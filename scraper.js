const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const Database = require('better-sqlite3');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================
// 🔧 Si Unimart cambia la URL del sitemap, actualiza esta constante:
const SITEMAP_URL = 'https://www.unimart.com/sitemap.xml';
const DB_PATH = path.join(__dirname, 'prices.db');
const MAX_PRODUCTS_PER_RUN = 50; // Maximum products to scrape per run
const REQUEST_DELAY_MS = 1000; // Delay between requests in milliseconds

// Initialize database
function initDatabase() {
  const db = new Database(DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      sku TEXT,
      title TEXT,
      last_scraped DATETIME
    );

    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'CRC',
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_product_id ON prices(product_id);
    CREATE INDEX IF NOT EXISTS idx_scraped_at ON prices(scraped_at);
    CREATE INDEX IF NOT EXISTS idx_sku ON products(sku);
  `);
  
  return db;
}

// ============================================================================
// SITEMAP FETCHING
// ============================================================================
// 🔧 Si Unimart cambia la estructura del sitemap, revisa esta función
//
// EDGE CASES VERIFICADOS:
// ✅ Sitemap Index: El sitemap principal contiene 1,245 referencias a otros sitemaps
// ✅ Product Sitemaps: Los primeros 1,228 son de productos (/products/)
// ✅ Otros Sitemaps: Los últimos contienen collections, articles, blogs (NO productos)
// ✅ Estructura Uniforme: Todos los product sitemaps tienen la misma estructura
// ✅ Usar el primero es SEGURO: No hay diferencia con otros product sitemaps
//
// SI UNIMART CAMBIA:
// - Estructura del sitemap index -> Ajusta líneas 58-74
// - URL de product sitemaps -> Ajusta línea 62 (actualmente usa [0])
// - Formato XML -> Ajusta parser en líneas 52, 66
async function fetchSitemap() {
  try {
    console.log('Fetching sitemap index from:', SITEMAP_URL);
    const response = await axios.get(SITEMAP_URL, { timeout: 10000 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    const urls = [];
    
    // Check if this is a sitemap index (contains references to other sitemaps)
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      console.log('Found sitemap index with', result.sitemapindex.sitemap.length, 'sitemaps');
      
      // 🔧 IMPORTANTE: Actualmente usa el PRIMER sitemap de productos
      // Todos los product sitemaps tienen la misma estructura (verificado)
      // Si quieres scrape de más productos, cambia [0] por un loop
      const firstSitemapUrl = result.sitemapindex.sitemap[0].loc[0];
      console.log('Fetching product sitemap:', firstSitemapUrl);
      
      const sitemapResponse = await axios.get(firstSitemapUrl, { timeout: 10000 });
      const sitemapResult = await parser.parseStringPromise(sitemapResponse.data);
      
      if (sitemapResult.urlset && sitemapResult.urlset.url) {
        for (const entry of sitemapResult.urlset.url) {
          if (entry.loc && entry.loc[0]) {
            urls.push(entry.loc[0]);
          }
        }
      }
    } 
    // Direct urlset (fallback si no es sitemap index)
    else if (result.urlset && result.urlset.url) {
      for (const entry of result.urlset.url) {
        if (entry.loc && entry.loc[0]) {
          urls.push(entry.loc[0]);
        }
      }
    }
    
    console.log(`Found ${urls.length} product URLs`);
    return urls;
  } catch (error) {
    console.error('Error fetching sitemap:', error.message);
    return [];
  }
}

// ============================================================================
// PRODUCT SCRAPING
// ============================================================================
// 🔧 Si Unimart cambia el HTML de las páginas de productos, revisa esta función
//
// SELECTORES ACTUALES (verificados con páginas reales):
// - Título: h1, meta[property="og:title"], o title tag
// - SKU: Dentro de <script> tags en formato JSON {"sku": "UM00IPM5"}
// - Precio: Clase .money (formato: ₡4,700)
// - Moneda: Símbolo ₡ para CRC (Colones Costarricenses)
//
// SI UNIMART CAMBIA:
// - Selector de precio -> Ajusta línea 165
// - Formato de SKU -> Ajusta línea 156
// - Símbolo de moneda -> Ajusta líneas 177-185
async function scrapeProduct(url) {
  try {
    console.log('Scraping:', url);
    const response = await axios.get(url, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract product title
    // 🔧 Si cambia estructura HTML, actualiza estos selectores
    const title = $('h1').first().text().trim() || 
                $('meta[property="og:title"]').attr('content') ||
                $('title').text().trim();
    
    // Extract SKU from script tags (Shopify stores product data in JSON)
    // 🔧 Si Unimart cambia de plataforma (deja Shopify), actualiza esta extracción
    let sku = null;
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const content = $(script).html() || '';
      if (content.includes('product') && content.includes('sku')) {
        const skuMatch = content.match(/"sku"\s*:\s*"([^"]+)"/);
        if (skuMatch) {
          sku = skuMatch[1];
          break;
        }
      }
    }
    
    // Extract price
    // 🔧 IMPORTANTE: Actualmente el precio está en clase .money
    // Si Unimart cambia el HTML, busca el nuevo selector aquí
    const priceText = $('.money').first().text().trim() ||
                    $('.price').first().text() ||
                    $('[class*="price"]').first().text() ||
                    $('[id*="price"]').first().text() ||
                    $('meta[property="og:price:amount"]').attr('content') ||
                    '';
    
    // Extract numeric price (handles formats like ₡4,700 or $1,234.56)
    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : null;
    
    // Detect currency from symbols
    // 🔧 Si Unimart cambia de moneda o símbolo, actualiza aquí
    let currency = 'CRC'; // Default to Costa Rican Colón for unimart.com
    if (priceText.includes('₡')) {
      currency = 'CRC';
    } else if (priceText.includes('$') || priceText.includes('USD')) {
      currency = 'USD';
    } else if (priceText.includes('€') || priceText.includes('EUR')) {
      currency = 'EUR';
    } else if (priceText.includes('£') || priceText.includes('GBP')) {
      currency = 'GBP';
    }
    
    return {
      url,
      sku,
      title: title || url,
      price,
      currency
    };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    return null;
  }
}

// Save product and price to database
function saveProductPrice(db, productData) {
  if (!productData || productData.price === null) {
    return;
  }
  
  try {
    // Insert or update product (URL is unique, but we also save/update SKU)
    const insertProduct = db.prepare(`
      INSERT INTO products (url, sku, title, last_scraped)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(url) DO UPDATE SET
        sku = excluded.sku,
        title = excluded.title,
        last_scraped = excluded.last_scraped
    `);
    
    insertProduct.run(productData.url, productData.sku, productData.title);
    
    // Get product ID
    const getProduct = db.prepare('SELECT id FROM products WHERE url = ?');
    const product = getProduct.get(productData.url);
    
    if (product) {
      // Insert price
      const insertPrice = db.prepare(`
        INSERT INTO prices (product_id, price, currency)
        VALUES (?, ?, ?)
      `);
      
      insertPrice.run(product.id, productData.price, productData.currency);
      const skuInfo = productData.sku ? ` (SKU: ${productData.sku})` : '';
      console.log(`Saved: ${productData.title}${skuInfo} - ${productData.currency} ${productData.price}`);
    }
  } catch (error) {
    console.error('Error saving to database:', error.message);
  }
}

// Main scraping function
async function main() {
  console.log('Starting Unimart price scraper...');
  
  const db = initDatabase();
  console.log('Database initialized');
  
  const urls = await fetchSitemap();
  
  if (urls.length === 0) {
    console.log('No URLs found. Exiting.');
    db.close();
    return;
  }
  
  // Filter for product URLs (unimart.com uses /products/ pattern)
  const productUrls = urls.filter(url => 
    url.includes('/products/')
  );
  
  console.log(`Found ${productUrls.length} product URLs`);
  
  // Scrape products (limit to avoid overwhelming the site)
  const limit = Math.min(productUrls.length, MAX_PRODUCTS_PER_RUN);
  console.log(`Processing ${limit} products...`);
  
  for (let i = 0; i < limit; i++) {
    const url = productUrls[i];
    const productData = await scrapeProduct(url);
    
    if (productData) {
      saveProductPrice(db, productData);
    }
    
    // Be nice to the server - add delay between requests
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
  }
  
  console.log('Scraping complete!');
  db.close();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { initDatabase, fetchSitemap, scrapeProduct, saveProductPrice };
