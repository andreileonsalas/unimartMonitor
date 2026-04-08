// Web Worker para procesar la base de datos en segundo plano
// Este worker maneja las queries SQL sin bloquear la UI

let db;

// Escuchar mensajes del thread principal
self.onmessage = async function(e) {
  const { type, data } = e.data;

  try {
    switch(type) {
    case 'INIT_DB':
      // Validar que tengamos el buffer
      if (!data || !data.buffer) {
        throw new Error('No se recibió el buffer de la base de datos');
      }
      
      // Inicializar SQL.js
      importScripts('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js');
      const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
      });

      // Cargar la base de datos desde ArrayBuffer
      db = new SQL.Database(new Uint8Array(data.buffer));
      self.postMessage({ type: 'DB_READY' });
      break;

    case 'QUERY_STATS': {
      // Detectar qué tabla de precios está disponible
      const tableInfo = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tableInfo.length > 0 ? tableInfo[0].values.map(r => r[0]) : [];
      const hasPriceRanges = tableNames.includes('price_ranges');
      const hasPrices = tableNames.includes('prices');

      let statsQuery;
      if (hasPriceRanges) {
        statsQuery = db.exec(`
          SELECT 
            (SELECT COUNT(*) FROM products) as total_products,
            (SELECT COUNT(*) FROM variants) as total_variants,
            (SELECT COUNT(*) FROM price_ranges) as total_ranges,
            (SELECT MAX(start_date) FROM price_ranges) as last_update
        `);
      } else if (hasPrices) {
        statsQuery = db.exec(`
          SELECT 
            (SELECT COUNT(*) FROM products) as total_products,
            (SELECT COUNT(*) FROM variants) as total_variants,
            (SELECT COUNT(*) FROM prices) as total_prices,
            (SELECT MAX(scraped_at) FROM prices) as last_update
        `);
      } else {
        statsQuery = db.exec(`
          SELECT 
            (SELECT COUNT(*) FROM products) as total_products,
            (SELECT COUNT(*) FROM variants) as total_variants,
            0 as total_records,
            NULL as last_update
        `);
      }
      self.postMessage({ 
        type: 'STATS_RESULT', 
        data: statsQuery[0].values[0] 
      });
      break;
    }

    case 'QUERY_VARIANTS': {
      // Detectar si la columna stock existe
      let hasStockColumn = false;
      try {
        const tableInfo = db.exec("PRAGMA table_info(variants)");
        if (tableInfo[0] && tableInfo[0].values) {
          hasStockColumn = tableInfo[0].values.some(row => row[1] === 'stock');
        }
      } catch (e) {
        hasStockColumn = false;
      }

      // Detectar qué tabla de precios está disponible
      const tableInfo = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tableInfo.length > 0 ? tableInfo[0].values.map(r => r[0]) : [];
      const hasPriceRanges = tableNames.includes('price_ranges');
      
      // Query condicional basado en si existe la columna stock
      const selectClause = hasStockColumn ? 
        `SELECT v.id, v.url, v.sku, v.variant_label, v.variant_value, v.stock, p.title` :
        `SELECT v.id, v.url, v.sku, v.variant_label, v.variant_value, NULL as stock, p.title`;
      
      const variantsQuery = db.exec(`
        ${selectClause}
        FROM variants v
        JOIN products p ON v.product_id = p.id
      `);

      const variantIds = variantsQuery[0].values.map(row => row[0]).join(',');

      // Query de precios actuales (último rango abierto, o último precio si schema antiguo)
      let pricesMap = {};
      if (variantIds.length > 0) {
        if (hasPriceRanges) {
          // Schema nuevo: usar rango con end_date IS NULL (precio actual)
          const pricesQuery = db.exec(`
            SELECT variant_id, price, currency, start_date
            FROM price_ranges
            WHERE variant_id IN (${variantIds}) AND end_date IS NULL
          `);
          if (pricesQuery.length > 0) {
            pricesQuery[0].values.forEach(row => {
              pricesMap[row[0]] = {
                price: row[1],
                currency: row[2],
                scraped_at: row[3]
              };
            });
          }
          // Para variantes sin rango abierto, usar el más reciente
          const missingIds = variantsQuery[0].values
            .map(r => r[0])
            .filter(id => !pricesMap[id])
            .join(',');
          if (missingIds.length > 0) {
            const fallbackQuery = db.exec(`
              SELECT pr.variant_id, pr.price, pr.currency, pr.start_date
              FROM price_ranges pr
              INNER JOIN (
                SELECT variant_id, MAX(start_date) as max_date
                FROM price_ranges
                WHERE variant_id IN (${missingIds})
                GROUP BY variant_id
              ) latest ON pr.variant_id = latest.variant_id AND pr.start_date = latest.max_date
            `);
            if (fallbackQuery.length > 0) {
              fallbackQuery[0].values.forEach(row => {
                pricesMap[row[0]] = { price: row[1], currency: row[2], scraped_at: row[3] };
              });
            }
          }
        } else {
          // Schema antiguo (archivo): usar último precio por fecha
          const pricesQuery = db.exec(`
            SELECT 
              p1.variant_id,
              p1.price,
              p1.currency,
              p1.scraped_at
            FROM prices p1
            INNER JOIN (
              SELECT variant_id, MAX(scraped_at) as max_date
              FROM prices
              WHERE variant_id IN (${variantIds})
              GROUP BY variant_id
            ) p2 ON p1.variant_id = p2.variant_id AND p1.scraped_at = p2.max_date
          `);
          if (pricesQuery.length > 0) {
            pricesQuery[0].values.forEach(row => {
              pricesMap[row[0]] = {
                price: row[1],
                currency: row[2],
                scraped_at: row[3]
              };
            });
          }
        }
      }

      // Calcular el precio más bajo histórico para cada variante
      const minPricesMap = {};
      if (variantIds.length > 0) {
        const minQuery = hasPriceRanges
          ? `SELECT variant_id, MIN(price) as min_price FROM price_ranges WHERE variant_id IN (${variantIds}) GROUP BY variant_id`
          : `SELECT variant_id, MIN(price) as min_price FROM prices WHERE variant_id IN (${variantIds}) GROUP BY variant_id`;
        const minPricesQuery = db.exec(minQuery);
        if (minPricesQuery.length > 0) {
          minPricesQuery[0].values.forEach(row => {
            minPricesMap[row[0]] = row[1];
          });
        }
      }

      // Enviar resultados en chunks para no bloquear
      const CHUNK_SIZE = 5000;
      const variants = variantsQuery[0].values;

      for (let i = 0; i < variants.length; i += CHUNK_SIZE) {
        const chunk = variants.slice(i, i + CHUNK_SIZE).map(row => {
          const variantId = row[0];
          const priceData = pricesMap[variantId] || {};
          const minPrice = minPricesMap[variantId] || null;
          return {
            id: variantId,
            url: row[1],
            sku: row[2],
            label: row[3],
            value: row[4],
            stock: row[5],
            title: row[6],
            currentPrice: priceData.price || null,
            currency: priceData.currency || null,
            lastScraped: priceData.scraped_at || null,
            minPrice: minPrice
          };
        });

        self.postMessage({
          type: 'VARIANTS_CHUNK',
          data: {
            chunk,
            progress: Math.round(((i + chunk.length) / variants.length) * 100),
            isLast: i + CHUNK_SIZE >= variants.length
          }
        });
      }
      break;
    }

    case 'QUERY_PRICE_HISTORY': {
      // Detectar qué tabla está disponible
      const tableInfo = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tableInfo.length > 0 ? tableInfo[0].values.map(r => r[0]) : [];
      const hasPriceRanges = tableNames.includes('price_ranges');

      let history = [];
      if (hasPriceRanges) {
        // Schema nuevo: devolver rangos [price, currency, start_date, end_date]
        const historyQuery = db.exec(`
          SELECT price, currency, start_date, end_date
          FROM price_ranges
          WHERE variant_id = ${data.variantId}
          ORDER BY start_date ASC
        `);
        history = historyQuery.length > 0 ? historyQuery[0].values : [];
      } else {
        // Schema antiguo (archivo): devolver registros diarios como [price, currency, scraped_at, null]
        const historyQuery = db.exec(`
          SELECT price, currency, scraped_at, NULL
          FROM prices
          WHERE variant_id = ${data.variantId}
          ORDER BY scraped_at ASC
        `);
        history = historyQuery.length > 0 ? historyQuery[0].values : [];
      }

      self.postMessage({
        type: 'PRICE_HISTORY_RESULT',
        data: {
          variantId: data.variantId,
          history,
          isRangeSchema: hasPriceRanges
        }
      });
      break;
    }

    default:
      throw new Error('Unknown message type: ' + type);
    }
  } catch (error) {
    self.postMessage({ 
      type: 'ERROR', 
      error: error.message 
    });
  }
};
