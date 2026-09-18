/* Reintento de timbrazo y foto del visitante cuando no atienden.
   Todo simulado: ni red, ni cámara, ni navegador. */
const fs = require('fs'), vm = require('vm');

let publicados = [];   // {tipo:'json'|'archivo', topic, campos, bytes}

function crearVentana(opcionesLlamada) {
  const v = {
    TIMBRE_CONFIG: {
      casa: 'Casa', servidor: 'https://ntfy.test', topicSenales: 'sig',
      destinos: [{ id: 'casa', nombre: 'Casa', detalle: '', topic: 'ring' }],
      llamada: Object.assign({
        videoVisitante: true, videoResidente: true,
        segundosSinRespuesta: 0.6, segundosMaxLlamada: 300,
        segundosReintento: 0.2, fotoSiNoAtienden: true
      }, opcionesLlamada || {}),
      textos: { tituloPush: 'Timbre', cuerpoPush: 'Hay alguien', avisoPush: 'Pasé' },
      ubicacion: { activa: false }
    },
    crypto: require('crypto').webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: b => Buffer.from(b, 'base64').toString('binary'),
    Blob, Response, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Set, Map, URL, URLSearchParams, Date, Promise, JSON, Object, Array, Error, Math,
    RTCPeerConnection: class {
      constructor() { this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.localDescription = null; this.currentRemoteDescription = null; }
      addTrack() {} getSenders() { return []; }
      addEventListener() {} removeEventListener() {}
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\nOFERTA\r\n' }; }
      async setLocalDescription(d) { this.localDescription = d; }
      async setRemoteDescription() {}
      close() {}
    },
    navigator: {
      mediaDevices: { getUserMedia: async () => {
        const ps = [{ kind: 'audio', enabled: true, stop() {} }, { kind: 'video', enabled: true, stop() {} }];
        return { getTracks: () => ps, getAudioTracks: () => ps.filter(p => p.kind === 'audio'),
                 getVideoTracks: () => ps.filter(p => p.kind === 'video'), addTrack() {}, removeTrack() {} };
      } },
      sendBeacon: () => true
    },
    location: { href: 'https://ejemplo.github.io/timbre/index.html' },
    fetch: async (url, o) => {
      if (o && o.method === 'PUT') {
        const u = new URL(url);
        const campos = {};
        u.searchParams.forEach((val, k) => { campos[k] = val; });
        publicados.push({ tipo: 'archivo', topic: decodeURIComponent(u.pathname.slice(1)),
                          campos, bytes: (o.body && o.body.size) || 0 });
      } else {
        const c = JSON.parse(o.body);
        publicados.push({ tipo: 'json', topic: c.topic, campos: c });
      }
      return { ok: true, json: async () => ({ id: 'x' }) };
    },
    EventSource: class { constructor() { setTimeout(() => this.onopen && this.onopen(), 1); } close() {} }
  };
  v.window = v;
  vm.createContext(v);
  for (const f of ['js/ntfy.js', 'js/rtc.js', 'js/geo.js', 'js/timbre.js']) {
    vm.runInContext(fs.readFileSync('C:/Users/gonza/TimbreQR/' + f, 'utf8'), v);
  }
  /* la captura real necesita canvas y video: se simula el resultado */
  v.TimbreRTC.capturarFoto = async () => new Blob([Buffer.alloc(4000)], { type: 'image/jpeg' });
  return v;
}

const esperar = ms => new Promise(r => setTimeout(r, ms));
const timbrazos = () => publicados.filter(p => p.topic === 'ring' && p.tipo === 'json' && p.campos.priority === 5);
const fotos = () => publicados.filter(p => p.tipo === 'archivo');

