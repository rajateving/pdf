// File: api/explain-pdf.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pageText = req.body.text;

  if (!pageText) {
    return res.status(400).json({ error: 'No text provided for explanation.' });
  }

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-pro";

  if (!openRouterApiKey || openRouterApiKey.trim() === '') {
    return res.status(500).json({ error: 'Server configuration error: OpenRouter API key not found.' });
  }

  const apiUrl = "https://openrouter.ai/api/v1/chat/completions";

  const payload = {
    model: openRouterModel,
    messages: [
      {
        role: "user",
        content: `Explain the following text from a PDF page in simple, clear, and concise language. Focus on the main points and make it easy to understand for a non-expert. Text to explain: "${pageText}"`
      }
    ]
  };

  try {
    const openRouterResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': req.headers.host,
        'X-Title': 'AI PDF Explainer App'
      },
      body: JSON.stringify(payload)
    });

    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.json().catch(() => ({}));
      const errorMessage = errorData.message || `OpenRouter API request failed with status ${openRouterResponse.status}`;
      return res.status(openRouterResponse.status).json({ error: errorMessage });
    }

    const result = await openRouterResponse.json();

    if (result.choices?.[0]?.message?.content) {
      res.json({ explanation: result.choices[0].message.content });
    } else {
      res.status(500).json({ error: "Unexpected AI response format." });
    }

  } catch (error) {
    console.error('Error during OpenRouter API call:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
}
