import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro",
  "openai/gpt-5",
  "openai/gpt-5-mini",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = String(claimsData.claims.sub);

    const { messages, model } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate model selection, default to gemini flash
    const selectedModel = ALLOWED_MODELS.includes(model) ? model : "google/gemini-3-flash-preview";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const [docsRes, extractedRes, profileRes] = await Promise.all([
      svc.from("health_documents").select("file_name, ai_suggested_name, ai_summary, ai_suggested_category, document_type").eq("user_id", userId).order("uploaded_at", { ascending: false }).limit(20),
      svc.from("medical_extracted_data").select("data_type, title, value, unit, reference_range, status, date_recorded, notes").eq("user_id", userId).order("date_recorded", { ascending: false }).limit(100),
      svc.from("profiles").select("full_name, life_stage").eq("id", userId).maybeSingle(),
    ]);

    const docs = docsRes.data || [];
    const extracted = extractedRes.data || [];
    const profile = profileRes.data;

    let medicalContext = "";

    if (profile) {
      medicalContext += `Patient: ${profile.full_name || "Unknown"}, Life stage: ${profile.life_stage || "Not specified"}\n\n`;
    }

    if (docs.length > 0) {
      medicalContext += "## Uploaded Documents\n";
      docs.forEach((d, i) => {
        medicalContext += `${i + 1}. ${d.ai_suggested_name || d.file_name} (${d.ai_suggested_category || d.document_type})\n`;
        if (d.ai_summary) medicalContext += `   Summary: ${d.ai_summary}\n`;
      });
      medicalContext += "\n";
    }

    if (extracted.length > 0) {
      const grouped: Record<string, typeof extracted> = {};
      extracted.forEach((item) => {
        const t = item.data_type || "other";
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(item);
      });

      medicalContext += "## Extracted Medical Data\n";
      for (const [type, items] of Object.entries(grouped)) {
        medicalContext += `\n### ${type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}\n`;
        items.forEach((item) => {
          let line = `- ${item.title}`;
          if (item.value) line += `: ${item.value}${item.unit ? " " + item.unit : ""}`;
          if (item.reference_range) line += ` (ref: ${item.reference_range})`;
          if (item.status) line += ` [${item.status}]`;
          if (item.date_recorded) line += ` — ${item.date_recorded}`;
          if (item.notes) line += `\n  Note: ${item.notes}`;
          medicalContext += line + "\n";
        });
      }
    }

    const systemPrompt = `You are an AI medical assistant for a women's health platform called Womanie. You have access to the patient's uploaded health documents and extracted medical data shown below. Use this information to provide personalized, empathetic health guidance.

IMPORTANT RULES:
- You are NOT a replacement for a real doctor. Always recommend consulting a healthcare professional for serious concerns.
- Be warm, supportive, and use clear language.
- Reference specific findings from the patient's records when relevant.
- If asked about something not in the records, say so honestly.
- Keep answers concise but thorough.
- Format responses with markdown for readability.
- Focus on women's health topics: reproductive health, menstrual cycles, fertility, pregnancy, menopause, general wellness.
- Never fabricate medical data not present in the records.
- When discussing lab results, explain what values mean in plain language.

## Patient Medical Records
${medicalContext || "No medical records available yet. Encourage the patient to upload their health documents for personalized advice."}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("ai-doctor-chat error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
