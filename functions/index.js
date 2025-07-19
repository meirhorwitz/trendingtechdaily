// functions/index.js

const { onCall, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("./config");
const cors = require("cors")({ origin: true });

// === API (Express App) ===
const apiApp = require("./api");
exports.api = onRequest(
  {
    region: "us-central1",
    // Grant the 'api' function access to all secrets its routes might need
    secrets: [
      "GEMINI_API_KEY",
      "NEWS_API_KEY",
      "GNEWS_API_KEY",
      "FINNHUB_API_KEY",
      "YOUTUBE_API_KEY",
      "SPOTIFY_CLIENT_ID",
      "SPOTIFY_CLIENT_SECRET",
      "UNSPLASH_ACCESS_KEY",
    ],
  },
  apiApp,
);

// === HTTP Triggers ===
const searchCallables = require('./callable/search');
const { fetchNewsManually } = require("./http/newsFetcher");
const { serveSitemap } = require("./http/sitemap");
const legacyProxies = require("./http/legacy");
const { handleArticleRouting, handleLegacyRedirects, handleDynamicRouting } = require("./http/routing");
//const { debugRouting } = require("./debug-routing");

// Routing functions
exports.handleArticleRouting = onRequest({ 
  region: "us-central1",
  maxInstances: 10,
  memory: "256MiB",
}, handleArticleRouting);

exports.handleLegacyRedirects = onRequest({ region: "us-central1" }, handleLegacyRedirects);

exports.handleDynamicRouting = onRequest({ region: "us-central1" }, handleDynamicRouting);

// Debug function
//exports.debugRouting = onRequest({ region: "us-central1" }, debugRouting);

// Wrap the fetchNewsManually function with CORS
exports.fetchNewsManually = onRequest({ secrets: ["NEWS_API_KEY"], region: "us-central1" }, (req, res) => {
  cors(req, res, () => fetchNewsManually(req, res));
});

exports.serveSitemap = onRequest({ region: "us-central1" }, serveSitemap);

exports.yahooFinanceHistory = onRequest({ cors: true }, legacyProxies.yahooFinanceHistory);
exports.yahooFinance = onRequest({ cors: true }, legacyProxies.yahooFinance);

// Export search callable functions
exports.searchArticles = onCall({ region: 'us-central1' }, searchCallables.searchArticles);
exports.getSearchSuggestions = onCall({ secrets: ["GEMINI_API_KEY"], region: 'us-central1' }, searchCallables.getSearchSuggestions);
exports.enhancedSearch = onCall({ secrets: ["GEMINI_API_KEY", "GROK_API_KEY"], region: 'us-central1', timeoutSeconds: 60 }, searchCallables.enhancedSearch);

// === Callable Functions ===
const aiCallables = require("./callable/ai");
const adminCallables = require("./callable/admin");
const proxyCallables = require("./callable/proxies");
const toolCallables = require("./callable/tools");
const { getTechPodcastsHandler } = require("./services/spotifyService");

// AI Callables
exports.generateArticleContent = onCall({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 180, region: "us-central1" }, aiCallables.generateArticleContent);
exports.rephraseText = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1" }, aiCallables.rephraseText);
exports.suggestArticleTopic = onCall({ secrets: ["GROK_API_KEY"], region: "us-central1" }, aiCallables.suggestArticleTopic);
exports.generateArticleImage = onCall({ secrets: ["GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY"], region: "us-central1", timeoutSeconds: 60 }, aiCallables.generateArticleImage);
exports.getStockDataForCompanies = onCall({ secrets: ["FINNHUB_API_KEY"], region: "us-central1" }, aiCallables.getStockDataForCompanies);
exports.readArticleAloud = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1", timeoutSeconds: 60 }, aiCallables.readArticleAloud);
exports.generateAIAgentResponse = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1", timeoutSeconds: 120 }, toolCallables.generateAIAgentResponse);

// Admin Callables
exports.createAdmin = onCall(adminCallables.createAdmin);

// Proxy Callables
exports.getNewsApiArticles = onCall({ secrets: ["NEWS_API_KEY"], region: "us-central1" }, proxyCallables.getNewsApiArticles);
exports.getGnewsArticles = onCall({ secrets: ["GNEWS_API_KEY"], region: "us-central1" }, proxyCallables.getGnewsArticles);
exports.getRecommendedVideos = onCall({ secrets: ["YOUTUBE_API_KEY"], region: "us-central1" }, proxyCallables.getRecommendedVideos);
exports.getTechPodcasts = onCall({ secrets: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"], region: "us-central1" }, getTechPodcastsHandler);

// Tool Callables
exports.searchWeb = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1" }, toolCallables.searchWeb);
exports.getFinnhubStockData = onCall({ secrets: ["FINNHUB_API_KEY", "GEMINI_API_KEY"], region: "us-central1" }, toolCallables.getFinnhubStockData);

// === Scheduled Functions ===
const { fetchAllNews } = require("./services/newsService");
exports.scheduledNewsFetch = onSchedule({ schedule: "every 4 hours", region: "us-central1", secrets: ["NEWS_API_KEY"] }, async () => {
  logger.info("Scheduled news fetch triggered.");
  try {
    await fetchAllNews({ newsApiKey: process.env.NEWS_API_KEY });
    logger.info("Scheduled news fetch completed successfully.");
  } catch (error) {
    logger.error("Error in scheduled news fetch:", error);
  }
});

logger.info("All active function modules loaded and exported successfully.");