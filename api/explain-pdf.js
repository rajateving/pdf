// /api/explain-pdf.js

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Helper for sending consistent and detailed error responses
const errorResponse = (res, status, error, details = {}) => {
  const errorId = Math.random().toString(36).substring(2, 9);
  console.error(`API Error [${status}][${errorId}]:`, { error, ...details });
  return res.status(status).json({
    success: false,
    error: `${error} (ID: ${errorId})`,
    details: details,
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
    return errorResponse(res, 405, 'Method Not Allowed');
  }

  // --- 1. API Key Validation ---
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return errorResponse(res, 500, 'Server Configuration Error', {
      hint: 'The OPENROUTER_API_KEY is not set on the server. Make sure you have a .env.local file with the key and have restarted your server.'
    });
  }
  if (!apiKey.startsWith('sk-or-')) {
    return errorResponse(res, 500, 'Server Configuration Error', {
      hint: 'The OpenRouter API key format is invalid. It must start with "sk-or-".'
    });
  }

  // --- 2. Request Body Validation ---
  let text, pageNumber;
  try {
    text = req.body?.text?.trim();
    if (!text) {
      return errorResponse(res, 400, 'Bad Request', { hint: 'Missing or empty "text" parameter in the request body.' });
    }
    pageNumber = parseInt(req.body?.page_number, 10) || 1;
  } catch (e) {
    return errorResponse(res, 400, 'Bad Request', { hint: 'Could not parse request body. Ensure it is valid JSON.' });
  }

  // --- 3. Prepare and Send Request to OpenRouter ---
  
  // **DYNAMIC REFERER FIX**: Automatically use your server's host or a default.
  const siteUrl = `http://${req.headers.host}` || 'http://localhost:3000';

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': siteUrl,
    'X-Title': 'AI PDF Explainer'
  };
  
  const payload = {
    model: "google/gemini-flash-1.5",
    messages: [{
      role: "user",
      content: `Explain the following text from page ${pageNumber} of a PDF. Be concise, clear, and focus on the main points (around 100-150 words).\n\nTEXT: "${text.substring(0, 15000)}"`
    }],
  };
  
  // Log what we are about to send (excluding the key itself)
  console.log('Sending request to OpenRouter with headers (referer):', headers['HTTP-Referer']);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenRouter Error Response:', data);
      return errorResponse(res, response.status, 'AI service returned an error.', data.error || { hint: 'Check the OpenRouter dashboard for API key status or credit balance.' });
    }

    const explanation = data.choices?.[0]?.message?.content;
    if (!explanation) {
      return errorResponse(res, 502, 'Unexpected API response structure.', { api_response: data });
    }

    return res.status(200).json({ success: true, explanation: explanation, model: data.model });

  } catch (error) {
    console.error('Fetch Error:', error);
    return errorResponse(res, 500, 'Internal Server Error', { hint: `Failed to connect to the AI service. Error: ${error.message}` });
  }
}
