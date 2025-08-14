const errorResponse = (res, status, error, details = {}) => {
    const errorId = Math.random().toString(36).substring(2, 9);
    console.error(API Error [${status}][${errorId}]:, { error, ...details });
    return res.status(status).json({
        success: false,
        error,
        error_id: errorId,
        ...details,
        timestamp: new Date().toISOString()
    });
};

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export default async function handler(req, res) {
    // CORS Setup
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return errorResponse(res, 405, 'Method not allowed', { allowed_methods: ['POST'] });
    }

    // Validate Configuration
    try {
        if (!process.env.OPENROUTER_API_KEY?.startsWith('sk-or-')) {
            throw new Error('Invalid or missing OpenRouter API key');
        }
    } catch (configError) {
        return errorResponse(res, 500, 'Server configuration error', {
            message: configError.message,
            resolution: 'Please check your environment variables'
        });
    }

    // Process Request
    try {
        // Validate Content-Type
        if (!req.headers['content-type']?.includes('application/json')) {
            return errorResponse(res, 415, 'Unsupported Media Type', {
                required: 'application/json'
            });
        }

        // Parse and validate body
        let text, pageNumber;
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            text = body?.text;
            pageNumber = body?.page_number || 1;
            
            if (typeof text !== 'string' || !text.trim()) {
                return errorResponse(res, 400, 'Invalid text input', {
                    requirements: { type: 'string', min_length: 10, max_length: 15000 }
                });
            }
        } catch (parseError) {
            return errorResponse(res, 400, 'Invalid JSON payload', {
                error: parseError.message
            });
        }

        // Sanitize input
        const cleanText = text.trim().substring(0, 15000);
        if (cleanText.length < 10) {
            return errorResponse(res, 400, 'Text too short', {
                min_length: 10, actual_length: cleanText.length
            });
        }

        // Prepare AI request
        const payload = {
            model: "google/gemini-2.5-flash-lite",
            messages: [{
                role: "user",
                content: Explain this PDF content from page ${pageNumber} in simple terms (100-150 words):\n\n${cleanText}
            }],
            temperature: 0.7,
            max_tokens: 300
        };

        // Make API request with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        try {
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': Bearer ${process.env.OPENROUTER_API_KEY},
                    'Content-Type': 'application/json',
                    'HTTP-Referer': req.headers.origin || process.env.ALLOWED_ORIGIN || 'https://your-app.vercel.app',
                    'X-Title': 'PDF-Explainer'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeout);

            const data = await response.json();
            
            if (!response.ok) {
                console.error('OpenRouter API Error:', { status: response.status, error: data });
                return errorResponse(res, 502, 'AI processing failed', {
                    api_status: response.status,
                    api_error: data.error?.message || 'Unknown API error'
                });
            }

            if (!data.choices?.[0]?.message?.content) {
                return errorResponse(res, 502, 'Unexpected API response format', {
                    api_response: data
                });
            }

            return res.status(200).json({
                success: true,
                explanation: data.choices[0].message.content,
                model: data.model
            });

        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError') {
                return errorResponse(res, 504, 'Request timeout', { timeout_ms: 20000 });
            }
            throw error;
        }

    } catch (error) {
        console.error('Server Error:', error);
        return errorResponse(res, 500, 'Internal server error', {
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
