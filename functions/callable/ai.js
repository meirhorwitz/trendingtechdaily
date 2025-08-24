// functions/callable/ai.js

const { HttpsError } = require("firebase-functions/v2/https");
const { logger, db, CONFIG } = require('../config'); 
const { loadGeminiSDK, getSafetySettings, getSafe, getGeminiSDK, getStockMappingCacheDuration } = require('../utils');
const fetch = require('node-fetch');

// --- generateArticleContent (robust JSON parsing for code blocks) ---
async function generateArticleContent(request) { // request contains { auth, data }
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    
    const topic = request.data.prompt; 
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      throw new HttpsError("invalid-argument", "A non-empty 'prompt' (topic) string is required.");
    }
    logger.info(`generateArticleContent: Received topic prompt from user ${request.auth.uid}: "${topic.substring(0, 100)}..."`);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error("generateArticleContent: GEMINI_API_KEY is not configured.");
        return { error: true, message: "API Key not configured." }; // Return error object
      }
      
      const sdkLoaded = await loadGeminiSDK();
      const { GoogleGenerativeAI } = getGeminiSDK(); 
      
      if (!sdkLoaded || !GoogleGenerativeAI) {
        logger.error("generateArticleContent: GoogleGenerativeAI SDK not loaded.");
        throw new HttpsError("internal", "Core AI SDK (@google/generative-ai) failed to load.");
      }
      
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings: getSafetySettings() }); 

      const structuredPrompt = `
Write a professional tech/finance news article about "${topic}" in the style of Yahoo Finance or Bloomberg.

Requirements:
- Write in a journalistic style with clear paragraphs.
- Use factual, analytical tone without marketing language.
- Include relevant data, trends, and market impact where applicable.
- Structure with natural paragraphs (no bullet points or lists).
- Mention specific companies or technologies when relevant.
- Length: 400-600 words.

Output MUST be ONLY a raw JSON object with these exact keys:
{
"title": "string, max 70 chars, professional headline",
"slug": "string, lowercase, hyphenated, based on title",
"content": "string, HTML with <p> tags for paragraphs, 400-600 words",
"excerpt": "string, informative summary, max 160 chars",
"tags": ["array", "of", "relevant", "tags"],
"imagePrompt": "string, professional image description for article illustration, suitable for AI image generator",
"mentionedCompanies": ["array", "of", "publicly traded company names mentioned (e.g., Apple, Microsoft)"],
"imageAltText": "string, descriptive alt text for the image, based on imagePrompt"
}

Generate the article about: "${topic}". Output ONLY the JSON object.
`;

      logger.info("generateArticleContent: Sending structured prompt to Gemini...");
      const result = await model.generateContent(structuredPrompt);
      const response = await result.response;
      const rawTextResponse = response.text();
      logger.info("generateArticleContent: Raw Gemini Response (first 500 chars):", rawTextResponse.substring(0, 500));

      let generatedJson = {};
      let parseErrorOccurred = false;
      let validationErrorOccurred = false;
      let errorMessage = "";

      try {
        // Robustly extract JSON from code block or plain text
        let jsonText = rawTextResponse.trim();
        
        // Remove markdown code blocks
        if (jsonText.includes('```json')) {
            jsonText = jsonText.replace(/```json\s*/g, '');
            jsonText = jsonText.replace(/\s*```/g, '');
        } else if (jsonText.includes('```')) {
            jsonText = jsonText.replace(/```\s*/g, '');
        }
        
        // Try to find JSON object
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch || !jsonMatch[0]) {
          throw new Error("No valid JSON object found in AI response.");
        }
        
        generatedJson = JSON.parse(jsonMatch[0]);
        logger.info("generateArticleContent: Successfully parsed JSON from Gemini response.");
      } catch (parseError) {
        parseErrorOccurred = true;
        errorMessage = "AI response was not valid JSON. Parse error: " + parseError.message;
        logger.error("generateArticleContent: Failed to parse JSON.", parseError, "Raw Text:", rawTextResponse);
      }

      if (!parseErrorOccurred) {
        if (!generatedJson.title || !generatedJson.content || !generatedJson.slug) {
          validationErrorOccurred = true;
          errorMessage = "AI response missing required fields (title, content, slug).";
          logger.error("generateArticleContent: Parsed JSON missing required fields:", generatedJson);
        }
      }

      if (parseErrorOccurred || validationErrorOccurred) {
        return { error: true, message: errorMessage, rawText: rawTextResponse };
      } else {
        return {
          title: getSafe(() => generatedJson.title),
          slug: getSafe(() => generatedJson.slug),
          content: getSafe(() => generatedJson.content),
          excerpt: getSafe(() => generatedJson.excerpt),
          tags: getSafe(() => generatedJson.tags, []),
          imagePrompt: getSafe(() => generatedJson.imagePrompt),
          imageAltText: getSafe(() => generatedJson.imageAltText, getSafe(() => generatedJson.title)),
          mentionedCompanies: getSafe(() => generatedJson.mentionedCompanies, [])
        };
      }
    } catch (error) {
      logger.error("generateArticleContent General Error Caught:", error);
      let generalErrorMessage = error.message || "Unknown error during article generation.";
      if (error.response?.promptFeedback?.blockReason) {
        generalErrorMessage = `Content generation blocked: ${error.response.promptFeedback.blockReason}.`;
      }
      return { error: true, message: generalErrorMessage }; // Return error object
    }
}

// --- rephraseText (Placeholder - Implement your logic) ---
async function rephraseText(request) { 
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    // TODO: Implement your rephraseText logic using Gemini
    return { rephrasedText: `Rephrased: ${request.data.text} (placeholder)` };
}

// --- suggestArticleTopic (Enhanced with better randomization) ---
async function suggestArticleTopic(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const GROK_API_KEY = process.env.GROK_API_KEY;
    if (!GROK_API_KEY) throw new HttpsError("internal", "GROK_API_KEY secret is not configured.");
    
    // Enhanced randomization with timestamp and longer random string
    const timestamp = Date.now();
    const randomizer = Math.random().toString(36).substring(2, 15);
    const userPrompt = request.data && request.data.prompt ? request.data.prompt : "trending technology";
    
    // Create a more dynamic prompt
    const prompt = `${userPrompt} [timestamp:${timestamp}] [session:${randomizer}] [unique:${Math.random()}]`;
    
    try {
        const grokResponse = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROK_API_KEY}`
            },
            body: JSON.stringify({
                model: "grok-3-latest",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert tech journalist assistant. Suggest a fresh and up-to-date technology news topic based on events from the last 24 hours. Never repeat a topic during the session and vary the area of tech discussed. Respond with a JSON object: { topic: string, reason: string }`
                    },
                    { 
                        role: "user", 
                        content: prompt 
                    }
                ],
                stream: false,
                temperature: 1.2,  // Increased from 0.8 for more randomness
                max_tokens: 200,
                top_p: 0.95  // Added for more diversity
            })
        });
        
        if (!grokResponse.ok) {
            throw new Error(`Grok API error: ${grokResponse.status} ${await grokResponse.text()}`);
        }
        
        const data = await grokResponse.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        let topic = "";
        let reason = "";
        
        if (content) {
            try {
                // Robustly extract JSON from code block or plain text
                let jsonText = content;
                if (jsonText.includes('```json')) {
                    jsonText = jsonText.replace(/^```json\s*/, '');
                    jsonText = jsonText.replace(/\s*```\s*$/, '');
                } else if (jsonText.startsWith('```') && jsonText.endsWith('```')) {
                    jsonText = jsonText.substring(3, jsonText.length - 3).trim();
                }
                const jsonMatch = jsonText.match(/(\{[\s\S]*\})/);
                if (!jsonMatch || !jsonMatch[0]) {
                    throw new Error("No valid JSON object found in AI response.");
                }
                const parsed = JSON.parse(jsonMatch[0]);
                topic = parsed.topic;
                reason = parsed.reason;
            } catch (e) {
                // If not valid JSON, fallback to plain text
                topic = content;
                reason = "";
            }
        }
        
        logger.info(`Suggested topic: "${topic}" with randomizer: ${randomizer}`);
        return { topic, reason };
    } catch (error) {
        logger.error("Grok API error:", error);
        throw new HttpsError("internal", `Grok API failed: ${error.message}`);
    }
}

