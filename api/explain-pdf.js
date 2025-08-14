const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Standardized error responses
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

export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'POST') {
        return errorResponse(res, 405, 'Method not allowed', { allowed_methods: ['POST'] });
    }

    // --- Validate API Key ---
    if (!process.env.OPENROUTER_API_KEY?.startsWith('sk-or-')) {
        return errorResponse(res, 500, 'Server configuration error', {
            message: 'Invalid or missing OpenRouter API key'
        });
    }

    // --- Parse Request Body ---
    let text, pageNumber;
    try {
        // Plain Node doesn't parse JSON automatically, so we parse it manually
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        text = body?.text?.trim();
        pageNumber = body?.page_number || 1;

        if (!text || text.length < 10) {
            return errorResponse(res, 400, 'Invalid text input', {
                min_length: 10,
                actual_length: text?.length || 0
            });
        }
    } catch (parseError) {
        return errorResponse(res, 400, 'Invalid JSON payload', { error: parseError.message });
    }

    // --- Prepare AI request ---
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

    // --- Fetch AI response with timeout ---
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': Bearer ${process.env.OPENROUTER_API_KEY},
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        const data = await response.json();

        if (!response.ok) {
            return errorResponse(res, 502, 'AI processing failed', {
                api_status: response.status,
                api_error: data.error?.message || 'Unknown API error'
            });
        }

        if (!data.choices?.[0]?.message?.content) {
            return errorResponse(res, 502, 'Unexpected API response format', { api_response: data });
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

        console.error('Server Error:', error);
        return errorResponse(res, 500, 'Internal server error', {
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
