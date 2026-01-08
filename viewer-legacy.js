
let db;
let allVariants = [];
let displayedVariants = [];
const VARIANTS_PER_PAGE = 10;
let currentPage = 1;

async function loadDatabase() {
  try {
    console.log('[viewer] Iniciando carga de la base de datos...');
    if (typeof initSqlJs === 'undefined') {
      throw new Error('SQL.js library failed to load.');
    }
    const SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });
		
    // Cargar DB comprimida con gzip
    console.log('[viewer] Fetching prices.db.gz (comprimido)...');
    const response = await fetch('prices.db.gz');
    if (!response.ok) {
      console.error('[viewer] No se pudo cargar prices.db.gz', response.status, response.statusText);
      throw new Error('Database file not found.');
    }
    console.log('[viewer] Fetch completado');
		
    // Descomprimir con pako
    console.log('[viewer] Convirtiendo a ArrayBuffer...');
    const compressed = await response.arrayBuffer();
    console.log('[viewer] Tamaño comprimido:', (compressed.byteLength/1024/1024).toFixed(2), 'MB');
		
    console.log('[viewer] Descomprimiendo con pako.ungzip (puede tardar ~10-20 segundos)...');
    const startDecompress = Date.now();
    const decompressed = pako.ungzip(new Uint8Array(compressed));
    const decompressTime = Date.now() - startDecompress;
    console.log('[viewer] ✓ Descompresión completa en', (decompressTime/1000).toFixed(1), 'segundos');
    console.log('[viewer] Tamaño descomprimido:', (decompressed.byteLength/1024/1024).toFixed(2), 'MB');
		
    console.log('[viewer] Inicializando SQL.Database...');
    db = new SQL.Database(decompressed);
    console.log('[viewer] Base de datos cargada, llamando displayData()');
    displayData();
  } catch (error) {
    showError('Error loading database: ' + error.message);
  }
}

function showError(message) {
  console.error('[viewer] showError:', message);
  document.getElementById('loading').style.display = 'none';
  document.getElementById('error').classList.remove('d-none');
  document.getElementById('error').style.display = 'block';
  document.getElementById('error').textContent = message;
}

function displayData() {
  // Estadísticas
  console.log('[viewer] displayData() llamada');
  const statsQuery = db.exec(`
		SELECT 
			(SELECT COUNT(*) FROM products) as total_products,
			(SELECT COUNT(*) FROM variants) as total_variants,
			(SELECT COUNT(*) FROM prices) as total_prices,
			(SELECT MAX(scraped_at) FROM prices) as last_update
	`);
  if (statsQuery.length > 0) {
    const stats = statsQuery[0].values[0];
    console.log('[viewer] Stats:', stats);
    document.getElementById('totalProducts').textContent = stats[0] || 0;
    // totalRecords muestra el total de precios (stats[2])
    document.getElementById('totalRecords').textContent = stats[2] || 0;
    if (stats[3]) {
      const lastUpdate = new Date(stats[3]);
      document.getElementById('lastUpdate').textContent = lastUpdate.toLocaleDateString();
    }
  } else {
    console.warn('[viewer] No se obtuvieron stats');
  }

  // Variantes con datos básicos
  console.log('[viewer] Ejecutando query simplificada de variantes...');
  const startQuery = Date.now();
  const variantsQuery = db.exec(`
		SELECT 
			v.id, 
			v.url, 
			v.sku, 
			v.variant_label, 
			v.variant_value, 
			p.title
		FROM variants v
		JOIN products p ON v.product_id = p.id
	`);
  const queryTime = Date.now() - startQuery;
  console.log('[viewer] Query completada en', queryTime, 'ms');
	
  if (variantsQuery.length === 0 || variantsQuery[0].values.length === 0) {
    console.warn('[viewer] No se encontraron variantes en la base');
    showEmptyState();
    return;
  }
  console.log('[viewer] Variantes encontradas:', variantsQuery[0].values.length);
	
  // Cargar precios más recientes para estas variantes
  console.log('[viewer] Cargando precios recientes...');
  const variantIds = variantsQuery[0].values.map(row => row[0]).join(',');
	
  const pricesQuery = db.exec(`
		SELECT 
			p1.variant_id,
			p1.price,
			p1.currency,
			p1.scraped_at
		FROM prices p1
		INNER JOIN (
			SELECT variant_id, MAX(scraped_at) as max_date
			FROM prices
			WHERE variant_id IN (${variantIds})
			GROUP BY variant_id
		) p2 ON p1.variant_id = p2.variant_id AND p1.scraped_at = p2.max_date
	`);
	
  // Mapear precios por variant_id
  const pricesMap = {};
  if (pricesQuery.length > 0) {
    pricesQuery[0].values.forEach(row => {
      pricesMap[row[0]] = {
        price: row[1],
        currency: row[2],
        scraped_at: row[3]
      };
    });
  }
  console.log('[viewer] Precios cargados:', Object.keys(pricesMap).length);
	
  allVariants = variantsQuery[0].values.map(row => {
    const variantId = row[0];
    const priceData = pricesMap[variantId] || {};
    return {
      id: variantId,
      url: row[1],
      sku: row[2],
      label: row[3],
      value: row[4],
      title: row[5],
      currentPrice: priceData.price || null,
      currency: priceData.currency || null,
      lastScraped: priceData.scraped_at || null,
      firstPrice: null,
      minPrice: null,
      maxPrice: null
    };
  });
	
  displayedVariants = allVariants.slice(0, VARIANTS_PER_PAGE);
  displayVariants(displayedVariants);
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('loading').style.display = 'none';
  const content = document.getElementById('content');
  content.classList.remove('d-none');
  content.style.display = 'block';
  console.log('[viewer] Mostrando #content');
}

