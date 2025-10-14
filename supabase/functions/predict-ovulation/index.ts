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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Prepare health data summary for AI analysis
    const healthSummary = healthData.map((day: any) => ({
      date: day.signal_date,
      discharge: day.discharge,
      symptoms: day.symptoms,
      mood: day.mood,
      notes: day.notes,
    }));

    const systemPrompt = `You are an expert women's health AI assistant specializing in ovulation prediction and cycle tracking.

Your task is to analyze the patient's health signals and predict ovulation timing based on:
1. Cervical mucus/discharge patterns (especially looking for "egg white" or watery discharge which indicates peak fertility)
2. Symptoms like ovulation pain, breast tenderness, increased libido
3. Mood changes and energy levels
4. Cycle history and patterns

Provide predictions in a supportive, educational tone. Be specific but acknowledge that these are predictions, not guarantees.`;

    const userPrompt = `Please analyze this health data and predict ovulation timing:

Recent Health Signals (last 30 days):
${JSON.stringify(healthSummary, null, 2)}

Cycle Information:
- Average cycle length: ${cycleData.cycleLength} days
- Last period start: ${cycleData.lastPeriodStart}

Based on this data, please provide:
1. Predicted ovulation date
2. Fertile window (most fertile days)
3. Key indicators you noticed in the data
4. Confidence level (low/medium/high)
5. Recommendations for tracking

Format your response as a clear, structured analysis.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_ovulation_prediction",
              description: "Return ovulation prediction with structured data",
              parameters: {
                type: "object",
                properties: {
                  predictedOvulationDate: {
                    type: "string",
                    description: "ISO date string of predicted ovulation"
                  },
                  fertileWindowStart: {
                    type: "string",
                    description: "ISO date string of fertile window start"
                  },
                  fertileWindowEnd: {
                    type: "string",
                    description: "ISO date string of fertile window end"
                  },
                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Confidence level of prediction"
                  },
                  keyIndicators: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of key health signals that influenced the prediction"
                  },
                  analysis: {
                    type: "string",
                    description: "Detailed analysis and explanation"
                  },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "Personalized recommendations for tracking"
                  }
                },
                required: ["predictedOvulationDate", "confidence", "keyIndicators", "analysis", "recommendations"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "provide_ovulation_prediction" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));

    // Extract the function call result
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No prediction data returned from AI");
    }

    const prediction = JSON.parse(toolCall.function.arguments);
    
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
