const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const PriceDatabase = require('./database');

class UnimartScraper {
  constructor() {
    this.sitemapUrl = 'https://www.unimart.com/sitemap.xml';
    this.db = new PriceDatabase('./prices.db');
    this.baseUrl = 'https://www.unimart.com';
  }

  async fetchSitemap() {
    try {
      console.log('Fetching sitemap...');
      const response = await axios.get(this.sitemapUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; UnimartMonitor/1.0)'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching sitemap:', error.message);
      return null;
    }
  }

  async parseSitemap(xml) {
    try {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xml);
      
      let urls = [];
      
      // Handle sitemap index (contains multiple sitemaps)
      if (result.sitemapindex) {
        console.log('Found sitemap index, fetching individual sitemaps...');
        const sitemaps = result.sitemapindex.sitemap || [];
        
        for (const sitemap of sitemaps) {
          const sitemapUrl = sitemap.loc[0];
          console.log(`Fetching sitemap: ${sitemapUrl}`);
          
          try {
            const response = await axios.get(sitemapUrl, {
              timeout: 30000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; UnimartMonitor/1.0)'
              }
            });
            
            const subResult = await parser.parseStringPromise(response.data);
            if (subResult.urlset && subResult.urlset.url) {
              const subUrls = subResult.urlset.url.map(u => u.loc[0]);
              urls = urls.concat(subUrls);
            }
          } catch (error) {
            console.error(`Error fetching sub-sitemap ${sitemapUrl}:`, error.message);
          }
        }
      } 
      // Handle regular sitemap
      else if (result.urlset && result.urlset.url) {
        urls = result.urlset.url.map(u => u.loc[0]);
      }
      
      console.log(`Total URLs found: ${urls.length}`);
      return urls;
    } catch (error) {
      console.error('Error parsing sitemap:', error.message);
      return [];
    }
  }

  filterProductUrls(urls) {
    // Filter to only include product pages
    // Unimart product URLs typically contain /p/, /product/, or similar patterns
    const productUrls = urls.filter(url => {
      const urlLower = url.toLowerCase();
      return urlLower.includes('/p/') || 
             urlLower.includes('/product/') ||
             urlLower.includes('/products/') ||
             (urlLower.includes('/') && !urlLower.includes('/category') && 
              !urlLower.includes('/blog') && !urlLower.includes('/about'));
    });
    
    console.log(`Filtered to ${productUrls.length} potential product URLs`);
    return productUrls;
  }

  async scrapeProductPage(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; UnimartMonitor/1.0)'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Try multiple common selectors for product name
      let name = $('h1.product-title').first().text().trim() ||
                 $('h1[itemprop="name"]').first().text().trim() ||
                 $('h1.product-name').first().text().trim() ||
                 $('h1').first().text().trim() ||
                 $('title').text().trim();
      
      // Try multiple common selectors for price
      let priceText = $('span.price').first().text().trim() ||
                      $('[itemprop="price"]').first().text().trim() ||
                      $('.product-price').first().text().trim() ||
                      $('meta[property="product:price:amount"]').attr('content') ||
                      '';
      
      // Extract numeric price
      let price = null;
      let currency = 'USD';
      
      if (priceText) {
        // Remove currency symbols and extract number
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        if (priceMatch) {
          price = parseFloat(priceMatch[0].replace(/,/g, ''));
        }
        
        // Try to detect currency
        if (priceText.includes('$')) currency = 'USD';
        else if (priceText.includes('€')) currency = 'EUR';
        else if (priceText.includes('£')) currency = 'GBP';
      }
      
      // Check availability
      const available = !($('.out-of-stock').length > 0 || 
                         $('[data-stock="out"]').length > 0 ||
                         response.data.toLowerCase().includes('out of stock'));
      
      return {
        name: name || 'Unknown Product',
        price,
        currency,
        available
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
      return null;
    }
  }

  async scrapeProducts(maxProducts = 50) {
    console.log('Starting scrape process...');
    
    const sitemapXml = await this.fetchSitemap();
    if (!sitemapXml) {
      console.log('Failed to fetch sitemap');
      return;
    }
    
    const allUrls = await this.parseSitemap(sitemapXml);
    const productUrls = this.filterProductUrls(allUrls);
    
    // Limit the number of products to scrape
    const urlsToScrape = productUrls.slice(0, maxProducts);
    console.log(`Scraping ${urlsToScrape.length} products...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < urlsToScrape.length; i++) {
      const url = urlsToScrape[i];
      console.log(`[${i + 1}/${urlsToScrape.length}] Scraping: ${url}`);
      
      const productData = await this.scrapeProductPage(url);
      
      if (productData) {
        try {
          const productId = this.db.addOrUpdateProduct(url, productData.name);
          this.db.addPriceRecord(
            productId, 
            productData.price, 
            productData.currency, 
            productData.available
          );
          successCount++;
          console.log(`  ✓ ${productData.name} - $${productData.price}`);
        } catch (error) {
          console.error(`  ✗ Database error: ${error.message}`);
          failCount++;
        }
      } else {
        failCount++;
        console.log(`  ✗ Failed to scrape`);
      }
      
      // Add a small delay to be respectful to the server
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\nScraping complete!`);
    console.log(`Success: ${successCount}, Failed: ${failCount}`);
  }

  close() {
    this.db.close();
  }
}

// If run directly
if (require.main === module) {
  const scraper = new UnimartScraper();
  
  // Get max products from command line argument, default to 50
  const maxProducts = parseInt(process.argv[2]) || 50;
  
  scraper.scrapeProducts(maxProducts)
    .then(() => {
      console.log('Scraper finished');
      scraper.close();
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraper error:', error);
      scraper.close();
      process.exit(1);
    });
}

module.exports = UnimartScraper;
