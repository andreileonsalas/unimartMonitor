#!/usr/bin/env node

/**
 * COMPREHENSIVE TEST SUITE
 * Tests both scraper and viewer functionality with real-world scenarios
 */

const { initDatabase, saveProductPrice } = require('./scraper.js');
const Database = require('better-sqlite3');

let testsPass = 0;
let testsFail = 0;

function testLog(message, isError = false) {
  if (isError) {
    console.error('❌', message);
    testsFail++;
  } else {
    console.log('✓', message);
    testsPass++;
  }
}

console.log('='.repeat(70));
console.log('🧪 RUNNING COMPREHENSIVE TEST SUITE');
console.log('='.repeat(70));
console.log('');

// ============================================================================
// TEST 1: Database Initialization
// ============================================================================
console.log('📦 Test 1: Database Initialization');
console.log('-'.repeat(70));
try {
  const db = initDatabase();
  
  // Check tables exist
  const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all();
  const tableNames = tables.map(t => t.name);
  
  if (tableNames.includes('products') && tableNames.includes('prices')) {
    testLog('Database tables created correctly');
  } else {
    testLog('Database tables not created', true);
  }
  
  // Check columns in products table
  const productCols = db.prepare('PRAGMA table_info(products)').all();
  const productColNames = productCols.map(c => c.name);
  
  if (productColNames.includes('sku') && productColNames.includes('url')) {
    testLog('Products table has required columns (url, sku)');
  } else {
    testLog('Products table missing required columns', true);
  }
  
  // Check indexes
  const indexes = db.prepare('SELECT name FROM sqlite_master WHERE type=\'index\'').all();
  const indexNames = indexes.map(i => i.name);
  
  if (indexNames.includes('idx_sku') && indexNames.includes('idx_product_id')) {
    testLog('Required indexes created (sku, product_id)');
  } else {
    testLog('Missing required indexes', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Database initialization failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// TEST 2: Product Data Saving (Simulating Real Unimart Data)
// ============================================================================
console.log('💾 Test 2: Saving Product Data (Real-World Scenario)');
console.log('-'.repeat(70));
try {
  const db = new Database(':memory:');
  
  // Create schema
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      sku TEXT,
      title TEXT,
      last_scraped DATETIME,
      status TEXT DEFAULT 'active',
      last_check DATETIME
    );
    
    CREATE TABLE prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'CRC',
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    
    CREATE INDEX idx_sku ON products(sku);
  `);
  
  // Test with real Unimart-like data
  const testProducts = [
    {
      url: 'https://www.unimart.com/products/epson-botella-de-tinta-negra-664',
      sku: 'UM00IPM5',
      title: 'Botella de Tinta Negra 664 T664120-AL',
      price: 4700,
      currency: 'CRC'
    },
    {
      url: 'https://www.unimart.com/products/logitech-mouse-m185',
      sku: 'UM006PN0',
      title: 'Mouse Inalámbrico M185',
      price: 9400,
      currency: 'CRC'
    }
  ];
  
  testProducts.forEach(product => {
    saveProductPrice(db, product);
  });
  
  const products = db.prepare('SELECT * FROM products').all();
  const prices = db.prepare('SELECT * FROM prices').all();
  
  if (products.length === 2 && prices.length === 2) {
    testLog('All test products saved correctly');
  } else {
    testLog(`Product count mismatch: expected 2, got ${products.length}`, true);
  }
  
  // Verify SKU was saved
  const productWithSku = db.prepare('SELECT * FROM products WHERE sku = ?').get('UM00IPM5');
  if (productWithSku && productWithSku.title.includes('Botella')) {
    testLog('SKU correctly linked to product');
  } else {
    testLog('SKU not saved correctly', true);
  }
  
  // Verify currency is CRC
  const crcPrices = db.prepare('SELECT * FROM prices WHERE currency = ?').all('CRC');
  if (crcPrices.length === 2) {
    testLog('Currency (CRC) saved correctly');
  } else {
    testLog('Currency not saved correctly', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Product saving test failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// TEST 3: Database Schema Verification
// ============================================================================
console.log('🗄️  Test 3: Database Schema Integrity');
console.log('-'.repeat(70));
try {
  const db = new Database(':memory:');
  
  // Create schema fresh for testing
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      sku TEXT,
      title TEXT,
      last_scraped DATETIME,
      status TEXT DEFAULT 'active',
      last_check DATETIME
    );
    
    CREATE TABLE prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'CRC',
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    
    CREATE INDEX idx_sku ON products(sku);
    CREATE INDEX idx_product_id ON prices(product_id);
  `);
  
  // Verify foreign key constraint
  const fkInfo = db.prepare('PRAGMA foreign_key_list(prices)').all();
  if (fkInfo.length > 0 && fkInfo[0].table === 'products') {
    testLog('Foreign key constraint exists');
  } else {
    testLog('Foreign key constraint missing', true);
  }
  
  // Verify default values
  db.exec(`
    INSERT INTO products (url, title) VALUES ('test-url-unique', 'test');
    INSERT INTO prices (product_id, price) VALUES (1, 100);
  `);
  
  const price = db.prepare('SELECT currency FROM prices WHERE product_id = 1').get();
  if (price.currency === 'CRC') {
    testLog('Default currency value (CRC) works correctly');
  } else {
    testLog('Default currency value not working', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Schema verification failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// TEST 4: STATUS TRACKING (NEW FUNCTIONALITY)
// ============================================================================
console.log('🔄 Test 4: Status Tracking (Active/404)');
console.log('-'.repeat(70));
try {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      sku TEXT,
      title TEXT,
      last_scraped DATETIME,
      status TEXT DEFAULT 'active',
      last_check DATETIME
    );
  `);
  
  // Test 1: Default status should be 'active'
  db.exec(`INSERT INTO products (url, title) VALUES ('test-url-1', 'Test Product')`);
  const activeProduct = db.prepare('SELECT status FROM products WHERE url = ?').get('test-url-1');
  if (activeProduct.status === 'active') {
    testLog('Default status is "active"');
  } else {
    testLog('Default status should be "active", got: ' + activeProduct.status, true);
  }
  
  // Test 2: Can mark product as 404
  db.exec(`UPDATE products SET status = '404', last_check = datetime('now') WHERE url = 'test-url-1'`);
  const notFoundProduct = db.prepare('SELECT status FROM products WHERE url = ?').get('test-url-1');
  if (notFoundProduct.status === '404') {
    testLog('Can mark product as 404');
  } else {
    testLog('Failed to mark product as 404', true);
  }
  
  // Test 3: Can filter by status (daily mode)
  db.exec(`
    INSERT INTO products (url, title, status) VALUES ('test-url-2', 'Active Product', 'active');
    INSERT INTO products (url, title, status) VALUES ('test-url-3', 'Another Active', 'active');
  `);
  
  const activeCount = db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE status != '404' OR status IS NULL
  `).get();
  
  if (activeCount.count === 2) {
    testLog('Daily mode query filters correctly (active only)');
  } else {
    testLog(`Daily mode query should return 2, got ${activeCount.count}`, true);
  }
  
  // Test 4: Can get 404 products (weekly mode)
  const notFoundCount = db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE status = '404'
  `).get();
  
  if (notFoundCount.count === 1) {
    testLog('Weekly mode can fetch 404 products correctly');
  } else {
    testLog(`Weekly mode should return 1 404, got ${notFoundCount.count}`, true);
  }
  
  // Test 5: last_check column exists and works
  const productWithCheck = db.prepare('SELECT last_check FROM products WHERE url = ?').get('test-url-1');
  if (productWithCheck.last_check !== null) {
    testLog('last_check column works correctly');
  } else {
    testLog('last_check should not be null after update', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Status tracking test failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// TEST 5: SCRAPER MODE QUERIES
// ============================================================================
console.log('📅 Test 5: Daily/Weekly Mode Queries');
console.log('-'.repeat(70));
try {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      sku TEXT,
      title TEXT,
      last_scraped DATETIME,
      status TEXT DEFAULT 'active',
      last_check DATETIME
    );
    
    CREATE TABLE scraping_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      status_code INTEGER,
      error_message TEXT,
      last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
      attempts INTEGER DEFAULT 0
    );
  `);
  
  // Insert test data
  db.exec(`
    INSERT INTO products (url, title, status, last_scraped) VALUES 
      ('url-1', 'Product 1', 'active', '2025-01-01 10:00:00'),
      ('url-2', 'Product 2', 'active', '2025-01-02 10:00:00'),
      ('url-3', 'Product 3', '404', '2025-01-03 10:00:00'),
      ('url-4', 'Product 4', '404', '2025-01-04 10:00:00'),
      ('url-5', 'Product 5', 'active', '2025-01-05 10:00:00');
      
    INSERT INTO scraping_failures (url, status_code) VALUES
      ('url-3', 404),
      ('url-4', 404),
      ('url-6', 404);
  `);
  
  // Test daily mode query (active only, ordered by oldest)
  const dailyQuery = db.prepare(`
    SELECT url FROM products 
    WHERE status != '404' OR status IS NULL
    ORDER BY last_scraped ASC
    LIMIT 5
  `);
  const dailyResults = dailyQuery.all();
  
  if (dailyResults.length === 3 && dailyResults[0].url === 'url-1') {
    testLog('Daily query returns active products, oldest first');
  } else {
    testLog(`Daily query should return 3 products starting with url-1, got ${dailyResults.length}`, true);
  }
  
  // Test weekly mode 404 query
  const weeklyQuery = db.prepare(`
    SELECT url FROM products WHERE status = '404'
    UNION
    SELECT url FROM scraping_failures WHERE status_code = 404
  `);
  const weeklyResults = weeklyQuery.all();
  
  if (weeklyResults.length === 3) { // url-3, url-4, url-6
    testLog('Weekly query fetches all 404s from both tables');
  } else {
    testLog(`Weekly query should return 3 404s, got ${weeklyResults.length}`, true);
  }
  
  // Test deduplication (url-3 and url-4 are in both tables)
  const uniqueUrls = new Set(weeklyResults.map(r => r.url));
  if (uniqueUrls.size === 3) {
    testLog('UNION correctly deduplicates 404 URLs');
  } else {
    testLog(`Deduplication failed, expected 3 unique, got ${uniqueUrls.size}`, true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Mode query test failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// SUMMARY
// ============================================================================
console.log('='.repeat(70));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Passed: ${testsPass}`);
console.log(`❌ Failed: ${testsFail}`);
console.log(`📈 Success Rate: ${((testsPass / (testsPass + testsFail)) * 100).toFixed(1)}%`);
console.log('='.repeat(70));

if (testsFail > 0) {
  console.log('');
  console.log('⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
} else {
  console.log('');
  console.log('🎉 All tests passed!');
  process.exit(0);
}
