const fetch = require('node-fetch');
const { logger } = require('../config');

async function fetchImageFromUnsplash(query, accessKey) {
  if (!accessKey) return null;
  const url = `https://api.unsplash.com/photos/random?orientation=landscape&query=${encodeURIComponent(query)}&client_id=${accessKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      logger.error('Unsplash API error:', res.status, text);
      return null;
    }
    const data = await res.json();
    return {
      imageUrl: data.urls && (data.urls.regular || data.urls.full || data.urls.raw),
      altText: data.alt_description || data.description || query,
    };
  } catch (err) {
    logger.error('Unsplash fetch error:', err);
    return null;
  }
}

module.exports = { fetchImageFromUnsplash };

