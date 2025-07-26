// index-he.js - dynamic Hebrew overrides and translation
window.language = 'he';
window.videoKeywords = ['חדשות טכנולוגיה', 'חדשנות', 'סקירות גאדג׳טים'];
window.podcastQuery = 'פודקאסט טכנולוגיה';
window.podcastMarket = 'IL';

function translateText(text) {
  return fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=he&dt=t&q=${encodeURIComponent(text)}`)
    .then(r => r.json())
    .then(d => d[0][0][0])
    .catch(() => text);
}

async function translateHome() {
  const titles = document.querySelectorAll('.article-title');
  for (const el of titles) {
    el.textContent = await translateText(el.textContent.trim());
    const link = el.querySelector('a');
    if (link && link.href.includes('article.html')) {
      const url = new URL(link.href);
      url.pathname = '/article-he.html';
      link.href = url.toString();
    }
  }
  const descs = document.querySelectorAll('.article-description');
  for (const el of descs) {
    if (el.textContent.trim()) {
      el.textContent = await translateText(el.textContent.trim());
    }
  }
}

document.addEventListener('firebase-ready', () => {
  setTimeout(translateHome, 3000);
});
