#!/usr/bin/env node

/**
 * This script creates a sample database with test data
 * Useful for testing the frontend without running the scraper
 */

const PriceDatabase = require('./database');

function createSampleData() {
  console.log('Creating sample database...');
  
  const db = new PriceDatabase('./prices.db');
  
  // Sample products
  const sampleProducts = [
    {
      url: 'https://www.unimart.com/products/laptop-dell-xps-13',
      name: 'Dell XPS 13 Laptop',
      prices: [1299.99, 1249.99, 1199.99, 1299.99]
    },
    {
      url: 'https://www.unimart.com/products/iphone-15-pro',
      name: 'iPhone 15 Pro 256GB',
      prices: [999.99, 999.99, 949.99, 999.99]
    },
    {
      url: 'https://www.unimart.com/products/samsung-galaxy-s24',
      name: 'Samsung Galaxy S24 Ultra',
      prices: [1199.99, 1149.99, 1199.99, 1099.99]
    },
    {
      url: 'https://www.unimart.com/products/airpods-pro',
      name: 'Apple AirPods Pro (2nd Gen)',
      prices: [249.99, 229.99, 249.99, 249.99]
    },
    {
      url: 'https://www.unimart.com/products/sony-headphones-wh1000xm5',
      name: 'Sony WH-1000XM5 Headphones',
      prices: [399.99, 379.99, 399.99, 349.99]
    }
  ];
  
  sampleProducts.forEach(product => {
    console.log(`Adding ${product.name}...`);
    const productId = db.addOrUpdateProduct(product.url, product.name);
    
    // Add price history (simulate data over past few days)
    product.prices.forEach((price, index) => {
      db.addPriceRecord(productId, price, 'USD', true);
    });
  });
  
  console.log('\nSample database created successfully!');
  console.log('Database file: prices.db');
  console.log('\nYou can now:');
  console.log('1. Open index.html in your browser');
  console.log('2. Load the prices.db file to view the sample data');
  
  db.close();
}

if (require.main === module) {
  createSampleData();
}

module.exports = createSampleData;