// --- generateArticleImage (Gemini-generated photos) ---
async function generateArticleImage(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { prompt, articleTitle = "" } = request.data;

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
        throw new HttpsError("invalid-argument", "A non-empty 'prompt' string is required.");
    }

    logger.info(`generateArticleImage called for prompt: "${prompt}", title: "${articleTitle}"`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.error("generateArticleImage: GEMINI_API_KEY is not configured.");
        throw new HttpsError("internal", "GEMINI API Key not configured.");
    }

    try {
        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenerativeAI } = getGeminiSDK();

        if (!sdkLoaded || !GoogleGenerativeAI) {
            logger.error("GoogleGenerativeAI SDK not loaded.");
            throw new HttpsError("internal", "Core AI SDK failed to load.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            safetySettings: getSafetySettings(),
            generationConfig: { outputMimeType: "image/png" }
        });

        const promptText = `Generate a high-quality technology photo for the article titled "${articleTitle || prompt}".`;
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: promptText }] }]
        });

        const part = result?.response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part || !part.inlineData?.data) {
            throw new Error("No image returned by Gemini");
        }

        const imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        const imageAltText = `${articleTitle || prompt} - Generated by Gemini`;

        return {
            success: true,
            imageUrl,
            imageAltText,
            source: "gemini",
            message: "Image generated with Gemini"
        };
    } catch (error) {
        logger.error("Image generation error:", error);
        throw new HttpsError("internal", "Gemini image generation failed.");
    }
}

