const fs = require('fs'), vm = require('vm');
const bus = [];
const ventana = {
  TIMBRE_CONFIG: { servidor: 'https://ntfy.test', topicSenales: 'sig' },
  crypto: require('crypto').webcrypto,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: b => Buffer.from(b, 'base64').toString('binary'),
  Blob, Response, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, console,
  EventSource: class {},
  fetch: async (u, o) => { const c = JSON.parse(o.body);
    bus.push({ c, bytes: Buffer.byteLength(o.body, 'utf8') });
    return { ok: true, json: async () => ({}) }; }
};
ventana.window = ventana;
vm.createContext(ventana);
vm.runInContext(fs.readFileSync('C:/Users/gonza/TimbreQR/js/ntfy.js', 'utf8'), ventana);
const N = ventana.TimbreNtfy;

(async () => {
  // texto incompresible: base64 de bytes aleatorios
  const original = require('crypto').randomBytes(12000).toString('base64'); // ~16 KB
  await N.enviarSenal({ tipo: 'offer', llamada: 'peor', sesion: 's9' }, original);
  const max = Math.max(...bus.map(m => m.bytes));
  console.log(`16 KB incompresibles -> ${bus.length} mensajes, POST más grande ${max} bytes`);

  let recibido = null;
  const receptor = N.receptorDeSenales((t, id, texto) => { recibido = texto; });
  // desordenados a propósito, para probar el rearmado
  const revuelto = bus.slice().reverse();
  for (const m of revuelto) await receptor({ message: m.c.message, id: 'z', time: 0 });
  await new Promise(r => setTimeout(r, 30));

  const ok = recibido === original;
  console.log(`rearmado desordenado idéntico: ${ok ? 'sí' : 'NO'}`);
  console.log(ok && max < 4096 ? '\nTODO OK' : '\nFALLO');
  process.exit(ok && max < 4096 ? 0 : 1);
})();