function displayVariants(variants, append = false) {
  console.log('[viewer] displayVariants() llamada, variantes:', variants.length);
  const variantsList = document.getElementById('productsList');
  if (variants.length === 0 && !append) {
    console.warn('[viewer] displayVariants: No variants to mostrar');
    variantsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>No variants found</p></div>';
    return;
  }
  const variantsHtml = variants.map(variant => {
    let priceChange = '';
    let lowestPriceBadge = '';
    let priceDisplay = 'Sin precio';
    if (typeof variant.currentPrice === 'number') {
      priceDisplay = `${variant.currency || ''} ${variant.currentPrice.toFixed(2)}`;
      if (variant.currentPrice === variant.minPrice && variant.minPrice !== null) {
        lowestPriceBadge = '<span class="lowest-price-badge">🎉 ¡PRECIO MÁS BAJO!</span>';
      }
      if (variant.firstPrice && variant.currentPrice !== variant.firstPrice) {
        const change = ((variant.currentPrice - variant.firstPrice) / variant.firstPrice * 100).toFixed(1);
        const changeClass = change > 0 ? 'price-up' : 'price-down';
        const changeSymbol = change > 0 ? '↑' : '↓';
        priceChange = `<span class="price-change ${changeClass}">${changeSymbol} ${Math.abs(change)}%</span>`;
      } else if (variant.firstPrice) {
        priceChange = '<span class="price-change price-stable">No change</span>';
      }
    }
    return `
			<div class="product-item product-card" onclick="toggleVariantDetails(${variant.id})">
				<div class="product-title">${escapeHtml(variant.title)}</div>
				${variant.sku ? `<div class="product-sku">SKU: ${escapeHtml(variant.sku)}</div>` : ''}
				${variant.label ? `<div class="variant-label">${escapeHtml(variant.label)}: ${escapeHtml(variant.value)}</div>` : ''}
				<div class="product-info">
					<div class="current-price">${priceDisplay}${lowestPriceBadge}</div>
					${priceChange}
				</div>
				<div class="product-url"><a href="${escapeHtml(variant.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" style="color: #667eea; text-decoration: none;">🔗 Ver variante</a></div>
				<div id="chart-${variant.id}" class="chart-container price-history"></div>
			</div>
		`;
  }).join('');
  if (append) {
    variantsList.innerHTML += variantsHtml;
  } else {
    variantsList.innerHTML = variantsHtml;
  }
  updateLoadMoreButton();
}

