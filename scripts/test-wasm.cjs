// WASM-Modul-Test: kompiliert WAT -> wasm und prüft gegen JS-Referenz
const wabt = require('wabt');
const fs = require('fs');
const TOL = 1e-8;
(async () => {
  const wabtMod = await wabt();
  const wat = fs.readFileSync('src/lib/wasm/bleDistance.wat', 'utf8');
  const mod = wabtMod.parseWat('bleDistance.wat', wat);
  mod.validate();
  const { buffer } = mod.toBinary({ log: false });
  fs.writeFileSync('public/wasm/ble_distance.wasm', Buffer.from(buffer));
  console.log('WASM kompiliert:', buffer.byteLength, 'Bytes');

  const e = (await WebAssembly.instantiate(buffer)).instance.exports;
  const ref = {
    cd: (rssi, tx) => Math.pow(10, (tx - rssi) / 20),
    env: (rssi, tx, n) => Math.pow(10, (tx - rssi) / (10 * n)),
    exact: (rssi, tx, rref, dref) => Math.abs(rssi - rref) < 0.001 ? dref :
      Math.pow(10, (tx - rssi) / 20) * (dref / Math.pow(10, (tx - rref) / 20)),
    learn: (rref, dref, rn, dn) => {
      if (dref <= 0 || dn <= 0 || Math.abs(rref - rn) < 0.001) return 2.0;
      const ratio = dn / dref; if (ratio <= 0) return 2.0;
      return Math.max(1.5, Math.min(6.0, (rref - rn) / (10 * Math.log10(ratio))));
    },
  };
  let maxErr = 0, fails = 0, checks = 0;
  const chk = (name, got, want, tol) => {
    checks++;
    const err = Math.abs(got - want) / Math.max(1, Math.abs(want));
    if (err > tol) { fails++; console.log('FAIL ' + name + ': got=' + got + ' want=' + want + ' relErr=' + err); }
    else maxErr = Math.max(maxErr, err);
  };
  for (const tx of [-80, -59, -40, -20, 0, 4]) {
    for (let rssi = -100; rssi <= -20; rssi += 7) {
      chk('cd(' + rssi + ',' + tx + ')', e.calculate_distance(rssi, tx), ref.cd(rssi, tx), TOL);
      for (const n of [1.5, 2.0, 2.7, 4.0, 6.0]) {
        chk('env(' + rssi + ',' + tx + ',' + n + ')', e.calculate_distance_env(rssi, tx, n), ref.env(rssi, tx, n), TOL);
      }
      chk('exact(' + rssi + ',' + tx + ',-59,2)', e.calc_exact_distance(rssi, tx, -59, 2.0), ref.exact(rssi, tx, -59, 2.0), TOL);
    }
  }
  chk('exact(same)', e.calc_exact_distance(-59, -59, -59, 2.0), 2.0, 0);
  chk('learn(valid)', e.learn_from_feedback(-59, 2.0, -70, 6.0), ref.learn(-59, 2.0, -70, 6.0), TOL);
  chk('get_learned_n after learn', e.get_learned_n(), ref.learn(-59, 2.0, -70, 6.0), TOL);
  chk('learn(invalid dref)', e.learn_from_feedback(-59, 0, -70, 6.0), 2.0, 0);
  chk('learn(clamp high)', e.learn_from_feedback(-40, 1.0, -80, 100.0), ref.learn(-40, 1.0, -80, 100.0), TOL);
  chk('get_learned_n clamped', e.get_learned_n(), ref.learn(-40, 1.0, -80, 100.0), TOL);
  chk('learn(clamp low)', e.learn_from_feedback(-40, 1.0, -80, 0.0001), ref.learn(-40, 1.0, -80, 0.0001), TOL);
  chk('get_learned_n low', e.get_learned_n(), ref.learn(-40, 1.0, -80, 0.0001), TOL);
  const mem = new Float64Array(e.memory.buffer);
  const inp = [-65, -70, -75, -80, -85];
  const inPtr = 0, outPtr = 128;
  mem.set(inp, inPtr / 8);
  e.batch_distances(inPtr, inp.length, -59, outPtr);
  for (let i = 0; i < inp.length; i++) {
    chk('batch[' + i + ']', mem[outPtr / 8 + i], ref.cd(inp[i], -59), TOL);
  }
  console.log(checks + ' Checks, ' + fails + ' Fehler, max. rel. Fehler: ' + maxErr.toExponential(3));
  process.exit(fails ? 1 : 0);
})();
