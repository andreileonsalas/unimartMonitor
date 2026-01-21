// price_change_report.js
// Lista variantes ordenadas por cambio de precio actual (descuento o encarecimiento), con paginación y detalles

const VARIANTS_PER_PAGE = 10;
let allVariants = [];
let displayedVariants = [];
let filteredVariants = [];
let currentPage = 0;
let currentType = 'discount';

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c];
  });
}

function displayVariants(variants, append = false) {
  const variantsList = document.getElementById('productsList');
  if (variants.length === 0 && !append) {
    variantsList.innerHTML = '<div class="empty-state"><p>No se encontraron variantes con cambios de precio.</p></div>';
    return;
  }
  const variantsHtml = variants.map(variant => {
    let priceDisplay = 'Sin precio';
    if (typeof variant.curr === 'number') {
      priceDisplay = `₡ ${variant.curr.toFixed(2)}`;
    }
    let badge = '';
    if (variant.change < 0) badge = `<span class='price-badge price-down'>${variant.change}</span>`;
    else if (variant.change > 0) badge = `<span class='price-badge price-up'>+${variant.change}</span>`;
    else badge = `<span class='price-badge price-stable'>0</span>`;
    return `
      <div class="product-item product-card" onclick="toggleVariantDetails(${variant.id})" style="cursor:pointer;">
        <div class="product-title">${escapeHtml(variant.title || variant.sku || '')}</div>
        ${variant.sku ? `<div class="product-sku">SKU: ${escapeHtml(variant.sku)}</div>` : ''}
        ${variant.label ? `<div class="variant-label">${escapeHtml(variant.label)}: ${escapeHtml(variant.value)}</div>` : ''}
        <div class="product-info">
          <div class="current-price">${priceDisplay} ${badge}</div>
          <div style="font-size:0.95rem;color:#6c757d;">De: ${variant.prev} → ${variant.curr}</div>
          <div style="font-size:0.9rem;color:#6c757d;">Fecha: ${variant.date}</div>
        </div>
        <div class="product-url"><a href="${escapeHtml(variant.url || '#')}" target="_blank" onclick="event.stopPropagation()" style="color: #667eea;">🔗 Ver variante</a></div>
        <div id="chart-${variant.id}" class="chart-container price-history"></div>
      </div>
    `;
  }).join('');
  if (append) {
    variantsList.innerHTML += variantsHtml;
  } else {
    variantsList.innerHTML = variantsHtml;
    updatePagination();
  }
}

// Mostrar/ocultar historial de precios al hacer clic
async function toggleVariantDetails(variantId) {
  const chartContainer = document.getElementById(`chart-${variantId}`);
  if (!chartContainer) return;
  if (chartContainer.classList.contains('active')) {
    chartContainer.classList.remove('active');
    chartContainer.innerHTML = '';
    return;
  }
  chartContainer.innerHTML = '<p style="text-align: center; padding: 2rem;">⏳ Cargando historial...</p>';
  chartContainer.classList.add('active');
  try {
    // Reabrir la base de datos para obtener el historial
    if (!window._priceChangeReportDB) return chartContainer.innerHTML = '<p>Error: DB no cargada</p>';
    const db = window._priceChangeReportDB;
    const history = db.exec(`SELECT price, scraped_at FROM prices WHERE variant_id = ${variantId} ORDER BY scraped_at ASC`)[0]?.values || [];
    if (history.length === 0) {
      chartContainer.innerHTML = '<p>No hay historial de precios</p>';
      return;
    }
    const prices = history.map(h => h[0]);
    const dates = history.map(h => new Date(h[1]));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
    const currentPrice = prices[prices.length - 1];
    // Badge si el precio actual es igual al más bajo
    const isLowest = currentPrice === minPrice;
    const lowestBadge = isLowest ? '<span class="badge bg-success ms-2">¡Precio más bajo histórico!</span>' : '';
    chartContainer.innerHTML = `
      <h3 style="margin-bottom: 1rem;">📊 Historial de Precios</h3>
      <div class="price-stats">
        <div class="price-stat-item"><div class="price-stat-label">Precio Actual</div><div class="price-stat-value">₡ ${currentPrice.toFixed(2)} ${lowestBadge}</div></div>
        <div class="price-stat-item"><div class="price-stat-label">Precio Más Bajo</div><div class="price-stat-value lowest">₡ ${minPrice.toFixed(2)}</div></div>
        <div class="price-stat-item"><div class="price-stat-label">Precio Más Alto</div><div class="price-stat-value highest">₡ ${maxPrice.toFixed(2)}</div></div>
        <div class="price-stat-item"><div class="price-stat-label">Promedio</div><div class="price-stat-value">₡ ${avgPrice}</div></div>
      </div>
      <div class="chart-wrapper"><canvas id="priceChart-${variantId}"></canvas></div>
    `;
    const ctx = document.getElementById(`priceChart-${variantId}`).getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates.map(d => d.toLocaleDateString()),
        datasets: [{
          label: `Precio (₡)`,
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
            ticks: { callback: (value) => `₡ ${value.toFixed(0)}` }
          }
        }
      }
    });
  } catch (err) {
    chartContainer.innerHTML = `<p>Error al cargar historial: ${err.message}</p>`;
  }
}

