// functions/scheduledArticles.js

const fetch = require('node-fetch');
const { logger, db } = require('./config');
const aiCallables = require('./callable/ai');
const articlesAdmin = require('./admin/articles');

const CONFIG_DOC = 'settings/autoArticleSchedule';

function estimateReadingTime(html) {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 225));
}

async function fetchTechHeadline(newsApiKey) {
  try {
    const res = await fetch(`https://newsapi.org/v2/top-headlines?category=technology&language=en&pageSize=1&apiKey=${newsApiKey}`);
    const data = await res.json();
    if (data && data.articles && data.articles.length > 0) {
      return data.articles[0].title;
    }
  } catch (err) {
    logger.error('Failed to fetch tech headline:', err);
  }
  return 'latest technology news';
}

async function fetchTechQuote() {
  try {
    const res = await fetch('https://api.quotable.io/random?tags=technology');
    const data = await res.json();
    if (data && data.content) {
      return `${data.content} — ${data.author}`;
    }
  } catch (err) {
    logger.error('Failed to fetch tech quote:', err);
  }
  return '';
}

async function shouldGenerateArticle(defaultFrequency) {
  const docRef = db.doc(CONFIG_DOC);
  const snap = await docRef.get();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  let data = snap.exists ? snap.data() : {};
  const frequency = data.frequency || defaultFrequency || 1;
  const last = data.lastGeneratedAt
    ? (data.lastGeneratedAt.toMillis ? data.lastGeneratedAt.toMillis() : new Date(data.lastGeneratedAt).getTime())
    : 0;
  if (now - last < oneDay / frequency) return false;
  await docRef.set({ lastGeneratedAt: new Date(now), frequency }, { merge: true });
  return true;
}

async function generateArticle(newsApiKey) {
  const headline = await fetchTechHeadline(newsApiKey);
  const aiContent = await aiCallables.generateArticleContent({ auth: { uid: 'scheduler' }, data: { prompt: headline } });
  if (aiContent.error) {
    logger.error('AI content generation failed:', aiContent.message);
    return;
  }
  const imageData = await aiCallables.generateArticleImage({ auth: { uid: 'scheduler' }, data: { prompt: aiContent.imagePrompt, articleTitle: aiContent.title } });
  const quote = await fetchTechQuote();
  let content = aiContent.content;
  if (quote) content += `<blockquote>${quote}</blockquote>`;
  const readingTime = estimateReadingTime(content);
  await articlesAdmin.createArticle({
    title: aiContent.title,
    slug: aiContent.slug,
    excerpt: aiContent.excerpt,
    category: aiContent.category || 'news',
    tags: aiContent.tags || [],
    featuredImage: imageData.imageUrl,
    imageAltText: imageData.imageAltText,
    content,
    published: true,
    readingTimeMinutes: readingTime,
  });
}

module.exports = { shouldGenerateArticle, generateArticle };