// --- generateTopTenArticle ---
async function generateTopTenArticle(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const topic = request.data && request.data.topic;
    const count = request.data && request.data.count ? parseInt(request.data.count, 10) : 10;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
        throw new HttpsError("invalid-argument", "A non-empty 'topic' string is required.");
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new HttpsError("internal", "GEMINI_API_KEY not configured.");

        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenerativeAI } = getGeminiSDK();
        if (!sdkLoaded || !GoogleGenerativeAI) throw new HttpsError("internal", "Core AI SDK failed to load.");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings: getSafetySettings() });

        const structuredPrompt = `Create a top ${count} list article about "${topic}" for a technology news website.

Requirements:
- Provide a brief introductory paragraph (key: intro).
- Provide exactly ${count} list items (key: items) where each item has: title, a detailed paragraph of at least 80 words, imagePrompt, imageAltText, and url (the official website or resource link when applicable).
- Provide a concluding paragraph (key: conclusion).
- Provide relevant tags (key: tags) and a URL-friendly slug (key: slug).
Output ONLY JSON with keys: title, slug, intro, items, conclusion, tags. Each item should include a "url" field when recommending a website or resource.`;

        const result = await model.generateContent(structuredPrompt);
        const response = await result.response;
        let rawText = response.text();
        rawText = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON object in AI response");

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.title || !Array.isArray(parsed.items)) {
            throw new Error("Parsed JSON missing required fields");
        }

        for (const item of parsed.items) {
            try {
                const prompt = item.imagePrompt
                    ? `${item.imagePrompt} ${topic}`
                    : `${item.title} ${topic} technology`;
                const imgRes = await generateArticleImage({
                    auth: request.auth,
                    data: { prompt, articleTitle: item.title }
                });
                item.imageUrl = imgRes.imageUrl;
                item.imageAltText = imgRes.imageAltText;
            } catch (e) {
                logger.error("Image generation failed for item", item.title, e);
                item.imageUrl = '';
            }
        }

        let content = '';
        if (parsed.intro) content += `<p>${parsed.intro}</p>`;
        parsed.items.forEach((item, idx) => {
            const itemUrl = item.url || item.link || item.website;
            const titleWithLink = itemUrl
                ? `<a href="${itemUrl}" target="_blank" rel="noopener noreferrer">${item.title}</a>`
                : item.title;
            content += `<h2>${idx + 1}. ${titleWithLink}</h2>`;
            if (item.imageUrl) content += `<p><img src="${item.imageUrl}" alt="${item.imageAltText || ''}" class="img-fluid"></p>`;
            content += `<p>${item.paragraph}</p>`;
        });
        if (parsed.conclusion) content += `<p>${parsed.conclusion}</p>`;

        const excerpt = parsed.intro ? parsed.intro.substring(0, 157) + '...' : '';

        return {
            title: parsed.title,
            slug: parsed.slug || parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            content,
            excerpt,
            tags: parsed.tags || [],
            items: parsed.items
        };
    } catch (err) {
        logger.error('generateTopTenArticle error:', err);
        throw new HttpsError('internal', err.message || 'Failed to generate top list article');
    }
}

