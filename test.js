#!/usr/bin/env node

/**
 * Test script to validate the scraper functionality
 */

const { initDatabase, saveProductPrice } = require('./scraper.js');
const Database = require('better-sqlite3');
const path = require('path');

console.log('Running scraper tests...\n');

// Test 1: Database initialization
console.log('Test 1: Database initialization');
const testDbPath = path.join(__dirname, 'test.db');
try {
    const db = initDatabase();
    db.close();
    console.log('✓ Database initialized successfully\n');
} catch (error) {
    console.error('✗ Database initialization failed:', error.message);
    process.exit(1);
}

// Test 2: Saving product data
console.log('Test 2: Saving product data');
try {
    const db = new Database(':memory:');
    
    // Create tables
    db.exec(`
        CREATE TABLE products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            title TEXT,
            last_scraped DATETIME
        );
        
        CREATE TABLE prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            price REAL,
            currency TEXT DEFAULT 'USD',
            scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
        );
    `);
    
    // Test data
    const testProduct = {
        url: 'https://example.com/product/test',
        title: 'Test Product',
        price: 99.99,
        currency: 'USD'
    };
    
    saveProductPrice(db, testProduct);
    
    // Verify data was saved
    const products = db.prepare('SELECT * FROM products').all();
    const prices = db.prepare('SELECT * FROM prices').all();
    
    if (products.length === 1 && prices.length === 1) {
        console.log('✓ Product and price saved successfully');
        console.log(`  Product: ${products[0].title}`);
        console.log(`  Price: ${prices[0].currency} ${prices[0].price}\n`);
    } else {
        throw new Error('Data not saved correctly');
    }
    
    db.close();
} catch (error) {
    console.error('✗ Saving product data failed:', error.message);
    process.exit(1);
}

// Test 3: Verify schema
console.log('Test 3: Verify database schema');
try {
    const db = initDatabase();
    
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    
    const requiredTables = ['products', 'prices'];
    const hasAllTables = requiredTables.every(table => tableNames.includes(table));
    
    if (hasAllTables) {
        console.log('✓ All required tables exist');
        console.log(`  Tables: ${tableNames.filter(t => t !== 'sqlite_sequence').join(', ')}\n`);
    } else {
        throw new Error('Missing required tables');
    }
    
    db.close();
} catch (error) {
    console.error('✗ Schema verification failed:', error.message);
    process.exit(1);
}

console.log('All tests passed! ✓');
