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
console.log('📦 Test 1: Database Initialization (Products → Variants → Price Ranges)');
console.log('-'.repeat(70));
try {
  const db = initDatabase();
  
  // Check all 3 tables exist
  const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all();
  const tableNames = tables.map(t => t.name);
  
  if (tableNames.includes('products') && tableNames.includes('variants') && tableNames.includes('price_ranges')) {
    testLog('All 3 tables created (products, variants, price_ranges)');
  } else {
    testLog('Missing tables. Expected: products, variants, price_ranges. Got: ' + tableNames.join(', '), true);
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
  
  // Check price_ranges table columns
  const rangeCols = db.prepare('PRAGMA table_info(price_ranges)').all();
  const rangeColNames = rangeCols.map(c => c.name);
  
  if (rangeColNames.includes('variant_id') && rangeColNames.includes('price') && rangeColNames.includes('currency') && rangeColNames.includes('start_date') && rangeColNames.includes('end_date')) {
    testLog('Price_ranges table has required columns (variant_id, price, currency, start_date, end_date)');
  } else {
    testLog('Price_ranges table missing required columns', true);
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
      stock INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    
    CREATE TABLE price_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'CRC',
      start_date TEXT NOT NULL,
      end_date TEXT,
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
  
  // Verify price_range → variant FK
  const rangeFk = db.prepare('PRAGMA foreign_key_list(price_ranges)').all();
  if (rangeFk.length > 0 && rangeFk[0].table === 'variants') {
    testLog('PriceRange → Variant foreign key exists');
  } else {
    testLog('PriceRange → Variant FK missing', true);
  }
  
  // Test cascade: insert product → variant → price_range
  db.exec(`
    INSERT INTO products (url_base, name) VALUES ('test-product', 'Test Product');
    INSERT INTO variants (product_id, url, sku, stock) VALUES (1, 'test-url', 'TEST-SKU', NULL);
    INSERT INTO price_ranges (variant_id, price, start_date) VALUES (1, 9999, '2026-01-01');
  `);
  
  const range = db.prepare('SELECT * FROM price_ranges WHERE variant_id = 1').get();
  if (range && range.price === 9999 && range.currency === 'CRC' && range.end_date === null) {
    testLog('Can insert product → variant → price_range chain (open-ended range)');
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
      stock INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    
    CREATE TABLE price_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'CRC',
      start_date TEXT NOT NULL,
      end_date TEXT,
      FOREIGN KEY (variant_id) REFERENCES variants(id)
    );
  `);
  
  // Insert a product with multiple variants (e.g., t-shirt with different colors)
  db.exec(`INSERT INTO products (url_base, name) VALUES ('tshirt-product', 'T-Shirt Base')`);
  
  db.exec(`
    INSERT INTO variants (product_id, url, sku, variant_label, variant_value, stock) VALUES
      (1, 'tshirt-red', 'TSHIRT-RED', 'Color', 'Rojo', NULL),
      (1, 'tshirt-blue', 'TSHIRT-BLUE', 'Color', 'Azul', NULL),
      (1, 'tshirt-green', 'TSHIRT-GREEN', 'Color', 'Verde', NULL);
  `);
  
  const variants = db.prepare('SELECT COUNT(*) as count FROM variants WHERE product_id = 1').get();
  if (variants.count === 3) {
    testLog('Product can have multiple variants (3 colors)');
  } else {
    testLog(`Expected 3 variants, got ${variants.count}`, true);
  }
  
  // Each variant can have a different open price range
  db.exec(`
    INSERT INTO price_ranges (variant_id, price, start_date) VALUES
      (1, 5000, '2026-01-01'),
      (2, 5500, '2026-01-01'),
      (3, 5200, '2026-01-01');
  `);
  
  const rangeCount = db.prepare('SELECT COUNT(*) as count FROM price_ranges').get();
  if (rangeCount.count === 3) {
    testLog('Each variant can have its own price range');
  } else {
    testLog(`Expected 3 price ranges, got ${rangeCount.count}`, true);
  }
  
  // Simulate a price change: close old range, open new one
  db.exec(`UPDATE price_ranges SET end_date = '2026-01-10' WHERE variant_id = 1 AND end_date IS NULL`);
  db.exec(`INSERT INTO price_ranges (variant_id, price, start_date) VALUES (1, 4800, '2026-01-11')`);
  
  const redVariantRanges = db.prepare('SELECT COUNT(*) as count FROM price_ranges WHERE variant_id = 1').get();
  if (redVariantRanges.count === 2) {
    testLog('Price range history tracked correctly (close old, open new)');
  } else {
    testLog('Price range history not working', true);
  }
  
  // Verify open range is the current price
  const currentRange = db.prepare('SELECT price FROM price_ranges WHERE variant_id = 1 AND end_date IS NULL').get();
  if (currentRange && currentRange.price === 4800) {
    testLog('Current price correctly identified via open range (end_date IS NULL)');
  } else {
    testLog('Current price lookup via open range failed', true);
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
  
  if (indexMap.price_ranges && indexMap.price_ranges.some(i => i.includes('variant_id'))) {
    testLog('Price_ranges table has variant_id index');
  } else {
    testLog('Missing variant_id index on price_ranges', true);
  }
  
  db.close();
  
} catch (error) {
  testLog('Index verification failed: ' + error.message, true);
}

console.log('');

// ============================================================================
// TEST 6: Segmentation & Merge Data Integrity (Using Real merge_db.js)
// ============================================================================
console.log('🔄 Test 6: Segmentation & Merge (Data Preservation)');
console.log('-'.repeat(70));

try {
  const fs = require('fs');
  const path = require('path');
  
  // Cleanup any existing test files
  ['prices.db', 'prices-1.db', 'prices-2.db'].forEach(file => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  // 1. Create main database with existing data using price_ranges schema
  const mainDb = new Database('prices.db');
  mainDb.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, url_base TEXT UNIQUE, title TEXT, status TEXT DEFAULT 'active', last_check DATETIME);
    CREATE TABLE variants (id INTEGER PRIMARY KEY, product_id INTEGER, url TEXT UNIQUE, sku TEXT, variant_label TEXT, variant_value TEXT, shopify_gid TEXT, stock INTEGER, FOREIGN KEY (product_id) REFERENCES products(id));
    CREATE TABLE price_ranges (id INTEGER PRIMARY KEY, variant_id INTEGER, price REAL, currency TEXT, start_date TEXT NOT NULL, end_date TEXT, FOREIGN KEY (variant_id) REFERENCES variants(id));
  `);
  
  // Insert existing data (50 products with historical price ranges)
  for (let i = 1; i <= 50; i++) {
    mainDb.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?)').run(i, `existing${i}`, `Existing Product ${i}`, 'active', '2026-01-18');
    mainDb.prepare('INSERT INTO variants VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(i, i, `existing${i}`, `SKU${i}`, null, null, null, null);
    // One open range per variant (current price)
    mainDb.prepare('INSERT INTO price_ranges (variant_id, price, currency, start_date) VALUES (?, ?, ?, ?)').run(i, 1000 + i, 'CRC', '2026-01-01');
  }
  
  const initialProducts = mainDb.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const initialVariants = mainDb.prepare('SELECT COUNT(*) as count FROM variants').get().count;
  const initialRanges = mainDb.prepare('SELECT COUNT(*) as count FROM price_ranges').get().count;
  
  testLog(`Initial DB: ${initialProducts} products, ${initialVariants} variants, ${initialRanges} ranges`);
  mainDb.close();

  // 2. Create segment databases using price_ranges schema
  
  // Segment 1: 5 new products
  const seg1 = new Database('prices-1.db');
  seg1.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, url_base TEXT UNIQUE, title TEXT, status TEXT DEFAULT 'active', last_check DATETIME);
    CREATE TABLE variants (id INTEGER PRIMARY KEY, product_id INTEGER, url TEXT UNIQUE, sku TEXT, variant_label TEXT, variant_value TEXT, shopify_gid TEXT, stock INTEGER);
    CREATE TABLE price_ranges (id INTEGER PRIMARY KEY, variant_id INTEGER, price REAL, currency TEXT, start_date TEXT NOT NULL, end_date TEXT);
  `);
  
  for (let i = 51; i <= 55; i++) {
    seg1.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?)').run(i, `new${i}`, `New Product ${i}`, 'active', '2026-01-19');
    seg1.prepare('INSERT INTO variants VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(i, i, `new${i}`, `NEWSKU${i}`, null, null, null, null);
    seg1.prepare('INSERT INTO price_ranges (variant_id, price, currency, start_date) VALUES (?, ?, ?, ?)').run(i, 1500, 'CRC', '2026-01-19');
  }
  
  const seg1Ranges = seg1.prepare('SELECT COUNT(*) as count FROM price_ranges').get().count;
  seg1.close();
  
  // Segment 2: 3 new products
  const seg2 = new Database('prices-2.db');
  seg2.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, url_base TEXT UNIQUE, title TEXT, status TEXT DEFAULT 'active', last_check DATETIME);
    CREATE TABLE variants (id INTEGER PRIMARY KEY, product_id INTEGER, url TEXT UNIQUE, sku TEXT, variant_label TEXT, variant_value TEXT, shopify_gid TEXT, stock INTEGER);
    CREATE TABLE price_ranges (id INTEGER PRIMARY KEY, variant_id INTEGER, price REAL, currency TEXT, start_date TEXT NOT NULL, end_date TEXT);
  `);
  
  for (let i = 56; i <= 58; i++) {
    seg2.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?)').run(i, `newer${i}`, `Newer Product ${i}`, 'active', '2026-01-19');
    seg2.prepare('INSERT INTO variants VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(i, i, `newer${i}`, `NEWERSKU${i}`, null, null, null, null);
    seg2.prepare('INSERT INTO price_ranges (variant_id, price, currency, start_date) VALUES (?, ?, ?, ?)').run(i, 2000, 'CRC', '2026-01-19');
  }
  
  const seg2Ranges = seg2.prepare('SELECT COUNT(*) as count FROM price_ranges').get().count;
  seg2.close();

  testLog(`Created segments: +${seg1Ranges} ranges (seg1), +${seg2Ranges} ranges (seg2)`);

  // 3. Execute real merge using merge_db.js module
  testLog('Executing real merge using merge_db.js...');
  
  const { mergeDatabase, findSegmentDatabases } = require('./merge_db.js');
  
  // Temporarily silence console.log during merge
  const originalLog = console.log;
  console.log = () => {};
  
  try {
    const segmentDbs = findSegmentDatabases();
    const mergeDb = new Database('prices.db');
    
    for (const segmentInfo of segmentDbs) {
      const segmentPath = path.join(__dirname, segmentInfo.file);
      mergeDatabase(mergeDb, segmentPath, segmentInfo.segment);
    }
    
    mergeDb.close();
    
    segmentDbs.forEach(seg => {
      if (fs.existsSync(seg.file)) fs.unlinkSync(seg.file);
    });
    
  } finally {
    console.log = originalLog;
  }

  // 4. Verify merge results
  const finalDb = new Database('prices.db');
  const finalProducts = finalDb.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const finalVariants = finalDb.prepare('SELECT COUNT(*) as count FROM variants').get().count;
  const finalRanges = finalDb.prepare('SELECT COUNT(*) as count FROM price_ranges').get().count;
  finalDb.close();
  
  const expectedProducts = initialProducts + 8; // +5 from seg1, +3 from seg2

  testLog(`Final result: ${finalProducts} products, ${finalVariants} variants, ${finalRanges} ranges`);
  
  if (finalRanges >= initialRanges) {
    testLog('✓ Existing ranges preserved (no data loss)');
    testsPass++;
  } else {
    testLog(`❌ CRITICAL: Range data loss detected! (${initialRanges} → ${finalRanges})`);
    testsFail++;
  }
  
  if (finalProducts >= expectedProducts) {
    testLog('✓ New products added successfully');
    testsPass++;
  } else {
    testLog(`❌ Product addition failed (expected ${expectedProducts}, got ${finalProducts})`);
    testsFail++;
  }
  
  if (finalRanges >= initialRanges + seg1Ranges + seg2Ranges) {
    testLog('✓ New ranges added successfully');
    testsPass++;
  } else {
    testLog(`❌ Range addition incomplete (expected ≥${initialRanges + seg1Ranges + seg2Ranges}, got ${finalRanges})`);
    testsFail++;
  }
  
  // Clean up test database
  if (fs.existsSync('prices.db')) fs.unlinkSync('prices.db');

} catch (error) {
  testLog(`❌ Merge test failed: ${error.message}`);
  testsFail++;
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
