// js/nav-loader.js - Updated with proper category loading

/**
 * The main function to initialize the entire navigation system.
 */
function initializeNavigation() {
  const loadHTML = (url, placeholderId, callback) => {
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        return response.text();
      })
      .then(data => {
        const placeholder = document.getElementById(placeholderId);
        if (placeholder) {
          placeholder.innerHTML = data;
          if (callback) callback();
        }
      })
      .catch(error => console.error(`Error loading content for ${placeholderId}:`, error));
  };

  const translateCategory = (name) => name;

  // Load the navigation, then initialize all its interactive elements
  const navFile = '/nav.html';
  loadHTML(navFile, 'navbar-placeholder', () => {
    // These are now guaranteed to run after nav.html is in the DOM
    initializeSearch();
    initializeResponsiveCategories();

    // Initialize user authentication state if the function exists
    if (window.initializeAuth) {
      window.initializeAuth();
    }
  });

  // Load the footer
  const footerFile = '/footer.html';
  loadHTML(footerFile, 'footer-placeholder', () => {
    // After footer is loaded, populate categories if Firebase is ready
    if (typeof firebase !== 'undefined' && firebase.apps.length) {
      loadFooterCategories();
    }
  });
}

/**
 * Initializes the search bar toggle functionality.
 */
function initializeSearch() {
  const searchToggleBtn = document.getElementById('search-toggle-btn');
  const searchForm = document.getElementById('nav-search-form');
  const searchInput = document.getElementById('nav-search-input');

  if (!searchToggleBtn || !searchForm || !searchInput) {
    console.warn('Search elements not found.');
    return;
  }

  searchToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    searchForm.classList.toggle('active');

    if (searchForm.classList.contains('active')) {
      searchInput.focus();
    }
  });

  // Close search when clicking outside
  document.addEventListener('click', (e) => {
    const nav = document.querySelector('.navbar');
    if (nav && !nav.contains(e.target)) {
      searchForm.classList.remove('active');
    }
  });
  
  // Handle search form submission
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (query) {
      // For stock data page, search stocks instead of redirecting
      if (window.location.pathname === '/stock-data.html' && typeof searchStock === 'function') {
        searchInput.value = query.toUpperCase();
        searchForm.classList.remove('active');
        searchStock();
      } else {
        // For other pages, redirect to search page
        window.location.href = `/search.html?q=${encodeURIComponent(query)}`;
      }
    }
  });
  
  // Handle Enter key in search input
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchForm.dispatchEvent(new Event('submit'));
    }
  });
}

/**
 * Initializes responsive category loading and handling from Firebase.
 */
function initializeResponsiveCategories() {
  const DEFAULT_CATEGORIES = [
    { name: 'AI', slug: 'ai', order: 1 },
    { name: 'Gadgets', slug: 'gadgets', order: 2 },
    { name: 'Startups', slug: 'startups', order: 3 },
    { name: 'Crypto', slug: 'crypto', order: 4 }
  ];

  // Wait for Firebase to be ready before trying to fetch categories
  const waitForFirebase = () => new Promise(resolve => {
    let attempts = 0;
    const maxAttempts = 30; // ~3 seconds total
    const interval = setInterval(() => {
      if (typeof firebase !== 'undefined' && firebase.apps.length) {
        clearInterval(interval);
        resolve(true);
      } else if (++attempts >= maxAttempts) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });

  const fetchCategoriesFromDB = async () => {
    const firebaseReady = await waitForFirebase();
    if (!firebaseReady) {
      console.warn("Firebase not initialized yet for categories; using defaults");
      return DEFAULT_CATEGORIES;
    }

    try {
      const db = firebase.firestore();

      // Try 'categories' collection first
      let snapshot = await db.collection('categories').orderBy('order', 'asc').get();

      // If categories collection is empty, try 'sections' collection
      if (snapshot.empty) {
        console.log("No documents in 'categories' collection, trying 'sections'");
        snapshot = await db.collection('sections').orderBy('order', 'asc').get();
      }

      if (snapshot.empty) {
        console.warn("No categories found in either 'categories' or 'sections' collections");
        return DEFAULT_CATEGORIES;
      }

      const categories = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        categories.push({
          id: doc.id,
          name: data.name,
          slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
          order: data.order || 999
        });
      });

      console.log('Categories loaded:', categories);
      return categories;

    } catch (error) {
      console.error("Error fetching categories from Firebase:", error);
      // Return default categories as fallback
      return DEFAULT_CATEGORIES;
    }
  };

  const renderCategories = (categories) => {
    const navbarNav = document.querySelector('#navbarMain .navbar-nav');
    const moreDropdownMenu = document.getElementById('more-dropdown-menu');
    const moreDropdown = document.getElementById('more-dropdown');
    const podcastsLabel = 'Podcasts';
    const stocksLabel = 'Stocks';

    if (!navbarNav) {
      console.error('Navbar nav element not found');
      return;
    }

    // Remove existing category items to prevent duplicates
    navbarNav.querySelectorAll('[data-category="true"]').forEach(el => el.remove());

    // We'll insert all categories first, then move overflowing ones
    const insertBeforeElement = moreDropdown || null;
    const categoryElements = [];

    categories.forEach(cat => {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.setAttribute('data-category', 'true');
      const a = document.createElement('a');
      a.className = 'nav-link';
      a.href = `/${cat.slug}`;
      a.textContent = translateCategory(cat.name);
      li.appendChild(a);
      navbarNav.insertBefore(li, insertBeforeElement);
      categoryElements.push({ li, cat });
    });

    // Add Stock Data link as a category item
    const stockCat = { name: stocksLabel, slug: 'stock-data.html', icon: '<i class="bi bi-graph-up me-1"></i>' };
    const stockLi = document.createElement('li');
    stockLi.className = 'nav-item';
    stockLi.setAttribute('data-category', 'true');
    const stockLink = document.createElement('a');
    stockLink.className = 'nav-link';
    stockLink.href = '/stock-data.html';
    stockLink.innerHTML = `${stockCat.icon}${stocksLabel}`;
    stockLi.appendChild(stockLink);
    navbarNav.insertBefore(stockLi, insertBeforeElement);
    categoryElements.push({ li: stockLi, cat: stockCat });

    // Move overflowing categories into the More dropdown
    const hiddenCategories = [];
    while (navbarNav.scrollWidth > navbarNav.clientWidth && categoryElements.length) {
      const { li, cat } = categoryElements.pop();
      hiddenCategories.unshift(cat);
      navbarNav.removeChild(li);
    }

    if (moreDropdownMenu && moreDropdown) {
      moreDropdownMenu.innerHTML = '';
      if (hiddenCategories.length > 0) {
        hiddenCategories.forEach(cat => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.className = 'dropdown-item';
          a.href = cat.slug === 'stock-data.html' ? '/stock-data.html' : `/${cat.slug}`;
          a.innerHTML = cat.icon ? `${cat.icon}${translateCategory(cat.name)}` : translateCategory(cat.name);
          li.appendChild(a);
          moreDropdownMenu.appendChild(li);
        });

        // Add Podcasts link to the dropdown
        const podcastsLi = document.createElement('li');
        const podcastsLink = document.createElement('a');
        podcastsLink.className = 'dropdown-item';
        podcastsLink.href = '/podcasts.html';
        podcastsLink.innerHTML = `<i class="bi bi-mic me-1"></i>${podcastsLabel}`;
        podcastsLi.appendChild(podcastsLink);
        moreDropdownMenu.appendChild(podcastsLi);

        moreDropdown.classList.remove('d-none');
      } else {
        moreDropdown.classList.add('d-none');
      }
    }
  };
  
  // Load and render categories
  fetchCategoriesFromDB().then(categories => {
    renderCategories(categories);
    
    // Re-render on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Remove existing category items before re-rendering
        const navbarNav = document.querySelector('#navbarMain .navbar-nav');
        if (navbarNav) {
          // Remove all category items
          navbarNav.querySelectorAll('[data-category="true"]').forEach(el => el.remove());
          // Re-render categories
          renderCategories(categories);
        }
      }, 150);
    });
  });
}