(async () => {
  const res = [];

  /* ---------- 1. nadie atiende: segundo timbrazo y foto ---------- */
  {
    publicados = [];
    const v = crearVentana();
    const t = v.Timbre.visitante();
    let ultimo = null, fotoAvisada = false;
    t.on('estado', e => { ultimo = e; });
    t.on('fotoEnviada', () => { fotoAvisada = true; });

    await t.tocar('casa');
    await esperar(120);
    res.push(['el primer timbrazo sale enseguida', timbrazos().length === 1]);

    await esperar(200);
    res.push(['a los 20 s (aquí 0,2) sale el recordatorio', timbrazos().length === 2]);
    res.push(['el recordatorio dice que siguen esperando', timbrazos()[1].campos.message.includes('Siguen esperando')]);
    res.push(['y abre el panel igual que el primero', !!timbrazos()[1].campos.click]);

    await esperar(500);
    res.push(['termina en "no atendió nadie"', ultimo.estado === 'sinRespuesta']);
    res.push(['avisa que hay foto', ultimo.hayFoto === true]);
    await esperar(60);
    res.push(['se mandó la foto', fotos().length === 1]);
    const f = fotos()[0];
    res.push(['va al topic del destino', f.topic === 'ring']);
    res.push(['como archivo .jpg', f.campos.filename === 'visita.jpg']);
    res.push(['con un texto que se entiende', f.campos.message.includes('no llegaste a atender')]);
    res.push(['sin prioridad de llamada', f.campos.priority === '4']);
    res.push(['con los bytes de la imagen', f.bytes === 4000]);
    res.push(['se emitió el evento fotoEnviada', fotoAvisada]);
  }

  /* ---------- 2. si atienden, no hay recordatorio ni foto ---------- */
  {
    publicados = [];
    const v = crearVentana();
    const t = v.Timbre.visitante();
    await t.tocar('casa');
    await esperar(100);
    t.colgar();                 // equivale a que la llamada terminó
    await esperar(400);
    res.push(['si la llamada ya terminó no sale recordatorio', timbrazos().length === 1]);
    res.push(['ni se manda ninguna foto', fotos().length === 0]);
  }

  /* ---------- 3. el aviso escrito se manda con la foto ---------- */
  {
    publicados = [];
    const v = crearVentana();
    const t = v.Timbre.visitante();
    await t.tocar('casa');
    await esperar(750);          // deja que no atiendan
    publicados = [];             // se limpia para mirar solo el aviso
    await t.dejarAviso('Te dejé un paquete');
    await esperar(60);
    res.push(['el aviso escrito viaja junto con la foto', fotos().length === 1]);
    res.push(['conserva el texto del visitante', fotos()[0].campos.message === 'Te dejé un paquete']);
    res.push(['y no se manda además un mensaje suelto', publicados.filter(p => p.tipo === 'json' && p.topic === 'ring').length === 0]);
  }

  /* ---------- 4. con la foto desactivada ---------- */
  {
    publicados = [];
    const v = crearVentana({ fotoSiNoAtienden: false });
    const t = v.Timbre.visitante();
    let ultimo = null;
    t.on('estado', e => { ultimo = e; });
    await t.tocar('casa');
    await esperar(750);
    res.push(['sin la opción activa no se saca foto', fotos().length === 0]);
    res.push(['y no se promete una foto que no existe', ultimo.hayFoto === false]);
    await t.dejarAviso('Hola');
    await esperar(60);
    res.push(['el aviso escrito sigue funcionando solo', publicados.some(p => p.tipo === 'json' && p.campos.message === 'Hola')]);
  }

  /* ---------- 5. sin reintento configurado ---------- */
  {
    publicados = [];
    const v = crearVentana({ segundosReintento: 0 });
    const t = v.Timbre.visitante();
    await t.tocar('casa');
    await esperar(400);
    res.push(['con segundosReintento en 0 no hay recordatorio', timbrazos().length === 1]);
  }

  /* ---------- 6. si falla el envío de la foto, no rompe nada ---------- */
  {
    publicados = [];
    const v = crearVentana();
    const original = v.fetch;
    const t = v.Timbre.visitante();
    let ultimo = null;
    t.on('estado', e => { ultimo = e; });
    await t.tocar('casa');
    await esperar(100);
    v.fetch = async (url, o) => {
      if (o && o.method === 'PUT') throw new Error('sin red');
      return original(url, o);
    };
    await esperar(700);
    res.push(['si la foto no se puede mandar, el visitante igual ve la pantalla final', ultimo.estado === 'sinRespuesta']);
  }

  let malos = 0;
  for (const [n, ok] of res) { console.log((ok ? '  OK   ' : '  FALLA') + '  ' + n); if (!ok) malos++; }
  console.log('\n' + (malos ? malos + ' FALLO(S)' : 'TODO OK — ' + res.length + ' verificaciones'));
  process.exit(malos ? 1 : 0);
})();
