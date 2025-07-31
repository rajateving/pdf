export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;
    
    // Validate input
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid text input' });
    }

    const cleanText = text.trim().substring(0, 2000);
    if (!cleanText) return res.status(400).json({ error: 'Text too short' });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey?.startsWith('sk-or-')) {
      console.error('Invalid API key format');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const payload = {
      model: "google/gemini-pro",
      messages: [{
        role: "user",
        content: `Explain this in simple terms: ${cleanText}`
      }]
    };

    console.log('API Key:', apiKey.substring(0, 6) + '...'); // Partial log for verification

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.vercel.app', // MUST match your exact Vercel URL
        'X-Title': 'PDF-Explainer' // Exactly 12 chars
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter Error:', response.status, error);
      return res.status(response.status).json({ 
        error: `AI service error (${response.status})`,
        details: error.length > 100 ? error.substring(0, 100) + '...' : error
      });
    }

    const { choices } = await response.json();
    return res.json({ explanation: choices[0].message.content });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