/**
 * Load categories in the footer
 */
function loadFooterCategories() {
  const footerCategoriesList = document.getElementById('footer-categories-list');
  if (!footerCategoriesList || typeof firebase === 'undefined') return;
  
  const db = firebase.firestore();
  
  // Try categories collection first, then sections
  db.collection('categories').orderBy('order', 'asc').get()
    .then(snapshot => {
      if (snapshot.empty) {
        // Try sections collection
        return db.collection('sections').orderBy('order', 'asc').get();
      }
      return snapshot;
    })
    .then(snapshot => {
      if (!snapshot.empty) {
        let categoriesHTML = '';
        snapshot.forEach(doc => {
          const category = doc.data();
          const slug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-');
          const href = `/${slug}`;
          categoriesHTML += `<li><a href="${href}">${translateCategory(category.name)}</a></li>`;
        });
        footerCategoriesList.innerHTML = categoriesHTML;
      } else {
        // Use default categories
        footerCategoriesList.innerHTML = `
          <li><a href="/ai">${translateCategory('AI')}</a></li>
          <li><a href="/gadgets">${translateCategory('Gadgets')}</a></li>
          <li><a href="/startups">${translateCategory('Startups')}</a></li>
          <li><a href="/crypto">${translateCategory('Crypto')}</a></li>
        `;
      }
    })
    .catch(error => {
      console.error('Error loading footer categories:', error);
      footerCategoriesList.innerHTML = '<li class="text-muted">Unable to load categories</li>';
    });
}


// Wait for Firebase to be ready
document.addEventListener('firebase-ready', () => {
  if (!navigationInitialized) {
    navigationInitialized = true;
    initializeNavigation();
  }
});

// Fallback initialization methods
let firebaseReadyFired = false;
let navigationInitialized = false; // Track if navigation is already initialized

document.addEventListener('firebase-ready', () => { 
  firebaseReadyFired = true; 
  console.log('Firebase ready event fired');
});

// If the page is using inline Firebase initialization (like stock-data.html)
document.addEventListener('DOMContentLoaded', () => {
  // Check if Firebase is already initialized after a delay
  setTimeout(() => {
    if (!navigationInitialized && !firebaseReadyFired && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      console.log('Fallback: Initializing navigation without firebase-ready event');
      navigationInitialized = true;
      initializeNavigation();
    }
  }, 1000);
  
  // Also check immediately for pages that initialize Firebase synchronously
  if (!navigationInitialized && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
    console.log('Firebase already initialized, loading navigation immediately');
    navigationInitialized = true;
    initializeNavigation();
  }
});

// Export for manual initialization if needed
window.initializeNavigation = initializeNavigation;