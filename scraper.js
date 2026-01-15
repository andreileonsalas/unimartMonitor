// Scraper para productos y variantes unimart.com
// Guarda resultados en prices.db con estructura normalizada (products, variants, prices)

const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const Database = require('better-sqlite3');
const path = require('path');

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const DB_PATH = path.join(__dirname, 'prices.db');
const SITEMAP_INDEX_URL = 'https://www.unimart.com/sitemap.xml';

// ⚡ OPTIMIZACIÓN DE VELOCIDAD:
const PARALLEL_REQUESTS = 20; // Productos en paralelo por batch
const SITEMAP_PARALLEL_REQUESTS = 15; // Sitemaps en paralelo

// 🔄 MODO DE OPERACIÓN:
// --mode=daily: Scrapea solo productos existentes en DB (rápido, actualiza precios)
// --mode=weekly: Scrapea sitemap completo (descubre nuevos productos + variantes)
const SCRAPE_MODE = (() => {
  if (process.argv.includes('--mode=daily')) return 'daily';
  if (process.argv.includes('--mode=weekly')) return 'weekly';
  return 'weekly'; // default
})();

function initDatabase() {
  const db = new Database(DB_PATH);
  // Crear tablas si no existen
  db.exec(`
		CREATE TABLE IF NOT EXISTS products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			url_base TEXT UNIQUE NOT NULL,
			title TEXT,
			status TEXT DEFAULT 'active',
			last_check DATETIME
		);
		CREATE TABLE IF NOT EXISTS variants (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			product_id INTEGER NOT NULL,
			url TEXT UNIQUE NOT NULL,
			sku TEXT,
			variant_label TEXT,
			variant_value TEXT,
			FOREIGN KEY (product_id) REFERENCES products(id)
		);
		CREATE TABLE IF NOT EXISTS prices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			variant_id INTEGER NOT NULL,
			price REAL,
			currency TEXT,
			scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (variant_id) REFERENCES variants(id)
		);
		
		-- Índices para mejorar performance
		CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
		CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
		CREATE INDEX IF NOT EXISTS idx_prices_variant_id ON prices(variant_id);
	`);
  
  // Agregar columnas status y last_check si no existen (para bases de datos migradas)
  try {
    db.exec('ALTER TABLE products ADD COLUMN status TEXT DEFAULT \'active\'');
  } catch {
    // Columna ya existe
  }
  try {
    db.exec('ALTER TABLE products ADD COLUMN last_check DATETIME');
  } catch {
    // Columna ya existe
  }
  
  return db;
}

