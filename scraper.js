// Scraper para productos y variantes unimart.com
// Guarda resultados en prices.db con estructura normalizada (products, variants, prices)

const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const Database = require('better-sqlite3');
const path = require('path');

// Sistema de logging simple
const log = {
  debug: (msg) => { if (process.argv.includes('--debug')) console.log(msg); },
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg)
};

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

// Configuración de segmentación para procesamiento paralelo
const SEGMENTS = (() => {
  const segmentsArg = process.argv.find(arg => arg.startsWith('--segments='));
  return segmentsArg ? parseInt(segmentsArg.split('=')[1]) : 1;
})();

const SEGMENT = (() => {
  const segmentArg = process.argv.find(arg => arg.startsWith('--segment='));
  return segmentArg ? parseInt(segmentArg.split('=')[1]) : 1;
})();

// Validar parámetros de segmentación
if (SEGMENTS < 1 || SEGMENT < 1 || SEGMENT > SEGMENTS) {
  log.error('Parámetros de segmentación inválidos:');
  log.error(`   --segments=${SEGMENTS} debe ser >= 1`);
  log.error(`   --segment=${SEGMENT} debe estar entre 1 y ${SEGMENTS}`);
  process.exit(1);
}

// Determinar archivo de base de datos según el segmento
const DB_PATH = SEGMENTS === 1 
  ? path.join(__dirname, 'prices.db')
  : path.join(__dirname, `prices-${SEGMENT}.db`);
const SITEMAP_INDEX_URL = 'https://www.unimart.com/sitemap.xml';

// ⚡ OPTIMIZACIÓN DE VELOCIDAD:
const PARALLEL_REQUESTS = 30; // Productos en paralelo por batch
const SITEMAP_PARALLEL_REQUESTS = 15; // Sitemaps en paralelo

// 🛡️ PROTECCIÓN CONTRA RATE LIMITING:
const TIMEOUT_COOLDOWN_MS = 60000; // 60 segundos de pausa tras timeout
let lastTimeoutTime = 0; // Timestamp del último timeout detectado

async function waitForCooldown() {
  const timeSinceLastTimeout = Date.now() - lastTimeoutTime;
  if (timeSinceLastTimeout < TIMEOUT_COOLDOWN_MS) {
    const remainingWait = TIMEOUT_COOLDOWN_MS - timeSinceLastTimeout;
    log.warn(`Esperando ${Math.ceil(remainingWait/1000)}s para evitar rate limiting...`);
    await new Promise(resolve => setTimeout(resolve, remainingWait));
  }
}

