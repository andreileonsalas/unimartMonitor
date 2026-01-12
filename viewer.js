// Viewer con Web Worker - la UI nunca se bloquea
let worker;
const allVariants = [];
let displayedVariants = [];
const VARIANTS_PER_PAGE = 10;

async function loadDatabase() {
  try {
    console.log('[viewer2] Iniciando carga con Web Worker...');
		
    // Crear el worker
    worker = new Worker('db-worker.js');
		
    // Configurar event listeners
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (error) => {
      showError('Worker error: ' + error.message);
    };
		
    // Timeout de seguridad (30 segundos para fetch)
    const fetchTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout: La descarga tardó demasiado')), 30000)
    );
		
    // Descargar y descomprimir la DB
    console.log('[viewer2] Fetching prices.db.gz...');
    const response = await Promise.race([
      fetch('prices.db.gz'),
      fetchTimeout
    ]);
    
    if (!response.ok) throw new Error('Database file not found.');
		
    const compressed = await response.arrayBuffer();
    console.log('[viewer2] Tamaño comprimido:', (compressed.byteLength/1024/1024).toFixed(2), 'MB');
		
    console.log('[viewer2] Descomprimiendo...');
    const startDecompress = Date.now();
    const decompressed = pako.ungzip(new Uint8Array(compressed));
    console.log('[viewer2] ✓ Descompresión:', ((Date.now() - startDecompress)/1000).toFixed(1), 's');
		
    // Verificar que la descompresión fue exitosa
    if (!decompressed || decompressed.length === 0) {
      throw new Error('Descompresión falló - datos vacíos');
    }
		
    // Enviar DB al worker (en segundo plano!)
    console.log('[viewer2] Enviando DB al worker...');
    
    // Crear ArrayBuffer del tamaño exacto (evita problemas con .buffer)
    const exactBuffer = decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength);
    
    worker.postMessage({ 
      type: 'INIT_DB', 
      data: { buffer: exactBuffer }
    }, [exactBuffer]); // Transferir ownership para mejor performance
		
  } catch (error) {
    console.error('[viewer2] Error loading database:', error);
    showError('Error loading database: ' + error.message);
    
    // FALLBACK: Mostrar datos de ejemplo si falla la carga
    loadFallbackData();
  }
}

function loadFallbackData() {
  console.log('[viewer2] Cargando datos de ejemplo (fallback)...');
  
  // Datos de ejemplo para que Google vea contenido
  const fallbackVariants = [
    {
      id: 1,
      title: 'Ejemplo Producto 1 - Unimart',
      url: 'https://www.unimart.com/ejemplo-1',
      sku: 'SKU-001',
      label: 'Color',
      value: 'Rojo',
      currentPrice: 15990,
      currency: '₡',
      lastScraped: new Date().toISOString()
    },
    {
      id: 2,
      title: 'Ejemplo Producto 2 - Unimart',
      url: 'https://www.unimart.com/ejemplo-2',
      sku: 'SKU-002',
      label: 'Tamaño',
      value: 'Grande',
      currentPrice: 25990,
      currency: '₡',
      lastScraped: new Date().toISOString()
    },
    {
      id: 3,
      title: 'Ejemplo Producto 3 - Unimart',
      url: 'https://www.unimart.com/ejemplo-3',
      sku: 'SKU-003',
      label: null,
      value: null,
      currentPrice: 8990,
      currency: '₡',
      lastScraped: new Date().toISOString()
    }
  ];
  
  // Actualizar estadísticas con datos de ejemplo
  document.getElementById('totalProducts').textContent = '1000+';
  document.getElementById('totalRecords').textContent = '50000+';
  document.getElementById('lastUpdate').textContent = new Date().toLocaleDateString();
  
  // Mostrar productos de ejemplo
  allVariants.push(...fallbackVariants);
  displayedVariants = fallbackVariants;
  displayVariants(displayedVariants);
  
  // Mostrar advertencia pero permitir que se vea la página
  const warningBanner = document.createElement('div');
  warningBanner.className = 'alert alert-warning alert-custom';
  warningBanner.style.marginBottom = '1rem';
  warningBanner.innerHTML = `
    <i class="bi bi-exclamation-triangle-fill me-2"></i>
    <strong>Modo de demostración:</strong> No se pudo cargar la base de datos completa. 
    Mostrando productos de ejemplo. Intenta recargar la página.
  `;
  document.querySelector('.container').insertBefore(warningBanner, document.getElementById('content'));
  
  // Ocultar loading y mostrar contenido
  document.getElementById('loading').style.display = 'none';
  document.getElementById('error').style.display = 'none';
  document.getElementById('content').classList.remove('d-none');
  document.getElementById('content').style.display = 'block';
  
  // Deshabilitar búsqueda en modo fallback
  const searchInput = document.getElementById('searchInput');
  searchInput.disabled = true;
  searchInput.placeholder = 'Búsqueda no disponible en modo demo';
}

