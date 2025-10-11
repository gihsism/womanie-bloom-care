import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, filePath, fileName, mimeType } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('health-documents')
      .download(filePath);

    if (downloadError) {
      console.error('Download error:', downloadError);
      throw downloadError;
    }

    // Convert file to base64 for AI analysis
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Prepare AI request
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a medical document analyzer. Analyze health documents and provide: 1) A concise, descriptive name (max 50 chars), 2) A category (lab_results, imaging, prescription, consultation_notes, vaccination_record, or other), 3) A brief summary highlighting key findings, dates, and important medical information.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this health document (${fileName}). Return a JSON object with: {"name": "suggested name", "category": "category", "summary": "key findings and details"}`
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl }
              }
            ]
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

    // Parse AI response (try to extract JSON, fallback to raw text)
    let analysis;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        name: fileName,
        category: 'other',
        summary: aiContent
      };
    } catch {
      analysis = {
        name: fileName,
        category: 'other',
        summary: aiContent
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
      throw updateError;
    }

    console.log('Document analyzed successfully:', documentId);

    return new Response(
      JSON.stringify({ 
        success: true,
        analysis 
      }),
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
