const { logger } = require('../config');
const path = require('path');
const fs = require('fs');

/**
 * Simple article routing handler that serves article.html
 * and lets the frontend handle the rest
 */
exports.handleArticleRouting = async (req, res) => {
  try {
    logger.info('Handling article routing for path:', req.path);
    
    // Construct the path to article.html
    const articleHtmlPath = path.join(__dirname, '../../public/article.html');
    
    // Check if file exists
    if (!fs.existsSync(articleHtmlPath)) {
      logger.error('article.html not found at:', articleHtmlPath);
      res.status(404).send('Article page not found');
      return;
    }
    
    // Send the file
    res.sendFile(articleHtmlPath);
    
  } catch (error) {
    logger.error('Error in handleArticleRouting:', error);
    res.status(500).send('Internal server error');
  }
};

/**
 * Handles legacy redirects
 */
exports.handleLegacyRedirects = (req, res, next) => {
  try {
    const urlPath = req.path;
    logger.info(`Processing legacy redirect for path: ${urlPath}`);
    
    // Handle old article.html?id=xyz URLs
    if (urlPath === '/article.html' && req.query.id) {
      // Let the frontend handle this
      return next();
    }

    // Handle other legacy URLs
    const legacyUrls = {
      '/about.html': '/about',
      '/contact.html': '/contact', 
      '/privacy.html': '/privacy',
      '/terms.html': '/terms'
    };

    const newUrl = legacyUrls[urlPath];
    if (newUrl) {
      logger.info(`Redirecting legacy URL ${urlPath} to ${newUrl}`);
      return res.redirect(301, newUrl);
    }

    // If no redirect is found, continue
    next();
  } catch (error) {
    logger.error('Error in legacy redirects:', error);
    next();
  }
};
