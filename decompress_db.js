// Descomprime prices.db.gz a prices.db
const fs = require('fs');
const zlib = require('zlib');

if (fs.existsSync('prices.db.gz')) {
  const input = fs.readFileSync('prices.db.gz');
  const output = zlib.gunzipSync(input);
  fs.writeFileSync('prices.db', output);
  console.log('✅ prices.db descomprimido');
} else {
  console.log('⚠️  prices.db.gz no encontrado');
  process.exit(1);
}
