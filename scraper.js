const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const Database = require('better-sqlite3');
const path = require('path');

// Configuration
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
  `);
  
  return db;
}

// Fetch and parse sitemap
async function fetchSitemap() {
  try {
    console.log('Fetching sitemap index from:', SITEMAP_URL);
    const response = await axios.get(SITEMAP_URL, { timeout: 10000 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    let urls = [];
    
    // Check if this is a sitemap index (contains references to other sitemaps)
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      console.log('Found sitemap index with', result.sitemapindex.sitemap.length, 'sitemaps');
      
      // Fetch the first product sitemap (to limit the number of products)
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
    // Direct urlset (original behavior)
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

// Scrape product information from a URL
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
    
    // Try to extract product information
    // Selectors adjusted for unimart.com structure
    let title = $('h1').first().text().trim() || 
                $('meta[property="og:title"]').attr('content') ||
                $('title').text().trim();
    
    // For unimart.com, prices are in .money elements
    let priceText = $('.money').first().text().trim() ||
                    $('.price').first().text() ||
                    $('[class*="price"]').first().text() ||
                    $('[id*="price"]').first().text() ||
                    $('meta[property="og:price:amount"]').attr('content') ||
                    '';
    
    // Extract numeric price (handles formats like ₡4,700 or $1,234.56)
    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : null;
    
    // Detect currency from symbols
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
    // Insert or update product
    const insertProduct = db.prepare(`
      INSERT INTO products (url, title, last_scraped)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        last_scraped = excluded.last_scraped
    `);
    
    const result = insertProduct.run(productData.url, productData.title);
    
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
      console.log(`Saved: ${productData.title} - ${productData.currency} ${productData.price}`);
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
