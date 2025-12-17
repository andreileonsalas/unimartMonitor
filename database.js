const Database = require('better-sqlite3');
const path = require('path');

class PriceDatabase {
  constructor(dbPath = './prices.db') {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  initDatabase() {
    // Create products table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        name TEXT,
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create price_history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        price REAL,
        currency TEXT DEFAULT 'USD',
        available BOOLEAN DEFAULT 1,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Create index for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_price_history_product_id 
      ON price_history(product_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_price_history_checked_at 
      ON price_history(checked_at)
    `);
  }

  addOrUpdateProduct(url, name) {
    const stmt = this.db.prepare(`
      INSERT INTO products (url, name, last_checked) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(url) DO UPDATE SET 
        name = excluded.name,
        last_checked = CURRENT_TIMESTAMP
    `);
    
    const result = stmt.run(url, name);
    return result.lastInsertRowid || this.getProductByUrl(url).id;
  }

  getProductByUrl(url) {
    const stmt = this.db.prepare('SELECT * FROM products WHERE url = ?');
    return stmt.get(url);
  }

  addPriceRecord(productId, price, currency = 'USD', available = true) {
    const stmt = this.db.prepare(`
      INSERT INTO price_history (product_id, price, currency, available, checked_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(productId, price, currency, available ? 1 : 0);
  }

  getAllProducts() {
    const stmt = this.db.prepare(`
      SELECT p.*, 
             ph.price as current_price,
             ph.currency,
             ph.available
      FROM products p
      LEFT JOIN price_history ph ON p.id = ph.product_id
      WHERE ph.id = (
        SELECT id FROM price_history 
        WHERE product_id = p.id 
        ORDER BY checked_at DESC 
        LIMIT 1
      )
      ORDER BY p.last_checked DESC
    `);
    return stmt.all();
  }

  getPriceHistory(productId, limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM price_history 
      WHERE product_id = ? 
      ORDER BY checked_at DESC 
      LIMIT ?
    `);
    return stmt.all(productId, limit);
  }

  exportToJSON() {
    const products = this.db.prepare('SELECT * FROM products').all();
    const priceHistory = this.db.prepare('SELECT * FROM price_history').all();
    
    return {
      products,
      priceHistory,
      exportedAt: new Date().toISOString()
    };
  }

  close() {
    this.db.close();
  }
}

module.exports = PriceDatabase;
