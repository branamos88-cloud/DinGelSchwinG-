// Kompiliert src/lib/wasm/bleDistance.wat → public/wasm/ble_distance.wasm
const wabt = require('wabt');
const fs = require('fs');
const path = require('path');

(async () => {
  const wabtMod = await wabt();
  const watPath = path.join(__dirname, '../src/lib/wasm/bleDistance.wat');
  const outPath = path.join(__dirname, '../public/wasm/ble_distance.wasm');
  const wat = fs.readFileSync(watPath, 'utf8');
  const mod = wabtMod.parseWat(watPath, wat);
  mod.validate();
  const { buffer } = mod.toBinary({ log: false });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(buffer));
  console.log(`WASM kompiliert: ${buffer.byteLength} Bytes → ${outPath}`);
})();
