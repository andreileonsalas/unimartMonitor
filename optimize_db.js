const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'prices.db');

console.log('='.repeat(70));
console.log('🔧 DATABASE OPTIMIZATION SCRIPT');
console.log('='.repeat(70));

// Get initial file size
const initialSize = fs.statSync(DB_PATH).size;
console.log(`\n📊 Initial database size: ${(initialSize / 1024 / 1024).toFixed(2)} MB`);

const db = new Database(DB_PATH);

// Step 1: Check current indices
console.log('\n' + '='.repeat(70));
console.log('📑 CURRENT INDICES');
console.log('='.repeat(70));
const indices = db.prepare(`
  SELECT name, tbl_name, sql 
  FROM sqlite_master 
  WHERE type = 'index' AND sql IS NOT NULL
  ORDER BY tbl_name, name
`).all();

indices.forEach(idx => {
  console.log(`${idx.tbl_name}.${idx.name}`);
  console.log(`  ${idx.sql}`);
});

// Step 2: Add missing optimized indices
console.log('\n' + '='.repeat(70));
console.log('➕ ADDING OPTIMIZED INDICES');
console.log('='.repeat(70));

const newIndices = [
  // Composite index for common price range queries
  'CREATE INDEX IF NOT EXISTS idx_price_ranges_variant_date ON price_ranges(variant_id, start_date DESC)',
  
  // Index for open ranges (current prices) - most common query
  'CREATE INDEX IF NOT EXISTS idx_price_ranges_open ON price_ranges(variant_id, end_date)',
  
  // Index for products by last_scraped (useful for --from-db mode)
  'CREATE INDEX IF NOT EXISTS idx_products_last_scraped ON products(last_check ASC)',
  
  // Partial index for active products
  'CREATE INDEX IF NOT EXISTS idx_products_title ON products(title) WHERE title IS NOT NULL',
];

newIndices.forEach(sql => {
  try {
    db.exec(sql);
    console.log(`✅ ${sql.substring(0, 80)}...`);
  } catch (err) {
    console.log(`⚠️  ${err.message}`);
  }
});

// Step 3: Update statistics for query optimizer
console.log('\n' + '='.repeat(70));
console.log('📈 ANALYZING TABLES (updating statistics)');
console.log('='.repeat(70));
db.exec('ANALYZE');
console.log('✅ Analysis complete');

// Step 4: Optimize performance settings
console.log('\n' + '='.repeat(70));
console.log('⚙️  OPTIMIZING PRAGMAS');
console.log('='.repeat(70));

// These settings improve performance
const pragmas = {
  journal_mode: 'WAL',  // Write-Ahead Logging for better concurrency
  synchronous: 'NORMAL', // Balance between safety and speed
  cache_size: -64000,    // 64MB cache (negative = KB)
  temp_store: 'MEMORY',  // Store temp tables in memory
  mmap_size: 30000000000, // 30GB memory-mapped I/O limit
  page_size: 4096        // Standard page size
};

Object.entries(pragmas).forEach(([key, value]) => {
  const current = db.pragma(key, { simple: true });
  console.log(`${key}: ${current} → ${value}`);
  db.pragma(`${key} = ${value}`);
});

// Step 5: Vacuum to reclaim space and defragment
console.log('\n' + '='.repeat(70));
console.log('🗜️  VACUUMING DATABASE (this may take a while...)');
console.log('='.repeat(70));
console.log('Compressing and defragmenting...');
db.exec('VACUUM');
console.log('✅ Vacuum complete');

// Get final file size
const finalSize = fs.statSync(DB_PATH).size;
const saved = initialSize - finalSize;
const savedPercent = ((saved / initialSize) * 100).toFixed(2);

console.log('\n' + '='.repeat(70));
console.log('✅ OPTIMIZATION COMPLETE');
console.log('='.repeat(70));
console.log(`Initial size: ${(initialSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`Final size:   ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`Space saved:  ${(saved / 1024 / 1024).toFixed(2)} MB (${savedPercent}%)`);

// Step 6: Show table statistics
console.log('\n' + '='.repeat(70));
console.log('📊 TABLE STATISTICS');
console.log('='.repeat(70));

const tables = ['products', 'variants', 'price_ranges'];
tables.forEach(table => {
  try {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
    console.log(`${table.padEnd(20)}: ${count.toLocaleString()} rows`);
  } catch (e) {
    console.log(`${table.padEnd(20)}: Error - ${e.message}`);
  }
});

console.log('\n' + '='.repeat(70));
console.log('💡 PERFORMANCE TIPS');
console.log('='.repeat(70));
console.log('1. Run this script periodically (monthly) to maintain performance');
console.log('2. WAL mode enabled - safe to have concurrent readers');
console.log('3. Indices optimized for common queries');
console.log('4. Database is now defragmented and compressed');
console.log('='.repeat(70));

db.close();
