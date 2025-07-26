// Overrides for Hebrew version
window.language = 'he';
window.videoKeywords = ['חדשות טכנולוגיה', 'חדשנות', 'סקירות גאדג׳טים'];
window.podcastQuery = 'פודקאסט טכנולוגיה';
window.podcastMarket = 'IL';

const hebrewArticles = [
  {
    id: 'he1',
    title: 'בינה מלאכותית בעולם העסקים',
    excerpt: 'כיצד AI משנה את פני התעשייה.',
    slug: '#',
    createdAt: { toDate: () => new Date() },
    featuredImage: '/img/default-podcast-art.png',
    readingTimeMinutes: 3,
    category: 'General'
  },
  {
    id: 'he2',
    title: 'הגאדג\'ט החדש שמשגע את כולם',
    excerpt: 'סקירה מהירה של המכשיר החם בשוק.',
    slug: '#',
    createdAt: { toDate: () => new Date() },
    featuredImage: '/img/default-podcast-art.png',
    readingTimeMinutes: 2,
    category: 'Gadgets'
  },
  {
    id: 'he3',
    title: 'מדריך קצר לאבטחת סייבר',
    excerpt: 'טיפים חשובים לשמירה על פרטיותך.',
    slug: '#',
    createdAt: { toDate: () => new Date() },
    featuredImage: '/img/default-podcast-art.png',
    readingTimeMinutes: 4,
    category: 'Security'
  }
];

function loadFeaturedArticle() {
  const container = document.getElementById('featured-article-container');
  if (!container) return;
  const doc = { id: hebrewArticles[0].id, data: () => hebrewArticles[0] };
  renderArticle(doc, container, true);
}

function loadLatestArticles() {
  const container = document.getElementById('articles-container');
  if (!container) return;
  container.innerHTML = '';
  hebrewArticles.slice(0, 3).forEach(article => {
    container.innerHTML += renderArticleCard(article);
  });
}
