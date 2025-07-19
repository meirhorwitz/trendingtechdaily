// Enhanced Stock Data JavaScript with fixed scope and issues

// Define global variables that need to be accessed across functions
let STOCK_SYMBOLS = [];
let allStocksLoaded = false;
let DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
let watchlist = [];
let allDisplayedStocks = [...DEFAULT_SYMBOLS];
let lastSearchQuery = '';
// Finnhub API key - replace with your own API key from https://finnhub.io/
const FINNHUB_API_KEY = 'd00dsnpr01qmsivsdiu0d00dsnpr01qmsivsdiug'; 
let stockDetailModal;
let stockChart = null; // Global chart instance

// Configuration
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the stock data functionality
    initStockDataPage();
    
    // Initialize Bootstrap modal
    const modalElement = document.getElementById('stockDetailModal');
    if (modalElement) {
        stockDetailModal = new bootstrap.Modal(modalElement);
        
        // Add event listener for when modal is shown
        modalElement.addEventListener('shown.bs.modal', function() {
            // Attempt to update the chart when modal is shown
            const symbol = document.getElementById('detail-symbol').textContent;
            if (symbol) {
                updateStockChart(symbol);
            }
        });
    }
    
    // Make stock cards clickable
    makeStockCardsClickable();
    initPremarketDrawer();
});

function initStockDataPage() {
    // Load stock symbols from JSON file
    loadStockData();
    
    // DOM Elements
    const stockSearch = document.getElementById('stock-search');
    const searchBtn = document.getElementById('search-btn');
    const searchSuggestions = document.createElement('div');
    searchSuggestions.className = 'search-suggestions';

    // Add search suggestions container after search input
    if (stockSearch && stockSearch.parentNode) {
        stockSearch.parentNode.insertBefore(searchSuggestions, stockSearch.nextSibling);
        searchSuggestions.style.display = 'none';
    }

    // Setup search functionality
    setupSearchFunctionality(stockSearch, searchBtn, searchSuggestions);

    // Initial loading
    initializePage();
    
    // Set up auto-refresh (every 5 minutes during market hours)
    setInterval(() => {
        const now = new Date();
        const hours = now.getHours();
        // Only refresh during potential market hours (4 AM - 8 PM Eastern)
        if (hours >= 4 && hours < 20) {
            refreshStockData();
        }
    }, 300000); // 5 minutes
}

function setupSearchFunctionality(stockSearch, searchBtn, searchSuggestions) {
    if (!stockSearch) return;

    let searchTimeout;

    // Focus event - show suggestions
    stockSearch.addEventListener('focus', () => {
        if (stockSearch.value.trim().length > 0) {
            showSearchSuggestions(stockSearch.value.trim(), searchSuggestions);
        }
    });

    // Input event - filter suggestions with debounce
    stockSearch.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = stockSearch.value.trim();
        
        if (query.length > 0) {
            searchTimeout = setTimeout(() => {
                showSearchSuggestions(query, searchSuggestions);
            }, 200);
        } else {
            searchSuggestions.style.display = 'none';
            // Reset to default view if search is cleared
            if (lastSearchQuery.length > 0) {
                lastSearchQuery = '';
                fetchDefaultStocks();
            }
        }
    });

    // Blur event - hide suggestions after a delay
    stockSearch.addEventListener('blur', () => {
        setTimeout(() => {
            searchSuggestions.style.display = 'none';
        }, 200);
    });

    // Enter key handler
    stockSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchStock();
        }
    });

    // Search button click handler
    if (searchBtn) {
        searchBtn.addEventListener('click', searchStock);
    }

    // Handle suggestion clicks with event delegation
    searchSuggestions.addEventListener('click', (event) => {
        const suggestionItem = event.target.closest('.suggestion-item');
        if (suggestionItem && suggestionItem.dataset.symbol) {
            stockSearch.value = suggestionItem.dataset.symbol;
            searchSuggestions.style.display = 'none';
            searchStock();
        }
    });
}

