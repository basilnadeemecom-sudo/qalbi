// netlify/functions/match-duas.js
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
  }

  try {
    const { occasion, intention, userName, gender, lovedOnes, duaCount, nameCount, duas, names } = JSON.parse(event.body);

    // Build the dua summaries for the prompt (just index + english + source + categories)
    const duaSummaries = duas.map((d, i) =>
      `[${i}] ${d.e} (${d.s}) [categories: ${d.c.join(", ")}]`
    ).join("\n");

    const nameSummaries = names.map((n, i) =>
      `[${i}] ${n.r} (${n.m}) - ${n.d} [categories: ${n.ct.join(", ")}]`
    ).join("\n");

    let userContext = `Occasion: ${occasion}.`;
    if (userName) userContext += ` Their name is ${userName}.`;
    if (gender) userContext += ` Gender: ${gender}.`;
    if (intention) userContext += ` What is on their heart: "${intention}"`;
    if (lovedOnes && lovedOnes.length) userContext += ` They want to include: ${lovedOnes.join(", ")}.`;

    const prompt = `You are BespokeDua, an Islamic supplication curator. You help people find the most relevant authentic duas for their situation.

IMPORTANT: You do NOT create or invent any duas. You ONLY select from the verified database below.

USER'S SITUATION:
${userContext}

VERIFIED DUA DATABASE (select ${duaCount} most relevant):
${duaSummaries}

NAMES OF ALLAH DATABASE (select ${nameCount} most relevant):
${nameSummaries}

TASK:
1. Select the ${duaCount} duas (by index number) that are MOST relevant to this person's specific situation and what they wrote.
2. Select the ${nameCount} Names of Allah (by index number) most relevant to their situation.
3. For each selected Name, write a 2-3 sentence personal connection explaining how THIS Name relates to what THIS person is going through. Make it deeply personal — reference their specific words and situation. Address them directly.

Respond with ONLY valid JSON:
{"duaIndices":[0,5,12],"nameIndices":[3,7],"nameConnections":["Personal connection for first name...","Personal connection for second name..."]}`;

    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: "API error", fallback: true }) };
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    // Parse JSON from response
    let parsed;
    try {
      const clean = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      const fi = text.indexOf("{");
      const li = text.lastIndexOf("}");
      if (fi >= 0 && li > fi) {
        parsed = JSON.parse(text.slice(fi, li + 1));
      } else {
        throw new Error("Could not parse API response");
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        duaIndices: parsed.duaIndices || [],
        nameIndices: parsed.nameIndices || [],
        nameConnections: parsed.nameConnections || [],
      }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, fallback: true }),
    };
  }
};