// --- generateHowToArticle ---
async function generateHowToArticle(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const topic = request.data && request.data.topic;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
        throw new HttpsError("invalid-argument", "A non-empty 'topic' string is required.");
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new HttpsError("internal", "GEMINI_API_KEY not configured.");

        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenerativeAI } = getGeminiSDK();
        if (!sdkLoaded || !GoogleGenerativeAI) throw new HttpsError("internal", "Core AI SDK failed to load.");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings: getSafetySettings() });

        const structuredPrompt = `Create a step-by-step how-to article about "${topic}" for a technology news website.

Requirements:
- Provide a brief introductory paragraph (key: intro).
- Provide an ordered list of steps (key: steps) where each step has: title, a detailed paragraph of at least 80 words, imagePrompt, imageAltText.
- Provide a concluding paragraph (key: conclusion).
- Provide relevant tags (key: tags) and a URL-friendly slug (key: slug).
Output ONLY JSON with keys: title, slug, intro, steps, conclusion, tags.`;

        const result = await model.generateContent(structuredPrompt);
        const response = await result.response;
        let rawText = response.text();
        rawText = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON object in AI response");

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.title || !Array.isArray(parsed.steps)) {
            throw new Error("Parsed JSON missing required fields");
        }

        for (const step of parsed.steps) {
            try {
                const prompt = step.imagePrompt
                    ? `${step.imagePrompt} ${topic}`
                    : `${step.title} ${topic} technology`;
                const imgRes = await generateArticleImage({
                    auth: request.auth,
                    data: { prompt, articleTitle: step.title }
                });
                step.imageUrl = imgRes.imageUrl;
                step.imageAltText = imgRes.imageAltText;
            } catch (e) {
                logger.error("Image generation failed for step", step.title, e);
                step.imageUrl = '';
            }
        }

        let content = '';
        if (parsed.intro) content += `<p>${parsed.intro}</p>`;
        parsed.steps.forEach((step, idx) => {
            content += `<h2>Step ${idx + 1}: ${step.title}</h2>`;
            if (step.imageUrl) content += `<p><img src="${step.imageUrl}" alt="${step.imageAltText || ''}" class="img-fluid"></p>`;
            content += `<p>${step.paragraph}</p>`;
        });
        if (parsed.conclusion) content += `<p>${parsed.conclusion}</p>`;

        const excerpt = parsed.intro ? parsed.intro.substring(0, 157) + '...' : '';

        return {
            title: parsed.title,
            slug: parsed.slug || parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            content,
            excerpt,
            tags: parsed.tags || [],
            steps: parsed.steps
        };
    } catch (err) {
        logger.error('generateHowToArticle error:', err);
        throw new HttpsError('internal', err.message || 'Failed to generate how-to article');
    }
}

// --- getStockDataForCompanies (Placeholder - Implement your logic) ---
async function getStockDataForCompanies(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    // TODO: Implement your getStockDataForCompanies logic
    return { stockData: [] };
}

// --- readArticleAloud using Gemini TTS ---
async function readArticleAloud(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const text = request.data && request.data.text;
    if (!text || typeof text !== 'string' || text.trim() === '') {
        throw new HttpsError("invalid-argument", "A non-empty 'text' field is required.");
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new HttpsError("internal", "GEMINI_API_KEY not configured.");

        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenerativeAI } = getGeminiSDK();
        if (!sdkLoaded || !GoogleGenerativeAI) throw new HttpsError("internal", "Core AI SDK failed to load.");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'tts-1-hd' });
        const result = await model.generateContent(text, { responseMimeType: 'audio/mp3' });
        const response = await result.response;
        const arrayBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString('base64');
        return { success: true, audioContent: base64Audio };
    } catch (err) {
        logger.error('readArticleAloud error:', err);
        throw new HttpsError('internal', 'Failed to generate audio');
    }
}

module.exports = {
  generateArticleContent,
  rephraseText,
  suggestArticleTopic,
  generateArticleImage,
  generateTopTenArticle,
  generateHowToArticle,
  getStockDataForCompanies,
  readArticleAloud,
};