// functions/callable/ai.js

const { HttpsError } = require("firebase-functions/v2/https");
const { logger, db, CONFIG } = require('../config'); 
const { loadGeminiSDK, getSafetySettings, getSafe, getGeminiSDK, getStockMappingCacheDuration } = require('../utils');
const fetch = require('node-fetch');

// --- Helper function to get relevant stock images based on keywords ---
function getFallbackImagesForCategory(prompt = "") {
  const promptLower = prompt.toLowerCase();
  const imageCategories = CONFIG.fallbackImages ? {
      ai: [CONFIG.fallbackImages.AI || "https://images.unsplash.com/photo-1677442135394-633f44004c86?w=1200&q=80"],
      gadgets: [CONFIG.fallbackImages.Gadgets || "https://images.unsplash.com/photo-1526570207772-2a4269e3ac40?w=1200&q=80"],
      startups: [CONFIG.fallbackImages.Startups || "https://images.unsplash.com/photo-1661956602116-661d5c25f9f4?w=1200&q=80"],
      crypto: [CONFIG.fallbackImages.Crypto || "https://images.unsplash.com/photo-1640340002902-a0588c2a6f38?w=1200&q=80"],
      blockchain: [ CONFIG.fallbackImages.Crypto || "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&q=80"],
      cybersecurity: ["https://images.unsplash.com/photo-1614064641938-3bbbc90f9e36?w=1200&q=80"],
      cloud: ["https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&q=80"],
      data: ["https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80"],
      mobile: ["https://images.unsplash.com/photo-1598128558393-70ff0c39a29d?w=1200&q=80"],
      default: [CONFIG.fallbackImages.default || "https://images.unsplash.com/photo-1488590528505-98fb2e5ea1c4?w=1200&q=80"]
  } : { 
      default: ["https://images.unsplash.com/photo-1488590528505-98fb2e5ea1c4?w=1200&q=80"]
  };
  
  for (const [category, images] of Object.entries(imageCategories)) {
    if (category !== 'default' && promptLower.includes(category)) return images;
  }
  const techKeywords = {
    'artificial intelligence': imageCategories.ai || imageCategories.default,
    'machine learning': imageCategories.ai || imageCategories.default,
    'crypto': imageCategories.blockchain || imageCategories.default,
    'bitcoin': imageCategories.blockchain || imageCategories.default,
    'security': imageCategories.cybersecurity || imageCategories.default,
    'cloud': imageCategories.cloud || imageCategories.default,
    'analytics': imageCategories.data || imageCategories.default,
    'smartphone': imageCategories.mobile || imageCategories.default,
  };
  for (const [keyword, images] of Object.entries(techKeywords)) {
    if (promptLower.includes(keyword)) return images;
  }
  return imageCategories.default;
}

