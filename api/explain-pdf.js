import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Invalid input text" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
      Please explain the following PDF page content in simple and clear language, 
      suitable for someone without technical expertise:
      ---
      ${text}
      ---
    `;

    const result = await model.generateContent(prompt);
    const explanation = result.response.text().trim();

    return res.status(200).json({ explanation });
  } catch (error) {
    console.error("Error generating explanation:", error);
    return res.status(500).json({ error: "Failed to generate explanation" });
  }
}
