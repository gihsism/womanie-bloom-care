import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PDF_PAGES = 20;
const MAX_TEXT_CHARS = 120000;

async function hashRequest(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

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

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

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
    let extractedPdfText = "";
    try {
      extractedPdfText = await extractPdfText(fileBytes);
      console.log("PDF text extracted:", extractedPdfText.length, "chars");
    } catch (pdfTextError) {
      console.error("PDF text extraction failed:", pdfTextError);
    }

    if (extractedPdfText.length > 50) {
      userContent = [{
        type: "text",
        text: `Analyze this medical document "${fileName}". Extract EVERY test result as a separate item — lab reports typically contain many values in tables.\n\n${patientContext}\n\nFull document text:\n${extractedPdfText}`,
      }];
    } else {
      // Scanned PDF with no text — send as image
      const dataUrl = `data:image/png;base64,${toBase64(fileBytes)}`;
      userContent = [
        { type: "text", text: `Analyze this scanned medical document "${fileName}". Read all visible text and extract EVERY test result.\n\n${patientContext}` },
        { type: "image_url", image_url: { url: dataUrl } },
      ];
    }
  } else if (isImage) {
    const dataUrl = `data:${mimeType};base64,${toBase64(fileBytes)}`;
    userContent = [
      { type: "text", text: `Analyze this health document image "${fileName}". Extract EVERY test result visible — lab reports typically have many values in a table. Don't stop at just one or two.\n\n${patientContext}` },
      { type: "image_url", image_url: { url: dataUrl } },
    ];
  } else {
    userContent = [{
      type: "text",
      text: `Analyze this health document named "${fileName}" (type: ${mimeType}).\n\n${patientContext}`,
    }];
  }

  const today = new Date().toISOString().split('T')[0];

  const systemPrompt = `You analyze medical documents for women. Write for patients, not doctors. Today: ${today}.
${patientContext || ""}

Return ONLY valid JSON with this structure:
{
  "name": "short document name (max 50 chars)",
  "category": "lab_results|imaging|prescription|consultation_notes|other",
  "summary": "3-5 sentences written to the patient. Start with what needs attention: 'Your ferritin is 12 ng/mL (healthy is 30+) — your iron stores are low, which explains fatigue. Your thyroid (TSH 1.8) looks great.' End with reassurance. Mention when tests were done relative to today.",
  "key_takeaways": ["Most important thing patient should know", "Second most important"],
  "action_items": ["Specific action: 'Ask about iron supplements — ferritin is below 30'"],
  "extracted_data": [
    {
      "data_type": "lab_result|condition|medication|cycle_info|allergy|procedure",
      "title": "Standardized name (always Hemoglobin not Hb, Ferritin not Serum Ferritin)",
      "value": "the number",
      "unit": "standard unit",
      "reference_range": "low-high (use pregnancy ranges if pregnant: Ferritin≥30, Hb≥11, TSH 0.1-2.5)",
      "status": "normal|abnormal|critical|expected|informational",
      "priority": "high|medium|low",
      "date_recorded": "YYYY-MM-DD from document",
      "notes": "MANDATORY 1-2 sentences: what this specific value means for the patient. For abnormal: state the value, what's healthy, what this could cause, what to do. For normal: brief confirmation. NEVER just say 'discuss with doctor' — explain WHY first.",
      "panel": "CBC|Thyroid Panel|Metabolic Panel|Hormone Panel|Coagulation|Autoimmune|Vitamins|Other",
      "possible_conditions": ["for abnormal/critical only: plain-language conditions"],
      "is_repeat_test": false
    }
  ],
  "cycle_data": {"cycle_length":null,"last_period_date":null,"period_length":null,"irregular":null}
}

CRITICAL RULES:
- Extract EVERY SINGLE test result as its own item. If document has 20 values, return 20 items. Missing results = patient can't see them.
- Notes field must NEVER be empty — each result needs 1-2 sentences explaining what it means for this patient.
- Standardize test names for cross-document matching: always "Hemoglobin" not "Hb"/"HGB", "Ferritin" not "Serum Ferritin", "TSH" not "Thyroid Stimulating Hormone".
- Always include units and reference ranges when visible in the document.

PREGNANCY-SPECIFIC (if patient is pregnant):
- Ferritin: must be ≥30 ng/mL. Below 30 = "abnormal", high priority.
- Hemoglobin: <11 g/dL = anemia in pregnancy.
- TSH: pregnancy range is 0.1-2.5 (1st tri), tighter than normal.
- HCG elevated = "expected" status, not abnormal.
- Progesterone elevated = "expected" in pregnancy.
- Vitamin D <30 = needs supplementation.
- Platelets <150k = monitor, <100k = urgent.
- Liver enzymes (ALT, AST) elevated = flag high priority (HELLP risk).

MENOPAUSE: high FSH + low estradiol = "expected" not abnormal.
AUTOIMMUNE: always flag APS antibodies, anti-TPO, lupus anticoagulant if positive.

- If document mentions gestational age, calculate current weeks from test date to ${today}.
- Return ONLY the JSON object. No markdown, no code fences, no explanation outside JSON.

EXAMPLE of good extracted_data (your output should have THIS MANY items or more):
[
  {"data_type":"lab_result","title":"Hemoglobin","value":"13.2","unit":"g/dL","reference_range":"12.0-16.0","status":"normal","priority":"low","date_recorded":"2026-03-15","notes":"Your hemoglobin is healthy — your blood is carrying oxygen well.","panel":"CBC","possible_conditions":[],"is_repeat_test":false},
  {"data_type":"lab_result","title":"Ferritin","value":"12","unit":"ng/mL","reference_range":"30-150","status":"abnormal","priority":"high","date_recorded":"2026-03-15","notes":"Your iron stores are very low at 12 ng/mL — during pregnancy this should be at least 30. Low ferritin causes fatigue and can affect your baby's growth. Ask about iron supplements.","panel":"CBC","possible_conditions":["Iron deficiency","Pregnancy anemia risk"],"is_repeat_test":false},
  {"data_type":"lab_result","title":"TSH","value":"1.8","unit":"mIU/L","reference_range":"0.1-2.5","status":"normal","priority":"low","date_recorded":"2026-03-15","notes":"Your thyroid function is healthy and within the safe pregnancy range.","panel":"Thyroid Panel","possible_conditions":[],"is_repeat_test":false},
  {"data_type":"lab_result","title":"Vitamin D","value":"18","unit":"ng/mL","reference_range":"30-100","status":"abnormal","priority":"medium","date_recorded":"2026-03-15","notes":"Your vitamin D is low at 18 — you need at least 30 for bone health and immunity. Consider a supplement of 2000-4000 IU daily.","panel":"Vitamins","possible_conditions":["Vitamin D deficiency"],"is_repeat_test":false}
]
Each test = one item. A typical blood test should produce 10-25 items.`;

  // Cache: hash the request (prompt + content + model) so any change invalidates
  const cacheModel = "claude-sonnet-4-20250514";
  const userContentStr = JSON.stringify(userContent);
  const cacheKey = await hashRequest(systemPrompt + userContentStr + cacheModel);

  // Check cache
  const { data: cached } = await supabaseClient
    .from("llm_cache")
    .select("response_text")
    .eq("request_hash", cacheKey)
    .maybeSingle();

  let aiContent: string;

  if (cached?.response_text) {
    // CACHE HIT
    console.log(`CACHE HIT for document ${documentId} (hash: ${cacheKey.slice(0, 12)}...)`);
    aiContent = cached.response_text;
    // Update hit count
    await supabaseClient.rpc("", {}).catch(() => {}); // ignore errors
    await supabaseClient
      .from("llm_cache")
      .update({ hit_count: undefined as any, last_hit_at: new Date().toISOString() })
      .eq("request_hash", cacheKey)
      .then(() => {
        // Increment hit_count via raw SQL would be better, but simple update works
      });
    // Simple increment
    await supabaseClient.from("llm_cache").update({
      last_hit_at: new Date().toISOString(),
    }).eq("request_hash", cacheKey);
  } else {
    // CACHE MISS — call LLM
    console.log(`CACHE MISS for document ${documentId} (hash: ${cacheKey.slice(0, 12)}...) — calling Anthropic`);

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cacheModel,
        max_tokens: 8000,
        system: systemPrompt,
        messages: [
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Anthropic API error:", aiResponse.status, errorText);
      throw new Error(`AI analysis failed with status ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    aiContent = aiData.content?.[0]?.text;

    // Store in cache
    if (aiContent) {
      await supabaseClient.from("llm_cache").upsert({
        request_hash: cacheKey,
        response_text: aiContent,
        model: cacheModel,
        hit_count: 0,
      }).catch(err => console.error("Cache store error:", err));
      console.log(`CACHE STORED for document ${documentId} (hash: ${cacheKey.slice(0, 12)}...)`);
    }
  }

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

    // Use service role client to verify the user's JWT token
    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await svcClient.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
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
