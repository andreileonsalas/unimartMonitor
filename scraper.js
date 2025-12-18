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

// ⚡ OPTIMIZACIÓN DE VELOCIDAD:
// Puedes ajustar estos valores para balancear velocidad vs. seguridad contra bloqueos
const REQUEST_DELAY_MS = 600; // Delay entre requests de productos (500-1000ms recomendado)
const SITEMAP_DELAY_MS = 250; // Delay entre sitemaps (200-500ms recomendado)
const PARALLEL_REQUESTS = 200; // Número de requests paralelos (product page requests)
const SITEMAP_PARALLEL_REQUESTS = 60; // Número de requests paralelos para descargar sitemaps (cuidado con carga)
const MAX_SITEMAPS_PER_RUN = 0; // Maximum sitemaps to fetch per run (for incremental processing). Set to 0 to process all.

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

    CREATE TABLE IF NOT EXISTS sitemap_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitemap_index_url TEXT UNIQUE NOT NULL,
      etag TEXT,
      last_modified TEXT,
      body_hash TEXT,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_product_id ON prices(product_id);
    CREATE INDEX IF NOT EXISTS idx_scraped_at ON prices(scraped_at);
    CREATE INDEX IF NOT EXISTS idx_sku ON products(sku);
    CREATE TABLE IF NOT EXISTS scraping_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      status_code INTEGER,
      error_message TEXT,
      last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
      attempts INTEGER DEFAULT 0
    );
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
    // First, try a HEAD request to check ETag / Last-Modified
    let headInfo = {};
    try {
      const headResp = await axios.head(SITEMAP_URL, { timeout: 8000 });
      headInfo.etag = headResp.headers['etag'] || null;
      headInfo.lastModified = headResp.headers['last-modified'] || null;
    } catch (e) {
      // HEAD may be unsupported; we'll fall back to GET
      headInfo = {};
    }

    const parser = new xml2js.Parser();

    // Check cache table for this sitemap index
    const getCache = db.prepare('SELECT etag, last_modified, body_hash FROM sitemap_cache WHERE sitemap_index_url = ?');
    const cacheRow = getCache.get(SITEMAP_URL);

    let shouldFetchIndexBody = true;
    if (cacheRow) {
      if (headInfo.etag && cacheRow.etag && headInfo.etag === cacheRow.etag) {
        shouldFetchIndexBody = false;
      } else if (headInfo.lastModified && cacheRow.last_modified && headInfo.lastModified === cacheRow.last_modified) {
        shouldFetchIndexBody = false;
      }
    }

    if (!shouldFetchIndexBody) {
      console.log('Cache HIT: sitemap index appears unchanged (ETag/Last-Modified matched).');
    } else {
      console.log('Cache MISS: sitemap index changed or not cached. Downloading index.');
    }

    let result;
    let responseBody;
    if (!shouldFetchIndexBody) {
      // If headers indicate unchanged, attempt to reuse cached body hash path
      console.log('Sitemap index unchanged (headers). Will prefer cached local sitemaps if network GET fails.');
      // We'll still try to GET the body but if GET fails we'll fall back to cacheRow.body_hash usage
      try {
        const getResp = await axios.get(SITEMAP_URL, { timeout: 10000 });
        responseBody = getResp.data;
        result = await parser.parseStringPromise(responseBody);
      } catch (e) {
        // Could not GET (network), but headers indicated unchanged — we'll try to use cached listing from local files
        responseBody = null;
        result = null;
      }
    } else {
      const getResp = await axios.get(SITEMAP_URL, { timeout: 10000 });
      responseBody = getResp.data;
      result = await parser.parseStringPromise(responseBody);

      // compute a simple body hash to detect changes even if headers absent
      const crypto = require('crypto');
      const bodyHash = crypto.createHash('sha256').update(responseBody).digest('hex');

      // Upsert cache row
      const upsert = db.prepare(`
        INSERT INTO sitemap_cache (sitemap_index_url, etag, last_modified, body_hash, fetched_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(sitemap_index_url) DO UPDATE SET
          etag = excluded.etag,
          last_modified = excluded.last_modified,
          body_hash = excluded.body_hash,
          fetched_at = excluded.fetched_at
      `);
      upsert.run(SITEMAP_URL, headInfo.etag || null, headInfo.lastModified || null, bodyHash);
    }
    
    // Use a Set to deduplicate URLs (products can appear in multiple sitemaps)
    const urlSet = new Set();
    
    // Check if this is a sitemap index (contains references to other sitemaps)
    if (result && result.sitemapindex && result.sitemapindex.sitemap) {
      console.log('Found sitemap index with', result.sitemapindex.sitemap.length, 'sitemaps');
      
      // Filter for product sitemaps only
      let productSitemaps = result.sitemapindex.sitemap.filter(s => 
        s.loc && s.loc[0] && s.loc[0].includes('/products/')
      );

      // If result is null (couldn't GET but headers matched), try to load local sitemaps folder filenames
      if ((!result || productSitemaps.length === 0) && cacheRow) {
        try {
          const fs = require('fs');
          const sitemapDir = path.join(__dirname, 'sitemaps');
          if (fs.existsSync(sitemapDir)) {
            const files = fs.readdirSync(sitemapDir).filter(f => f.endsWith('.xml'));
            productSitemaps = files
              .filter(f => f.includes('products'))
              .map(f => ({ loc: [new URL(f, SITEMAP_URL).toString()] }));
            console.log(`Loaded ${productSitemaps.length} product sitemap entries from local sitemaps folder due to cached index.`);
          }
        } catch (e) {
          console.warn('Could not load local sitemaps folder for cache fallback:', e.message);
        }
      }
      
      console.log(`Found ${productSitemaps.length} product sitemaps`);
      
      // Get scraping state to resume from where we left off
      const getState = db.prepare('SELECT last_sitemap_index, total_sitemaps FROM scraping_state WHERE id = 1');
      let state = getState.get();
      
      if (!state) {
        // Initialize state
        db.prepare('INSERT INTO scraping_state (id, last_sitemap_index, total_sitemaps) VALUES (1, 0, ?)').run(productSitemaps.length);
        state = { last_sitemap_index: 0, total_sitemaps: productSitemaps.length };
      } else if (state.total_sitemaps !== productSitemaps.length) {
        // Total sitemaps changed, reset to start over
        console.log(`⚠️  Sitemap count changed from ${state.total_sitemaps} to ${productSitemaps.length}. Resetting progress to start from beginning.`);
        db.prepare('UPDATE scraping_state SET total_sitemaps = ?, last_sitemap_index = 0 WHERE id = 1').run(productSitemaps.length);
        state.total_sitemaps = productSitemaps.length;
        state.last_sitemap_index = 0;
      }
      
      const startIndex = state.last_sitemap_index;
      // If MAX_SITEMAPS_PER_RUN is 0 => process all sitemaps from startIndex to end
      const requestedLimit = MAX_SITEMAPS_PER_RUN === 0 ? productSitemaps.length : MAX_SITEMAPS_PER_RUN;
      const endIndex = Math.min(startIndex + requestedLimit, productSitemaps.length);
      
      console.log(`Processing sitemaps ${startIndex + 1} to ${endIndex} of ${productSitemaps.length}`);
      console.log(`Fetching ${endIndex - startIndex} product sitemaps... (MAX_SITEMAPS_PER_RUN=${MAX_SITEMAPS_PER_RUN})`);
      
      // We'll fetch product sitemaps in parallel batches to speed up.
      let failedSitemaps = 0;
      const fs = require('fs');
      const sitemapDir = path.join(__dirname, 'sitemaps');

      for (let i = startIndex; i < endIndex; i += SITEMAP_PARALLEL_REQUESTS) {
        const batchEnd = Math.min(i + SITEMAP_PARALLEL_REQUESTS, endIndex);
        const batch = [];

        for (let k = i; k < batchEnd; k++) {
          const sitemapUrl = productSitemaps[k].loc[0];
          const filename = path.basename(new URL(sitemapUrl).pathname);
          const localPath = path.join(sitemapDir, filename);
          const preferLocal = !!cacheRow && !shouldFetchIndexBody;

          batch.push((async () => {
            try {
              console.log(`[${k - startIndex + 1}/${endIndex - startIndex}] Fetching sitemap: ${sitemapUrl}`);

              let sitemapResponseData = null;

              if (preferLocal && fs.existsSync(localPath)) {
                sitemapResponseData = fs.readFileSync(localPath, 'utf8');
                console.log(`Cache HIT - Loaded sitemap from cache file: ${localPath}`);
              } else {
                try {
                  const sitemapResponse = await axios.get(sitemapUrl, { timeout: 10000 });
                  sitemapResponseData = sitemapResponse.data;
                  console.log(`Cache MISS - Fetched sitemap from network: ${sitemapUrl}`);

                  try {
                    if (!fs.existsSync(sitemapDir)) fs.mkdirSync(sitemapDir, { recursive: true });
                    fs.writeFileSync(localPath, sitemapResponseData, 'utf8');
                  } catch (writeErr) {
                    console.warn('Warning: could not write sitemap to local cache:', writeErr.message);
                  }
                } catch (e) {
                  if (fs.existsSync(localPath)) {
                    sitemapResponseData = fs.readFileSync(localPath, 'utf8');
                    console.log(`Cache HIT (fallback) - Loaded sitemap from cache file: ${localPath}`);
                  } else {
                    throw e;
                  }
                }
              }

              const sitemapResult = await parser.parseStringPromise(sitemapResponseData);
              if (sitemapResult && sitemapResult.urlset && sitemapResult.urlset.url) {
                for (const entry of sitemapResult.urlset.url) {
                  if (entry.loc && entry.loc[0]) urlSet.add(entry.loc[0]);
                }
              }

              return { success: true, sitemapUrl };
            } catch (err) {
              console.error(`Error fetching sitemap ${sitemapUrl}:`, err.message);
              return { success: false, sitemapUrl };
            }
          })());
        }

        const batchResults = await Promise.all(batch);
        for (const r of batchResults) if (!r.success) failedSitemaps++;

        // polite delay between batches
        if (i + SITEMAP_PARALLEL_REQUESTS < endIndex) await new Promise(resolve => setTimeout(resolve, SITEMAP_DELAY_MS));
      }

      // If we reached here and there were no failures, update sitemap_cache to reflect the successful fetch cycle
      if (failedSitemaps === 0) {
        try {
          const upsertSuccess = db.prepare(`
            INSERT INTO sitemap_cache (sitemap_index_url, etag, last_modified, body_hash, fetched_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(sitemap_index_url) DO UPDATE SET
              etag = excluded.etag,
              last_modified = excluded.last_modified,
              body_hash = excluded.body_hash,
              fetched_at = excluded.fetched_at
          `);
          // we already computed body hash earlier when doing GET of index; reuse cacheRow values if present
          const etag = headInfo.etag || (cacheRow && cacheRow.etag) || null;
          const lastModified = headInfo.lastModified || (cacheRow && cacheRow.last_modified) || null;
          const bodyHash = (cacheRow && cacheRow.body_hash) || null;
          upsertSuccess.run(SITEMAP_URL, etag, lastModified, bodyHash);
          console.log('Sitemap cache updated atomically after successful sitemap downloads.');
        } catch (e) {
          console.warn('Warning: could not update sitemap_cache atomically:', e.message);
        }
      } else {
        console.log(`⚠️  ${failedSitemaps} sitemap(s) failed to fetch in this cycle; sitemap_cache not updated atomically.`);
      }
      
      if (failedSitemaps > 0) {
        console.log(`⚠️  ${failedSitemaps} sitemap(s) failed to fetch and will be retried in next cycle`);
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
      timeout: 30000,
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
    const status = error.response && error.response.status ? error.response.status : null;
    console.error(`Error scraping ${url}:`, status || error.message);
    return { url, error: true, status, message: error.message };
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
  
  // Scrape all products in this batch
  const limit = urlsToScrape.length;
  console.log(`\nProcessing ${limit} products in this run...`);
  console.log('='.repeat(70));
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process products in parallel batches
  for (let i = 0; i < limit; i += PARALLEL_REQUESTS) {
    const batch = [];
    const batchSize = Math.min(PARALLEL_REQUESTS, limit - i);
    
    // Create parallel requests for this batch
    for (let j = 0; j < batchSize; j++) {
      const index = i + j;
      const url = urlsToScrape[index];
      console.log(`[${index + 1}/${limit}] Processing: ${url}`);
      
      batch.push(
        scrapeProduct(url).then(productData => {
          if (productData && !productData.error) {
            // Successful scrape -> save and remove any previous failure record
            saveProductPrice(db, productData);
            try {
              db.prepare('DELETE FROM scraping_failures WHERE url = ?').run(productData.url);
            } catch (e) {
              console.error('Error removing failure record:', e.message);
            }
            return { success: true };
          }

          // productData.error === true -> log failure into scraping_failures
          try {
            const upsert = db.prepare(`
              INSERT INTO scraping_failures (url, status_code, error_message, last_attempt, attempts)
              VALUES (?, ?, ?, datetime('now'), 1)
              ON CONFLICT(url) DO UPDATE SET
                status_code = excluded.status_code,
                error_message = excluded.error_message,
                last_attempt = excluded.last_attempt,
                attempts = scraping_failures.attempts + 1
            `);
            upsert.run(productData.url, productData.status, productData.message);
          } catch (e) {
            console.error('Error recording failure:', e.message);
          }

          return { success: false };
        })
      );
    }
    
    // Wait for all requests in this batch to complete
    const results = await Promise.all(batch);
    results.forEach(result => {
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    });
    
    // Progress update every batch
    const processed = Math.min(i + PARALLEL_REQUESTS, limit);
    if (processed % 10 === 0 || processed === limit) {
      console.log(`Progress: ${processed}/${limit} products processed (${successCount} successful, ${errorCount} errors)`);
    }
    
    // Be nice to the server - add delay between batches
    if (i + PARALLEL_REQUESTS < limit) {
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
