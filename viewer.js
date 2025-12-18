let db;
let allProducts = [];
let displayedProducts = [];
const PRODUCTS_PER_PAGE = 10;
let currentPage = 1;

async function loadDatabase() {
  try {
    console.log('Initializing database loading...');
    // Check if SQL.js is available
    if (typeof initSqlJs === 'undefined') {
      throw new Error('SQL.js library failed to load. Please check your internet connection or try refreshing the page.');
    }

    // Initialize SQL.js
    const SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    console.log('Fetching database file...');
    // Fetch the database file
    const response = await fetch('prices.db');
    if (!response.ok) {
      console.error('Failed to fetch database file:', response.statusText);
      throw new Error('Database file not found. Please run the scraper first.');
    }

    console.log('Database file fetched successfully.');
    const buffer = await response.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buffer));

    console.log('Database loaded successfully.');
    displayData();
  } catch (error) {
    console.error('Error loading database:', error);
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
    console.log('Executing statistics query...');
    // Get statistics
    const statsQuery = db.exec(`
            SELECT 
                (SELECT COUNT(*) FROM products) as total_products,
                (SELECT COUNT(*) FROM prices) as total_records,
                (SELECT MAX(scraped_at) FROM prices) as last_update
        `);

    console.log('Statistics query result:', statsQuery);
    if (statsQuery.length > 0) {
      const stats = statsQuery[0].values[0];
      console.log('Parsed statistics:', stats);
      document.getElementById('totalProducts').textContent = stats[0] || 0;
      document.getElementById('totalRecords').textContent = stats[1] || 0;
      if (stats[2]) {
        const lastUpdate = new Date(stats[2]);
        document.getElementById('lastUpdate').textContent = lastUpdate.toLocaleDateString();
      }
    }

    console.log('Executing products query...');
    // Get all products with latest prices
    const productsQuery = db.exec(`
            SELECT 
                p.id,
                p.url,
                p.sku,
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
                ) as first_price,
                (
                    SELECT MIN(price)
                    FROM prices
                    WHERE product_id = p.id
                ) as min_price,
                (
                    SELECT MAX(price)
                    FROM prices
                    WHERE product_id = p.id
                ) as max_price
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

    console.log('Products query result:', productsQuery);
    if (productsQuery.length === 0 || productsQuery[0].values.length === 0) {
      console.warn('No products found in the database.');
      showEmptyState();
      return;
    }

    // Process products
    allProducts = productsQuery[0].values.map(row => ({
      id: row[0],
      url: row[1],
      sku: row[2],
      title: row[3],
      currentPrice: row[4],
      currency: row[5],
      lastScraped: row[6],
      firstPrice: row[7],
      minPrice: row[8],
      maxPrice: row[9]
    }));

    console.log('Parsed products:', allProducts);
    
    // Display first page of products
    displayedProducts = allProducts.slice(0, PRODUCTS_PER_PAGE);
    displayProducts(displayedProducts);

    // Setup search
    document.getElementById('searchInput').addEventListener('input', handleSearch);

    // Show content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    console.log('Ensuring content visibility...');
    const contentElement = document.getElementById('content');
    if (contentElement.classList.contains('d-none')) {
      console.warn('#content is hidden. Removing d-none class.');
      contentElement.classList.remove('d-none');
    } else {
      console.log('#content is already visible.');
    }
  } catch (error) {
    console.error('Error displaying data:', error);
    showError('Error displaying data: ' + error.message);
  }
}

function displayProducts(products, append = false) {
  console.log('Displaying products:', products);
  const productsList = document.getElementById('productsList');
    
  if (products.length === 0 && !append) {
    productsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>No products found</p></div>';
    return;
  }

  const productsHtml = products.map(product => {
    let priceChange = '';
    let lowestPriceBadge = '';
    
    // Check if current price is the lowest
    if (product.currentPrice === product.minPrice && product.minPrice !== null) {
      lowestPriceBadge = '<span class="lowest-price-badge">🎉 ¡PRECIO MÁS BAJO!</span>';
    }
    
    if (product.firstPrice && product.currentPrice !== product.firstPrice) {
      const change = ((product.currentPrice - product.firstPrice) / product.firstPrice * 100).toFixed(1);
      const changeClass = change > 0 ? 'price-up' : 'price-down';
      const changeSymbol = change > 0 ? '↑' : '↓';
      priceChange = `<span class="price-change ${changeClass}">${changeSymbol} ${Math.abs(change)}%</span>`;
    } else if (product.firstPrice) {
      priceChange = '<span class="price-change price-stable">No change</span>';
    }

    return `
            <div class="product-item product-card" onclick="toggleProductDetails(${product.id})">
                <div class="product-title">${escapeHtml(product.title)}</div>
                ${product.sku ? `<div class="product-sku">SKU: ${escapeHtml(product.sku)}</div>` : ''}
                <div class="product-info">
                    <div class="current-price">${product.currency} ${typeof product.currentPrice === 'number' ? product.currentPrice.toFixed(2) : 'N/A'}${lowestPriceBadge}</div>
                    ${priceChange}
                </div>
                <div class="product-url">${escapeHtml(product.url)}</div>
                <div id="chart-${product.id}" class="chart-container price-history"></div>
            </div>
        `;
  }).join('');
  
  if (append) {
    productsList.innerHTML += productsHtml;
  } else {
    productsList.innerHTML = productsHtml;
  }
  
  // Update or add "Load More" button
  updateLoadMoreButton();
}

function updateLoadMoreButton() {
  const productsList = document.getElementById('productsList');
  const existingButton = document.getElementById('loadMoreBtn');
  
  // Remove existing button if present
  if (existingButton) {
    existingButton.remove();
  }
  
  // Check if there are more products to load
  if (displayedProducts.length < allProducts.length) {
    const remaining = allProducts.length - displayedProducts.length;
    const buttonHtml = `
      <div id="loadMoreBtn" style="text-align: center; padding: 2rem;">
        <button class="btn btn-primary btn-lg" onclick="loadMoreProducts()" style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          padding: 1rem 2rem;
          font-size: 1rem;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)'" 
           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
          <i class="bi bi-arrow-down-circle"></i> Cargar todos los productos restantes (${remaining})<br>
          <small style="font-size: 0.85rem; opacity: 0.9;">⚠️ La página podría volverse más lenta</small>
        </button>
      </div>
    `;
    productsList.insertAdjacentHTML('beforeend', buttonHtml);
  }
}

function loadMoreProducts() {
  const start = displayedProducts.length;
  const remainingProducts = allProducts.slice(start);
  
  displayedProducts = allProducts.slice(0); // Load all products
  displayProducts(remainingProducts, true);
}

function toggleProductDetails(productId) {
  const chartContainer = document.getElementById(`chart-${productId}`);
    
  if (chartContainer.classList.contains('active')) {
    chartContainer.classList.remove('active');
    // Destroy chart if exists
    const canvasId = `priceChart-${productId}`;
    const existingChart = Chart.getChart(canvasId);
    if (existingChart) {
      existingChart.destroy();
    }
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
    const prices = history.map(h => h[0]);
    const dates = history.map(h => new Date(h[2]));
    const currency = history[0][1];
    
    // Calculate stats
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
    const currentPrice = prices[prices.length - 1];
    
    // Create HTML with stats and chart
    chartContainer.innerHTML = `
      <h3 style="margin-bottom: 1rem;">📊 Historial de Precios</h3>
      
      <div class="price-stats">
        <div class="price-stat-item">
          <div class="price-stat-label">Precio Actual</div>
          <div class="price-stat-value">${currency} ${currentPrice.toFixed(2)}</div>
        </div>
        <div class="price-stat-item">
          <div class="price-stat-label">Precio Más Bajo</div>
          <div class="price-stat-value lowest">${currency} ${minPrice.toFixed(2)}</div>
        </div>
        <div class="price-stat-item">
          <div class="price-stat-label">Precio Más Alto</div>
          <div class="price-stat-value highest">${currency} ${maxPrice.toFixed(2)}</div>
        </div>
        <div class="price-stat-item">
          <div class="price-stat-label">Promedio</div>
          <div class="price-stat-value">${currency} ${avgPrice}</div>
        </div>
      </div>
      
      <div class="chart-wrapper">
        <canvas id="priceChart-${productId}"></canvas>
      </div>
    `;
    
    // Create chart
    const ctx = document.getElementById(`priceChart-${productId}`).getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates.map(d => d.toLocaleDateString()),
        datasets: [{
          label: `Precio (${currency})`,
          data: prices,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#667eea',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                return `${currency} ${context.parsed.y.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function(value) {
                return `${currency} ${value.toFixed(0)}`;
              }
            }
          },
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
      }
    });
  }

  chartContainer.classList.add('active');
}

function handleSearch(event) {
  const searchTerm = event.target.value.toLowerCase();
    
  if (!searchTerm) {
    currentPage = 1;
    displayedProducts = allProducts.slice(0, PRODUCTS_PER_PAGE);
    displayProducts(displayedProducts);
    return;
  }

  const filtered = allProducts.filter(product => 
    product.title.toLowerCase().includes(searchTerm) ||
        product.url.toLowerCase().includes(searchTerm) ||
        (product.sku && product.sku.toLowerCase().includes(searchTerm))
  );

  currentPage = 1;
  displayedProducts = filtered.slice(0, PRODUCTS_PER_PAGE);
  displayProducts(displayedProducts);
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
