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


async function detectVariants(url) {
  try {
    const res = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
		
    // Método simplificado: buscar la clase .product-options
    const productOptions = $('.product-options');
    if (productOptions.length === 0) {
      // No hay variantes
      return null;
    }
		
    // Extraer el label de variante del HTML
    let variantLabel = null;
    const optionText = productOptions.text();
    const labelMatch = optionText.match(/(Color|Valor|Tamaño)/);
    if (labelMatch) {
      variantLabel = labelMatch[1];
    }
		
    // Ahora extraer las variantes desde el JSON (vra)
    const variants = [];
    $('script').each((i, el) => {
      const content = $(el).html();
      if (!content || !content.includes('vra')) return;
			
      try {
        // Buscar el primer vra array
        const vraIndex = content.indexOf('"vra":');
        if (vraIndex === -1) return;
				
        const arrayStart = content.indexOf('[', vraIndex);
        if (arrayStart === -1) return;
				
        // Contar corchetes para extraer el array completo
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
            if (key === 'Color' || key === 'Valor' || key === 'Tamaño') {
              variant.title = values[0];
              if (!variantLabel) variantLabel = key;
            } else if (key === 'Product-sku') {
              variant.sku = values[0];
            } else if (key === 'Price') {
              const priceStr = values[0].split(':')[1];
              variant.price = parseFloat(priceStr);
            } else if (key === 'Sellable') {
              variant.available = values[0];
            }
          });
          if (variant.title && variant.sku) {
            variants.push(variant);
          }
        });
				
        if (variants.length > 0) return false; // Salir del each
      } catch (e) {
        console.error('Error parseando vra:', e.message);
      }
    });
		
    if (variants.length === 0) return null;
    return { label: variantLabel, variants };
  } catch (e) {
    console.error('Error fetching product:', url, e.message);
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
        // Siempre construye URL de variante con parámetro si hay label y valor
        let variantUrl = url;
        if (detected.label && v.title) {
          const param = encodeURIComponent(detected.label) + '=' + encodeURIComponent(v.title);
          variantUrl = url + (url.includes('?') ? '&' : '?') + param;
        }
        // Si no hay label o valor, igual guarda la variante pero con la URL base
        const exists = db.prepare('SELECT id FROM variants WHERE url = ?').get(variantUrl);
        if (!exists) {
          const insertVariant = db.prepare(`
						INSERT INTO variants (product_id, url, sku, variant_label, variant_value)
						VALUES (?, ?, ?, ?, ?)
					`);
          insertVariant.run(product.id, variantUrl, v.sku, detected.label, v.title);
        }
        
        // ✅ SIEMPRE guardar precio (aunque la variante ya exista) para historial
        const variant = db.prepare('SELECT id FROM variants WHERE url = ?').get(variantUrl);
        if (variant && v.price) {
          const insertPrice = db.prepare(`
						INSERT INTO prices (variant_id, price, currency)
						VALUES (?, ?, ?)
					`);
          insertPrice.run(variant.id, v.price, 'CRC');
        }
      }
    } else {
      console.log('  → Sin variantes');
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
  for (let i = 0; i < uniqueUrlBases.length; i += PARALLEL_REQUESTS) {
    const batch = uniqueUrlBases.slice(i, i + PARALLEL_REQUESTS);
    const batchPromises = batch.map((url, idx) => {
      const globalIdx = i + idx + 1;
      console.log(`[${globalIdx}/${uniqueUrlBases.length}] Scrapeando: ${url}`);
      return scrapeAndSave(db, url);
    });
    await Promise.all(batchPromises);
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
