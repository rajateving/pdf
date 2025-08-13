export default async function handler(req, res) {
  // 1. CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Method Validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 3. Input Validation
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid text input' });
    }

    // 4. Text Sanitization
    const cleanText = text
      .trim()
      .replace(/[^\w\s.,!?\-'"\n]/g, '') // Remove special chars
      .substring(0, 1500); // Length limit

    if (cleanText.length < 10) {
      return res.status(400).json({ error: 'Text too short (min 10 chars)' });
    }

    // 5. API Key Validation
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey?.startsWith('sk-or-')) {
      console.error('Missing or invalid API key');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // 6. Payload Construction
    const payload = {
      model: "google/gemini-2.5-flash-lite"
,
      messages: [{
        role: "user",
        content: `Explain this in simple terms (under 100 words): ${cleanText}`
      }],
      temperature: 0.7,
      max_tokens: 200
    };

    // 7. API Request with Debugging
    console.log('Request payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.vercel.app', // MUST match your exact URL
        'X-Title': 'PDF-Explainer' // Exactly 12 chars
      },
      body: JSON.stringify(payload)
    });

    // 8. Response Handling
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error:', {
        status: response.status,
        error: errorData
      });
      return res.status(400).json({ 
        error: 'AI processing failed',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const data = await response.json();
    return res.json({ 
      explanation: data.choices[0].message.content 
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