function updatePagination() {
  const paginationContainer = document.getElementById('paginationContainer');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const paginationInfo = document.getElementById('paginationInfo');
  if (filteredVariants.length <= VARIANTS_PER_PAGE) {
    paginationContainer.classList.add('d-none');
    return;
  }
  paginationContainer.classList.remove('d-none');
  const totalShown = Math.min((currentPage + 1) * VARIANTS_PER_PAGE, filteredVariants.length);
  const hasMore = totalShown < filteredVariants.length;
  loadMoreBtn.disabled = !hasMore;
  loadMoreBtn.innerHTML = hasMore 
    ? '<i class="bi bi-plus-circle me-2"></i>Cargar más'
    : '<i class="bi bi-check-circle me-2"></i>Todos los productos mostrados';
  paginationInfo.textContent = `Mostrando ${totalShown} de ${filteredVariants.length} variantes`;
}

function loadMoreProducts() {
  if (currentPage * VARIANTS_PER_PAGE >= filteredVariants.length) return;
  currentPage++;
  const startIndex = currentPage * VARIANTS_PER_PAGE;
  const endIndex = startIndex + VARIANTS_PER_PAGE;
  const moreVariants = filteredVariants.slice(startIndex, endIndex);
  displayVariants(moreVariants, true);
  updatePagination();
}

document.getElementById('loadMoreBtn').addEventListener('click', loadMoreProducts);
document.getElementById('changeType').addEventListener('change', function(e) {
  currentType = e.target.value;
  currentPage = 0;
  filterAndDisplay();
});

function filterAndDisplay() {
  if (currentType === 'discount') {
    filteredVariants = allVariants.filter(v => v.change < 0);
    filteredVariants.sort((a, b) => a.change - b.change); // más negativo primero
  } else {
    filteredVariants = allVariants.filter(v => v.change > 0);
    filteredVariants.sort((a, b) => b.change - a.change); // más positivo primero
  }
  currentPage = 0;
  displayedVariants = filteredVariants.slice(0, VARIANTS_PER_PAGE);
  displayVariants(displayedVariants);
}

(async function() {
  const loading = document.getElementById('loading');
  const errorDiv = document.getElementById('error');
  try {
    const response = await fetch('prices.db.gz');
    if (!response.ok) throw new Error('No se pudo descargar prices.db.gz');
    const compressed = await response.arrayBuffer();
    const decompressed = pako.ungzip(new Uint8Array(compressed));
    const SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });
    const db = new SQL.Database(decompressed);
    window._priceChangeReportDB = db; // Guardar referencia global para historial
    // Obtener todas las variantes y calcular cambios
    const variants = db.exec('SELECT id, sku, variant_label, variant_value, url FROM variants')[0]?.values || [];
    allVariants = [];
    for (const [id, sku, label, value, url] of variants) {
      const history = db.exec(`SELECT price, scraped_at FROM prices WHERE variant_id = ${id} ORDER BY scraped_at ASC`)[0]?.values;
      if (!history || history.length < 2) continue;
      const prev = history[history.length - 2];
      const curr = history[history.length - 1];
      const change = curr[0] - prev[0];
      allVariants.push({
        id, sku, label, value, url,
        prev: prev[0], curr: curr[0], change, date: curr[1]
      });
    }
    filterAndDisplay();
    loading.style.display = 'none';
  } catch (err) {
    loading.style.display = 'none';
    errorDiv.classList.remove('d-none');
    document.getElementById('errorMessage').textContent = err.message;
  }
})();
