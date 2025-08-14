const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Helper for sending consistent error responses
const errorResponse = (res, status, error, details = {}) => {
  const errorId = Math.random().toString(36).substring(2, 9);
  console.error(`API Error [${status}][${errorId}]:`, { 
    error, 
    ...details,
    timestamp: new Date().toISOString()
  });
  
  return res.status(status).json({
    success: false,
    error: `${error} (Error ID: ${errorId})`,
    error_id: errorId,
    ...details,
  });
};

export default async function handler(req, res) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method Not Allowed', { 
      allowed_methods: ['POST'],
      received_method: req.method
    });
  }

  // --- API Key Validation ---
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return errorResponse(res, 500, 'Server configuration error: Missing API key', {
      hint: 'The OPENROUTER_API_KEY environment variable is not set on the server.'
    });
  }
  if (!apiKey.startsWith('sk-or-')) {
    return errorResponse(res, 500, 'Server configuration error: Invalid API key format', {
      hint: 'The provided OpenRouter API key is malformed. It should start with "sk-or-".'
    });
  }

  // --- Request Body Validation ---
  let text, pageNumber;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    text = body?.text?.trim();
    pageNumber = parseInt(body?.page_number, 10) || 1;

    if (!text) {
      return errorResponse(res, 400, 'Bad Request: Missing or empty "text" parameter.');
    }
  } catch (parseError) {
    return errorResponse(res, 400, 'Bad Request: Invalid JSON in request body.', {
      error_message: parseError.message
    });
  }

  // --- Prepare and Send Request to OpenRouter ---
  const payload = {
    model: "google/gemini-2.5-flash-lite", // Using a reliable and fast model
    messages: [
      {
        role: "user",
        content: `Explain the following text from page ${pageNumber} of a document. Be concise and clear, aiming for about 100-150 words. Focus on the main points.\n\n---START OF TEXT---\n${text.substring(0, 15000)}\n---END OF TEXT---`
      }
    ],
    temperature: 0.6,
    max_tokens: 350,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25-second timeout

  try {
    const startTime = Date.now();
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000', // **CRITICAL FIX**: Required by OpenRouter. Change if your site URL is different.
        'X-Title': 'AI PDF Explainer'             // Recommended by OpenRouter
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
        return errorResponse(res, 502, 'AI service returned an error', {
            api_status: response.status,
            api_error: data.error?.message || 'Unknown error from OpenRouter.'
        });
    }

    const explanation = data.choices?.[0]?.message?.content;
    if (!explanation) {
        return errorResponse(res, 502, 'Unexpected API response structure', {
            api_response_sample: JSON.stringify(data).substring(0, 200)
        });
    }
    
    return res.status(200).json({
      success: true,
      explanation: explanation,
      model: data.model,
      response_time_ms: responseTime
    });

  } catch (error) {
    clearTimeout(timeout);
    
    if (error.name === 'AbortError') {
      return errorResponse(res, 504, 'Request to AI service timed out after 25 seconds.');
    }
    
    return errorResponse(res, 500, 'Internal Server Error while contacting AI service.', {
      error_message: error.message
    });
  }
}
