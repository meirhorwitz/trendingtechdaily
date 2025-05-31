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
    
    // Set the correct content type
    res.set('Content-Type', 'text/html');
    
    // Send the article.html file content
    const articleHtml = fs.readFileSync(path.join(__dirname, '../../public/article.html'), 'utf8');
    res.status(200).send(articleHtml);
    
  } catch (error) {
    logger.error('Error in handleArticleRouting:', error);
    res.status(404).send('Article page not found');
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

/**
 * Handle dynamic routing for categories
 */
exports.handleDynamicRouting = async (req, res) => {
  try {
    const urlPath = req.path.substring(1); // Remove leading slash
    logger.info('Handling dynamic routing for path:', urlPath);
    
    // List of static pages that should not be treated as categories
    const staticPages = ['about', 'contact', 'privacy', 'terms', 'login', 'signup', 'stock-data', 'podcasts'];
    
    if (staticPages.includes(urlPath)) {
      // This shouldn't happen as these are handled by earlier rewrites
      res.status(404).send('Page not found');
      return;
    }
    
    // For any other single-segment path, treat it as a category
    // Serve the category.html page
    res.set('Content-Type', 'text/html');
    const categoryHtml = fs.readFileSync(path.join(__dirname, '../../public/category.html'), 'utf8');
    res.status(200).send(categoryHtml);
    
  } catch (error) {
    logger.error('Error in handleDynamicRouting:', error);
    res.status(404).send('Page not found');
  }
};
