// Utility function for clean error responses
const errorResponse = (res, status, error, details = {}) => {
  console.error(`API Error [${status}]:`, { error, ...details });
  return res.status(status).json({
    success: false,
    error,
    ...details,
    timestamp: new Date().toISOString()
  });
};

export default async function handler(req, res) {
  // 1. Configuration Validation
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY environment variable not configured');
    }
    
    if (!process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
      throw new Error('Invalid OpenRouter API key format');
    }
  } catch (configError) {
    return errorResponse(res, 500, 'Server configuration error', {
      message: configError.message,
      resolution: 'Please check your environment variables'
    });
  }

  // 2. CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Method Validation
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed', {
      allowed_methods: ['POST']
    });
  }

  // 4. Request Processing
  try {
    // Validate Content-Type
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      return errorResponse(res, 415, 'Unsupported Media Type', {
        required: 'application/json'
      });
    }

    // Parse and validate body
    let text;
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      text = body?.text;
    } catch (parseError) {
      return errorResponse(res, 400, 'Invalid JSON payload');
    }

    if (typeof text !== 'string' || !text.trim()) {
      return errorResponse(res, 400, 'Invalid text input', {
        requirements: {
          type: 'string',
          min_length: 10,
          max_length: 15000
        }
      });
    }

    // Sanitize input
    const cleanText = text.trim().substring(0, 15000);
    if (cleanText.length < 10) {
      return errorResponse(res, 400, 'Text too short', {
        min_length: 10,
        actual_length: cleanText.length
      });
    }

    // Prepare AI request
    const payload = {
      model: "google/gemini-2.5-flash-lite",
      messages: [{
        role: "user",
        content: `Explain this PDF content in simple terms (100-150 words): ${cleanText}`
      }],
      temperature: 0.7,
      max_tokens: 300
    };

    // Make API request with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const startTime = Date.now();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.ALLOWED_ORIGIN || 'https://your-app.vercel.app',
        'X-Title': 'PDF-Explainer'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const responseTime = Date.now() - startTime;

    // Handle API response
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: await response.text() };
      }

      return errorResponse(res, 502, 'AI processing failed', {
        api_status: response.status,
        api_error: errorData.error?.message || 'Unknown API error',
        response_time_ms: responseTime
      });
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      return errorResponse(res, 502, 'Unexpected API response format', {
        api_response: data
      });
    }

    // Successful response
    return res.status(200).json({
      success: true,
      explanation: data.choices[0].message.content,
      model: data.model,
      usage: data.usage,
      response_time_ms: responseTime
    });

  } catch (error) {
    // Handle specific error types
    if (error.name === 'AbortError') {
      return errorResponse(res, 504, 'Request timeout', {
        timeout_ms: 15000
      });
    }

    // General error handling
    return errorResponse(res, 500, 'Internal server error', {
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
