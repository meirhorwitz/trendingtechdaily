const { logger } = require('../config');

/**
 * Simple article routing handler that serves article.html
 * and lets the frontend handle the rest
 */
exports.handleArticleRouting = async (req, res) => {
  try {
    logger.info('Handling article routing for path:', req.path);
    
    // In production, we need to return the HTML directly
    const articleHtml = `<!DOCTYPE html>
<html>
<head>
    <script>window.location.href = '/article.html' + window.location.search + '&path=' + encodeURIComponent(window.location.pathname);</script>
</head>
<body>
    <a href="/article.html">Click here if not redirected</a>
</body>
</html>`;
    
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
    
    if (urlPath === '/article.html' && req.query.id) {
      return next();
    }

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
    
    // Return HTML that redirects to category.html with the slug
    const categoryHtml = `<!DOCTYPE html>
<html>
<head>
    <script>window.location.href = '/category.html?slug=' + encodeURIComponent('${urlPath}');</script>
</head>
<body>
    <a href="/category.html?slug=${urlPath}">Click here if not redirected</a>
</body>
</html>`;
    
    res.status(200).send(categoryHtml);
    
  } catch (error) {
    logger.error('Error in handleDynamicRouting:', error);
    res.status(404).send('Page not found');
  }
};