// Function to display search suggestions
function showSearchSuggestions(query, suggestionsContainer) {
    if (!allStocksLoaded || STOCK_SYMBOLS.length === 0) {
        return;
    }

    query = query.toUpperCase();
    
    // Filter stocks that match the query
    const matches = STOCK_SYMBOLS.filter(stock => 
        stock.symbol.includes(query) || 
        stock.name.toUpperCase().includes(query)
    );

    if (matches.length > 0) {
        let suggestionsHTML = '<div class="suggestions-container">';
        
        // Take first 6 matches
        matches.slice(0, 6).forEach(stock => {
            const hasLogo = stock.logoUrl && stock.logoUrl !== '';
            
            suggestionsHTML += `
                <div class="suggestion-item" data-symbol="${stock.symbol}">
                    ${hasLogo ? 
                        `<img src="${stock.logoUrl}" alt="${stock.symbol}" class="suggestion-logo" onerror="this.style.display='none'">` : 
                        '<div class="suggestion-logo-placeholder"></div>'}
                    <div class="suggestion-text">
                        <strong>${stock.symbol}</strong>
                        <span class="suggestion-name">${stock.name}</span>
                    </div>
                </div>
            `;
        });
        
        if (matches.length > 6) {
            suggestionsHTML += `
                <div class="suggestion-more">
                    ${matches.length - 6} more results available...
                </div>
            `;
        }
        
        suggestionsHTML += '</div>';
        suggestionsContainer.innerHTML = suggestionsHTML;
        suggestionsContainer.style.display = 'block';
    } else {
        suggestionsContainer.innerHTML = `
            <div class="suggestion-no-results">
                No stocks found matching "${query}"
            </div>
        `;
        suggestionsContainer.style.display = 'block';
    }
}

// Initialize the page
async function initializePage() {
    const premarketLoader = document.getElementById('premarket-loader');
    const marketLoader = document.getElementById('market-loader');
    const premarketError = document.getElementById('premarket-error');
    const marketError = document.getElementById('market-error');
    
    // Show loaders
    if (premarketLoader) premarketLoader.style.display = 'block';
    if (marketLoader) marketLoader.style.display = 'block';
    
    // Clear errors
    if (premarketError) premarketError.textContent = '';
    if (marketError) marketError.textContent = '';
    
    try {
        // Get watchlist from localStorage
        watchlist = JSON.parse(localStorage.getItem('stockWatchlist')) || [];
        
        // If user is authenticated, sync with Firestore
        if (typeof auth !== 'undefined' && auth.currentUser) {
            try {
                const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
                if (userDoc.exists && userDoc.data().stockWatchlist) {
                    watchlist = userDoc.data().stockWatchlist;
                    localStorage.setItem('stockWatchlist', JSON.stringify(watchlist));
                } else {
                    // Create watchlist in Firestore if it doesn't exist
                    await db.collection('users').doc(auth.currentUser.uid).set({
                        stockWatchlist: watchlist
                    }, { merge: true });
                }
            } catch (error) {
                console.error("Error syncing watchlist with Firestore:", error);
            }
        }
        
        fetchDefaultStocks();
    } catch (error) {
        console.error('Error initializing page:', error);
        if (premarketLoader) premarketLoader.style.display = 'none';
        if (marketLoader) marketLoader.style.display = 'none';
        if (marketError) marketError.textContent = 'Error initializing page. Please refresh.';
    }
}

// Fetch default stocks
async function fetchDefaultStocks() {
    allDisplayedStocks = [...new Set([...DEFAULT_SYMBOLS, ...watchlist])];
    await fetchStockData(allDisplayedStocks);
    updateWatchlistDisplay();
}

// Search for a stock
function searchStock() {
    const searchInput = document.getElementById('stock-search');
    if (!searchInput) return;
    
    const symbol = searchInput.value.trim().toUpperCase();
    if (!symbol) {
        lastSearchQuery = '';
        fetchDefaultStocks();
        return;
    }
    
    lastSearchQuery = symbol;
    allDisplayedStocks = [symbol];
    fetchStockData([symbol]);
}

