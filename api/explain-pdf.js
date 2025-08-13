export default async function handler(req, res) {
    // Enhanced CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            allowed_methods: ['POST']
        });
    }

    try {
        // Validate content type
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            return res.status(415).json({
                error: 'Unsupported Media Type',
                message: 'Please send JSON with Content-Type: application/json'
            });
        }

        // Parse and validate body
        const { text } = req.body;
        
        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                error: 'Invalid input',
                requirements: {
                    text: 'Must be a non-empty string',
                    min_length: 10,
                    max_length: 1500
                }
            });
        }

        // Sanitize and validate length
        const cleanText = text.trim().substring(0, 1500);
        if (cleanText.length < 10) {
            return res.status(400).json({
                error: 'Input too short',
                min_length: 10,
                actual_length: cleanText.length
            });
        }

        // Validate API key
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.error('Missing OPENROUTER_API_KEY environment variable');
            return res.status(500).json({
                error: 'Server configuration error',
                message: 'API key not configured'
            });
        }

        // Prepare AI request
        const payload = {
            model: "google/gemini-2.5-flash-lite",
            messages: [{
                role: "user",
                content: `Explain this PDF content in simple terms (100 words max): ${cleanText}`
            }],
            temperature: 0.7,
            max_tokens: 200
        };

        // Debug logging
        console.log('AI Request Payload:', {
            text_sample: cleanText.substring(0, 50) + (cleanText.length > 50 ? '...' : ''),
            length: cleanText.length
        });

        const startTime = Date.now();
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.origin || 'https://your-app.vercel.app',
                'X-Title': 'PDF-Explainer'
            },
            body: JSON.stringify(payload),
            timeout: 10000 // 10 seconds timeout
        });

        const responseTime = Date.now() - startTime;

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: await response.text() };
            }

            console.error('AI API Error:', {
                status: response.status,
                statusText: response.statusText,
                responseTime,
                error: errorData
            });

            return res.status(502).json({
                error: 'AI processing failed',
                status: response.status,
                api_error: errorData.error?.message || 'Unknown API error',
                suggestion: 'Please check your API key and input length',
                response_time_ms: responseTime
            });
        }

        const data = await response.json();
        
        if (!data.choices?.[0]?.message?.content) {
            console.error('Unexpected API response:', data);
            return res.status(502).json({
                error: 'AI response format unexpected',
                api_response: data
            });
        }

        return res.json({
            explanation: data.choices[0].message.content,
            model: data.model,
            usage: data.usage,
            response_time_ms: responseTime
        });

    } catch (error) {
        console.error('Server Error:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        return res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
            suggestion: 'Try again later or check your input',
            timestamp: new Date().toISOString()
        });
    }
}