async function fetchProductSitemaps() {
  try {
    const res = await axios.get(SITEMAP_INDEX_URL, { timeout: 20000 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(res.data);
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      return result.sitemapindex.sitemap
        .map(s => s.loc[0])
        .filter(url => url.includes('/products/'));
    }
    return [];
  } catch (e) {
    console.error('Error fetching sitemap index:', e.message);
    return [];
  }
}

async function fetchSitemapUrls(sitemapUrl) {
  try {
    const res = await axios.get(sitemapUrl, { timeout: 15000 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(res.data);
    if (result.urlset && result.urlset.url) {
      return result.urlset.url.map(entry => entry.loc[0]);
    }
    return [];
  } catch (e) {
    console.error('Error fetching sitemap:', sitemapUrl, e.message);
    return [];
  }
}


// Extraer SKU del HTML de una página específica
async function extractSKUFromHTML(pageUrl) {
  try {
    const res = await axios.get(pageUrl, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);

    // Buscar SKU en el HTML
    let sku = null;

    // Intento 1: buscar en meta tags
    sku = $('meta[itemprop="sku"]').attr('content');
    if (sku) return sku;

    // Intento 2: buscar en atributos data-sku
    sku = $('[data-sku]').first().attr('data-sku');
    if (sku) return sku;

    // Intento 3: buscar en JSON-LD
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const jsonData = JSON.parse($(el).html());
        if (jsonData.sku) {
          sku = jsonData.sku;
          return false;
        }
      } catch (e) {}
    });
    if (sku) return sku;

    // Intento 4: buscar en texto "SKU:" o "SKU ="
    const html = $.html();
    let match = html.match(/SKU\s*[:=]\s*([A-Z0-9\-]+)/i);
    if (match && match[1]) {
      sku = match[1];
      // Limpiar prefijo "SKU" si está presente
      if (sku.startsWith('SKU')) {
        sku = sku.substring(3);
      }
      return sku;
    }

    // Intento 5: buscar en divs/spans con clase sku
    sku = $('[class*="sku"]').first().text().trim();
    if (sku && sku.length < 50 && /[A-Z0-9]/.test(sku)) {
      if (sku.startsWith('SKU')) {
        sku = sku.substring(3);
      }
      return sku;
    }

    // Intento 6: buscar en tabla de descripción del producto
    const descTable = $('.product-description-table');
    if (descTable.length > 0) {
      let found = false;
      descTable.find('tr').each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const firstCell = $(cells[0]).text().trim();
          const secondCell = $(cells[1]).text().trim();
          
          if (firstCell === 'SKU' && secondCell) {
            sku = secondCell;
            found = true;
            return false;
          }
        }
      });
      if (found) return sku;
    }

    return null;
  } catch (e) {
    console.error(`Error extracting SKU from ${pageUrl}:`, e.message);
    return null;
  }
}

async function detectVariants(url) {
  try {
    const res = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
		
    // Buscar la clase .product-options
    const productOptions = $('.product-options');
    if (productOptions.length === 0) {
      // No hay variantes
      return null;
    }
		
    // 1. Extraer el label de variante del HTML visible
    let variantLabel = null;
    const labelSpan = productOptions.find('span.font-normal');
    if (labelSpan.length > 0) {
      variantLabel = labelSpan.text().trim();
    }
    
    // 2. Extraer variantes del HTML - estrategia simple y confiable
    const variants = [];
    const variantButtons = productOptions.find('button');
    
    variantButtons.each((i, el) => {
      const $button = $(el);
      const variantValue = $button.find('p').text().trim();
      
      if (variantValue && variantValue.length > 0 && !variantValue.match(/Guía|talla/i)) {
        variants.push({
          title: variantValue,
          label: variantLabel
          // El precio será el precio principal del producto (común en Shopify)
        });
      }
    });
    
    // 3. Si no encontramos variantes en HTML, usar VRA como fallback
    if (variants.length === 0) {
      $('script').each((i, el) => {
        const content = $(el).html();
        if (!content || !content.includes('vra')) return;
        
        try {
          const vraIndex = content.indexOf('"vra":');
          if (vraIndex === -1) return;
          
          const arrayStart = content.indexOf('[', vraIndex);
          if (arrayStart === -1) return;
          
          let depth = 0;
          let arrayEnd = -1;
          for (let i = arrayStart; i < content.length; i++) {
            if (content[i] === '[') depth++;
            if (content[i] === ']') {
              depth--;
              if (depth === 0) {
                arrayEnd = i;
                break;
              }
            }
          }
          
          if (arrayEnd === -1) return;
          
          const vraJson = content.substring(arrayStart, arrayEnd + 1);
          const vraData = JSON.parse(vraJson);
          
          vraData.forEach(([variantId, attributes]) => {
            const variant = { id: variantId };
            attributes.forEach(([key, values]) => {
              if (key === 'Color' || key === 'Valor' || key === 'Tamaño' || key === 'formato') {
                variant.title = values[0];
                if (!variantLabel) variantLabel = key;
              } else if (key === 'Sellable') {
                variant.available = values[0];
              }
            });
            // Solo usar variantes VRA si tienen título
            if (variant.title) {
              variants.push(variant);
            }
          });
          
          if (variants.length > 0) return false;
        } catch (e) {
          // ignore
        }
      });
    }
		
    if (variants.length === 0) return null;
    return { label: variantLabel, variants };
  } catch (e) {
    console.error('Error fetching product:', url, e.message);
    return null;
  }
}

