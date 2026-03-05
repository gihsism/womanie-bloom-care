import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PDF_PAGES = 20;
const MAX_TEXT_CHARS = 120000;

function toBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const pdfjs = await import("npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableWorker: true,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pageTexts: string[] = [];

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: any) => item?.str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText) {
      pageTexts.push(pageText);
    }
  }

  return pageTexts.join("\n\n").slice(0, MAX_TEXT_CHARS).trim();
}

function normalizeAiJson(rawContent: string) {
  const content = rawContent
    .replace(/^```json\s*/i, "")
    .replace(/^```/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
}

async function analyzeDocument(documentId: string, filePath: string, fileName: string, mimeType: string, userId: string) {
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  console.log("Starting analysis for document:", { documentId, filePath, mimeType });

  const { data: fileData, error: downloadError } = await supabaseClient.storage
    .from("health-documents")
    .download(filePath);

  if (downloadError || !fileData) {
    console.error("Storage download failed:", downloadError);
    throw new Error("Failed to download document");
  }

  const fileBytes = new Uint8Array(await fileData.arrayBuffer());
  const isImage = ["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(mimeType);
  const isPdf = mimeType === "application/pdf";

  let userContent: any[] = [];

  if (isPdf) {
    try {
      const extractedPdfText = await extractPdfText(fileBytes);

      if (extractedPdfText.length > 100) {
        userContent = [
          {
            type: "text",
            text: `Analyze the following medical PDF content extracted from "${fileName}". Extract specific medical facts only (conditions, medications, test values, dates, cycle information).\n\n${extractedPdfText}`,
          },
        ];
      } else {
        const dataUrl = `data:${mimeType};base64,${toBase64(fileBytes)}`;
        userContent = [
          {
            type: "text",
            text: `Analyze this medical PDF file (${fileName}). If content is unreadable, return an empty extracted_data array and explain briefly in summary.`,
          },
          {
            type: "image_url",
            image_url: { url: dataUrl },
          },
        ];
      }
    } catch (pdfTextError) {
      console.error("PDF text extraction failed:", pdfTextError);
      const dataUrl = `data:${mimeType};base64,${toBase64(fileBytes)}`;
      userContent = [
        {
          type: "text",
          text: `Analyze this medical PDF file (${fileName}).`,
        },
        {
          type: "image_url",
          image_url: { url: dataUrl },
        },
      ];
    }
  } else if (isImage) {
    const dataUrl = `data:${mimeType};base64,${toBase64(fileBytes)}`;
    userContent = [
      {
        type: "text",
        text: `Analyze this health document image (${fileName}). Extract all concrete medical findings.`,
      },
      {
        type: "image_url",
        image_url: { url: dataUrl },
      },
    ];
  } else {
    userContent = [
      {
        type: "text",
        text: `Analyze this health document named "${fileName}" (type: ${mimeType}). Extract any medical findings if possible.`,
      },
    ];
  }

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a medical document analyzer specializing in women's health.

Return STRICT JSON with this shape:
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
      "date_recorded": "YYYY-MM-DD if found",
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

Rules:
- Do NOT mention inaccessible links.
- If information is missing, keep extracted_data empty and explain shortly in summary.
- Always return valid JSON only.`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error("AI gateway error:", aiResponse.status, errorText);
    throw new Error(`AI analysis failed with status ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const aiContent = aiData.choices?.[0]?.message?.content;

  if (!aiContent || typeof aiContent !== "string") {
    throw new Error("AI did not return content");
  }

  let analysis: any;
  try {
    analysis = normalizeAiJson(aiContent);
  } catch (parseError) {
    console.error("AI JSON parse error:", parseError, aiContent);
    analysis = {
      name: fileName,
      category: "other",
      summary: aiContent.slice(0, 1200),
      extracted_data: [],
      cycle_data: {
        cycle_length: null,
        last_period_date: null,
        period_length: null,
        irregular: null,
      },
    };
  }

  const { error: updateError } = await supabaseClient
    .from("health_documents")
    .update({
      ai_suggested_name: analysis.name || fileName,
      ai_suggested_category: analysis.category || "other",
      ai_summary: analysis.summary || "Document analyzed, but no major findings were extracted.",
    })
    .eq("id", documentId)
    .eq("user_id", userId);

  if (updateError) {
    console.error("Failed to update health_documents:", updateError);
    throw new Error("Failed to persist document summary");
  }

  if (Array.isArray(analysis.extracted_data) && analysis.extracted_data.length > 0) {
    const medicalRecords = analysis.extracted_data.map((item: any) => ({
      user_id: userId,
      document_id: documentId,
      data_type: item?.data_type || "other",
      title: item?.title || "Unknown",
      value: item?.value || null,
      unit: item?.unit || null,
      reference_range: item?.reference_range || null,
      status: item?.status || null,
      date_recorded: item?.date_recorded || null,
      notes: item?.notes || null,
      raw_data: item,
    }));

    const { error: insertError } = await supabaseClient
      .from("medical_extracted_data")
      .insert(medicalRecords);

    if (insertError) {
      console.error("Failed to insert medical_extracted_data:", insertError);
    }
  }

  const cycleData = analysis.cycle_data;
  if (cycleData && cycleData.last_period_date && cycleData.cycle_length) {
    const { data: existing } = await supabaseClient
      .from("period_tracking")
      .select("id")
      .eq("user_id", userId)
      .eq("period_start_date", cycleData.last_period_date)
      .maybeSingle();

    if (!existing) {
      const periodLen = Number(cycleData.period_length) || 5;
      const endDate = new Date(cycleData.last_period_date);
      endDate.setDate(endDate.getDate() + periodLen - 1);

      const { error: periodError } = await supabaseClient.from("period_tracking").insert({
        user_id: userId,
        period_start_date: cycleData.last_period_date,
        period_end_date: endDate.toISOString().split("T")[0],
        cycle_length: Number(cycleData.cycle_length) || 28,
      });

      if (periodError) {
        console.error("Failed to update period_tracking:", periodError);
      }
    }
  }

  console.log("Document analyzed successfully:", documentId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
    const { documentId, filePath, fileName, mimeType } = await req.json();

    if (!documentId || !filePath || !fileName || !mimeType) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: doc, error: docError } = await verifyClient
      .from("health_documents")
      .select("id, user_id")
      .eq("id", documentId)
      .single();

    if (docError || !doc || doc.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Document not found or access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await analyzeDocument(documentId, filePath, fileName, mimeType, userId);

    return new Response(JSON.stringify({ success: true, message: "Analysis completed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-document function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
