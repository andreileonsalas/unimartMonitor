# Unimart Price Tracker - Implementation Summary

## Overview
This implementation provides a complete price tracking solution for unimart.com, similar to CamelCamelCamel, with the following key features:

## Architecture

### 1. Data Collection (scraper.js)
- **Sitemap Parsing**: Fetches product URLs from https://www.unimart.com/sitemap.xml
- **Price Scraping**: Extracts product titles and prices from product pages
- **Database Storage**: Saves historical data to SQLite database
- **Configuration**: Configurable limits and delays to be respectful to the website

### 2. Automation (GitHub Actions)
- **Daily Runs**: Scheduled to run at 2 AM UTC every day
- **Automated Commits**: Commits updated database back to repository
- **No Server Required**: Runs entirely on GitHub's infrastructure

### 3. Viewer (index.html + viewer.js)
- **Client-Side Database**: Uses sql.js to read SQLite in the browser
- **No Backend**: Everything runs in the user's browser
- **Price History**: Shows historical price trends for each product
- **Search**: Filter products by name or URL
- **Price Change Indicators**: Visual indicators for price increases/decreases

## Technical Details

### Database Schema
```sql
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
```

### Dependencies
- **Node.js Packages**:
  - axios (^1.12.0) - HTTP requests (updated to fix security vulnerabilities)
  - cheerio - HTML parsing
  - xml2js - Sitemap XML parsing
  - better-sqlite3 - SQLite for Node.js

- **Browser Libraries**:
  - sql.js - SQLite in WebAssembly for browser

### Security
- ✅ All dependencies scanned for vulnerabilities
- ✅ axios updated to v1.12.0 to fix DoS and SSRF vulnerabilities
- ✅ GitHub Actions workflow has explicit minimal permissions
- ✅ SQL.js loaded with Subresource Integrity (SRI) hash
- ✅ Type safety for price display to prevent errors

## Usage

### For Users
1. Visit the GitHub Pages URL (once deployed)
2. View all tracked products and their price history
3. Search for specific products
4. Click on products to see detailed price history

### For Developers
1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm test` to verify setup
4. Run `npm run scrape` to collect price data
5. Start a local web server to view the data

### Deployment
1. Enable GitHub Pages in repository settings
2. The GitHub Actions workflow runs daily automatically
3. Database is updated and committed after each run
4. Users see updated prices when they visit the page

## Customization

### Adjust Scraping Rate
In `scraper.js`:
```javascript
const MAX_PRODUCTS_PER_RUN = 100;  // Change this
const REQUEST_DELAY_MS = 1000;     // Change this
```

### Adjust Schedule
In `.github/workflows/scrape.yml`:
```yaml
schedule:
  - cron: '0 2 * * *'  # Change this (currently 2 AM UTC)
```

### Update Selectors
If product page structure changes, update the selectors in `scraper.js`:
```javascript
let title = $('h1').first().text().trim() || 
            $('meta[property="og:title"]').attr('content') ||
            $('title').text().trim();

let priceText = $('.price').first().text() ||
                $('[class*="price"]').first().text() ||
                ...
```

## Files

- `scraper.js` - Main scraper script
- `index.html` - Viewer UI
- `viewer.js` - Viewer logic
- `test.js` - Test suite
- `prices.db` - SQLite database (committed to repo)
- `.github/workflows/scrape.yml` - GitHub Actions workflow
- `package.json` - Node.js dependencies
- `README.md` - User documentation

## Testing

Run tests:
```bash
npm test
```

Tests verify:
- Database initialization
- Product/price saving functionality
- Database schema correctness

## Notes

- The scraper includes generic selectors that may need adjustment based on the actual structure of unimart.com
- The system is designed to be polite to the target website with configurable delays
- All data is stored in a single SQLite file for portability
- No authentication or backend is required
- The system works entirely within GitHub's free tier (Actions + Pages)
