// functions/http/sitemap.js

const { db, logger } = require('../config');
const { getSafe } = require('../utils');

/**
 * Generates and serves a sitemap.xml for SEO purposes.
 */
async function serveSitemap(req, res) {
  try {
    const baseUrl = "https://trendingtechdaily.com";
    let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    
    // Static pages
    xml += `<url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;
    xml += `<url><loc>${baseUrl}/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
    xml += `<url><loc>${baseUrl}/privacy</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>`;
    xml += `<url><loc>${baseUrl}/terms</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>`;
    
    // Category pages
    const categories = ['ai', 'startups', 'cybersecurity', 'blockchain', 'tech', 'market'];
    categories.forEach(category => {
      xml += `<url><loc>${baseUrl}/${category}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`;
    });
    
    // Dynamic article pages
    const articlesSnap = await db.collection('articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();
        
    articlesSnap.forEach(doc => {
      const slug = getSafe(() => doc.data().slug);
      const category = getSafe(() => doc.data().category, 'tech');
      const updatedAt = getSafe(() => doc.data().updatedAt?.toDate().toISOString());
      if (slug) {
        xml += `<url><loc>${baseUrl}/${category}/${slug}</loc>`;
        if (updatedAt) {
          xml += `<lastmod>${updatedAt}</lastmod>`;
        }
        xml += `<changefreq>monthly</changefreq><priority>0.8</priority></url>`;
      }
    });

    xml += '</urlset>';
    
    res.set('Content-Type', 'application/xml');
    res.status(200).send(xml);
    
  } catch (error) {
    logger.error("Error generating sitemap:", error);
    res.status(500).send("Error generating sitemap.");
  }
}

module.exports = { serveSitemap };