// Función para productos simples (sin variantes)
async function scrapeSimpleProduct(url) {
  try {
    const response = await axios.get(url, { 
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(response.data);
    
    // CORREGIDO: Usar el selector correcto de Unimart
    const priceSelectors = [
      '.money', // Selector principal de Unimart
      '.product-price',
      '.price',
      '[data-price]'
    ];
    
    for (const selector of priceSelectors) {
      const priceElements = $(selector);
      
      // Buscar el precio principal (no tachado)
      for (let i = 0; i < priceElements.length; i++) {
        const element = priceElements.eq(i);
        const priceText = element.text().trim();
        const classes = element.attr('class') || '';
        
        // Evitar precios tachados (line-through)
        if (classes.includes('line-through')) continue;
        
        if (priceText && priceText.includes('₡')) {
          // Extraer número del formato ₡XX,XXX
          const price = parseFloat(priceText.replace(/[^\d.]/g, ''));
          if (!isNaN(price) && price > 0) {
            console.log(`    💰 Precio: ₡${price.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
            return price;
          }
        }
      }
    }
    
    console.log(`    ⚠️ No se encontró precio con selectores: ${priceSelectors.join(', ')}`);
    return null;
  } catch (e) {
    console.log(`    ❌ Error scrapeando precio: ${e.message}`);
    return null;
  }
}

async function scrapeAndSave(db, url) {
  // Guarda el producto base
  let title = url.split('/').pop().replace(/-/g, ' ');
  let status404 = false;
  
  try {
    const res = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    title = $('h1').first().text().trim() || title;
  } catch (e) {
    if (e.response && e.response.status === 404) {
      status404 = true;
      console.log(`  ⚠ 404 - Producto no encontrado: ${url}`);
    } else {
      console.log(`  ⚠ Error obteniendo título: ${e.message}`);
    }
  }
	
  // Normalizar URL: quitar parámetros para url_base
  const urlBase = url.split('?')[0];
  
  try {
    // Si es 404, marcar como tal y salir
    if (status404) {
      const updateStatus = db.prepare(`
        INSERT INTO products (url_base, title, status, last_check)
        VALUES (?, ?, '404', datetime('now'))
        ON CONFLICT(url_base) DO UPDATE SET
          status = '404',
          last_check = datetime('now')
      `);
      updateStatus.run(urlBase, title);
      return;
    }
    
    // Producto activo - guardar/actualizar con status 'active'
    const insertProduct = db.prepare(`
      INSERT INTO products (url_base, title, status, last_check)
      VALUES (?, ?, 'active', datetime('now'))
      ON CONFLICT(url_base) DO UPDATE SET
        title = excluded.title,
        status = 'active',
        last_check = datetime('now')
    `);
    insertProduct.run(urlBase, title);
    const product = db.prepare('SELECT id FROM products WHERE url_base = ?').get(urlBase);
    if (!product) {
      console.log('  ⚠ No se pudo insertar producto');
      return;
    }

    // Detecta variantes
    const detected = await detectVariants(url);
    if (detected && detected.variants.length > 0) {
      console.log(`  → ${detected.variants.length} variantes (${detected.label})`);
      
      for (const v of detected.variants) {
        // ⭐ RESTAURADO: Construir URL de variante con parámetro
        let variantUrl = url;
        if (detected.label && v.title) {
          const param = encodeURIComponent(detected.label) + '=' + encodeURIComponent(v.title);
          variantUrl = url + (url.includes('?') ? '&' : '?') + param;
        }
        
        // Extraer SKU y precio de la página específica de la variante
        const skuFromHTML = await extractSKUFromHTML(variantUrl);
        const variantPrice = await scrapeSimpleProduct(variantUrl);
        
        // Buscar si la variante ya existe (por product_id + variant_label + variant_value)
        const exists = db.prepare(`
          SELECT id, sku FROM variants 
          WHERE product_id = ? AND variant_label = ? AND variant_value = ?
        `).get(product.id, detected.label, v.title);
        
        if (!exists) {
          // INSERT: Nueva variante
          const insertVariant = db.prepare(`
						INSERT INTO variants (product_id, url, sku, variant_label, variant_value)
						VALUES (?, ?, ?, ?, ?)
					`);
          insertVariant.run(product.id, variantUrl, skuFromHTML, detected.label, v.title);
        } else if (exists.sku === null && skuFromHTML) {
          // UPDATE: Actualizar SKU si está NULL
          const updateSku = db.prepare('UPDATE variants SET sku = ? WHERE id = ?');
          updateSku.run(skuFromHTML, exists.id);
          console.log(`    ✏️  SKU actualizado: NULL → ${skuFromHTML}`);
        }
        
        // ✅ Guardar precio específico de la variante
        const variant = db.prepare(`
          SELECT id FROM variants 
          WHERE product_id = ? AND variant_label = ? AND variant_value = ?
        `).get(product.id, detected.label, v.title);
        
        if (variant && variantPrice && variantPrice > 0) {
          const insertPrice = db.prepare(`
						INSERT INTO prices (variant_id, price, currency)
						VALUES (?, ?, ?)
					`);
          insertPrice.run(variant.id, variantPrice, 'CRC');
          
          // Mostrar precio scrapeado
          const priceDisplay = `₡${variantPrice.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
          console.log(`    💰 ${v.title}: ${priceDisplay}`);
        } else if (variant && (!variantPrice || variantPrice <= 0)) {
          console.log(`    ⚠️  Sin precio para variante: ${v.title}`);
        }
      }
    } else {
      // Intentar como producto simple
      const simplePrice = await scrapeSimpleProduct(url);
      if (simplePrice && simplePrice > 0) {
        // Crear variante base si no existe
        let baseVariant = db.prepare('SELECT id FROM variants WHERE product_id = ? AND variant_label IS NULL').get(product.id);
        
        if (!baseVariant) {
          const skuFromHTML = await extractSKUFromHTML(url);
          const insertVariant = db.prepare(`
            INSERT INTO variants (product_id, url, sku, variant_label, variant_value)
            VALUES (?, ?, ?, NULL, NULL)
          `);
          const result = insertVariant.run(product.id, url, skuFromHTML);
          baseVariant = { id: result.lastInsertRowid };
        }
        
        // Guardar precio
        const insertPrice = db.prepare(`
          INSERT INTO prices (variant_id, price, currency)
          VALUES (?, ?, ?)
        `);
        insertPrice.run(baseVariant.id, simplePrice, 'CRC');
        
        console.log(`  💰 Producto simple: ₡${simplePrice.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
      } else {
        console.log('  ❌ Sin precios encontrados');
      }
    }
  } catch (e) {
    console.log(`  ⚠ Error procesando producto: ${e.message}`);
  }
}

async function main() {
  const db = initDatabase();
  console.log('Base de datos inicializada:', DB_PATH);
  console.log('='.repeat(70));
  console.log(`🔄 MODO: ${SCRAPE_MODE}`);
  console.log('='.repeat(70));
  
  let uniqueUrlBases = [];
  
  if (SCRAPE_MODE === 'daily') {
    // 📅 MODO DAILY: Solo actualizar precios de productos activos (sin 404s)
    console.log('📅 Modo Daily: Actualizando precios de productos activos\n');
    
    const products = db.prepare('SELECT url_base FROM products WHERE status != \'404\' OR status IS NULL').all();
    uniqueUrlBases = products.map(p => p.url_base);
    
    console.log(`✓ ${uniqueUrlBases.length} productos activos en base de datos\n`);
    
  } else {
    // 📆 MODO WEEKLY: Descubrir nuevos productos del sitemap
    console.log('📆 Modo Weekly: Descubriendo productos del sitemap\n');
    
    // Descubre TODOS los sitemaps de productos
    const productSitemaps = await fetchProductSitemaps();
    console.log(`Encontrados ${productSitemaps.length} sitemaps de productos`);
    
    // ⚡ Procesar sitemaps EN PARALELO (15 simultáneos)
    let urls = [];
    for (let i = 0; i < productSitemaps.length; i += SITEMAP_PARALLEL_REQUESTS) {
      const batch = productSitemaps.slice(i, i + SITEMAP_PARALLEL_REQUESTS);
      console.log(`Procesando batch ${Math.floor(i / SITEMAP_PARALLEL_REQUESTS) + 1}/${Math.ceil(productSitemaps.length / SITEMAP_PARALLEL_REQUESTS)} (${batch.length} sitemaps)...`);
      
      const batchPromises = batch.map(async (sitemapUrl) => {
        const u = await fetchSitemapUrls(sitemapUrl);
        return u;
      });
      
      const results = await Promise.all(batchPromises);
      results.forEach(u => { urls = urls.concat(u); });
    }
    
    // Elimina duplicados
    urls = [...new Set(urls)];
    
    // ⚡ OPTIMIZACIÓN: Normalizar URLs (quitar parámetros) para evitar duplicados
    // Ejemplo: /products/audifonos?Color=Rosa → /products/audifonos
    const urlBases = urls.map(url => url.split('?')[0]);
    uniqueUrlBases = [...new Set(urlBases)];
    
    console.log(`\n✓ ${urls.length} URLs en sitemap → ${uniqueUrlBases.length} productos únicos\n`);
  }
	
  // ⚡ Procesar productos EN PARALELO (20 simultáneos)
  let totalProcessed = 0;
  let startTime = Date.now();
  
  for (let i = 0; i < uniqueUrlBases.length; i += PARALLEL_REQUESTS) {
    const batch = uniqueUrlBases.slice(i, i + PARALLEL_REQUESTS);
    const batchPromises = batch.map((url, idx) => {
      const globalIdx = i + idx + 1;
      console.log(`[${globalIdx}/${uniqueUrlBases.length}] Scrapeando: ${url}`);
      return scrapeAndSave(db, url);
    });
    await Promise.all(batchPromises);
    totalProcessed += batch.length;
    
    // Estadísticas cada 25 productos
    if (totalProcessed % 25 === 0 || totalProcessed === uniqueUrlBases.length) {
      const currentPrices = db.prepare('SELECT COUNT(*) as count FROM prices').get().count;
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const rate = (totalProcessed / elapsedSeconds * 60).toFixed(1); // productos/minuto
      
      console.log(`\n📊 PROGRESO: ${totalProcessed}/${uniqueUrlBases.length} (${((totalProcessed/uniqueUrlBases.length)*100).toFixed(1)}%)`);
      console.log(`💰 Total precios en DB: ${currentPrices.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
      console.log(`⚡ Velocidad: ${rate} productos/min\n`);
    }
    
    console.log(`  ✓ Batch ${Math.floor(i / PARALLEL_REQUESTS) + 1}/${Math.ceil(uniqueUrlBases.length / PARALLEL_REQUESTS)} completado`);
  }
	
  console.log('\n=== Resumen ===');
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const totalVariants = db.prepare('SELECT COUNT(*) as count FROM variants').get().count;
  const totalPrices = db.prepare('SELECT COUNT(*) as count FROM prices').get().count;
  console.log(`Productos guardados: ${totalProducts}`);
  console.log(`Variantes guardadas: ${totalVariants}`);
  console.log(`Precios guardados: ${totalPrices}`);
	
  db.close();
  console.log('\n✓ Scraping completo. Revisa prices.db');
}

if (require.main === module) {
  main();
}

// Exportar funciones para testing
module.exports = {
  initDatabase
};
