import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

async function hashRequest(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const { documentId, userId, documentText, fileName } = req.body;
    if (!documentId || !userId || !documentText) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Fetch patient context
    const profiles = await sql('SELECT life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = $1', [userId]);
    const profile = profiles[0];

    const existingData = await sql(
      'SELECT title, value, unit, date_recorded, status FROM medical_extracted_data WHERE user_id = $1 ORDER BY date_recorded DESC LIMIT 50',
      [userId]
    );

    let patientContext = '';
    if (profile) {
      if (profile.life_stage) patientContext += `Patient life stage: ${profile.life_stage}. `;
      if (profile.pregnancy_due_date) patientContext += `Currently pregnant, due date: ${profile.pregnancy_due_date}. `;
      if (profile.ivf_phase) patientContext += `Undergoing IVF treatment, phase: ${profile.ivf_phase}. `;
    }
    const previousLabTitles = [...new Set(existingData.filter((d: any) => d.value).map((d: any) => d.title))];
    if (previousLabTitles.length > 0) {
      patientContext += `\nPrevious results for: ${previousLabTitles.join(', ')}.`;
    }

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `You analyze medical documents for women. Write for patients, not doctors. Today: ${today}.
${patientContext || ""}

Return ONLY valid JSON with this structure:
{
  "name": "short document name (max 50 chars)",
  "category": "lab_results|imaging|prescription|consultation_notes|other",
  "summary": "3-5 sentences for the patient. Start with abnormals: 'Your ferritin is 12 ng/mL (healthy is 30+) — your iron stores are low.' End with reassurance.",
  "key_takeaways": ["Most important thing"],
  "action_items": ["Specific action"],
  "extracted_data": [
    {
      "data_type": "lab_result|condition|medication|cycle_info|allergy|procedure",
      "title": "Standardized name (Hemoglobin not Hb)",
      "value": "the number",
      "unit": "standard unit",
      "reference_range": "low-high",
      "status": "normal|abnormal|critical|expected|informational",
      "priority": "high|medium|low",
      "date_recorded": "YYYY-MM-DD",
      "notes": "MANDATORY 1-2 sentences: what this means for patient.",
      "panel": "CBC|Thyroid Panel|Metabolic Panel|Hormone Panel|Coagulation|Autoimmune|Vitamins|Other",
      "possible_conditions": ["for abnormal only"],
      "is_repeat_test": false
    }
  ],
  "cycle_data": {"cycle_length":null,"last_period_date":null,"period_length":null,"irregular":null}
}

CRITICAL:
- Extract EVERY test result as its own item. 20 values = 20 items.
- Notes MUST explain what result means. Never empty.
- Pregnancy: Ferritin≥30, Hb≥11, TSH 0.1-2.5. HCG elevated=expected.
- Menopause: high FSH + low estradiol = expected.
- Return ONLY JSON. No markdown fences.

EXAMPLE (produce THIS MANY items):
[{"data_type":"lab_result","title":"Hemoglobin","value":"13.2","unit":"g/dL","reference_range":"12.0-16.0","status":"normal","priority":"low","date_recorded":"2026-03-15","notes":"Your hemoglobin is healthy.","panel":"CBC","possible_conditions":[],"is_repeat_test":false},{"data_type":"lab_result","title":"Ferritin","value":"12","unit":"ng/mL","reference_range":"30-150","status":"abnormal","priority":"high","date_recorded":"2026-03-15","notes":"Iron stores low at 12 — should be 30+ in pregnancy.","panel":"CBC","possible_conditions":["Iron deficiency"],"is_repeat_test":false}]`;

    const userContent = `Analyze this medical document "${fileName}". Extract EVERY test result as a separate item.\n\n${patientContext}\n\nDocument text:\n${documentText}`;

    // Cache check
    const cacheKey = await hashRequest(systemPrompt + userContent + 'claude-sonnet-4-20250514');
    const cached = await sql('SELECT response_text FROM llm_cache WHERE request_hash = $1', [cacheKey]);

    let aiContent: string;

    if (cached.length > 0 && cached[0].response_text) {
      console.log(`CACHE HIT for ${documentId}`);
      aiContent = cached[0].response_text;
      await sql('UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = now() WHERE request_hash = $1', [cacheKey]);
    } else {
      console.log(`CACHE MISS for ${documentId} — calling Anthropic`);

      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
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
        await sql(
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
      // Try recovery
      const start = aiContent.indexOf('{');
      const end = aiContent.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          analysis = JSON.parse(aiContent.slice(start, end + 1));
        } catch {
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
    await sql(
      'UPDATE health_documents SET ai_suggested_name = $1, ai_suggested_category = $2, ai_summary = $3 WHERE id = $4 AND user_id = $5',
      [analysis.name || fileName, analysis.category || 'other', enhancedSummary, documentId, userId]
    );

    // Insert extracted data
    if (Array.isArray(analysis.extracted_data) && analysis.extracted_data.length > 0) {
      for (const item of analysis.extracted_data) {
        await sql(
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
  } catch (error) {
    console.error('analyze-document error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
}
