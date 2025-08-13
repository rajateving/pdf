// Enhanced error response utility
const errorResponse = (res, status, error, details = {}) => {
  const errorId = Math.random().toString(36).substring(2, 9);
  console.error(`API Error [${status}][${errorId}]:`, { error, ...details });
  
  return res.status(status).json({
    success: false,
    error,
    error_id: errorId,
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Rate limiting setup
const rateLimit = new Map();

export default async function handler(req, res) {
  // 0. Rate Limiting (optional but recommended)
  const IP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const currentTime = Date.now();
  const windowDuration = 60000; // 1 minute
  const maxRequests = 10; // Max requests per window
  
  if (rateLimit.has(IP)) {
    const userData = rateLimit.get(IP);
    if (userData.count >= maxRequests && currentTime - userData.startTime < windowDuration) {
      return errorResponse(res, 429, 'Too many requests', {
        retry_after: Math.ceil((windowDuration - (currentTime - userData.startTime)) / 1000),
        limit: maxRequests,
        window: '1 minute'
      });
    }
    
    if (currentTime - userData.startTime > windowDuration) {
      rateLimit.set(IP, { count: 1, startTime: currentTime });
    } else {
      userData.count += 1;
    }
  } else {
    rateLimit.set(IP, { count: 1, startTime: currentTime });
  }

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

  // 2. Enhanced CORS Setup
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
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

    // Enhanced body parsing with size limit
    let text;
    try {
      const MAX_BODY_SIZE = 1024 * 1024 * 2; // 2MB
      if (req.headers['content-length'] > MAX_BODY_SIZE) {
        return errorResponse(res, 413, 'Payload too large', {
          max_size: '2MB'
        });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      text = body?.text;
    } catch (parseError) {
      return errorResponse(res, 400, 'Invalid JSON payload', {
        error: parseError.message
      });
    }

    // Validate text input
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

    // Prepare AI request with enhanced prompt
    const payload = {
      model: "google/gemini-2.5-flash-lite",
      messages: [{
        role: "user",
        content: `Explain this PDF content in simple terms (100-150 words), maintaining accuracy while making it easy to understand. Focus on key concepts and avoid technical jargon unless necessary:\n\n${cleanText}`
      }],
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9
    };

    // Make API request with timeout and retry logic
    const MAX_RETRIES = 2;
    let retryCount = 0;
    let response;
    let responseTime;

    while (retryCount <= MAX_RETRIES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const startTime = Date.now();

      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        responseTime = Date.now() - startTime;
        break;
      } catch (error) {
        clearTimeout(timeout);
        if (retryCount === MAX_RETRIES) throw error;
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

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
        response_time_ms: responseTime,
        attempt: retryCount + 1
      });
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      return errorResponse(res, 502, 'Unexpected API response format', {
        api_response: data
      });
    }

    // Cache control headers for successful responses
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');

    // Successful response
    return res.status(200).json({
      success: true,
      explanation: data.choices[0].message.content,
      model: data.model,
      usage: data.usage,
      response_time_ms: responseTime,
      truncated: text.length > 15000
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
