export default async function handler(req, res) {
    // 1. Validate Environment Configuration First
    const apiKey = process.env.OPENROUTER_API_KEY;
    const expectedReferer = process.env.ALLOWED_ORIGIN || 'https://your-app.vercel.app';
    
    if (!apiKey) {
        console.error('Configuration Error: OPENROUTER_API_KEY is not set in environment variables');
        return res.status(500).json({
            error: 'Server misconfiguration',
            message: 'API service is currently unavailable',
            resolution: 'Please contact support or try again later'
        });
    }

    if (!apiKey.startsWith('sk-or-')) {
        console.error('Configuration Error: Invalid API key format');
        return res.status(500).json({
            error: 'Server misconfiguration',
            message: 'Invalid API key format',
            required_format: 'Must start with "sk-or-"'
        });
    }

    // 2. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 3. Main Handler
    try {
        // [Previous validation and processing code remains the same]
        // ... (include all the previous input validation and processing logic)

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': expectedReferer,
                'X-Title': 'PDF-Explainer' // Exactly 12 chars
            },
            body: JSON.stringify(payload),
            timeout: 10000
        });

        // [Previous response handling remains the same]
        // ... (include all the previous response handling logic)

    } catch (error) {
        console.error('Server Error:', {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : 'hidden'
        });

        return res.status(500).json({
            error: 'Internal server error',
            message: 'Unexpected error occurred',
            request_id: req.headers['x-request-id'] || 'none'
        });
    }
}
