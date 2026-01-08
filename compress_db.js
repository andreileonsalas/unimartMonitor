// Comprime prices.db a prices.db.gz para GitHub Pages
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const input = path.join(__dirname, 'prices.db');
const output = path.join(__dirname, 'prices.db.gz');

const sizeBefore = fs.statSync(input).size / (1024 * 1024);
console.log(`Tamaño original: ${sizeBefore.toFixed(2)} MB`);
console.log('Comprimiendo...');

const gzip = zlib.createGzip({ level: 9 }); // Máxima compresión
const source = fs.createReadStream(input);
const destination = fs.createWriteStream(output);

source.pipe(gzip).pipe(destination);

destination.on('finish', () => {
  const sizeAfter = fs.statSync(output).size / (1024 * 1024);
  const percentage = ((sizeBefore - sizeAfter) / sizeBefore * 100).toFixed(1);
  
  console.log('✓ Comprimido exitosamente');
  console.log(`Tamaño comprimido: ${sizeAfter.toFixed(2)} MB`);
  console.log(`Reducción: ${percentage}%`);
  console.log('\nSubí prices.db.gz a GitHub (ignorá prices.db sin comprimir)');
});
