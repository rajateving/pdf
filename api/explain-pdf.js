// In file: /api/explain-pdf.js

const https = require('https');

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Helper function to send a consistent error response
const sendError = (res, status, message, details = {}) => {
  console.error("API Error:", { status, message, details });
  res.status(status).json({
    success: false,
    error: message,
    details,
  });
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method Not Allowed');
  }

  // 1. Validate API Key from environment variables
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-or-')) {
    return sendError(res, 500, 'Server Configuration Error', {
      hint: 'The OPENROUTER_API_KEY is missing or invalid on the server. Ensure your .env.local file is correct and you have restarted the server.'
    });
  }

  // 2. Validate request body
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return sendError(res, 400, 'Bad Request', { hint: 'Request body must include a non-empty "text" field.' });
  }

  // 3. Prepare the request to OpenRouter
  const siteUrl = `http://${req.headers.host || 'localhost:3000'}`;
  
  const payload = JSON.stringify({
    model: "google/gemini-2.5-flash-lite",
    messages: [{
      role: "user",
      content: `Explain this text from a PDF page simply and concisely (100-150 words). Focus on the key takeaways.\n\nTEXT: "${text.substring(0, 15000)}"`
    }],
  });
  
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': siteUrl,
      'X-Title': 'AI PDF Explainer'
    },
    timeout: 30000, // 30 seconds
  };

  // 4. Make the API call
  try {
    const apiReq = https.request(OPENROUTER_API_URL, options, (apiRes) => {
      let responseBody = '';
      apiRes.on('data', (chunk) => {
        responseBody += chunk;
      });

      apiRes.on('end', () => {
        try {
          const data = JSON.parse(responseBody);
          if (apiRes.statusCode >= 400) {
            return sendError(res, apiRes.statusCode, 'AI service returned an error.', data.error);
          }
          
          const explanation = data.choices?.[0]?.message?.content;
          if (!explanation) {
            return sendError(res, 502, 'Unexpected API response structure.', { api_response: data });
          }
          
          res.status(200).json({ success: true, explanation });
        } catch (e) {
          sendError(res, 500, 'Failed to parse AI service response.', { raw_response: responseBody });
        }
      });
    });

    apiReq.on('error', (e) => {
      sendError(res, 500, 'Failed to connect to AI service.', { error_message: e.message });
    });
    
    apiReq.on('timeout', () => {
      apiReq.destroy();
      sendError(res, 504, 'Request to AI service timed out.');
    });

    apiReq.write(payload);
    apiReq.end();

  } catch (e) {
    sendError(res, 500, 'An unexpected error occurred.', { error_message: e.message });
  }
};


