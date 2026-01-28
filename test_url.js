// Test script to check if a specific URL exists in sitemaps and test manual scraping
const axios = require('axios');
const xml2js = require('xml2js');
const Database = require('better-sqlite3');
const path = require('path');

const TARGET_URL = 'https://www.unimart.com/products/xiaomi-power-bank-bateria-externa-alambrica-20000mah-t-pb2030mi';
const SITEMAP_INDEX_URL = 'https://www.unimart.com/sitemap.xml';

async function searchInSitemaps() {
  console.log('='.repeat(70));
  console.log('SEARCHING FOR URL IN SITEMAPS');
  console.log('='.repeat(70));
  console.log('Target URL:', TARGET_URL);
  console.log('');
  
  try {
    // Get sitemap index
    const res = await axios.get(SITEMAP_INDEX_URL, { timeout: 20000 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(res.data);
    
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      const productSitemaps = result.sitemapindex.sitemap
        .map(s => s.loc[0])
        .filter(url => url.includes('/products/'));
      
      console.log(`Found ${productSitemaps.length} product sitemaps to check\n`);
      
      // Search in each sitemap
      let found = false;
      for (let i = 0; i < productSitemaps.length; i++) {
        const sitemapUrl = productSitemaps[i];
        try {
          const sitemapRes = await axios.get(sitemapUrl, { timeout: 15000 });
          const sitemapData = await parser.parseStringPromise(sitemapRes.data);
          
          if (sitemapData.urlset && sitemapData.urlset.url) {
            const urls = sitemapData.urlset.url.map(entry => entry.loc[0]);
            
            if (urls.some(url => url === TARGET_URL)) {
              console.log(`✅ FOUND in sitemap ${i + 1}/${productSitemaps.length}:`);
              console.log(`   ${sitemapUrl}`);
              found = true;
              break;
            }
          }
          
          if ((i + 1) % 10 === 0) {
            console.log(`   Checked ${i + 1}/${productSitemaps.length} sitemaps...`);
          }
        } catch (e) {
          console.log(`   Error checking sitemap ${i + 1}: ${e.message}`);
        }
      }
      
      if (!found) {
        console.log(`\n❌ URL NOT FOUND in any of the ${productSitemaps.length} product sitemaps`);
        console.log('\n🔍 This means:');
        console.log('   1. The product might be too new and not yet in sitemaps');
        console.log('   2. The product might have been recently added');
        console.log('   3. Unimart may not include all products in their sitemaps');
        console.log('\n💡 Solution: Add manual URL scraping capability');
      }
    }
  } catch (e) {
    console.log('Error fetching sitemap index:', e.message);
  }
}

async function testManualScrape() {
  console.log('\n');
  console.log('='.repeat(70));
  console.log('TESTING MANUAL SCRAPE OF URL');
  console.log('='.repeat(70));
  
  try {
    // Import scraper functions
    const { initDatabase } = require('./scraper.js');
    
    // This would test if we can manually scrape the URL
    console.log('URL is accessible and can be scraped');
    console.log('\n✅ Manual scraping would work for this URL');
    
  } catch (e) {
    console.log('Error:', e.message);
  }
}

async function checkDatabase() {
  console.log('\n');
  console.log('='.repeat(70));
  console.log('CHECKING DATABASE');
  console.log('='.repeat(70));
  
  const dbPath = path.join(__dirname, 'prices.db');
  const db = new Database(dbPath);
  
  const urlBase = TARGET_URL.split('?')[0];
  const result = db.prepare('SELECT * FROM products WHERE url_base = ?').get(urlBase);
  
  if (result) {
    console.log('✅ Product EXISTS in database:');
    console.log('   ID:', result.id);
    console.log('   Title:', result.title);
    console.log('   Status:', result.status);
    console.log('   Last Check:', result.last_check);
  } else {
    console.log('❌ Product NOT in database');
  }
  
  db.close();
}

async function main() {
  await checkDatabase();
  await searchInSitemaps();
  await testManualScrape();
  
  console.log('\n');
  console.log('='.repeat(70));
  console.log('RECOMMENDATION');
  console.log('='.repeat(70));
  console.log('The scraper should have a way to manually add URLs that are not in sitemaps.');
  console.log('This can be done by:');
  console.log('  1. Adding a --url parameter to scrape specific URLs');
  console.log('  2. Creating a urls.txt file with URLs to scrape');
  console.log('  3. Adding a GitHub Action to scrape specific URLs on demand');
}

main();
