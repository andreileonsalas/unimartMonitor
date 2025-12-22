const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'prices.db');
const db = new Database(DB_PATH);

// Get counts
const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
const totalPrices = db.prepare('SELECT COUNT(*) as count FROM prices').get().count;
const totalFailures = db.prepare('SELECT COUNT(*) as count FROM scraping_failures').get().count;

console.log('='.repeat(70));
console.log('📊 DATABASE STATS');
console.log('='.repeat(70));
console.log(`Total products: ${totalProducts}`);
console.log(`Total price records: ${totalPrices}`);
console.log(`Total failures: ${totalFailures}`);

// Check database size and warn if approaching limits
const dbSizeMB = fs.statSync(DB_PATH).size / 1024 / 1024;
console.log(`\n📦 Database file size: ${dbSizeMB.toFixed(2)} MB`);

if (dbSizeMB > 10240) {
  console.log('🚨 WARNING: DB > 10GB - Consider migrating to PostgreSQL (see MIGRATION_GUIDE.md)');
} else if (dbSizeMB > 5120) {
  console.log('⚠️  INFO: DB > 5GB - Monitor size, migration may be needed soon');
} else if (dbSizeMB > 1024) {
  console.log('💡 INFO: DB > 1GB - Still healthy, SQLite can handle this easily');
} else {
  console.log('✅ Database size is healthy for SQLite');
}

// Get recent failures
console.log('\n' + '='.repeat(70));
console.log('❌ RECENT FAILURES (last 20)');
console.log('='.repeat(70));
const failures = db.prepare(`
  SELECT url, status_code, error_message, attempts, last_attempt 
  FROM scraping_failures 
  ORDER BY last_attempt DESC 
  LIMIT 20
`).all();

failures.forEach(f => {
  console.log(`[${f.attempts} attempts] ${f.status_code || 'N/A'} - ${f.url}`);
  console.log(`  Error: ${f.error_message}`);
  console.log(`  Last: ${f.last_attempt}`);
});

// Get status code distribution
console.log('\n' + '='.repeat(70));
console.log('📈 FAILURE STATUS CODE DISTRIBUTION');
console.log('='.repeat(70));
const statusDist = db.prepare(`
  SELECT status_code, COUNT(*) as count 
  FROM scraping_failures 
  GROUP BY status_code 
  ORDER BY count DESC
`).all();

statusDist.forEach(s => {
  console.log(`Status ${s.status_code || 'NULL'}: ${s.count} failures`);
});

db.close();
