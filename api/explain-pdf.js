export default async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pageText = req.body.text;

    // Validate input
    if (!pageText || typeof pageText !== 'string') {
      return res.status(400).json({ error: 'No valid text provided for explanation.' });
    }

    // Sanitize and limit input length
    const cleanText = pageText.trim().substring(0, 2000);
    if (!cleanText) {
      return res.status(400).json({ error: 'Text is empty after sanitization.' });
    }

    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-pro";

    if (!openRouterApiKey?.startsWith('sk-or-')) {
      console.error('Invalid OpenRouter API key format');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const apiUrl = "https://openrouter.ai/api/v1/chat/completions";

    // Simplified prompt without quoted text that could cause formatting issues
    const payload = {
      model: openRouterModel,
      messages: [
        {
          role: "user",
          content: `Explain this PDF text in simple terms:\n${cleanText}`
        }
      ]
    };

    console.log('Sending payload to OpenRouter:', { 
      model: payload.model,
      message_length: payload.messages[0].content.length 
    });

    const openRouterResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': 'https://your-app.vercel.app', // REPLACE WITH YOUR ACTUAL URL
        'X-Title': 'PDF-Explainer' // Must be ≤20 chars, no spaces
      },
      body: JSON.stringify(payload)
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter API Error:', {
        status: openRouterResponse.status,
        statusText: openRouterResponse.statusText,
        body: errorText
      });
      return res.status(openRouterResponse.status).json({ 
        error: `AI service error (${openRouterResponse.status})`,
        details: errorText
      });
    }

    const result = await openRouterResponse.json();

    if (result.choices?.[0]?.message?.content) {
      return res.json({ explanation: result.choices[0].message.content });
    }
    
    console.error('Unexpected OpenRouter response:', result);
    return res.status(500).json({ error: "Unexpected AI response format." });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
