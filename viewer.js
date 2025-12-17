let db;
let allProducts = [];

async function loadDatabase() {
    try {
        // Check if SQL.js is available
        if (typeof initSqlJs === 'undefined') {
            throw new Error('SQL.js library failed to load. Please check your internet connection or try refreshing the page.');
        }

        // Initialize SQL.js
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        // Fetch the database file
        const response = await fetch('prices.db');
        if (!response.ok) {
            throw new Error('Database file not found. Please run the scraper first.');
        }

        const buffer = await response.arrayBuffer();
        db = new SQL.Database(new Uint8Array(buffer));

        displayData();
    } catch (error) {
        showError('Error loading database: ' + error.message);
    }
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('error').textContent = message;
}

function displayData() {
    try {
        // Get statistics
        const statsQuery = db.exec(`
            SELECT 
                (SELECT COUNT(*) FROM products) as total_products,
                (SELECT COUNT(*) FROM prices) as total_records,
                (SELECT MAX(scraped_at) FROM prices) as last_update
        `);

        if (statsQuery.length > 0) {
            const stats = statsQuery[0].values[0];
            document.getElementById('totalProducts').textContent = stats[0] || 0;
            document.getElementById('totalRecords').textContent = stats[1] || 0;
            
            if (stats[2]) {
                const lastUpdate = new Date(stats[2]);
                document.getElementById('lastUpdate').textContent = lastUpdate.toLocaleDateString();
            }
        }

        // Get all products with latest prices
        const productsQuery = db.exec(`
            SELECT 
                p.id,
                p.url,
                p.title,
                pr.price as current_price,
                pr.currency,
                pr.scraped_at as last_scraped,
                (
                    SELECT price 
                    FROM prices 
                    WHERE product_id = p.id 
                    ORDER BY scraped_at ASC 
                    LIMIT 1
                ) as first_price
            FROM products p
            LEFT JOIN prices pr ON p.id = pr.product_id
            WHERE pr.id = (
                SELECT id FROM prices 
                WHERE product_id = p.id 
                ORDER BY scraped_at DESC 
                LIMIT 1
            )
            ORDER BY p.last_scraped DESC
        `);

        if (productsQuery.length === 0 || productsQuery[0].values.length === 0) {
            showEmptyState();
            return;
        }

        // Process products
        allProducts = productsQuery[0].values.map(row => ({
            id: row[0],
            url: row[1],
            title: row[2],
            currentPrice: row[3],
            currency: row[4],
            lastScraped: row[5],
            firstPrice: row[6]
        }));

        displayProducts(allProducts);

        // Setup search
        document.getElementById('searchInput').addEventListener('input', handleSearch);

        // Show content
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
    } catch (error) {
        showError('Error displaying data: ' + error.message);
    }
}

function displayProducts(products) {
    const productsList = document.getElementById('productsList');
    
    if (products.length === 0) {
        productsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>No products found</p></div>';
        return;
    }

    productsList.innerHTML = products.map(product => {
        let priceChange = '';
        if (product.firstPrice && product.currentPrice !== product.firstPrice) {
            const change = ((product.currentPrice - product.firstPrice) / product.firstPrice * 100).toFixed(1);
            const changeClass = change > 0 ? 'price-up' : 'price-down';
            const changeSymbol = change > 0 ? '↑' : '↓';
            priceChange = `<span class="price-change ${changeClass}">${changeSymbol} ${Math.abs(change)}%</span>`;
        } else if (product.firstPrice) {
            priceChange = '<span class="price-change price-stable">No change</span>';
        }

        return `
            <div class="product-item" onclick="toggleProductDetails(${product.id})">
                <div class="product-title">${escapeHtml(product.title)}</div>
                <div class="product-info">
                    <div class="current-price">${product.currency} ${typeof product.currentPrice === 'number' ? product.currentPrice.toFixed(2) : 'N/A'}</div>
                    ${priceChange}
                </div>
                <div class="product-url">${escapeHtml(product.url)}</div>
                <div id="chart-${product.id}" class="chart-container"></div>
            </div>
        `;
    }).join('');
}

function toggleProductDetails(productId) {
    const chartContainer = document.getElementById(`chart-${productId}`);
    
    if (chartContainer.classList.contains('active')) {
        chartContainer.classList.remove('active');
        return;
    }

    // Get price history for this product
    const historyQuery = db.exec(`
        SELECT price, currency, scraped_at
        FROM prices
        WHERE product_id = ${productId}
        ORDER BY scraped_at ASC
    `);

    if (historyQuery.length === 0 || historyQuery[0].values.length === 0) {
        chartContainer.innerHTML = '<p>No price history available</p>';
    } else {
        const history = historyQuery[0].values;
        let historyHtml = '<h3>Price History</h3><ul class="price-history">';
        
        history.forEach(([price, currency, date]) => {
            const formattedDate = new Date(date).toLocaleString();
            const formattedPrice = typeof price === 'number' ? price.toFixed(2) : 'N/A';
            historyHtml += `
                <li>
                    <span>${formattedDate}</span>
                    <span><strong>${currency} ${formattedPrice}</strong></span>
                </li>
            `;
        });
        
        historyHtml += '</ul>';
        chartContainer.innerHTML = historyHtml;
    }

    chartContainer.classList.add('active');
}

function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    
    if (!searchTerm) {
        displayProducts(allProducts);
        return;
    }

    const filtered = allProducts.filter(product => 
        product.title.toLowerCase().includes(searchTerm) ||
        product.url.toLowerCase().includes(searchTerm)
    );

    displayProducts(filtered);
}

function showEmptyState() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
    document.getElementById('productsList').innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <h2>No products yet</h2>
            <p>The database is empty. Run the scraper to collect price data.</p>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load database when page loads
loadDatabase();