// --- generateArticleContent (Implemented Version from previous step) ---
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
        let jsonText = rawTextResponse;
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
        generatedJson = JSON.parse(jsonMatch[0]);
        logger.info("generateArticleContent: Successfully parsed JSON from Gemini response.");
      } catch (parseError) {
        parseErrorOccurred = true;
        errorMessage = "AI response was not valid JSON. Raw: " + rawTextResponse.substring(0,100);
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

// --- suggestArticleTopic (Placeholder - Implement your logic) ---
async function suggestArticleTopic(request) { 
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    // TODO: Implement your suggestArticleTopic logic using Gemini
    return { topic: "Placeholder: AI-suggested Article Topic", reason: "This is a compelling topic because..." };
}

// --- generateArticleImage (Logic Order UPDATED) ---
async function generateArticleImage(request) {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    
    const { prompt, articleTitle = '', style = 'tech_illustration' } = request.data;
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      throw new HttpsError("invalid-argument", "A non-empty 'prompt' string is required.");
    }
    logger.info(`generateArticleImage called for prompt: "${prompt}", title: "${articleTitle}"`);

    let imageUrl = '';
    let imageAltText = `Image for: ${articleTitle || prompt}`; // Default alt text
    let source = 'unknown';
    let message = '';
    // let enhancedPrompts = null; // Kept if you plan to use Gemini for prompt enhancement later

    // --- NEW ORDER ---
    // Option 1: Try AI-suggested Fallback first (using getFallbackImagesForCategory)
    logger.info("Attempting AI-suggested fallback image first...");
    const fallbackImages = getFallbackImagesForCategory(prompt); // Array of URLs
    if (fallbackImages && fallbackImages.length > 0) {
        imageUrl = fallbackImages[0]; // Take the first one
        imageAltText = `Suggested stock image for: ${prompt}`; // More specific alt text
        source = 'ai_keyword_fallback';
        logger.info("Using AI-suggested fallback image (from predefined categories):", imageUrl);
        message = "Used an AI-suggested stock image based on your prompt.";
    } else {
        logger.warn("No suitable image found from AI-suggested fallback categories for prompt:", prompt);
    }

    // Option 2: If AI-suggested fallback didn't provide an image, try Unsplash API
    if (!imageUrl) {
      const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
      if (unsplashKey) {
        logger.info("AI-suggested fallback failed or not found, trying Unsplash...");
        const searchQuery = encodeURIComponent(prompt);
        try {
          const unsplashResponse = await fetch(
            `https://api.unsplash.com/search/photos?query=${searchQuery}&orientation=landscape&per_page=1`,
            { headers: { 'Authorization': `Client-ID ${unsplashKey}` } }
          );
          
          if (unsplashResponse.ok) {
            const unsplashData = await unsplashResponse.json();
            if (unsplashData.results && unsplashData.results.length > 0) {
              const img = unsplashData.results[0];
              imageUrl = img.urls.regular;
              imageAltText = img.description || img.alt_description || `Stock photo from Unsplash for: ${prompt}`;
              source = 'unsplash';
              logger.info("Image successfully fetched from Unsplash:", imageUrl);
              message = "Fetched an image from Unsplash.";
            } else {
              logger.warn("No results from Unsplash for prompt:", prompt);
            }
          } else {
            logger.error(`Unsplash API error ${unsplashResponse.status}:`, await unsplashResponse.text());
          }
        } catch (unsplashError) {
          logger.error("Error calling Unsplash API:", unsplashError);
        }
      } else {
        logger.warn("UNSPLASH_ACCESS_KEY not configured. Skipping Unsplash.");
      }
    }
    
    // Final Fallback: If no image URL found yet, use a default from CONFIG
    if (!imageUrl) {
      logger.warn("No image found from AI fallback or Unsplash, using default image.");
      const defaultFallbacks = getFallbackImagesForCategory('default'); 
      if (defaultFallbacks && defaultFallbacks.length > 0) {
          imageUrl = defaultFallbacks[0];
      } else {
          // Absolute last resort if CONFIG.fallbackImages.default is somehow missing
          imageUrl = "[https://via.placeholder.com/800x400.png?text=Image+Not+Available](https://via.placeholder.com/800x400.png?text=Image+Not+Available)"; 
      }
      imageAltText = "Default fallback image";
      source = 'default_fallback';
      message = message || "No specific image found, using a default fallback.";
    }

    return {
      success: !!imageUrl, 
      imageUrl,
      imageAltText,
      source,
      message: message || (imageUrl ? "Image processed." : "Failed to retrieve any image."),
      // enhancedPrompts // Include if you generate them
    };
}

// --- getStockDataForCompanies (Placeholder - Implement your logic) ---
async function getStockDataForCompanies(request) { 
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    // TODO: Implement your getStockDataForCompanies logic
    return { stockData: [] };
}

module.exports = {
  generateArticleContent,
  rephraseText,
  suggestArticleTopic,
  generateArticleImage,
  getStockDataForCompanies,
};