// Refresh current stock data
async function refreshStockData() {
    if (lastSearchQuery) {
        await fetchStockData([lastSearchQuery]);
    } else {
        await fetchStockData(allDisplayedStocks);
    }
    
    const lastUpdated = document.getElementById('last-updated');
    if (lastUpdated) lastUpdated.textContent = new Date().toLocaleString();
}

// Load stock data from JSON file
async function loadStockData() {
    try {
        const response = await fetch('/json/stock-data.json');
        
        if (!response.ok) {
            throw new Error(`Failed to load stock data: ${response.status}`);
        }
        
        const data = await response.json();
        STOCK_SYMBOLS = data;
        allStocksLoaded = true;
        console.log(`Loaded ${STOCK_SYMBOLS.length} stocks from JSON`);
    } catch (error) {
        console.error('Error loading stock data:', error);
        // Fallback to basic symbols
        STOCK_SYMBOLS = [
            { symbol: 'AAPL', name: 'Apple Inc.', logoUrl: '' },
            { symbol: 'MSFT', name: 'Microsoft Corporation', logoUrl: '' },
            { symbol: 'GOOGL', name: 'Alphabet Inc.', logoUrl: '' },
            { symbol: 'AMZN', name: 'Amazon.com Inc.', logoUrl: '' },
            { symbol: 'TSLA', name: 'Tesla Inc.', logoUrl: '' }
        ];
    }
}

// Fetch stock data from API
async function fetchStockData(symbols) {
    const marketData = document.getElementById('market-data');
    const marketLoader = document.getElementById('market-loader');
    
    if (!marketData) return;
    
    marketData.innerHTML = '';
    if (marketLoader) marketLoader.style.display = 'block';
    
    try {
        const stockDataMap = {};
        
        // Create logo map from loaded data
        const logoMap = {};
        STOCK_SYMBOLS.forEach(stock => {
            logoMap[stock.symbol] = {
                name: stock.name,
                logoUrl: stock.logoUrl
            };
        });
        
        // Fetch data for all symbols
        await Promise.all(symbols.map(async (symbol, index) => {
            try {
                // Add delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, index * 300));
                
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Error fetching ${symbol}: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Add name and logo
                if (logoMap[symbol]) {
                    data.name = logoMap[symbol].name;
                    data.logoUrl = logoMap[symbol].logoUrl;
                } else {
                    data.name = symbol;
                    data.logoUrl = '';
                }
                
                stockDataMap[symbol] = data;
            } catch (error) {
                console.error(`Error fetching ${symbol}:`, error);
                stockDataMap[symbol] = {
                    error: true,
                    name: logoMap[symbol]?.name || symbol,
                    logoUrl: logoMap[symbol]?.logoUrl || ''
                };
            }
        }));
        
        // Display the data
        symbols.forEach(symbol => {
            const stockInfo = stockDataMap[symbol];
            const card = createMarketStockCard(symbol, stockInfo, watchlist.includes(symbol));
            marketData.appendChild(card);
        });
        
        // Update last updated time
        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated) lastUpdated.textContent = new Date().toLocaleString();
    } catch (error) {
        console.error('Error fetching stock data:', error);
        marketData.innerHTML = '<div class="error-message">Failed to fetch stock data. Please try again later.</div>';
    } finally {
        if (marketLoader) marketLoader.style.display = 'none';
    }
}

