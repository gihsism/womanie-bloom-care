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
    if (pageText) pageTexts.push(pageText);
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
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  console.log("Starting analysis for document:", { documentId, filePath, mimeType });

  // Fetch patient context for smarter analysis
  const [profileRes, existingDataRes] = await Promise.all([
    supabaseClient.from("profiles").select("life_stage, pregnancy_due_date, ivf_phase, ivf_start_date").eq("id", userId).maybeSingle(),
    supabaseClient.from("medical_extracted_data").select("title, value, unit, date_recorded, status").eq("user_id", userId).order("date_recorded", { ascending: false }).limit(50),
  ]);

  const profile = profileRes.data;
  const existingData = existingDataRes.data || [];

  // Build context string
  let patientContext = "";
  if (profile) {
    if (profile.life_stage) patientContext += `Patient life stage: ${profile.life_stage}. `;
    if (profile.pregnancy_due_date) patientContext += `Currently pregnant, due date: ${profile.pregnancy_due_date}. `;
    if (profile.ivf_phase) patientContext += `Undergoing IVF treatment, phase: ${profile.ivf_phase}. `;
  }

  // Build previous results context for timeline comparison
  const previousLabTitles = [...new Set(existingData.filter(d => d.value).map(d => d.title))];
  if (previousLabTitles.length > 0) {
    patientContext += `\nPatient has previous results for these tests: ${previousLabTitles.join(", ")}. When you find matching tests, note this is a repeat measurement.`;
  }

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
        userContent = [{
          type: "text",
          text: `Analyze the following medical document extracted from "${fileName}".\n\n${patientContext}\n\nDocument content:\n${extractedPdfText}`,
        }];
      } else {
        const dataUrl = `data:${mimeType};base64,${toBase64(fileBytes)}`;
        userContent = [
          { type: "text", text: `Analyze this medical PDF file (${fileName}).\n\n${patientContext}\n\nIf content is unreadable, return an empty extracted_data array and explain briefly in summary.` },
          { type: "image_url", image_url: { url: dataUrl } },
        ];
      }
    } catch (pdfTextError) {
      console.error("PDF text extraction failed:", pdfTextError);
      const dataUrl = `data:${mimeType};base64,${toBase64(fileBytes)}`;
      userContent = [
        { type: "text", text: `Analyze this medical PDF file (${fileName}).\n\n${patientContext}` },
        { type: "image_url", image_url: { url: dataUrl } },
      ];
    }
  } else if (isImage) {
    const dataUrl = `data:${mimeType};base64,${toBase64(fileBytes)}`;
    userContent = [
      { type: "text", text: `Analyze this health document image (${fileName}).\n\n${patientContext}` },
      { type: "image_url", image_url: { url: dataUrl } },
    ];
  } else {
    userContent = [{
      type: "text",
      text: `Analyze this health document named "${fileName}" (type: ${mimeType}).\n\n${patientContext}`,
    }];
  }

  const systemPrompt = `You are a medical document analyzer specializing in women's health. You write for patients, not doctors — use plain language a non-medical person can understand.

CRITICAL RULES FOR INTERPRETATION:

1. **PREGNANCY-SPECIFIC REFERENCE RANGES** (if patient is pregnant):
   - Ferritin: MUST be ≥30 ng/mL in pregnancy (ideally ≥50). Below 30 is LOW and clinically significant — iron deficiency in pregnancy causes fatigue, preterm birth risk, and fetal growth issues. Flag as "abnormal" with high priority.
   - Hemoglobin: <11 g/dL in 1st/3rd trimester or <10.5 g/dL in 2nd trimester = anemia. Flag as "abnormal".
   - HCG (beta-hCG): elevated is EXPECTED in pregnancy — status "expected", low priority.
   - Progesterone: elevated is EXPECTED in pregnancy.
   - TSH: pregnancy range is 0.1–2.5 mIU/L (1st tri), 0.2–3.0 (2nd tri), 0.3–3.5 (3rd tri) — tighter than non-pregnant ranges.
   - Vitamin D: <30 ng/mL needs supplementation in pregnancy.
   - Iron/TIBC: interpret with ferritin — low ferritin + low iron = iron deficiency even if hemoglobin is still "normal".
   - Platelets: <100k in pregnancy needs attention (HELLP risk).
   - Liver enzymes (ALT, AST): elevated in pregnancy can signal HELLP or cholestasis — flag as high priority.
   - Fibrinogen: pregnancy range is higher (300–600 mg/dL). Low fibrinogen in pregnancy is concerning.

2. **AUTOIMMUNE & COAGULATION CONDITIONS — DO NOT MISS**:
   - Antiphospholipid Syndrome (APS/AFS): Look for anticardiolipin antibodies (IgG, IgM), anti-beta-2-glycoprotein I antibodies, lupus anticoagulant. If ANY of these are positive/elevated, flag as "abnormal" with HIGH priority and explain: "Positive antiphospholipid antibodies may indicate antiphospholipid syndrome (APS), which increases risk of blood clots and pregnancy complications. Discuss with your doctor."
   - Anti-nuclear antibodies (ANA): if positive, note it.
   - Anti-thyroid antibodies (anti-TPO, anti-TG): if present, flag — especially in pregnancy (miscarriage risk).
   - Coagulation markers: D-dimer (elevated is common in pregnancy but very high values need attention), PT, PTT, INR abnormalities should be flagged.
   - Factor V Leiden, MTHFR, Protein C/S deficiency: if mentioned, always extract and flag.

3. **Context-aware status assignment**:
   - "critical" = requires urgent medical attention (dangerously low hemoglobin, very high glucose, positive lupus anticoagulant in pregnancy, etc.)
   - "abnormal" = outside reference range AND clinically meaningful (low ferritin in pregnancy, positive APS antibodies, abnormal thyroid in pregnancy)
   - "expected" = outside general reference range but EXPECTED given patient context (HCG in pregnancy, elevated FSH in menopause)
   - "normal" = within appropriate reference range for patient's context
   - "informational" = no reference range, just recorded for tracking

4. **IVF context**: hormonal values like estradiol, FSH, LH should be interpreted in the context of stimulation protocols.

5. **Menopause context**: elevated FSH and low estradiol are EXPECTED, not abnormal.

6. **Plain language notes**: For each finding, write a brief explanation a non-medical person would understand. Be specific: "Your iron stores (ferritin) are low at 15 ng/mL — during pregnancy this should be at least 30. Low iron can cause fatigue and may affect your baby's growth."

7. **Group related tests**: If multiple tests belong to the same panel (CBC, thyroid panel, coagulation panel, autoimmune panel, etc.), note the panel name.

8. **NEVER MISS DIAGNOSES**: If the document mentions ANY diagnosis, condition, or syndrome (e.g., antiphospholipid syndrome, gestational diabetes, preeclampsia, thyroid disorder, anemia), ALWAYS extract it as a separate item with data_type "condition" — even if lab values aren't included.

Return STRICT JSON with this shape:
{
  "name": "suggested document name (max 50 chars)",
  "category": "lab_results | imaging | prescription | consultation_notes | vaccination_record | other",
  "summary": "A 2-3 sentence plain-language summary for the patient. Lead with what's most important — anything abnormal or needing attention first. Be specific about values and what they mean. Then reassure about normal results.",
  "key_takeaways": [
    "One-line plain-language takeaway the patient should know",
    "Another key point"
  ],
  "action_items": [
    "Specific follow-up action if any (e.g., 'Ask your doctor about iron supplementation — your ferritin is below the safe level for pregnancy')",
  ],
  "extracted_data": [
    {
      "data_type": "condition | medication | lab_result | cycle_info | allergy | procedure | vaccination",
      "title": "standardized test/finding name (use common medical abbreviations like HCG, TSH, etc.)",
      "value": "value if applicable",
      "unit": "standardized unit (use common units: mIU/mL, ng/dL, g/dL, etc.)",
      "reference_range": "context-appropriate range (use PREGNANCY ranges if pregnant, not general population ranges)",
      "status": "normal | abnormal | critical | expected | informational | active | resolved",
      "priority": "high | medium | low",
      "date_recorded": "YYYY-MM-DD if found in document",
      "notes": "Plain-language explanation of what this result means for the patient. Be helpful, not alarming.",
      "panel": "name of test panel if applicable (e.g., 'Complete Blood Count', 'Thyroid Panel', 'Coagulation Panel', 'Autoimmune Panel')",
      "is_repeat_test": false
    }
  ],
  "cycle_data": {
    "cycle_length": null,
    "last_period_date": null,
    "period_length": null,
    "irregular": null
  }
}

Additional rules:
- Standardize test names so the same test from different documents can be matched (e.g., always use "Hemoglobin" not "Hb" or "HGB", always use "Ferritin" not "Serum Ferritin").
- Always include units when available.
- Use PREGNANCY-SPECIFIC reference ranges when patient is pregnant — do NOT use general population ranges.
- Do NOT mention inaccessible links.
- If information is missing, keep extracted_data empty and explain shortly in summary.
- Return valid JSON only.
- Sort extracted_data by priority: high first, then medium, then low.`;

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
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
      key_takeaways: [],
      action_items: [],
      extracted_data: [],
      cycle_data: { cycle_length: null, last_period_date: null, period_length: null, irregular: null },
    };
  }

  // Build enhanced summary with takeaways and actions
  let enhancedSummary = analysis.summary || "Document analyzed, but no major findings were extracted.";
  
  if (analysis.key_takeaways?.length > 0) {
    enhancedSummary += "\n\n📋 Key Takeaways:\n" + analysis.key_takeaways.map((t: string) => `• ${t}`).join("\n");
  }
  if (analysis.action_items?.length > 0) {
    enhancedSummary += "\n\n⚡ Action Items:\n" + analysis.action_items.map((a: string) => `• ${a}`).join("\n");
  }

  const { error: updateError } = await supabaseClient
    .from("health_documents")
    .update({
      ai_suggested_name: analysis.name || fileName,
      ai_suggested_category: analysis.category || "other",
      ai_summary: enhancedSummary,
    })
    .eq("id", documentId)
    .eq("user_id", userId);

  if (updateError) {
    console.error("Failed to update health_documents:", updateError);
    throw new Error("Failed to persist document summary");
  }

  if (Array.isArray(analysis.extracted_data) && analysis.extracted_data.length > 0) {
    // Check which tests are repeats
    const existingTitles = new Set(existingData.map(d => d.title.toLowerCase()));
    
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
      raw_data: {
        ...item,
        priority: item?.priority || "low",
        panel: item?.panel || null,
        is_repeat_test: existingTitles.has((item?.title || "").toLowerCase()),
      },
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
      if (periodError) console.error("Failed to update period_tracking:", periodError);
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
