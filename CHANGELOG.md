# Cambios Implementados - Sistema de Scraping Optimizado

## 🎯 Objetivo
Optimizar el uso de minutos de GitHub Actions dividiendo el scraping en dos modos: diario (rápido) y semanal (completo), con recuperación inteligente de 404s.

## 📋 Cambios Realizados

### 1. Base de Datos
**Archivo:** `scraper.js` (función `initDatabase`)

**Columnas agregadas a tabla `products`:**
- `status` (TEXT DEFAULT 'active'): Estado del producto ('active' o '404')
- `last_check` (DATETIME): Última verificación del producto

### 2. Script de Migración
**Archivo nuevo:** `migrate_db.js`

**Funcionalidad:**
- Agrega columnas `status` y `last_check` a productos existentes
- Marca productos con status='404' basándose en `scraping_failures`
- Marca productos restantes como 'active'
- Muestra estadísticas antes/después

**Resultados de la migración:**
```
Total products: 79,997
Active: 77,596
404: 2,401
```

### 3. Modos de Operación del Scraper
**Archivo modificado:** `scraper.js`

**Nuevos modos:**

#### Modo Daily (`--mode=daily`)
- Scrapea solo productos con `status != '404'`
- Límite: 5,000 productos/día
- Ordena por `last_scraped ASC` (prioriza más antiguos)
- **Uso:** Actualización diaria rápida de precios

#### Modo Weekly (`--mode=weekly`)
- Descarga todos los sitemaps (~76,000 URLs)
- Obtiene URLs marcadas como 404 de la DB
- **MERGE INTELIGENTE:** Usa Set para combinar sin duplicados
- Scrapea todo en una sola pasada
- **Logging especial:**
  ```
  URLs from sitemap: 76809
  URLs from 404s: 2401
  Total unique URLs after merge: 79210
  Duplicates removed: 0
  ```
- **Uso:** Descubrimiento semanal + recuperación de 404s

#### Modo Legacy (`--from-db`)
- Mantiene compatibilidad con versión anterior
- Scrapea todas las URLs de la DB sin filtro

### 4. Nuevas Funciones
**Archivo:** `scraper.js`

**`fetchUrlsFromDatabase(db, mode)`**
- Soporta modos 'daily' y 'from-db'
- Aplica filtros según el modo
- Retorna URLs listas para scrapear

**`fetch404Urls(db)`**
- Obtiene URLs con status='404' de `products`
- Obtiene URLs con status_code=404 de `scraping_failures`
- Merge y deduplicación automática
- Logging detallado

### 5. Actualización de Estado
**Archivo:** `scraper.js` (función principal)

**Productos exitosos:**
- Se marcan como `status='active'`
- Se actualiza `last_check` y `last_scraped`
- Se elimina registro de `scraping_failures` si existía

**Productos con error 404:**
- Se marca `status='404'` en tabla products
- Se actualiza `last_check`
- Se registra en `scraping_failures`

### 6. GitHub Actions Workflows

#### Workflow Diario
**Archivo nuevo:** `.github/workflows/daily-scraper.yml`

- **Schedule:** Lunes-Sábado a las 2 AM UTC
- **Cron:** `0 2 * * 1-6`
- **Comando:** `node scraper.js --mode=daily`
- **Duración estimada:** ~15 min/día

#### Workflow Semanal
**Archivo nuevo:** `.github/workflows/weekly-discovery.yml`

- **Schedule:** Domingos a las 3 AM UTC
- **Cron:** `0 3 * * 0`
- **Comando:** `node scraper.js --mode=weekly`
- **Duración estimada:** ~50 min/semana

#### Workflow Eliminado
**Archivo eliminado:** `.github/workflows/scrape.yml`
- Reemplazado por los workflows daily y weekly

### 7. Documentación
**Archivo modificado:** `README.md`

**Secciones agregadas/actualizadas:**
- Explicación de los dos workflows (daily y weekly)
- Ventajas de la arquitectura
- Modos de operación del scraper
- Instrucciones de migración de DB
- Schema actualizado con nuevas columnas
- Estimaciones de uso de minutos

## 📊 Beneficios

### Eficiencia de Minutos
**Antes:**
- Scrapeo diario completo: ~40 min/día × 30 = 1200 min/mes

**Ahora:**
- Daily (6 días/semana): ~15 min × 24 = 360 min/mes
- Weekly (1 día/semana): ~50 min × 4 = 200 min/mes
- **Total: ~560 min/mes (28% del límite)**
- **Ahorro: 640 min/mes (53% de reducción)**

### Optimización de Requests
- **No se recorre 2 veces:** Sitemap + 404s se procesan en una sola pasada
- **Deduplicación automática:** Si un 404 volvió al sitemap, solo se scrapea 1 vez
- **Priorización inteligente:** Daily solo actualiza productos activos

### Recuperación de 404s
- Productos marcados como 404 se revisan semanalmente
- Si vuelven a estar disponibles, se detectan automáticamente
- Estado se actualiza a 'active' al scrapear exitosamente

## 🚀 Uso

### Para ejecutar localmente:

**Migración (solo una vez):**
```bash
node migrate_db.js
```

**Daily scrape:**
```bash
node scraper.js --mode=daily
```

**Weekly scrape:**
```bash
node scraper.js --mode=weekly
```

### En GitHub Actions:
- Los workflows se ejecutan automáticamente según el schedule
- Se pueden triggear manualmente desde la pestaña "Actions"

## 📝 Notas Importantes

1. **Migración requerida:** Ejecutar `migrate_db.js` antes de usar los nuevos modos
2. **Compatibilidad:** El modo `--from-db` mantiene comportamiento anterior
3. **Logging mejorado:** Weekly mode muestra estadísticas del merge
4. **Estado automático:** Los productos se marcan como 404 o active automáticamente
