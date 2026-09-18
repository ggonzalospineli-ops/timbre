/* Test de integración: visitante y residente en el mismo proceso,
   con WebRTC y ntfy simulados. Valida la coreografía completa. */
const fs = require('fs'), vm = require('vm');

/* ---------- bus ntfy compartido ---------- */
const suscriptores = [];   // { topic, entregar }
const publicados = [];

function publicarEnBus(topic, cuerpo) {
  const msg = { id: 'm' + (publicados.length + 1), time: Math.floor(Date.now() / 1000),
                message: cuerpo.message, title: cuerpo.title, priority: cuerpo.priority };
  publicados.push({ topic, cuerpo });
  suscriptores.filter(s => s.topic === topic)
              .forEach(s => setTimeout(() => s.entregar(msg), 1));
}

/* ---------- WebRTC simulado ---------- */
function hacerRTCPeerConnection(nombre) {
  return class RTCPeerConnection {
    constructor() {
      this.iceGatheringState = 'complete';
      this.connectionState = 'new';
      this.localDescription = null;
      this.currentRemoteDescription = null;
      this._pistas = [];
      this._oyentes = {};
    }
    addTrack(t) { this._pistas.push(t); return { track: t, replaceTrack: async () => {} }; }
    getSenders() { return this._pistas.map(t => ({ track: t, replaceTrack: async () => {} })); }
    addEventListener(e, f) { (this._oyentes[e] = this._oyentes[e] || []).push(f); }
    removeEventListener() {}
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\nSDP-OFERTA-DE-' + nombre + '\r\n' + 'a=x\r\n'.repeat(80) }; }
    async createAnswer() { return { type: 'answer', sdp: 'v=0\r\nSDP-RESPUESTA-DE-' + nombre + '\r\n' + 'a=y\r\n'.repeat(80) }; }
    async setLocalDescription(d) { this.localDescription = d; }
    async setRemoteDescription(d) {
      this.currentRemoteDescription = d;
      if (this.ontrack) setTimeout(() => this.ontrack({ streams: [{ id: 'remoto' }] }), 1);
    }
    close() { this.connectionState = 'closed'; }
  };
}

function pista(kind) { return { kind, enabled: true, stop() {} }; }
function stream() {
  const ps = [pista('audio'), pista('video')];
  return { getTracks: () => ps, getAudioTracks: () => ps.filter(p => p.kind === 'audio'),
           getVideoTracks: () => ps.filter(p => p.kind === 'video'),
           addTrack() {}, removeTrack() {} };
}

/* ---------- arma un "navegador" ---------- */
const CFG = {
  casa: 'Casa de prueba',
  servidor: 'https://ntfy.test',
  topicSenales: 'sig',
  destinos: [{ id: 'casa', nombre: 'Casa', detalle: '', topic: 'ring' }],
  llamada: { videoVisitante: true, videoResidente: true, segundosSinRespuesta: 45, segundosMaxLlamada: 300 },
  textos: { tituloPush: 'Timbre', cuerpoPush: 'Hay alguien', avisoPush: 'Pasé' }
};

function crearVentana(nombre) {
  const v = {
    TIMBRE_CONFIG: JSON.parse(JSON.stringify(CFG)),
    crypto: require('crypto').webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: b => Buffer.from(b, 'base64').toString('binary'),
    Blob, Response, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
    console, setTimeout, clearTimeout, setInterval, clearInterval, Set, Map, URL, URLSearchParams,
    Date, Promise, JSON, Object, Array, Error,
    RTCPeerConnection: hacerRTCPeerConnection(nombre),
    navigator: { mediaDevices: { getUserMedia: async () => stream() } },
    location: { href: 'https://ejemplo.github.io/timbre/index.html' },
    fetch: async (url, o) => {
      const cuerpo = JSON.parse(o.body);
      publicarEnBus(cuerpo.topic, cuerpo);
      return { ok: true, json: async () => ({ id: 'ok' }) };
    },
    EventSource: class {
      constructor(url) {
        const topic = decodeURIComponent(url.split('/').slice(-2)[0]);
        suscriptores.push({ topic, entregar: (m) => { if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ event: 'message' }, m)) }); } });
        setTimeout(() => { if (this.onopen) this.onopen(); }, 1);
      }
      close() {}
    }
  };
  v.window = v;
  vm.createContext(v);
  for (const f of ['js/ntfy.js', 'js/rtc.js', 'js/timbre.js']) {
    vm.runInContext(fs.readFileSync('C:/Users/gonza/TimbreQR/' + f, 'utf8'), v);
  }
  return v;
}


/* ---------- escenarios borde ---------- */
(async () => {
  const resultados = [];

  /* --- 1. el residente rechaza --- */
  {
    const vV = crearVentana('v1'), vR = crearVentana('r1');
    const visitante = vV.Timbre.visitante(), residente = vR.Timbre.residente();
    const eV = [];
    visitante.on('estado', e => eV.push(e.estado));
    residente.escuchar({ destinoId: 'casa' });
    await esperar(40);
    await visitante.tocar('casa');
    await esperar(150);
    await residente.rechazar();
    await esperar(150);
    resultados.push(['al rechazar, el visitante ve "rechazada"', eV.includes('rechazada')]);
    resultados.push(['el residente vuelve a escuchar tras rechazar', residente.estado === 'escuchando']);
  }

  /* --- 2. dos celulares escuchando, uno atiende --- */
  {
    const vV = crearVentana('v2'), vA = crearVentana('rA'), vB = crearVentana('rB');
    const visitante = vV.Timbre.visitante();
    const resA = vA.Timbre.residente(), resB = vB.Timbre.residente();
    let motivoB = null;
    resB.on('estado', e => { if (e.motivo) motivoB = e.motivo; });
    resA.escuchar({ destinoId: 'casa' });
    resB.escuchar({ destinoId: 'casa' });
    await esperar(40);
    await visitante.tocar('casa');
    await esperar(150);
    const ambosSonaron = resA.estado === 'entrante' && resB.estado === 'entrante';
    await resA.atender({ video: true });
    await esperar(200);
    resultados.push(['suenan los dos celulares', ambosSonaron]);
    resultados.push(['el que atiende queda en llamada', resA.estado === 'enLlamada']);
    resultados.push(['el otro deja de sonar', resB.estado === 'escuchando']);
    resultados.push(['y explica por qué', motivoB === 'atendidaEnOtroDispositivo']);
    resultados.push(['el visitante habla con el que atendió', visitante.estado === 'enLlamada']);
  }

  /* --- 3. nadie atiende: dejar aviso --- */
  {
    const vV = crearVentana('v3');
    const visitante = vV.Timbre.visitante();
    await visitante.tocar('casa');
    await esperar(150);
    const antes = publicados.length;
    await visitante.dejarAviso('Te dejé un paquete');
    await esperar(50);
    const aviso = publicados[publicados.length - 1];
    resultados.push(['el aviso sale por el topic del destino', aviso.topic === 'ring']);
    resultados.push(['con el texto que escribió el visitante', aviso.cuerpo.message === 'Te dejé un paquete']);
    resultados.push(['sin prioridad de llamada', aviso.cuerpo.priority === 4]);
  }

  let malos = 0;
  for (const [n, ok] of resultados) {
    console.log((ok ? '  OK   ' : '  FALLA') + '  ' + n);
    if (!ok) malos++;
  }
  console.log('\n' + (malos ? malos + ' FALLO(S)' : 'TODO OK — ' + resultados.length + ' verificaciones'));
  process.exit(malos ? 1 : 0);
})();

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
