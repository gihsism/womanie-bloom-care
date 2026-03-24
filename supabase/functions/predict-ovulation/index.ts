import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { healthData, cycleData } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const healthSummary = healthData.map((day: any) => ({
      date: day.signal_date,
      discharge: day.discharge,
      symptoms: day.symptoms,
      mood: day.mood,
      notes: day.notes,
    }));

    const systemPrompt = `You are an expert women's health AI assistant specializing in ovulation prediction and cycle tracking.

Analyze the patient's health signals and predict ovulation timing based on:
1. Cervical mucus/discharge patterns (egg white or watery = peak fertility)
2. Symptoms like ovulation pain, breast tenderness, increased libido
3. Mood changes and energy levels
4. Cycle history and patterns

Return ONLY valid JSON with this exact shape:
{
  "predictedOvulationDate": "YYYY-MM-DD",
  "fertileWindowStart": "YYYY-MM-DD",
  "fertileWindowEnd": "YYYY-MM-DD",
  "confidence": "low" | "medium" | "high",
  "keyIndicators": ["indicator 1", "indicator 2"],
  "analysis": "Detailed analysis text",
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

    const userPrompt = `Analyze this health data and predict ovulation:

Recent Health Signals (last 30 days):
${JSON.stringify(healthSummary, null, 2)}

Cycle Information:
- Average cycle length: ${cycleData.cycleLength} days
- Last period start: ${cycleData.lastPeriodStart}

Return ONLY the JSON object, no other text.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      throw new Error("AI service error");
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;

    if (!content) {
      throw new Error("No prediction data returned from AI");
    }

    // Parse JSON from response (strip markdown code fences if present)
    const jsonStr = content.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    const prediction = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(jsonStr);

    return new Response(JSON.stringify({ prediction }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Ovulation prediction error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