function handleWorkerMessage(e) {
  const { type, data, error } = e.data;
	
  console.log('[viewer2] Worker message:', type);
	
  switch(type) {
  case 'DB_READY':
    console.log('[viewer2] ✓ Worker listo, pidiendo stats...');
    document.getElementById('loading').querySelector('p').textContent = 'Cargando estadísticas...';
    worker.postMessage({ type: 'QUERY_STATS' });
    break;
			
  case 'STATS_RESULT':
    console.log('[viewer2] Stats:', data);
    document.getElementById('totalProducts').textContent = data[0] || 0;
    document.getElementById('totalRecords').textContent = data[2] || 0;
    if (data[3]) {
      const lastUpdate = new Date(data[3]);
      document.getElementById('lastUpdate').textContent = lastUpdate.toLocaleDateString();
    }
			
    // Pedir variantes
    document.getElementById('loading').querySelector('p').textContent = 'Cargando variantes...';
    worker.postMessage({ type: 'QUERY_VARIANTS' });
    break;
			
  case 'VARIANTS_CHUNK':
    // Recibir chunks sin bloquear la UI
    allVariants.push(...data.chunk);
    document.getElementById('loading').querySelector('p').textContent = 
				`Procesando variantes... ${data.progress}%`;
			
    if (data.isLast) {
      console.log('[viewer2] ✓ Todas las variantes cargadas:', allVariants.length);
      displayedVariants = allVariants.slice(0, VARIANTS_PER_PAGE);
      displayVariants(displayedVariants);
      document.getElementById('searchInput').addEventListener('input', handleSearch);
      document.getElementById('loading').style.display = 'none';
      document.getElementById('content').classList.remove('d-none');
      document.getElementById('content').style.display = 'block';
    }
    break;
			
  case 'PRICE_HISTORY_RESULT':
    displayPriceHistory(data.variantId, data.history);
    break;
			
  case 'ERROR':
    showError('Worker error: ' + error);
    break;
  }
}

// Called from HTML onclick events
// eslint-disable-next-line no-unused-vars
function toggleVariantDetails(variantId) {
  const chartContainer = document.getElementById(`chart-${variantId}`);
  if (chartContainer.classList.contains('active')) {
    chartContainer.classList.remove('active');
    return;
  }
	
  // Pedir historial al worker
  chartContainer.innerHTML = '<p style="text-align: center; padding: 2rem;">⏳ Cargando historial...</p>';
  chartContainer.classList.add('active');
  worker.postMessage({ 
    type: 'QUERY_PRICE_HISTORY', 
    data: { variantId } 
  });
}

function displayPriceHistory(variantId, history) {
  const chartContainer = document.getElementById(`chart-${variantId}`);
	
  if (history.length === 0) {
    chartContainer.innerHTML = '<p>No price history available</p>';
    return;
  }
	
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
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: false,
          ticks: { callback: (value) => `${currency} ${value.toFixed(0)}` }
        }
      }
    }
  });
}

function displayVariants(variants, append = false) {
  const variantsList = document.getElementById('productsList');
  if (variants.length === 0 && !append) {
    variantsList.innerHTML = '<div class="empty-state"><p>No variants found</p></div>';
    return;
  }
	
  const variantsHtml = variants.map(variant => {
    let priceDisplay = 'Sin precio';
    if (typeof variant.currentPrice === 'number') {
      priceDisplay = `${variant.currency || ''} ${variant.currentPrice.toFixed(2)}`;
    }
		
    return `
			<div class="product-item product-card" onclick="toggleVariantDetails(${variant.id})">
				<div class="product-title">${escapeHtml(variant.title)}</div>
				${variant.sku ? `<div class="product-sku">SKU: ${escapeHtml(variant.sku)}</div>` : ''}
				${variant.label ? `<div class="variant-label">${escapeHtml(variant.label)}: ${escapeHtml(variant.value)}</div>` : ''}
				<div class="product-info">
					<div class="current-price">${priceDisplay}</div>
				</div>
				<div class="product-url"><a href="${escapeHtml(variant.url)}" target="_blank" onclick="event.stopPropagation()" style="color: #667eea;">🔗 Ver variante</a></div>
				<div id="chart-${variant.id}" class="chart-container price-history"></div>
			</div>
		`;
  }).join('');
	
  if (append) {
    variantsList.innerHTML += variantsHtml;
  } else {
    variantsList.innerHTML = variantsHtml;
  }
}

function handleSearch(event) {
  const searchTerm = event.target.value.toLowerCase();
  if (!searchTerm) {
    displayedVariants = allVariants.slice(0, VARIANTS_PER_PAGE);
    displayVariants(displayedVariants);
    return;
  }
	
  const filtered = allVariants.filter(variant => 
    variant.title.toLowerCase().includes(searchTerm) ||
		variant.url.toLowerCase().includes(searchTerm) ||
		(variant.sku && variant.sku.toLowerCase().includes(searchTerm))
  );
	
  displayedVariants = filtered.slice(0, VARIANTS_PER_PAGE);
  displayVariants(displayedVariants);
}

function showError(message) {
  console.error('[viewer2]', message);
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  
  if (loadingEl) loadingEl.style.display = 'none';
  if (errorEl) {
    errorEl.classList.remove('d-none');
    errorEl.style.display = 'block';
    
    // Actualizar el mensaje de error
    const errorMessageEl = document.getElementById('errorMessage');
    if (errorMessageEl) {
      errorMessageEl.textContent = message;
    } else {
      errorEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i>${escapeHtml(message)}`;
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

loadDatabase();