function updateLoadMoreButton() {
  const variantsList = document.getElementById('productsList');
  const existingButton = document.getElementById('loadMoreBtn');
  if (existingButton) existingButton.remove();
  if (displayedVariants.length < allVariants.length) {
    const remaining = allVariants.length - displayedVariants.length;
    const buttonHtml = `
			<div id="loadMoreBtn" style="text-align: center; padding: 2rem;">
				<button class="btn btn-primary btn-lg" onclick="loadMoreVariants()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; padding: 1rem 2rem; font-size: 1rem; border-radius: 10px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
					<i class="bi bi-arrow-down-circle"></i> Cargar todas las variantes restantes (${remaining})<br>
					<small style="font-size: 0.85rem; opacity: 0.9;">⚠️ La página podría volverse más lenta</small>
				</button>
			</div>
		`;
    variantsList.insertAdjacentHTML('beforeend', buttonHtml);
  }
}

function loadMoreVariants() {
  const start = displayedVariants.length;
  const remainingVariants = allVariants.slice(start);
  displayedVariants = allVariants.slice(0);
  displayVariants(remainingVariants, true);
}

function toggleVariantDetails(variantId) {
  const chartContainer = document.getElementById(`chart-${variantId}`);
  if (chartContainer.classList.contains('active')) {
    chartContainer.classList.remove('active');
    const canvasId = `priceChart-${variantId}`;
    const existingChart = Chart.getChart(canvasId);
    if (existingChart) existingChart.destroy();
    return;
  }
  const historyQuery = db.exec(`
		SELECT price, currency, scraped_at FROM prices WHERE variant_id = ${variantId} ORDER BY scraped_at ASC
	`);
  if (historyQuery.length === 0 || historyQuery[0].values.length === 0) {
    chartContainer.innerHTML = '<p>No price history available</p>';
  } else {
    const history = historyQuery[0].values;
    const prices = history.map(h => h[0]);
    const dates = history.map(h => new Date(h[2]));
    const currency = history[0][1];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
    const currentPrice = prices[prices.length - 1];
    chartContainer.innerHTML = `
			<h3 style="margin-bottom: 1rem;">📊 Historial de Precios</h3>
			<div class="price-stats">
				<div class="price-stat-item"><div class="price-stat-label">Precio Actual</div><div class="price-stat-value">${currency} ${currentPrice.toFixed(2)}</div></div>
				<div class="price-stat-item"><div class="price-stat-label">Precio Más Bajo</div><div class="price-stat-value lowest">${currency} ${minPrice.toFixed(2)}</div></div>
				<div class="price-stat-item"><div class="price-stat-label">Precio Más Alto</div><div class="price-stat-value highest">${currency} ${maxPrice.toFixed(2)}</div></div>
				<div class="price-stat-item"><div class="price-stat-label">Promedio</div><div class="price-stat-value">${currency} ${avgPrice}</div></div>
			</div>
			<div class="chart-wrapper"><canvas id="priceChart-${variantId}"></canvas></div>
		`;
    const ctx = document.getElementById(`priceChart-${variantId}`).getContext('2d');
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
          legend: { display: false },
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
    displayedVariants = allVariants.slice(0, VARIANTS_PER_PAGE);
    displayVariants(displayedVariants);
    return;
  }
  const filtered = allVariants.filter(variant => 
    variant.title.toLowerCase().includes(searchTerm) ||
		variant.url.toLowerCase().includes(searchTerm) ||
		(variant.sku && variant.sku.toLowerCase().includes(searchTerm)) ||
		(variant.label && variant.label.toLowerCase().includes(searchTerm)) ||
		(variant.value && variant.value.toLowerCase().includes(searchTerm))
  );
  currentPage = 1;
  displayedVariants = filtered.slice(0, VARIANTS_PER_PAGE);
  displayVariants(displayedVariants);
}

function showEmptyState() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
  document.getElementById('productsList').innerHTML = `
		<div class="empty-state">
			<div class="empty-state-icon">📦</div>
			<h2>No variants yet</h2>
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
