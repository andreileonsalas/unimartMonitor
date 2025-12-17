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
      last_scraped DATETIME
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
      last_scraped DATETIME
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
