# 🛒 Unimart Price Monitor

A price tracking application for Unimart.com, similar to CamelCamelCamel. This tool automatically tracks product prices from Unimart's sitemap and displays historical pricing data - all running serverless with GitHub Actions and client-side SQLite!

## ✨ Features

- 📊 **Daily Price Tracking**: Automated scraping via GitHub Actions
- 💾 **SQLite Database**: No backend server needed - all data stored in a single file
- 🌐 **Client-Side Viewing**: Browse price history entirely in your browser using sql.js
- 📈 **Price History Charts**: Visual representation of price trends over time
- 🔍 **Search Functionality**: Easily find products you're tracking
- 🚀 **Serverless**: No hosting costs - everything runs on GitHub

## 🏗️ Architecture

- **Scraper** (`scraper.js`): Fetches product data from Unimart sitemap
- **Database** (`database.js`): SQLite wrapper for storing prices
- **Frontend** (`index.html`): Browser-based viewer using sql.js
- **GitHub Actions** (`.github/workflows/scrape.yml`): Automated daily runs

## 🚀 Setup

### Prerequisites

- Node.js 18 or higher
- npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/andreileonsalas/unimartMonitor.git
cd unimartMonitor
```

2. Install dependencies:
```bash
npm install
```

3. Run the scraper manually (optional):
```bash
npm run scrape
```

This will create a `prices.db` file with the scraped data.

## 📅 Automated Scraping

The GitHub Actions workflow runs automatically every day at 2 AM UTC. You can also trigger it manually:

1. Go to the **Actions** tab in your GitHub repository
2. Select **Daily Price Scraper**
3. Click **Run workflow**

The workflow will:
- Install dependencies
- Run the scraper
- Commit the updated `prices.db` file back to the repository

## 🖥️ Viewing Price Data

### Option 1: View Online

1. Enable GitHub Pages in your repository settings
2. Set the source to the main/master branch, root folder
3. Visit `https://yourusername.github.io/unimartMonitor/`

### Option 2: View Locally

1. Open `index.html` in your browser
2. Click "Load from Repository" or upload the `prices.db` file manually

### Features of the Viewer

- **Product Cards**: View all tracked products with current prices
- **Search**: Filter products by name or URL
- **Price History**: Click any product to see historical pricing
- **Visual Charts**: See price trends over time
- **Statistics**: Overview of total products and price records

## 📁 Project Structure

```
unimartMonitor/
├── .github/
│   └── workflows/
│       └── scrape.yml          # GitHub Actions workflow
├── database.js                  # SQLite database wrapper
├── scraper.js                   # Product scraper
├── index.html                   # Web viewer interface
├── package.json                 # Node.js dependencies
├── prices.db                    # SQLite database (generated)
└── README.md                    # This file
```

## 🛠️ Configuration

### Adjusting Scrape Limit

By default, the scraper processes 50 products. To change this:

```bash
node scraper.js 100  # Scrape 100 products
```

Or modify the GitHub Actions workflow in `.github/workflows/scrape.yml`.

### Database Schema

**Products Table:**
- `id`: Primary key
- `url`: Product URL (unique)
- `name`: Product name
- `last_checked`: Last check timestamp

**Price History Table:**
- `id`: Primary key
- `product_id`: Foreign key to products
- `price`: Product price
- `currency`: Currency code (default: USD)
- `available`: Stock status
- `checked_at`: Check timestamp

## 🔧 Development

### Run Scraper Locally
```bash
npm run scrape
```

### Query Database Directly
```bash
sqlite3 prices.db "SELECT * FROM products LIMIT 10;"
```

## 📝 How It Works

1. **Sitemap Fetching**: The scraper downloads Unimart's sitemap.xml
2. **URL Extraction**: Parses XML to extract product URLs
3. **Product Scraping**: Visits each product page to extract:
   - Product name
   - Current price
   - Currency
   - Availability status
4. **Data Storage**: Saves to SQLite database with timestamp
5. **GitHub Actions**: Commits updated database daily
6. **Client Viewing**: Browser loads database using sql.js and displays data

## 🌟 Technologies Used

- **Node.js**: Runtime for scraper
- **axios**: HTTP client for fetching pages
- **cheerio**: HTML parsing
- **xml2js**: XML/sitemap parsing
- **better-sqlite3**: SQLite database for Node.js
- **sql.js**: SQLite in the browser
- **GitHub Actions**: Automation platform

## 📜 License

MIT License - feel free to use this project for your own price tracking needs!

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## ⚠️ Disclaimer

This tool is for educational and personal use only. Please respect Unimart's terms of service and robots.txt when scraping. Consider adding reasonable delays between requests and limit the scraping rate to avoid overwhelming their servers.
