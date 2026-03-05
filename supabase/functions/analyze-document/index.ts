import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function analyzeDocument(documentId: string, filePath: string, fileName: string, mimeType: string, userId: string) {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  // Download the file from storage
  const { data: fileData, error: downloadError } = await supabaseClient
    .storage
    .from('health-documents')
    .download(filePath);

  if (downloadError || !fileData) {
    console.error('Download error:', downloadError);
    throw new Error('Failed to download file');
  }

  // Convert file to base64
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64Data = btoa(binary);
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  // Build message content with inline base64 data for all file types
  const isImage = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(mimeType);
  const isPdf = mimeType === 'application/pdf';
  
  let userContent: any[];
  if (isImage || isPdf) {
    userContent = [
      {
        type: 'text',
        text: `Analyze this health document (${fileName}). Extract all medical data, lab results, conditions, medications, and any menstrual cycle information.`
      },
      {
        type: 'image_url',
        image_url: { url: dataUrl }
      }
    ];
  } else {
    userContent = [
      {
        type: 'text',
        text: `Analyze this health document named "${fileName}" (type: ${mimeType}). Please extract all medical data, lab results, conditions, medications, and any menstrual cycle information based on the document name and type.`
      }
    ];
  }

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content: `You are a medical document analyzer specializing in women's health. Analyze health documents and extract structured data.

Return a JSON object with:
{
  "name": "suggested document name (max 50 chars)",
  "category": "lab_results | imaging | prescription | consultation_notes | vaccination_record | other",
  "summary": "brief summary of key findings",
  "extracted_data": [
    {
      "data_type": "condition | medication | lab_result | cycle_info | allergy | procedure | vaccination",
      "title": "name of the finding",
      "value": "value if applicable",
      "unit": "unit if applicable",
      "reference_range": "normal range if applicable",
      "status": "normal | abnormal | critical | active | resolved",
      "date_recorded": "YYYY-MM-DD if found in document",
      "notes": "additional context"
    }
  ],
  "cycle_data": {
    "cycle_length": null,
    "last_period_date": null,
    "period_length": null,
    "irregular": null
  }
}

For cycle_info entries, extract menstrual cycle details.
For lab_results, extract specific values with units and reference ranges.
For medications, include dosage in the value field.
The cycle_data field should contain any cycle-related information found.
If no cycle data is found, set cycle_data values to null.
Always return valid JSON.`
        },
        {
          role: 'user',
          content: userContent
        }
      ]
    })
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('AI gateway error:', aiResponse.status, errorText);
    throw new Error(`AI analysis failed: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const aiContent = aiData.choices?.[0]?.message?.content;

  if (!aiContent) {
    throw new Error('No response from AI');
  }

  // Parse AI response
  let analysis;
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      name: fileName,
      category: 'other',
      summary: aiContent,
      extracted_data: [],
      cycle_data: {}
    };
  } catch {
    analysis = {
      name: fileName,
      category: 'other',
      summary: aiContent,
      extracted_data: [],
      cycle_data: {}
    };
  }

  // Update document with AI analysis
  const { error: updateError } = await supabaseClient
    .from('health_documents')
    .update({
      ai_suggested_name: analysis.name,
      ai_suggested_category: analysis.category,
      ai_summary: analysis.summary
    })
    .eq('id', documentId);

  if (updateError) {
    console.error('Update error:', updateError);
  }

  // Insert extracted medical data
  if (analysis.extracted_data && analysis.extracted_data.length > 0 && userId) {
    const medicalRecords = analysis.extracted_data.map((item: any) => ({
      user_id: userId,
      document_id: documentId,
      data_type: item.data_type || 'other',
      title: item.title || 'Unknown',
      value: item.value || null,
      unit: item.unit || null,
      reference_range: item.reference_range || null,
      status: item.status || null,
      date_recorded: item.date_recorded || null,
      notes: item.notes || null,
      raw_data: item
    }));

    const { error: insertError } = await supabaseClient
      .from('medical_extracted_data')
      .insert(medicalRecords);

    if (insertError) {
      console.error('Medical data insert error:', insertError);
    }
  }

  // Update cycle tracking if cycle data found
  if (analysis.cycle_data && userId) {
    const { cycle_length, last_period_date, period_length } = analysis.cycle_data;

    if (last_period_date && cycle_length) {
      const { data: existing } = await supabaseClient
        .from('period_tracking')
        .select('id')
        .eq('user_id', userId)
        .eq('period_start_date', last_period_date)
        .maybeSingle();

      if (!existing) {
        const periodLen = period_length || 5;
        const endDate = new Date(last_period_date);
        endDate.setDate(endDate.getDate() + periodLen - 1);

        const { error: periodError } = await supabaseClient
          .from('period_tracking')
          .insert({
            user_id: userId,
            period_start_date: last_period_date,
            period_end_date: endDate.toISOString().split('T')[0],
            cycle_length: parseInt(cycle_length) || 28
          });

        if (periodError) {
          console.error('Period tracking update error:', periodError);
        }
      }
    }
  }

  console.log('Document analyzed successfully:', documentId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, filePath, fileName, mimeType, userId } = await req.json();

    // Use EdgeRuntime.waitUntil for background processing
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        analyzeDocument(documentId, filePath, fileName, mimeType, userId).catch((error) => {
          console.error('Background analysis error:', error);
        })
      );
    } else {
      // Fallback: run inline (may timeout for large files)
      await analyzeDocument(documentId, filePath, fileName, mimeType, userId);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Analysis started' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-document function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
