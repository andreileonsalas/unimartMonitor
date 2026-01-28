# Manual URL Scraping - Quick Start Guide

## 🎯 Problem Solved
The Xiaomi Power Bank (https://www.unimart.com/products/xiaomi-power-bank-bateria-externa-alambrica-20000mah-t-pb2030mi) was missing from the database because Unimart hadn't included it in their sitemaps yet.

## ✅ Solution Implemented
Added manual URL scraping capability with three convenient methods:

---

## Method 1: Single URL (Command Line)
```bash
node scraper.js --mode=manual --url="https://www.unimart.com/products/your-product"
```

**Example:**
```bash
node scraper.js --mode=manual --url="https://www.unimart.com/products/xiaomi-power-bank-bateria-externa-alambrica-20000mah-t-pb2030mi"
```

---

## Method 2: Multiple URLs (File)
1. Create or edit `manual-urls.txt`:
```
# Manual URLs to scrape
https://www.unimart.com/products/product-1
https://www.unimart.com/products/product-2
```

2. Run the scraper:
```bash
node scraper.js --mode=manual --urls-file=manual-urls.txt
# OR
npm run scrape:manual
```

---

## Method 3: GitHub Actions (No Setup Required!) 🌟 EASIEST

### Step-by-Step:
1. **Go to GitHub repository**: https://github.com/andreileonsalas/unimartMonitor
2. **Click "Actions" tab** at the top
3. **Select "Manual URL Scraper"** from the left sidebar
4. **Click "Run workflow"** button (top right)
5. **Choose your option:**
   - **Option A**: Paste a single URL in the "url" field
   - **Option B**: Paste multiple URLs (one per line) in the "urls" field
6. **Click "Run workflow"** to start
7. **Wait 2-3 minutes** for completion
8. **Done!** The product is now in the database and will be tracked

### Example Input (Multiple URLs):
```
https://www.unimart.com/products/xiaomi-power-bank-bateria-externa-alambrica-20000mah-t-pb2030mi
https://www.unimart.com/products/another-product
https://www.unimart.com/products/yet-another-product
```

---

## 📊 Results
After running manual scraping, the Xiaomi Power Bank is now tracked:
- ✅ Product added to database
- ✅ 2 variants detected (Azul, Beige)
- ✅ Prices tracked: ₡15,500 and ₡20,200
- ✅ Stock information: 115 units (Azul), Out of stock (Beige)
- ✅ Will be updated daily by automatic scraper

---

## 🔍 Verify It Worked
You can verify the product is in the database by:
1. Checking the viewer at: https://andreileonsalas.github.io/unimartMonitor/
2. Searching for "Xiaomi Power Bank" or "PB2030MI"
3. You should see the product with price history

---

## 💡 When to Use Manual Scraping
- ✅ Product missing from Unimart sitemaps (newly added)
- ✅ Want to track a specific product immediately
- ✅ Product URL is known but not showing up in daily/weekly scrapes
- ✅ Emergency price check needed
- ✅ Testing the scraper with known products

---

## 📝 Notes
- Manual scraping respects the same rate limits as regular scraping
- Products scraped manually will be included in daily updates automatically
- The database is automatically optimized and compressed after manual scraping
- GitHub Actions method automatically commits changes to the repository