// 🔄 MODO DE OPERACIÓN:
// --mode=daily: Scrapea solo productos existentes en DB (rápido, actualiza precios)
// --mode=weekly: Scrapea sitemap completo (descubre nuevos productos + variantes)
// --mode=test: Scrapea solo primeros sitemaps para pruebas rápidas
const SCRAPE_MODE = (() => {
  if (process.argv.includes('--mode=daily')) return 'daily';
  if (process.argv.includes('--mode=weekly')) return 'weekly';
  if (process.argv.includes('--mode=test')) return 'test';
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
			shopify_gid TEXT,
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
  
  // Agregar columnas status y last_check si no existen (para bases de datos migradas)	// Agregar columna shopify_gid si no existe
	try {
		db.exec('ALTER TABLE variants ADD COLUMN shopify_gid TEXT');
	} catch (e) {
		// Columna ya existe, ignorar error
	}
	
	// Agregar columna stock si no existe
	try {
		db.exec('ALTER TABLE variants ADD COLUMN stock INTEGER');
	} catch (e) {
		// Columna ya existe, ignorar error
	}  try {
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

// 🚀 OPTIMIZACIÓN: Extraer TODAS las variantes de una sola llamada HTTP
// Usando la misma lógica exitosa del battle test
function extractVariantsFromHTML(html) {
  const variants = [];
  
  try {
    // 🚀 USAR MÉTODO REGEX COMO EN BATTLE TEST - MÁS ROBUSTO
    // Patrón mejorado para capturar también el contexto del producto
    const extendedPattern = /"firstSelectableVariant":\s*(\{(?:[^{}]|\{[^{}]*\})*\})/g;
    let match;
    
    // Buscar todas las variantes con firstSelectableVariant
    while ((match = extendedPattern.exec(html)) !== null) {
      try {
        const variant = JSON.parse(match[1]);
        
        if (variant.sku) {
          const extractedVariant = {
            name: variant.title === "Default Title" 
              ? (variant.product?.title || 'Variante')
              : variant.title, // ✅ USAR título del producto si variant.title es "Default Title"
            sku: variant.sku,
            price: variant.price?.amount ? parseFloat(variant.price.amount) : null,
            comparePrice: variant.compareAtPrice?.amount ? parseFloat(variant.compareAtPrice.amount) : null,
            available: variant.availableForSale ?? true,
            stock: variant.quantityAvailable || null,
            gid: variant.id?.toString() || null, // ✨ CAPTURAR GID DE SHOPIFY
            label: 'Color' // Usar label por defecto como en battle test
          };
          
          variants.push(extractedVariant);
        }
      } catch (e) {
        // Ignorar errores de parsing individual
      }
    }
    
    // Eliminar duplicados por SKU como en battle test
    return variants.filter((variant, index, self) => 
      index === self.findIndex(v => v.sku === variant.sku)
    );

  } catch (error) {
    return [];
  }
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
    log.error('Error fetching sitemap index:', e.message);
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
    log.error('Error fetching sitemap:', sitemapUrl, e.message);
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
    // 🛡️ DETECTAR TIMEOUT EN EXTRACCIÓN DE SKU
    if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
      lastTimeoutTime = Date.now();
      log.warn(`TIMEOUT en extracción de SKU de ${pageUrl}`);
    }
    log.error(`Error extracting SKU from ${pageUrl}:`, e.message);
    return null;
  }
}

// 🚀 OPTIMIZADO: Detecta variantes usando extracción de UNA sola llamada
async function detectVariants(url) {
  try {
    const res = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    const html = res.data;
		
    // 🚀 NUEVA OPTIMIZACIÓN: Extraer variantes del JSON embebido
    const embeddedVariants = extractVariantsFromHTML(html);
    if (embeddedVariants.length > 0) {
      log.info(`  🚀 Extraídas ${embeddedVariants.length} variantes de datos embebidos`);
      return { 
        label: embeddedVariants[0].label || 'Color',
        variants: embeddedVariants.map(v => ({
          title: v.name,
          price: v.price,
          sku: v.sku,
          available: v.available,
          stock: v.stock,
          gid: v.gid
        }))
      };
    }
    
    // 💡 FALLBACK: Usar método anterior si no hay datos embebidos
    log.info(`  💡 Fallback a detección HTML tradicional`);
    
    // Buscar la clase .product-options
    const productOptions = $('.product-options');
    if (productOptions.length === 0) {
      return null;
    }
		
    // Extraer el label de variante del HTML visible
    let variantLabel = null;
    const labelSpan = productOptions.find('span.font-normal');
    if (labelSpan.length > 0) {
      variantLabel = labelSpan.text().trim();
    }
    
    // Extraer variantes del HTML
    const variants = [];
    const variantButtons = productOptions.find('button');
    
    variantButtons.each((i, el) => {
      const $button = $(el);
      const variantValue = $button.find('p').text().trim();
      
      if (variantValue && variantValue.length > 0 && !variantValue.match(/Guía|talla/i)) {
        variants.push({
          title: variantValue,
          label: variantLabel
        });
      }
    });
		
    if (variants.length === 0) return null;
    return { label: variantLabel, variants };
  } catch (e) {
    // 🛡️ DETECTAR TIMEOUT EN DETECCIÓN DE VARIANTES
    if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
      lastTimeoutTime = Date.now();
      log.warn(`TIMEOUT en detección de variantes de ${url}`);
    }
    log.error('Error fetching product:', url, e.message);
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
            log.debug(`    💰 Precio: ₡${price.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
            return price;
          }
        }
      }
    }
    
    log.warn(`No se encontró precio con selectores: ${priceSelectors.join(', ')}`);
    return null;
  } catch (e) {
    // 🛡️ DETECTAR TIMEOUT Y ACTIVAR COOLDOWN
    if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
      lastTimeoutTime = Date.now();
      console.log(`    🛡️ TIMEOUT detectado - activando cooldown de 60s`);
    }
    log.error(`Error scrapeando precio: ${e.message}`);
    return null;
  }
}

async function scrapeAndSave(db, url) {
  // 🛡️ Verificar si necesitamos esperar por cooldown
  await waitForCooldown();
  
  // Guarda el producto base
  let title = url.split('/').pop().replace(/-/g, ' ');
  let status404 = false;
  
  try {
    const res = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    title = $('h1').first().text().trim() || title;
  } catch (e) {
    // 🛡️ DETECTAR TIMEOUT EN REQUEST PRINCIPAL
    if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
      lastTimeoutTime = Date.now();
      console.log(`  🛡️ TIMEOUT detectado en ${url} - activando cooldown`);
    }
    
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
      log.warn('No se pudo insertar producto');
      return;
    }

    // Detecta variantes
    const detected = await detectVariants(url);
    if (detected && detected.variants.length > 0) {
      log.info(`  → ${detected.variants.length} variantes (${detected.label})`);
      
      // 🚀 NUEVO: Procesar variantes optimizado (con o sin datos embebidos)
      const variantPromises = detected.variants.map(async (v, index) => {
        log.debug(`\n    🔍 PROCESANDO VARIANTE ${index + 1}/${detected.variants.length}:`);
        log.debug(`       🏷️  Título: "${v.title}"`);
        log.debug(`       📋 SKU: "${v.sku || 'N/A'}"`);
        log.debug(`       💰 Precio embebido: ${v.price || 'N/A'}`);
        log.debug(`       🆔 GID: "${v.gid || 'N/A'}"`);
        
        let variantUrl = url;
        let variantPrice = v.price; // Precio desde datos embebidos (si existe)
        let skuFromVariant = v.sku; // SKU desde datos embebidos (si existe)
        
        // Si NO tenemos precio embebido, usar método anterior (request HTTP)
        if (!variantPrice) {
          if (detected.label && v.title) {
            const param = encodeURIComponent(detected.label) + '=' + encodeURIComponent(v.title);
            variantUrl = url + (url.includes('?') ? '&' : '?') + param;
            log.debug(`       🔗 URL construida: ${variantUrl}`);
          } else {
            log.debug(`       🔗 URL base (sin parámetros): ${variantUrl}`);
          }
          
          // Solo hacer requests adicionales si NO tenemos datos embebidos
          const [skuFromHTML, scrapedPrice] = await Promise.all([
            skuFromVariant ? Promise.resolve(skuFromVariant) : extractSKUFromHTML(variantUrl),
            scrapeSimpleProduct(variantUrl)
          ]);
          
          skuFromVariant = skuFromVariant || skuFromHTML;
          variantPrice = scrapedPrice;
          log.debug(`    🔄 Request adicional para ${v.title}`);
        } else {
          log.info(`    🚀 Usando datos embebidos para ${v.title}`);
        }
        
        // Buscar si la variante ya existe (por URL o por product_id + variant_label + variant_value)
        log.debug(`       🔍 Verificando existencia...`);
        log.debug(`          📊 product_id: ${product.id}`);
        log.debug(`          🏷️  label: "${detected.label}"`);
        log.debug(`          📝 value: "${v.title}"`);
        log.debug(`          🔗 url: "${variantUrl}"`);
        
        const exists = db.prepare(`
          SELECT id, sku FROM variants 
          WHERE url = ? OR (product_id = ? AND variant_label = ? AND variant_value = ?)
        `).get(variantUrl, product.id, detected.label, v.title);
        
        if (exists) {
          log.debug(`       ✅ ENCONTRADA variante existente (ID: ${exists.id}, SKU: ${exists.sku || 'NULL'})`);
        } else {
          log.debug(`       🆕 NUEVA variante - será insertada`);
        }
        
        if (!exists) {
          // INSERT: Nueva variante
          log.debug(`       ➕ INSERTANDO nueva variante...`);
          log.debug(`          📊 product_id: ${product.id}`);
          log.debug(`          🔗 url: "${variantUrl}"`);
          log.debug(`          📋 sku: "${skuFromVariant || 'NULL'}"`);
          log.debug(`          🏷️  label: "${detected.label}"`);
          log.debug(`          📝 value: "${v.title}"`);
          log.debug(`          🆔 gid: "${v.gid || 'NULL'}"`);
          
          const insertVariant = db.prepare(`
					INSERT INTO variants (product_id, url, sku, variant_label, variant_value, shopify_gid, stock)
					VALUES (?, ?, ?, ?, ?, ?, ?)
				`);
          
          try {
            const result = insertVariant.run(product.id, variantUrl, skuFromVariant, detected.label, v.title, v.gid, v.stock || null);
            log.debug(`       ✅ INSERTADA con ID: ${result.lastInsertRowid}`);
          } catch (insertError) {
            log.error(`ERROR EN INSERCIÓN: ${insertError.message}`);
            return { success: false, variant: v.title, reason: 'insert_error', error: insertError.message };
          }
        } else {
          // UPDATE: Actualizar SKU si está NULL
          if (exists.sku === null && skuFromVariant) {
            log.debug(`       ✏️  ACTUALIZANDO SKU: NULL → "${skuFromVariant}"`);
            const updateSku = db.prepare('UPDATE variants SET sku = ? WHERE id = ?');
            updateSku.run(skuFromVariant, exists.id);
            log.debug(`       ✅ SKU actualizado exitosamente`);
          }
          // UPDATE: Actualizar stock siempre
          const updateStock = db.prepare('UPDATE variants SET stock = ? WHERE id = ?');
          updateStock.run(typeof v.stock !== 'undefined' ? v.stock : null, exists.id);
          log.debug(`       ✅ Stock actualizado a: ${v.stock}`);
        }
        
        // ✅ Guardar precio
        log.debug(`\n       💰 PROCESANDO PRECIO...`);
        const variant = db.prepare(`
          SELECT id FROM variants 
          WHERE url = ? OR (product_id = ? AND variant_label = ? AND variant_value = ?)
        `).get(variantUrl, product.id, detected.label, v.title);
        
        if (variant) {
          log.debug(`       🎯 Variante encontrada para precio (ID: ${variant.id})`);
          
          if (variantPrice && variantPrice > 0) {
            log.debug(`       💵 Insertando precio: ₡${variantPrice} CRC`);
            const insertPrice = db.prepare(`
						INSERT INTO prices (variant_id, price, currency)
						VALUES (?, ?, ?)
					`);
            
            try {
              const priceResult = insertPrice.run(variant.id, variantPrice, 'CRC');
              log.debug(`       ✅ PRECIO GUARDADO (ID: ${priceResult.lastInsertRowid})`);
              
              // Mostrar precio con información adicional
              const priceDisplay = `₡${variantPrice.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
              const stockInfo = v.stock ? ` (Stock: ${v.stock})` : '';
              const availability = v.available === false ? ' [AGOTADO]' : '';
              log.info(`    💰 ${v.title}: ${priceDisplay}${stockInfo}${availability}`);
              return { success: true, variant: v.title, price: priceDisplay };
            } catch (priceError) {
              log.error(`ERROR guardando precio: ${priceError.message}`);
              return { success: false, variant: v.title, reason: 'price_error', error: priceError.message };
            }
          } else {
            log.warn(`Sin precio válido para ${v.title}: ${variantPrice}`);
            return { success: false, variant: v.title, reason: 'no_valid_price' };
          }
        } else {
          log.error(`No se encontró variante para guardar precio: ${v.title}`);
          return { success: false, variant: v.title, reason: 'variant_not_found' };
        }
        
        return { success: false, variant: v.title, reason: 'no_variant_found' };
      });
      
      // Esperar a que todas las variantes se procesen
      await Promise.all(variantPromises);
    } else {
      // Intentar como producto simple
      const simplePrice = await scrapeSimpleProduct(url);
      if (simplePrice && simplePrice > 0) {
        // Crear variante base si no existe
        let baseVariant = db.prepare('SELECT id FROM variants WHERE product_id = ? AND variant_label IS NULL').get(product.id);
        
        if (!baseVariant) {
          const skuFromHTML = await extractSKUFromHTML(url);
          const insertVariant = db.prepare(`
            INSERT INTO variants (product_id, url, sku, variant_label, variant_value, shopify_gid, stock)
            VALUES (?, ?, ?, NULL, NULL, NULL, NULL)
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
        
        log.info(`  💰 Producto simple: ₡${simplePrice.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
      } else {
        console.log('  ❌ Sin precios encontrados');
      }
    }
  } catch (e) {
    console.log(`  ⚠ Error procesando producto: ${e.message}`);
  }
}

async function main() {
  // En modo daily con segmentación, necesitamos leer productos de la BD principal
  let sourceDb = null;
  if (SCRAPE_MODE === 'daily' && SEGMENTS > 1) {
    const mainDbPath = path.join(__dirname, 'prices.db');
    if (require('fs').existsSync(mainDbPath)) {
      sourceDb = new Database(mainDbPath, { readonly: true });
    }
  }
  
  const db = initDatabase();
  log.info('Base de datos inicializada:', DB_PATH);
  if (sourceDb) {
    log.info('Base de datos fuente (lectura):', path.join(__dirname, 'prices.db'));
  }
  log.info('='.repeat(70));
  console.log(`🔄 MODO: ${SCRAPE_MODE}`);
  if (SEGMENTS > 1) {
    console.log(`🧩 SEGMENTACIÓN: ${SEGMENT}/${SEGMENTS}`);
  }
  console.log('='.repeat(70));
  
  let uniqueUrlBases = [];
  
  if (SCRAPE_MODE === 'daily') {
    // 📅 MODO DAILY: Solo actualizar precios de productos activos (sin 404s)
    log.info('📅 Modo Daily: Actualizando precios de productos activos\n');
    
    // Usar BD fuente si existe, si no usar la BD actual
    const queryDb = sourceDb || db;
    const products = queryDb.prepare('SELECT url_base FROM products WHERE status != \'404\' OR status IS NULL').all();
    uniqueUrlBases = products.map(p => p.url_base);
    
    log.info(`✓ ${uniqueUrlBases.length} productos activos en base de datos\n`);
    
    // Cerrar BD fuente si se usó
    if (sourceDb) {
      sourceDb.close();
    }
    
  } else {
    // 📆 MODO WEEKLY/TEST: Descubrir nuevos productos del sitemap
    const modeLabel = SCRAPE_MODE === 'test' ? 'Test (limitado)' : 'Weekly';
    log.info(`📆 Modo ${modeLabel}: Descubriendo productos del sitemap\n`);
    
    // Descubre TODOS los sitemaps de productos
    let productSitemaps = await fetchProductSitemaps();
    console.log(`Encontrados ${productSitemaps.length} sitemaps de productos`);
    
    // 🧪 En modo test, solo usar primeros 5 sitemaps para pruebas rápidas
    if (SCRAPE_MODE === 'test') {
      productSitemaps = productSitemaps.slice(0, 5);
      console.log(`🧪 Modo TEST: Limitando a ${productSitemaps.length} sitemaps para pruebas rápidas`);
    }
    
    // ⚡ Procesar sitemaps EN PARALELO (15 simultáneos)
    let urls = [];
    for (let i = 0; i < productSitemaps.length; i += SITEMAP_PARALLEL_REQUESTS) {
      const batch = productSitemaps.slice(i, i + SITEMAP_PARALLEL_REQUESTS);
      const batchNum = Math.floor(i / SITEMAP_PARALLEL_REQUESTS) + 1;
      const totalBatches = Math.ceil(productSitemaps.length / SITEMAP_PARALLEL_REQUESTS);
      console.log(`Procesando batch ${batchNum}/${totalBatches} (${batch.length} sitemaps)...`);
      
      const batchPromises = batch.map(async (sitemapUrl) => {
        const u = await fetchSitemapUrls(sitemapUrl);
        return u;
      });
      
      const results = await Promise.all(batchPromises);
      const batchUrls = results.flat();
      urls = urls.concat(batchUrls);
      
      // Mostrar progreso cada 10 batches
      if (batchNum % 10 === 0 || batchNum === totalBatches) {
        console.log(`   📊 URLs acumuladas: ${urls.length.toLocaleString()}`);
      }
    }
    
    // Elimina duplicados
    urls = [...new Set(urls)];
    
    // ⚡ OPTIMIZACIÓN: Normalizar URLs (quitar parámetros) para evitar duplicados
    // Ejemplo: /products/audifonos?Color=Rosa → /products/audifonos
    const urlBases = urls.map(url => url.split('?')[0]);
    uniqueUrlBases = [...new Set(urlBases)];
    
    console.log(`\n✓ ${urls.length} URLs en sitemap → ${uniqueUrlBases.length} productos únicos\n`);
  }

  // 🧩 Dividir productos por segmentos si es necesario
  if (SEGMENTS > 1) {
    const segmentSize = Math.ceil(uniqueUrlBases.length / SEGMENTS);
    const startIndex = (SEGMENT - 1) * segmentSize;
    const endIndex = Math.min(startIndex + segmentSize, uniqueUrlBases.length);
    
    console.log(`🧩 Procesando segmento ${SEGMENT}/${SEGMENTS}:`);
    console.log(`   Productos ${startIndex + 1}-${endIndex} de ${uniqueUrlBases.length} totales\n`);
    
    uniqueUrlBases = uniqueUrlBases.slice(startIndex, endIndex);
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
