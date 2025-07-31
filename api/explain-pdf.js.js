// server.js (Modified for Serverless Deployment)

// 1. REMOVE dotenv configuration. Hosting platforms handle environment variables directly.
// require('dotenv').config();
// console.log("DEBUG: dotenv.config() executed.");

const express = require('express');
const bodyParser = require('body-parser');
// const path = require('path'); // 2. REMOVE path if app.get('/') is removed (static files served differently)
// const fetch = require('node-fetch'); // REMOVE THIS LINE - fetch is now global in Node.js 21

const app = express();
// 3. REMOVE PORT definition. The hosting platform will provide it if needed, or manage routing.
// const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json()); // To parse JSON request bodies

// 4. REMOVE serving static files directly from this backend.
// Static files (like index.html) are typically served by the hosting platform's static site builder.
// app.use(express.static(__dirname));

// Endpoint to explain PDF text using OpenRouter API
app.post('/explain-pdf', async (req, res) => { // Keep this path as is for now, will adjust for platform conventions later
    console.log("DEBUG: Received request on /explain-pdf");
    const pageText = req.body.text;

    if (!pageText) {
        console.log("DEBUG: No text provided in request body.");
        return res.status(400).json({ error: 'No text provided for explanation.' });
    }

    // 5. Environment variables are now expected from the hosting platform's settings
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-pro";

    console.log(`DEBUG: Raw process.env.OPENROUTER_API_KEY: "${openRouterApiKey ? '******' + openRouterApiKey.substring(openRouterApiKey.length - 8) : 'Not Set'}"`);
    console.log(`DEBUG: openRouterApiKey variable: "${openRouterApiKey ? '******' + openRouterApiKey.substring(openRouterApiKey.length - 8) : 'Not Set'}"`);
    console.log(`DEBUG: Is openRouterApiKey truthy? ${!!openRouterApiKey}`);


    if (!openRouterApiKey || openRouterApiKey.trim() === '') {
        // 6. Update error message to reflect checking platform's env vars
        console.error("DEBUG: OPENROUTER_API_KEY is missing, undefined, or empty after trimming. Check hosting platform's environment variables!");
        return res.status(500).json({ error: 'Server configuration error: OpenRouter API key not found.' });
    }

    // OpenRouter API endpoint
    const apiUrl = "https://openrouter.ai/api/v1/chat/completions";
    const authorizationHeader = `Bearer ${openRouterApiKey}`;

    console.log(`DEBUG: Using model: ${openRouterModel}`);
    console.log(`DEBUG: Authorization header being sent: "Bearer ******${openRouterApiKey.substring(openRouterApiKey.length - 8)}"`);


    const payload = {
        model: openRouterModel,
        messages: [
            {
                role: "user",
                content: `Explain the following text from a PDF page in simple, clear, and concise language. Focus on the main points and make it easy to understand for a non-expert. Text to explain: "${pageText}"`
            }
        ],
        // You can add other OpenRouter parameters here, like 'temperature', 'max_tokens', etc.
    };

    try {
        const openRouterResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authorizationHeader,
                // 7. Adjust HTTP-Referer for dynamic deployed environments
                'HTTP-Referer': `https://${req.headers.host}`,
                'X-Title': 'AI PDF Explainer App'
            },
            body: JSON.stringify(payload)
        });

        console.log(`DEBUG: OpenRouter API response status: ${openRouterResponse.status}`);
        if (!openRouterResponse.ok) {
            const errorData = await openRouterResponse.json().catch(() => {
                console.error("DEBUG: OpenRouter API returned non-OK status, but response was not JSON.");
                return {};
            });
            const errorMessage = errorData.message || errorData.error?.message || `OpenRouter API request failed with status ${openRouterResponse.status}`;
            console.error('DEBUG: OpenRouter API Error response:', errorData);
            console.error('DEBUG: Formatted error message for client:', errorMessage);
            return res.status(openRouterResponse.status).json({ error: `Failed to get explanation from AI: ${errorMessage}` });
        }

        const result = await openRouterResponse.json();
        console.log("DEBUG: OpenRouter API successful response (partial):", JSON.stringify(result).substring(0, 200) + "...");

        if (result.choices && result.choices.length > 0 && result.choices[0].message && result.choices[0].message.content) {
            const explanation = result.choices[0].message.content;
            res.json({ explanation: explanation });
        } else {
            console.error("DEBUG: Unexpected OpenRouter API response structure:", result);
            return res.status(500).json({ error: "Failed to get a valid explanation from the AI. The response format was unexpected or content was empty." });
        }

    } catch (error) {
        console.error('DEBUG: Server error during OpenRouter API call:', error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});

// 8. REMOVE the route for serving index.html.
// This file will now strictly be your API backend.
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'index.html'));
// });

// 9. REMOVE the app.listen block. The hosting platform will handle starting the server.
// app.listen(PORT, () => {
//     console.log(`Server running on http://localhost:${PORT}`);
//     console.log(`All files should be in the same directory as 'server.js'.`);
//     console.log(`Ensure your .env file is present and correct, then restart the server.`);
// });

// 10. IMPORTANT: Export the app instance. This is how serverless platforms get your Express app.
module.exports = app;