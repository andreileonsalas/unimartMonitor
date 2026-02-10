# Instrucciones para Desarrollo - Unimart Monitor

## 🧪 Testing Obligatorio

**SIEMPRE** ejecutar `npm run test:all` después de cualquier cambio de código para evitar quebrar la funcionalidad esperada.

```bash
npm run test:all  # Ejecuta test.js + test-e2e-viewer.js
```

**IMPORTANTE**: NO cambiar pruebas para que pasen. Solo modificar tests si la lógica fundamental del código cambia intencionalmente.

## 📝 Scripts Temporales

**SIEMPRE** usar `temp.js` para ejecutar código de prueba o consultas en lugar de:
- ❌ `node -e "código inline"` (problemas de sintaxis en PowerShell)
- ❌ Comandos npm inline
- ❌ Comandos sqlite3 directos

**Razón**: `temp.js` garantiza sintaxis correcta y evita pérdida de tokens por errores de comillas/escape.

```javascript
// Ejemplo: temp.js para consultar DB
const db = require('better-sqlite3')('prices.db');
console.log(db.prepare('SELECT COUNT(*) FROM products').get());
db.close();
```

## 💾 Gestión de Base de Datos

### Antes de trabajar con la base:

```bash
git pull                    # 1. Obtener última versión
node decompress_db.js       # 2. Descomprimir prices.db.gz
node temp.js                # 3. Ejecutar consultas/tests
```

### Después de terminar pruebas:

```bash
Remove-Item prices.db -ErrorAction SilentlyContinue
```

**Razón**: Previene trabajar con datos antiguos en futuros tests.

## 📚 Documentación

**NO crear archivos `.md` innecesarios**. Las reglas son:
- ✅ Actualizar `README.md` si hay cambios de flujo o lógica de código
- ✅ Actualizar documentos existentes (`IMPLEMENTATION.md`, `MIGRATION_GUIDE.md`)
- ❌ NO crear nuevos `.md` explicando cada cambio
- ❌ NO crear documentos de resumen por cada fix

## 🔄 Workflow de Desarrollo

1. **Antes de cambios**:
   ```bash
   git pull
   node decompress_db.js
   ```

2. **Durante desarrollo**:
   ```bash
   # Usar temp.js para pruebas
   node temp.js
   ```

3. **Después de cambios**:
   ```bash
   npm run test:all              # ¡Obligatorio!
   git add <archivos-necesarios>
   git commit -m "..."
   git push
   Remove-Item prices.db -ErrorAction SilentlyContinue
   ```

## 📦 Commits

**Solo commitear archivos necesarios**. Nunca incluir:
- ❌ Archivos de debug (`check_*.js`, `analyze_*.js`, `investigate_*.js`)
- ❌ `temp.js` o scripts temporales
- ❌ `prices.db` descomprimido (solo `prices.db.gz`)
- ❌ Backups (`prices_backup_*.db`, `prices.backup.*.db`)

## 🏗️ Arquitectura del Proyecto

### Base de Datos (SQLite)
- `products` - Productos base (1 por URL)
- `variants` - Variantes de color/tamaño (N por producto)
- `prices` - Historial de precios (N por variante)

### Restricciones Importantes
- `products.url_base` - UNIQUE (sin parámetros)
- `variants.url` - UNIQUE (con parámetros ?Color=X)
- Las variantes DEBEN tener URLs únicas con parámetros

### Scripts Principales
- `scraper.js` - Scraper con 4 modos (daily, weekly, test, manual)
- `merge_db.js` - Merge incremental (NUNCA sobrescribe datos existentes)
- `compress_db.js` / `decompress_db.js` - Compresión gzip

## ⚠️ Reglas Críticas

1. **Weekly scrape debe descomprimir DB existente antes de merge** para evitar pérdida de datos
2. **Nunca borrar productos** aunque no estén en sitemap (pueden volver)
3. **Construir URLs de variantes con parámetros** antes de verificar existencia
4. **Tests deben pasar siempre** antes de push (husky hook)
