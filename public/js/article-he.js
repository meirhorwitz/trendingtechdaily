// article-he.js - translation support for Hebrew article page
window.language = 'he';

function translateText(text) {
  return fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=he&dt=t&q=${encodeURIComponent(text)}`)
    .then(r => r.json())
    .then(d => d[0][0][0])
    .catch(() => text);
}

async function translateArticle() {
  const titleEl = document.querySelector('.article-title');
  if (titleEl) {
    titleEl.textContent = await translateText(titleEl.textContent.trim());
  }
  const metaDesc = document.querySelector('.article-description');
  if (metaDesc) {
    metaDesc.textContent = await translateText(metaDesc.textContent.trim());
  }
  const body = document.querySelector('.article-body-content');
  if (body) {
    const translated = await translateText(body.textContent.trim());
    body.textContent = translated;
  }
  const categoryLink = document.querySelector('#category-display a');
  if (categoryLink) {
    const slug = categoryLink.getAttribute('href').split('/').pop();
    categoryLink.href = `/category-he.html?slug=${slug}`;
  }
}

window.addEventListener('load', () => {
  const container = document.getElementById('article-container');
  if (!container) return;
  const observer = new MutationObserver(() => {
    if (container.querySelector('.article-title')) {
      observer.disconnect();
      translateArticle();
    }
  });
  observer.observe(container, { childList: true, subtree: true });
});
