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
const MAX_PRODUCTS_PER_RUN = 50; // Maximum products to scrape per run (processes incrementally)
const REQUEST_DELAY_MS = 1000; // Delay between requests in milliseconds
const SITEMAP_DELAY_MS = 500; // Delay between sitemap fetches
const MAX_SITEMAPS_PER_RUN = 100; // Maximum sitemaps to fetch per run (for incremental processing)

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

    CREATE TABLE IF NOT EXISTS scraping_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sitemap_index INTEGER DEFAULT 0,
      total_sitemaps INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
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
// ✅ Productos pueden aparecer en múltiples sitemaps (se deduplican por URL)
// ✅ Procesamiento incremental: procesa sitemaps en lotes para completar en tiempo razonable
//
// SI UNIMART CAMBIA:
// - Estructura del sitemap index -> Ajusta esta función
// - URL de product sitemaps -> Ajusta el filtro de '/products/'
// - Formato XML -> Ajusta parser
async function fetchSitemap(db) {
  try {
    console.log('Fetching sitemap index from:', SITEMAP_URL);
    const response = await axios.get(SITEMAP_URL, { timeout: 10000 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    // Use a Set to deduplicate URLs (products can appear in multiple sitemaps)
    const urlSet = new Set();
    
    // Check if this is a sitemap index (contains references to other sitemaps)
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      console.log('Found sitemap index with', result.sitemapindex.sitemap.length, 'sitemaps');
      
      // Filter for product sitemaps only
      const productSitemaps = result.sitemapindex.sitemap.filter(s => 
        s.loc && s.loc[0] && s.loc[0].includes('/products/')
      );
      
      console.log(`Found ${productSitemaps.length} product sitemaps`);
      
      // Get scraping state to resume from where we left off
      const getState = db.prepare('SELECT last_sitemap_index, total_sitemaps FROM scraping_state WHERE id = 1');
      let state = getState.get();
      
      if (!state) {
        // Initialize state
        db.prepare('INSERT INTO scraping_state (id, last_sitemap_index, total_sitemaps) VALUES (1, 0, ?)').run(productSitemaps.length);
        state = { last_sitemap_index: 0, total_sitemaps: productSitemaps.length };
      } else if (state.total_sitemaps !== productSitemaps.length) {
        // Total sitemaps changed, reset
        db.prepare('UPDATE scraping_state SET total_sitemaps = ?, last_sitemap_index = 0 WHERE id = 1').run(productSitemaps.length);
        state.total_sitemaps = productSitemaps.length;
        state.last_sitemap_index = 0;
      }
      
      const startIndex = state.last_sitemap_index;
      const endIndex = Math.min(startIndex + MAX_SITEMAPS_PER_RUN, productSitemaps.length);
      
      console.log(`Processing sitemaps ${startIndex + 1} to ${endIndex} of ${productSitemaps.length}`);
      console.log(`Fetching ${endIndex - startIndex} product sitemaps...`);
      
      // Fetch product sitemaps in this batch
      for (let i = startIndex; i < endIndex; i++) {
        const sitemapUrl = productSitemaps[i].loc[0];
        
        try {
          if ((i - startIndex) > 0 && (i - startIndex) % 20 === 0) {
            console.log(`Batch progress: ${i - startIndex}/${endIndex - startIndex} sitemaps processed...`);
          }
          
          const sitemapResponse = await axios.get(sitemapUrl, { timeout: 10000 });
          const sitemapResult = await parser.parseStringPromise(sitemapResponse.data);
          
          if (sitemapResult.urlset && sitemapResult.urlset.url) {
            for (const entry of sitemapResult.urlset.url) {
              if (entry.loc && entry.loc[0]) {
                urlSet.add(entry.loc[0]); // Set automatically deduplicates
              }
            }
          }
          
          // Be nice to the server - delay between sitemap fetches
          if (i < endIndex - 1) {
            await new Promise(resolve => setTimeout(resolve, SITEMAP_DELAY_MS));
          }
        } catch (error) {
          console.error(`Error fetching sitemap ${sitemapUrl}:`, error.message);
          // Continue with other sitemaps
        }
      }
      
      // Update state for next run
      const nextIndex = endIndex >= productSitemaps.length ? 0 : endIndex; // Reset to 0 if we reached the end
      db.prepare('UPDATE scraping_state SET last_sitemap_index = ?, last_updated = datetime(\'now\') WHERE id = 1').run(nextIndex);
      
      if (nextIndex === 0) {
        console.log(`✅ Completed full cycle of all ${productSitemaps.length} sitemaps. Starting over on next run.`);
      } else {
        console.log(`Next run will start from sitemap ${nextIndex + 1}/${productSitemaps.length}`);
      }
      
      console.log(`Fetched ${endIndex - startIndex} sitemaps. Found ${urlSet.size} unique product URLs in this batch.`);
    } 
    // Direct urlset (fallback si no es sitemap index)
    else if (result.urlset && result.urlset.url) {
      for (const entry of result.urlset.url) {
        if (entry.loc && entry.loc[0]) {
          urlSet.add(entry.loc[0]);
        }
      }
    }
    
    // Convert Set to Array
    const urls = Array.from(urlSet);
    console.log(`Total unique product URLs to process: ${urls.length}`);
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
  console.log('='.repeat(70));
  
  const db = initDatabase();
  console.log('Database initialized');
  
  const urls = await fetchSitemap(db);
  
  if (urls.length === 0) {
    console.log('No URLs found in this batch. Exiting.');
    db.close();
    return;
  }
  
  // Filter for product URLs (unimart.com uses /products/ pattern)
  const productUrls = urls.filter(url => 
    url.includes('/products/')
  );
  
  console.log(`Found ${productUrls.length} unique product URLs in this batch`);
  
  // Get already scraped URLs from database to prioritize unscraped products
  const scrapedUrls = new Map(); // Map of URL -> last_scraped date
  const getScrapedUrls = db.prepare('SELECT url, last_scraped FROM products');
  const scrapedProducts = getScrapedUrls.all();
  
  for (const product of scrapedProducts) {
    scrapedUrls.set(product.url, product.last_scraped);
  }
  
  console.log(`Total products in database: ${scrapedUrls.size}`);
  
  // Prioritize: first unscraped products, then oldest scraped ones
  const unscrapedUrls = productUrls.filter(url => !scrapedUrls.has(url));
  const alreadyScrapedUrls = productUrls.filter(url => scrapedUrls.has(url));
  
  console.log(`New products in this batch: ${unscrapedUrls.length}`);
  console.log(`Previously tracked products in this batch: ${alreadyScrapedUrls.length}`);
  
  // Combine: prioritize new products, then update old ones
  const urlsToScrape = [...unscrapedUrls, ...alreadyScrapedUrls];
  
  // Scrape products (limit per run to be respectful to the server)
  const limit = Math.min(urlsToScrape.length, MAX_PRODUCTS_PER_RUN);
  console.log(`\nProcessing ${limit} products in this run...`);
  console.log('='.repeat(70));
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < limit; i++) {
    const url = urlsToScrape[i];
    const productData = await scrapeProduct(url);
    
    if (productData) {
      saveProductPrice(db, productData);
      successCount++;
    } else {
      errorCount++;
    }
    
    // Progress update every 10 products
    if ((i + 1) % 10 === 0) {
      console.log(`Progress: ${i + 1}/${limit} products processed (${successCount} successful, ${errorCount} errors)`);
    }
    
    // Be nice to the server - add delay between requests
    if (i < limit - 1) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }
  
  // Get final statistics
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const totalPrices = db.prepare('SELECT COUNT(*) as count FROM prices').get().count;
  
  console.log('\n' + '='.repeat(70));
  console.log('SCRAPING SUMMARY');
  console.log('='.repeat(70));
  console.log(`Products processed this run: ${limit} (${successCount} successful, ${errorCount} errors)`);
  console.log(`Total products in database: ${totalProducts}`);
  console.log(`Total price records: ${totalPrices}`);
  console.log(`Remaining products in this batch: ${Math.max(0, urlsToScrape.length - limit)}`);
  console.log('='.repeat(70));
  
  db.close();
  console.log('\n✅ Scraping complete!');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { initDatabase, fetchSitemap, scrapeProduct, saveProductPrice };
