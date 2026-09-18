/* Prueba el protocolo de señalización sin navegador:
   ntfy.js corre en un contexto falso con un "bus" en memoria. */
const fs = require('fs'), vm = require('vm');

const bus = [];                       // mensajes publicados
let suscriptor = null;

const ventana = {
  TIMBRE_CONFIG: { servidor: 'https://ntfy.test', topicSenales: 'sig' },
  crypto: require('crypto').webcrypto,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: b => Buffer.from(b, 'base64').toString('binary'),
  Blob, Response, TextEncoder, TextDecoder,
  CompressionStream, DecompressionStream,
  console,
  EventSource: class { constructor(){ suscriptor = this; } },
  fetch: async (url, opciones) => {
    const cuerpo = JSON.parse(opciones.body);
    const bytes = Buffer.byteLength(cuerpo.message || '', 'utf8');
    bus.push({ cuerpo, bytes });
    return { ok: true, json: async () => ({ id: 'm' + bus.length, time: Math.floor(Date.now()/1000) }) };
  }
};
ventana.window = ventana;
vm.createContext(ventana);
vm.runInContext(fs.readFileSync('C:/Users/gonza/TimbreQR/js/ntfy.js', 'utf8'), ventana);
const N = ventana.TimbreNtfy;

/* Un SDP realista y gordo: audio + video + todos los codecs + ICE con TURN */
function sdpDeMentira(kb) {
  let s = 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
  s += 'a=group:BUNDLE 0 1\r\na=msid-semantic: WMS stream\r\n';
  const linea = 'a=candidate:842163049 1 udp 1677729535 190.55.12.34 54321 typ srflx raddr 192.168.0.14 rport 54321 generation 0 ufrag Xk9m network-cost 999\r\n';
  while (Buffer.byteLength(s) < kb * 1024) {
    s += linea + 'a=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n';
  }
  return s;
}

(async () => {
  let fallos = 0;
  const esperado = new Map();

  for (const kb of [1, 3, 6, 12]) {
    bus.length = 0;
    const original = sdpDeMentira(kb);
    await N.enviarSenal({ tipo: 'offer', llamada: 'abc123', sesion: 's1' }, original);

    const max = Math.max(...bus.map(m => m.bytes));
    const ok4k = max < 4096;
    console.log(`SDP de ~${kb} KB  ->  ${bus.length} mensaje(s), el mayor ${max} bytes  ${ok4k ? 'OK' : 'EXCEDE 4096'}`);
    if (!ok4k) fallos++;

    /* reensamblado del otro lado */
    let recibido = null;
    const receptor = N.receptorDeSenales((tipo, id, texto, msg, quien) => {
      recibido = { tipo, id, texto, quien };
    });
    for (const m of bus) await receptor({ message: m.cuerpo.message, id: 'x', time: 0 });
    await new Promise(r => setTimeout(r, 20));

    const igual = recibido && recibido.texto === original;
    console.log(`   reensamblado idéntico: ${igual ? 'sí' : 'NO'} · tipo=${recibido && recibido.tipo} · sesion=${recibido && recibido.quien}`);
    if (!igual || recibido.tipo !== 'offer' || recibido.quien !== 's1') fallos++;
  }

  /* señal sin cuerpo (bye / no) */
  bus.length = 0;
  await N.enviarSenal({ tipo: 'bye', llamada: 'abc123', sesion: 's1' }, null);
  let bye = null;
  const r2 = N.receptorDeSenales((t, id, texto) => { bye = { t, texto }; });
  for (const m of bus) await r2({ message: m.cuerpo.message, id: 'y', time: 0 });
  await new Promise(r => setTimeout(r, 20));
  console.log(`bye sin cuerpo: tipo=${bye && bye.t} texto=${JSON.stringify(bye && bye.texto)}`);
  if (!bye || bye.t !== 'bye') fallos++;

  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
  process.exit(fallos ? 1 : 0);
})();
