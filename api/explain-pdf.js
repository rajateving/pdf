const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Enhanced error response with more debugging info
const errorResponse = (res, status, error, details = {}) => {
    const errorId = Math.random().toString(36).substring(2, 9);
    console.error(API Error [${status}][${errorId}]:, { 
        error, 
        ...details,
        timestamp: new Date().toISOString()
    });
    
    return res.status(status).json({
        success: false,
        error: ${error} (Error ID: ${errorId}),
        error_id: errorId,
        ...details,
        timestamp: new Date().toISOString()
    });
};

export default async function handler(req, res) {
    // Log incoming request
    console.log('Request received:', {
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    });

    // Enhanced CORS handling
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return errorResponse(res, 405, 'Method not allowed', { 
            allowed_methods: ['POST'],
            received_method: req.method
        });
    }

    // Validate API Key with better error reporting
    if (!process.env.OPENROUTER_API_KEY) {
        return errorResponse(res, 500, 'Server configuration error - Missing OpenRouter API key', {
            hint: 'Please set OPENROUTER_API_KEY environment variable'
        });
    }

    if (!process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
        return errorResponse(res, 500, 'Server configuration error - Invalid OpenRouter API key format', {
            hint: 'API key should start with "sk-or-"'
        });
    }

    // Parse request body with better error handling
    let text, pageNumber;
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        text = body?.text?.trim();
        pageNumber = parseInt(body?.page_number) || 1;

        if (!text) {
            return errorResponse(res, 400, 'Missing text parameter', {
                required: 'text (string)',
                received: Object.keys(body)
            });
        }

        if (text.length < 10) {
            return errorResponse(res, 400, 'Text too short', {
                min_length: 10,
                actual_length: text.length,
                sample_text: text.length > 20 ? text.substring(0, 20) + '...' : text
            });
        }
    } catch (parseError) {
        return errorResponse(res, 400, 'Invalid request body', {
            error: parseError.message,
            body_sample: typeof req.body === 'string' ? req.body.substring(0, 100) : 'Not a string'
        });
    }

    // Prepare AI request with logging
    const payload = {
        model: "google/gemini-2.5-flash-lite",
        messages: [
            {
                role: "user",
                content: Explain this PDF content from page ${pageNumber} in simple terms (100-150 words):\n\n${text.substring(0, 15000)}
            }
        ],
        temperature: 0.7,
        max_tokens: 300
    };

    console.log('Sending to OpenRouter:', {
        model: payload.model,
        text_length: text.length,
        pageNumber
    });

    // Fetch with timeout and better error handling
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

    try {
        const startTime = Date.now();
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': Bearer ${process.env.OPENROUTER_API_KEY},
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://your-site.com', // Required by OpenRouter
                'X-Title': 'AI PDF Explainer'              // Recommended by OpenRouter
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);
        const responseTime = Date.now() - startTime;

        const data = await response.json().catch(e => ({
            error: Failed to parse JSON: ${e.message}
        }));

        console.log('OpenRouter response:', {
            status: response.status,
            time: ${responseTime}ms,
            model: data.model,
            usage: data.usage
        });

        if (!response.ok) {
            return errorResponse(res, 502, 'AI service error', {
                api_status: response.status,
                api_error: data.error?.message || JSON.stringify(data),
                response_time: responseTime
            });
        }

        if (!data.choices?.[0]?.message?.content) {
            return errorResponse(res, 502, 'Unexpected API response', {
                api_response: data,
                expected_structure: 'choices[0].message.content'
            });
        }

        // Successful response
        return res.status(200).json({
            success: true,
            explanation: data.choices[0].message.content,
            model: data.model,
            response_time: responseTime
        });

    } catch (error) {
        clearTimeout(timeout);
        
        console.error('API Call Failed:', {
            error: error.message,
            stack: error.stack,
            type: error.name
        });

        if (error.name === 'AbortError') {
            return errorResponse(res, 504, 'Request to AI service timed out', {
                timeout_ms: 25000
            });
        }

        return errorResponse(res, 500, 'Internal server error', {
            error: error.message,
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }
}