// Create market stock card
function createMarketStockCard(symbol, stockInfo, isInWatchlist) {
    const card = document.createElement('div');
    card.className = 'stock-card';
    
    if (isInWatchlist) {
        card.classList.add('in-watchlist');
    }
    
    const logoUrl = stockInfo.logoUrl || '';
    const hasLogo = logoUrl && logoUrl !== '';
    
    if (stockInfo.error) {
        card.classList.add('error-card');
        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-header-title">
                    ${hasLogo ? 
                        `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : 
                        ''}
                    <h3>${symbol}</h3>
                </div>
                <button class="watchlist-btn ${isInWatchlist ? 'in-watchlist' : ''}" 
                        data-symbol="${symbol}" 
                        title="${isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}">
                    ★
                </button>
            </div>
            <div class="stock-name">${stockInfo.name || symbol}</div>
            <div class="error-message">Unable to load stock data</div>
        `;
    } else {
        const price = stockInfo.c || 0;
        const change = stockInfo.d || 0;
        const changePercent = stockInfo.dp || 0;
        const isPositive = change >= 0;
        
        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-header-title">
                    ${hasLogo ? 
                        `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : 
                        ''}
                    <h3>${symbol}</h3>
                </div>
                <button class="watchlist-btn ${isInWatchlist ? 'in-watchlist' : ''}" 
                        data-symbol="${symbol}" 
                        title="${isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}">
                    ★
                </button>
            </div>
            <div class="stock-name">${stockInfo.name || symbol}</div>
            <div class="stock-price">$${price.toFixed(2)}</div>
            <div class="stock-change ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${change.toFixed(2)} 
                (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
            </div>
            <div class="stock-details">
                <div>Open: $${(stockInfo.o || 0).toFixed(2)}</div>
                <div>High: $${(stockInfo.h || 0).toFixed(2)}</div>
                <div>Low: $${(stockInfo.l || 0).toFixed(2)}</div>
                <div>Volume: ${(stockInfo.v || 0).toLocaleString()}</div>
            </div>
        `;
    }
    
    // Add watchlist button event listener
    const watchlistBtn = card.querySelector('.watchlist-btn');
    if (watchlistBtn) {
        watchlistBtn.addEventListener('click', event => {
            event.stopPropagation();
            toggleWatchlist(symbol);
        });
    }
    
    return card;
}

// Toggle watchlist
async function toggleWatchlist(symbol) {
    const isAdding = !watchlist.includes(symbol);
    
    if (isAdding) {
        watchlist.push(symbol);
        if (!allDisplayedStocks.includes(symbol) && !lastSearchQuery) {
            allDisplayedStocks.push(symbol);
        }
    } else {
        watchlist = watchlist.filter(s => s !== symbol);
    }
    
    // Save to localStorage
    localStorage.setItem('stockWatchlist', JSON.stringify(watchlist));
    
    // Save to Firestore if authenticated
    if (typeof auth !== 'undefined' && auth.currentUser) {
        try {
            await db.collection('users').doc(auth.currentUser.uid).update({
                stockWatchlist: watchlist,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error("Error updating watchlist in Firestore:", error);
            // Try to create the document if it doesn't exist
            try {
                await db.collection('users').doc(auth.currentUser.uid).set({
                    stockWatchlist: watchlist,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (setError) {
                console.error("Error creating watchlist in Firestore:", setError);
            }
        }
    }
    
    // Update UI
    updateWatchlistStatus(symbol, isAdding);
    updateWatchlistDisplay();
}

// Update watchlist status in UI
function updateWatchlistStatus(symbol, isInWatchlist) {
    // Update all watchlist buttons for this symbol
    document.querySelectorAll(`.watchlist-btn[data-symbol="${symbol}"]`).forEach(btn => {
        if (isInWatchlist) {
            btn.classList.add('in-watchlist');
            btn.title = 'Remove from watchlist';
        } else {
            btn.classList.remove('in-watchlist');
            btn.title = 'Add to watchlist';
        }
    });
    
    // Update card styling
    document.querySelectorAll('.stock-card').forEach(card => {
        const cardSymbol = card.querySelector('h3')?.textContent;
        if (cardSymbol === symbol) {
            if (isInWatchlist) {
                card.classList.add('in-watchlist');
            } else {
                card.classList.remove('in-watchlist');
            }
        }
    });
    
    // Update detail modal if open
    const modalSymbol = document.getElementById('detail-symbol')?.textContent;
    if (modalSymbol === symbol) {
        updateWatchlistButton(symbol);
    }
}

// Update watchlist display
function updateWatchlistDisplay() {
    const watchlistStocks = document.getElementById('watchlist-stocks');
    if (!watchlistStocks) return;
    
    if (watchlist.length === 0) {
        watchlistStocks.innerHTML = '<p class="no-stocks">No stocks in your watchlist yet.</p>';
        return;
    }
    
    watchlistStocks.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    fetchWatchlistData();
}

// Fetch watchlist data
async function fetchWatchlistData() {
    const watchlistStocks = document.getElementById('watchlist-stocks');
    if (!watchlistStocks || watchlist.length === 0) return;
    
    try {
        const stockDataMap = {};
        const logoMap = {};
        
        // Get logo info from loaded data
        STOCK_SYMBOLS.forEach(stock => {
            if (watchlist.includes(stock.symbol)) {
                logoMap[stock.symbol] = {
                    name: stock.name,
                    logoUrl: stock.logoUrl
                };
            }
        });
        
        // Fetch data for watchlist stocks
        await Promise.all(watchlist.map(async (symbol, index) => {
            try {
                await new Promise(resolve => setTimeout(resolve, index * 300));
                
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Error fetching ${symbol}`);
                }
                
                const data = await response.json();
                stockDataMap[symbol] = data;
            } catch (error) {
                console.error(`Error fetching watchlist data for ${symbol}:`, error);
                stockDataMap[symbol] = { error: true };
            }
        }));
        
        // Build watchlist UI
        let watchlistHTML = '';
        
        watchlist.forEach(symbol => {
            const stockInfo = stockDataMap[symbol];
            const logoInfo = logoMap[symbol] || { name: symbol, logoUrl: '' };
            const hasLogo = logoInfo.logoUrl && logoInfo.logoUrl !== '';
            
            if (stockInfo && !stockInfo.error) {
                const price = stockInfo.c || 0;
                const change = stockInfo.d || 0;
                const changePercent = stockInfo.dp || 0;
                const isPositive = change >= 0;
                
                watchlistHTML += `
                    <div class="watchlist-item" data-symbol="${symbol}">
                        <div class="watchlist-info">
                            ${hasLogo ? 
                                `<img src="${logoInfo.logoUrl}" alt="${symbol}" class="watchlist-logo" onerror="this.style.display='none'">` : 
                                ''}
                            <div class="watchlist-details">
                                <span class="watchlist-symbol">${symbol}</span>
                                <span class="watchlist-name">${logoInfo.name}</span>
                            </div>
                            <span class="watchlist-price">$${price.toFixed(2)}</span>
                            <span class="watchlist-change ${isPositive ? 'positive' : 'negative'}">
                                ${isPositive ? '+' : ''}${change.toFixed(2)} 
                                (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
                            </span>
                        </div>
                        <button class="remove-btn" data-symbol="${symbol}">✕</button>
                    </div>
                `;
            } else {
                watchlistHTML += `
                    <div class="watchlist-item" data-symbol="${symbol}">
                        <div class="watchlist-info">
                            ${hasLogo ? 
                                `<img src="${logoInfo.logoUrl}" alt="${symbol}" class="watchlist-logo" onerror="this.style.display='none'">` : 
                                ''}
                            <div class="watchlist-details">
                                <span class="watchlist-symbol">${symbol}</span>
                                <span class="watchlist-name">${logoInfo.name}</span>
                            </div>
                            <span class="watchlist-error">Unable to load data</span>
                        </div>
                        <button class="remove-btn" data-symbol="${symbol}">✕</button>
                    </div>
                `;
            }
        });
        
        watchlistStocks.innerHTML = watchlistHTML;
        
        // Add event listeners to remove buttons
        watchlistStocks.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', event => {
                event.stopPropagation();
                toggleWatchlist(btn.dataset.symbol);
            });
        });
        
        // Add click event to watchlist items
        watchlistStocks.querySelectorAll('.watchlist-item').forEach(item => {
            item.addEventListener('click', event => {
                if (!event.target.closest('.remove-btn')) {
                    const symbol = item.dataset.symbol;
                    openStockDetail(symbol);
                }
            });
        });
        
    } catch (error) {
        console.error('Error fetching watchlist data:', error);
        watchlistStocks.innerHTML = '<p class="error-text">Error loading watchlist data.</p>';
    }
}

// Make stock cards clickable
function makeStockCardsClickable() {
    document.addEventListener('click', function(event) {
        const stockCard = event.target.closest('.stock-card');
        
        if (stockCard && !event.target.closest('.watchlist-btn')) {
            const symbol = stockCard.querySelector('h3')?.textContent;
            if (symbol) {
                openStockDetail(symbol);
            }
        }
    });
}

// Open stock detail modal
async function openStockDetail(symbol) {
    if (!symbol || !stockDetailModal) return;
    
    // Reset modal content
    document.getElementById('detail-symbol').textContent = symbol;
    document.getElementById('detail-name').textContent = 'Loading...';
    document.getElementById('detail-price').textContent = '--';
    document.getElementById('detail-change').textContent = '';
    document.getElementById('detail-change').className = '';
    
    // Find company info
    const stockInfo = STOCK_SYMBOLS.find(s => s.symbol === symbol);
    if (stockInfo) {
        document.getElementById('detail-name').textContent = stockInfo.name;
        const logo = document.getElementById('detail-logo');
        if (logo) {
            logo.src = stockInfo.logoUrl || '';
            logo.style.display = stockInfo.logoUrl ? 'block' : 'none';
        }
    }
    
    // Update watchlist button
    updateWatchlistButton(symbol);
    
    // Show the modal
    stockDetailModal.show();
    
    // Fetch stock data
    try {
        document.getElementById('detail-loading').style.display = 'block';
        document.getElementById('detail-error').style.display = 'none';
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status}`);
        }
        
        const data = await response.json();
        updateDetailView(symbol, data);
        
        // Fetch company profile
        fetchCompanyProfile(symbol);
        
    } catch (error) {
        console.error('Error fetching stock details:', error);
        document.getElementById('detail-error').textContent = `Error loading stock data: ${error.message}`;
        document.getElementById('detail-error').style.display = 'block';
    } finally {
        document.getElementById('detail-loading').style.display = 'none';
    }
}

// Update detail view
function updateDetailView(symbol, data) {
    if (!data) return;
    
    const price = data.c || 0;
    const change = data.d || 0;
    const changePercent = data.dp || 0;
    const isPositive = change >= 0;
    
    document.getElementById('detail-price').textContent = `$${price.toFixed(2)}`;
    
    const changeEl = document.getElementById('detail-change');
    changeEl.textContent = `${isPositive ? '+' : ''}${change.toFixed(2)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)`;
    changeEl.className = isPositive ? 'fs-4 positive' : 'fs-4 negative';
    
    // Update stats
    const statsElements = {
        'detail-prev-close': data.pc,
        'detail-open': data.o,
        'detail-high': data.h,
        'detail-low': data.l,
        'detail-volume': data.v
    };
    
    Object.entries(statsElements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            if (id === 'detail-volume') {
                element.textContent = value ? value.toLocaleString() : 'N/A';
            } else if (id === 'detail-range') {
                element.textContent = `$${(data.l || 0).toFixed(2)} - $${(data.h || 0).toFixed(2)}`;
            } else {
                element.textContent = value ? `$${value.toFixed(2)}` : 'N/A';
            }
        }
    });
    
    // Update last updated time
    const lastUpdatedEl = document.getElementById('detail-last-updated');
    if (lastUpdatedEl) {
        lastUpdatedEl.textContent = new Date().toLocaleString();
    }
}

// Update watchlist button
async function updateWatchlistButton(symbol) {
    const watchlistBtn = document.getElementById('watchlist-toggle-btn');
    if (!watchlistBtn) return;
    
    const isInWatchlist = watchlist.includes(symbol);
    
    const icon = watchlistBtn.querySelector('i');
    const text = watchlistBtn.querySelector('span');
    
    if (icon) icon.className = isInWatchlist ? 'bi bi-star-fill' : 'bi bi-star';
    if (text) text.textContent = isInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist';
    
    watchlistBtn.classList.toggle('in-watchlist', isInWatchlist);
    
    // Remove old event listeners and add new one
    const newBtn = watchlistBtn.cloneNode(true);
    watchlistBtn.parentNode.replaceChild(newBtn, watchlistBtn);
    
    newBtn.addEventListener('click', () => {
        toggleWatchlist(symbol);
    });
}

// Fetch company profile
async function fetchCompanyProfile(symbol) {
    try {
        const response = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch company profile: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.name) {
            document.getElementById('detail-name').textContent = data.name;
            
            const descEl = document.getElementById('detail-description');
            if (descEl) {
                let description = '';
                if (data.name) description += `${data.name} (${symbol}) `;
                if (data.exchange) description += `is listed on the ${data.exchange}. `;
                if (data.finnhubIndustry) description += `The company operates in the ${data.finnhubIndustry} industry. `;
                if (data.country) description += `Headquartered in ${data.country}. `;
                if (data.marketCapitalization) {
                    const marketCap = (data.marketCapitalization / 1000).toFixed(2);
                    description += `Market Cap: $${marketCap}B. `;
                }
                
                descEl.textContent = description || 'No company description available.';
            }
        }
    } catch (error) {
        console.error('Error fetching company profile:', error);
        const descEl = document.getElementById('detail-description');
        if (descEl) {
            descEl.textContent = `Unable to load company information for ${symbol}.`;
        }
    }
}

// Update stock chart
async function updateStockChart(symbol) {
    const chartContainer = document.getElementById('stock-chart');
    if (!chartContainer || !symbol) return;
    
    // Show loading state
    chartContainer.innerHTML = `
        <div class="chart-placeholder text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading chart...</span>
            </div>
            <p class="text-muted mt-2">Loading price chart...</p>
        </div>
    `;
    
    try {
        // For now, show a message about chart unavailability
        // In production, you would fetch real historical data
        chartContainer.innerHTML = `
            <div class="text-center p-3">
                <p class="mb-2">Chart data temporarily unavailable.</p>
                <a href="https://finance.yahoo.com/quote/${symbol}/chart" 
                   target="_blank" 
                   class="btn btn-sm btn-outline-primary">
                    View Chart on Yahoo Finance
                </a>
            </div>
        `;
    } catch (error) {
        console.error('Error creating stock chart:', error);
        chartContainer.innerHTML = `
            <div class="text-center p-3">
                <p class="text-danger">Unable to load chart data.</p>
            </div>
        `;
    }
}

// Initialize premarket drawer
function initPremarketDrawer() {
    const premarketContent = document.getElementById('premarketContent');
    if (!premarketContent) return;
    
    premarketContent.addEventListener('show.bs.collapse', function() {
        const premarketData = document.getElementById('premarket-data');
        if (premarketData && premarketData.innerHTML.trim() === '') {
            loadPremarketData(allDisplayedStocks);
        }
    });
}

// Load premarket data
async function loadPremarketData(symbols) {
    const premarketData = document.getElementById('premarket-data');
    const premarketLoader = document.getElementById('premarket-loader');
    
    if (!premarketData) return;
    
    premarketData.innerHTML = '';
    if (premarketLoader) premarketLoader.style.display = 'block';
    
    try {
        const now = new Date();
        const hour = now.getHours();
        const isPreMarketHours = hour >= 4 && hour < 9.5;
        
        if (!isPreMarketHours) {
            premarketData.innerHTML = '<div class="no-data">Premarket data is only available between 4:00 AM and 9:30 AM Eastern Time.</div>';
            if (premarketLoader) premarketLoader.style.display = 'none';
            return;
        }
        
        // In a real implementation, you would fetch actual premarket data
        // For now, show a message
        premarketData.innerHTML = '<div class="no-data">Premarket data coming soon.</div>';
    } catch (error) {
        console.error('Error loading premarket data:', error);
        premarketData.innerHTML = '<div class="error-message">Failed to fetch premarket data.</div>';
    } finally {
        if (premarketLoader) premarketLoader.style.display = 'none';
    }
}