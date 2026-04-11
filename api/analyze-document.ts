import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

async function hashRequest(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const { documentId, userId, filePath, fileName, mimeType } = req.body;
    if (!documentId || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Download file from Vercel Blob URL
    let documentText = '';
    if (filePath && filePath.startsWith('http')) {
      try {
        const fileResp = await fetch(filePath);
        if (fileResp.ok) {
          const buffer = await fileResp.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');

          // Fetch patient context
          const profiles = await sql.query('SELECT life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = $1', [userId]);
          const profile = profiles[0];
          let patientContext = '';
          if (profile) {
            if (profile.life_stage) patientContext += `Patient life stage: ${profile.life_stage}. `;
            if (profile.pregnancy_due_date) patientContext += `Currently pregnant, due date: ${profile.pregnancy_due_date}. `;
          }

          const today = new Date().toISOString().split('T')[0];
          const systemPrompt = buildSystemPrompt(today, patientContext);

          let userContent: any[];

          if (mimeType === 'application/pdf') {
            // Send PDF natively to Claude — it can read PDFs directly
            userContent = [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: `Analyze this medical document "${fileName}". Read every page carefully. Extract EVERY test result as a separate item — lab reports contain tables with many values. A typical blood test has 10-25 results.\n\n${patientContext}` },
            ];
          } else if (['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(mimeType)) {
            // Send image to Claude vision
            userContent = [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              { type: 'text', text: `Analyze this medical document image "${fileName}". Extract EVERY test result you can see in the image.\n\n${patientContext}` },
            ];
          } else {
            documentText = await fileResp.text();
            // Fall through to text processing below
            userContent = [];
          }

          if (userContent.length > 0) {
            return await processWithAI(sql, ANTHROPIC_API_KEY, systemPrompt, userContent, documentId, userId, fileName, res);
          }
        }
      } catch (e) {
        console.error('File download error:', e);
      }
    }

    if (!documentText || documentText.length < 10) {
      documentText = `[Document: ${fileName}, type: ${mimeType}. No text could be extracted.]`;
    }

    // Fetch patient context
    const profiles = await sql.query('SELECT life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = $1', [userId]);
    const profile = profiles[0];
    let patientContext = '';
    if (profile) {
      if (profile.life_stage) patientContext += `Patient life stage: ${profile.life_stage}. `;
      if (profile.pregnancy_due_date) patientContext += `Currently pregnant, due date: ${profile.pregnancy_due_date}. `;
    }

    const today = new Date().toISOString().split('T')[0];
    const systemPrompt = buildSystemPrompt(today, patientContext);
    const userContent = `Analyze this medical document "${fileName}". Extract EVERY test result as a separate item.\n\n${patientContext}\n\nDocument text:\n${documentText}`;

    return await processWithAI(sql, ANTHROPIC_API_KEY, systemPrompt, [{ type: 'text', text: userContent }], documentId, userId, fileName, res);

  } catch (error) {
    console.error('analyze-document error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
}

function buildSystemPrompt(today: string, patientContext: string): string {
  return `You analyze medical documents for women. Write for patients, not doctors. Today: ${today}.
${patientContext || ""}

Return ONLY valid JSON:
{"name":"doc name","category":"lab_results|imaging|prescription|consultation_notes|other","summary":"3-5 sentences. Lead with abnormals: value + range + meaning. End with reassurance.","key_takeaways":["..."],"action_items":["..."],"extracted_data":[{"data_type":"lab_result|condition|medication","title":"Standardized name","value":"number","unit":"unit","reference_range":"low-high","status":"normal|abnormal|critical|expected","priority":"high|medium|low","date_recorded":"YYYY-MM-DD","notes":"MANDATORY: what this means.","panel":"CBC|Thyroid|Metabolic|Hormone|Vitamins|Other","possible_conditions":[],"is_repeat_test":false}],"cycle_data":{"cycle_length":null,"last_period_date":null,"period_length":null,"irregular":null}}

RULES:
- Extract EVERY test result. 20 values = 20 items.
- Notes MUST explain what result means. Never empty.
- Pregnancy: Ferritin≥30, Hb≥11, TSH 0.1-2.5. HCG elevated=expected.
- Return ONLY JSON. No markdown fences.`;
}

async function processWithAI(
  sql: any, apiKey: string, systemPrompt: string, userContent: any,
  documentId: string, userId: string, fileName: string,
  res: VercelResponse
) {
  const contentStr = JSON.stringify(userContent);
  const cacheKey = await hashRequest(systemPrompt + contentStr + 'claude-sonnet-4-20250514');

  // Check cache
  const cached = await sql.query('SELECT response_text FROM llm_cache WHERE request_hash = $1', [cacheKey]);

  let aiContent: string;

  if (cached.length > 0 && cached[0].response_text) {
    console.log(`CACHE HIT for ${documentId}`);
    aiContent = cached[0].response_text;
    await sql.query('UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = now() WHERE request_hash = $1', [cacheKey]).catch(() => {});
  } else {
    console.log(`CACHE MISS for ${documentId} — calling Anthropic`);

    const messages = Array.isArray(userContent) && userContent[0]?.type
      ? [{ role: 'user', content: userContent }]
      : [{ role: 'user', content: userContent }];

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages,
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('Anthropic error:', aiResponse.status, errText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    aiContent = aiData.content?.[0]?.text;

    if (aiContent) {
      await sql.query(
        'INSERT INTO llm_cache (request_hash, response_text, model) VALUES ($1, $2, $3) ON CONFLICT (request_hash) DO UPDATE SET response_text = $2',
        [cacheKey, aiContent, 'claude-sonnet-4-20250514']
      ).catch((e: any) => console.error('Cache store error:', e));
    }
  }

  if (!aiContent) throw new Error('No AI response');

  // Parse JSON
  let analysis: any;
  try {
    const cleaned = aiContent.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
    console.log(`Parsed OK. extracted_data: ${analysis.extracted_data?.length || 0} items`);
  } catch {
    console.error('JSON parse failed. First 300:', aiContent.slice(0, 300));
    const start = aiContent.indexOf('{');
    const end = aiContent.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { analysis = JSON.parse(aiContent.slice(start, end + 1)); } catch {
        analysis = { name: fileName, category: 'other', summary: aiContent.slice(0, 1200), extracted_data: [] };
      }
    } else {
      analysis = { name: fileName, category: 'other', summary: aiContent.slice(0, 1200), extracted_data: [] };
    }
  }

  // Build summary
  let enhancedSummary = analysis.summary || 'Document analyzed.';
  if (analysis.key_takeaways?.length > 0) {
    enhancedSummary += '\n\n📋 Key Takeaways:\n' + analysis.key_takeaways.map((t: string) => `• ${t}`).join('\n');
  }
  if (analysis.action_items?.length > 0) {
    enhancedSummary += '\n\n⚡ Action Items:\n' + analysis.action_items.map((a: string) => `• ${a}`).join('\n');
  }

  // Update document
  await sql.query(
    'UPDATE health_documents SET ai_suggested_name = $1, ai_suggested_category = $2, ai_summary = $3 WHERE id = $4 AND user_id = $5',
    [analysis.name || fileName, analysis.category || 'other', enhancedSummary, documentId, userId]
  );

  // Insert extracted data
  if (Array.isArray(analysis.extracted_data) && analysis.extracted_data.length > 0) {
    for (const item of analysis.extracted_data) {
      await sql.query(
        `INSERT INTO medical_extracted_data (user_id, document_id, data_type, title, value, unit, reference_range, status, date_recorded, notes, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId, documentId,
          item.data_type || 'other', item.title || 'Unknown',
          item.value || null, item.unit || null, item.reference_range || null,
          item.status || null, item.date_recorded || null, item.notes || null,
          JSON.stringify({ priority: item.priority, panel: item.panel, possible_conditions: item.possible_conditions, is_repeat_test: item.is_repeat_test }),
        ]
      );
    }
  }

  return res.status(200).json({ success: true, extracted: analysis.extracted_data?.length || 0 });
}
