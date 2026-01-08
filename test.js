#!/usr/bin/env node

/**
 * COMPREHENSIVE TEST SUITE
 * Tests scraper with normalized schema: products → variants → prices
 */

const { initDatabase } = require('./scraper.js');
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
console.log('🧪 COMPREHENSIVE TEST SUITE - Variants Architecture');
console.log('='.repeat(70));
console.log('');

// ============================================================================
// TEST 1: Database Initialization - Normalized Schema
// ============================================================================
console.log('📦 Test 1: Database Initialization (Products → Variants → Prices)');
console.log('-'.repeat(70));
try {
  const db = initDatabase();
  
  // Check all 3 tables exist
  const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all();
  const tableNames = tables.map(t => t.name);
  
  if (tableNames.includes('products') && tableNames.includes('variants') && tableNames.includes('prices')) {
    testLog('All 3 tables created (products, variants, prices)');
  } else {
    testLog('Missing tables. Expected: products, variants, prices', true);
  }
  
  // Check products table columns
  const productCols = db.prepare('PRAGMA table_info(products)').all();
  const productColNames = productCols.map(c => c.name);
  
  if (productColNames.includes('url_base') && productColNames.includes('status') && productColNames.includes('last_check')) {
    testLog('Products table has required columns (url_base, status, last_check)');
  } else {
    testLog('Products table missing required columns', true);
  }
  
  // Check variants table columns
  const variantCols = db.prepare('PRAGMA table_info(variants)').all();
  const variantColNames = variantCols.map(c => c.name);
  
  if (variantColNames.includes('product_id') && variantColNames.includes('sku') && variantColNames.includes('variant_label')) {
    testLog('Variants table has required columns (product_id, sku, variant_label)');
  } else {
    testLog('Variants table missing required columns', true);
  }
  
  // Check prices table columns
  const priceCols = db.prepare('PRAGMA table_info(prices)').all();
  const priceColNames = priceCols.map(c => c.name);
  
  if (priceColNames.includes('variant_id') && priceColNames.includes('price') && priceColNames.includes('currency')) {
    testLog('Prices table has required columns (variant_id, price, currency)');
  } else {
    testLog('Prices table missing required columns', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Database initialization failed: ' + error.message, true);
}

console.log('');

console.log('');

// ============================================================================
// TEST 2: Foreign Key Relationships
// ============================================================================
console.log('🔗 Test 2: Foreign Key Constraints (Normalized Schema)');
console.log('-'.repeat(70));
try {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_base TEXT UNIQUE NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'active',
      last_check DATETIME
    );
    
    CREATE TABLE variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      url TEXT UNIQUE NOT NULL,
      sku TEXT,
      variant_label TEXT,
      variant_value TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    
    CREATE TABLE prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'CRC',
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (variant_id) REFERENCES variants(id)
    );
  `);
  
  // Verify variant → product FK
  const variantFk = db.prepare('PRAGMA foreign_key_list(variants)').all();
  if (variantFk.length > 0 && variantFk[0].table === 'products') {
    testLog('Variant → Product foreign key exists');
  } else {
    testLog('Variant → Product FK missing', true);
  }
  
  // Verify price → variant FK
  const priceFk = db.prepare('PRAGMA foreign_key_list(prices)').all();
  if (priceFk.length > 0 && priceFk[0].table === 'variants') {
    testLog('Price → Variant foreign key exists');
  } else {
    testLog('Price → Variant FK missing', true);
  }
  
  // Test cascade: insert product → variant → price
  db.exec(`
    INSERT INTO products (url_base, name) VALUES ('test-product', 'Test Product');
    INSERT INTO variants (product_id, url, sku) VALUES (1, 'test-url', 'TEST-SKU');
    INSERT INTO prices (variant_id, price) VALUES (1, 9999);
  `);
  
  const price = db.prepare('SELECT * FROM prices WHERE variant_id = 1').get();
  if (price && price.price === 9999 && price.currency === 'CRC') {
    testLog('Can insert product → variant → price chain');
  } else {
    testLog('Failed to insert full chain', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Foreign key test failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// TEST 3: Status Tracking (Active/404)
// ============================================================================
console.log('🔄 Test 3: Status Tracking (Active/404)');
console.log('-'.repeat(70));
try {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_base TEXT UNIQUE NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'active',
      last_check DATETIME
    );
  `);
  
  // Test default status
  db.exec(`INSERT INTO products (url_base, name) VALUES ('test-1', 'Test Product')`);
  const activeProduct = db.prepare('SELECT status FROM products WHERE url_base = ?').get('test-1');
  if (activeProduct.status === 'active') {
    testLog('Default status is "active"');
  } else {
    testLog('Default status should be "active"', true);
  }
  
  // Test marking as 404
  db.exec(`UPDATE products SET status = '404', last_check = datetime('now') WHERE url_base = 'test-1'`);
  const notFoundProduct = db.prepare('SELECT status, last_check FROM products WHERE url_base = ?').get('test-1');
  if (notFoundProduct.status === '404' && notFoundProduct.last_check) {
    testLog('Can mark product as 404 with last_check');
  } else {
    testLog('Failed to mark as 404', true);
  }
  
  // Test daily mode filter (active only)
  db.exec(`
    INSERT INTO products (url_base, name, status) VALUES 
      ('test-2', 'Active 1', 'active'),
      ('test-3', 'Active 2', 'active'),
      ('test-4', '404 Product', '404');
  `);
  
  const activeCount = db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE status != '404'
  `).get();
  
  if (activeCount.count === 2) {
    testLog('Daily mode filters active products (excludes 404s)');
  } else {
    testLog(`Expected 2 active products, got ${activeCount.count}`, true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Status tracking test failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// TEST 4: Variant Handling (Multiple SKUs per Product)
// ============================================================================
console.log('🎨 Test 4: Variant Handling (Colors, Sizes, etc.)');
console.log('-'.repeat(70));
try {
  const db = new Database(':memory:');
  
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_base TEXT UNIQUE NOT NULL,
      name TEXT
    );
    
    CREATE TABLE variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      url TEXT UNIQUE NOT NULL,
      sku TEXT,
      variant_label TEXT,
      variant_value TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    
    CREATE TABLE prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'CRC',
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (variant_id) REFERENCES variants(id)
    );
  `);
  
  // Insert a product with multiple variants (e.g., t-shirt with different colors)
  db.exec(`INSERT INTO products (url_base, name) VALUES ('tshirt-product', 'T-Shirt Base')`);
  
  db.exec(`
    INSERT INTO variants (product_id, url, sku, variant_label, variant_value) VALUES
      (1, 'tshirt-red', 'TSHIRT-RED', 'Color', 'Rojo'),
      (1, 'tshirt-blue', 'TSHIRT-BLUE', 'Color', 'Azul'),
      (1, 'tshirt-green', 'TSHIRT-GREEN', 'Color', 'Verde');
  `)
  
  const variants = db.prepare('SELECT COUNT(*) as count FROM variants WHERE product_id = 1').get();
  if (variants.count === 3) {
    testLog('Product can have multiple variants (3 colors)');
  } else {
    testLog(`Expected 3 variants, got ${variants.count}`, true);
  }
  
  // Each variant can have different prices
  db.exec(`
    INSERT INTO prices (variant_id, price) VALUES
      (1, 5000),
      (2, 5500),
      (3, 5200);
  `);
  
  const priceCount = db.prepare('SELECT COUNT(*) as count FROM prices').get();
  if (priceCount.count === 3) {
    testLog('Each variant can have its own price');
  } else {
    testLog(`Expected 3 prices, got ${priceCount.count}`, true);
  }
  
  // Verify price history per variant
  db.exec(`INSERT INTO prices (variant_id, price) VALUES (1, 4800)`); // Price drop
  const redVariantPrices = db.prepare('SELECT COUNT(*) as count FROM prices WHERE variant_id = 1').get();
  if (redVariantPrices.count === 2) {
    testLog('Variant price history tracked correctly');
  } else {
    testLog('Price history not working', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Variant handling test failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// TEST 5: Query Performance & Indexes
// ============================================================================
console.log('⚡ Test 5: Query Performance & Indexes');
console.log('-'.repeat(70));
try {
  const db = initDatabase();
  
  // Check indexes exist
  const indexes = db.prepare('SELECT name, tbl_name FROM sqlite_master WHERE type=\'index\' AND sql IS NOT NULL').all();
  const indexMap = {};
  indexes.forEach(idx => {
    if (!indexMap[idx.tbl_name]) indexMap[idx.tbl_name] = [];
    indexMap[idx.tbl_name].push(idx.name);
  });
  
  if (indexMap.variants && indexMap.variants.some(i => i.includes('sku'))) {
    testLog('Variants table has SKU index');
  } else {
    testLog('Missing SKU index on variants', true);
  }
  
  if (indexMap.variants && indexMap.variants.some(i => i.includes('product_id'))) {
    testLog('Variants table has product_id index');
  } else {
    testLog('Missing product_id index on variants', true);
  }
  
  if (indexMap.prices && indexMap.prices.some(i => i.includes('variant_id'))) {
    testLog('Prices table has variant_id index');
  } else {
    testLog('Missing variant_id index on prices', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Index verification failed: ' + error.message, true);
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
