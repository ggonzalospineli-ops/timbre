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
    navigator: { mediaDevices: { getUserMedia: async () => stream() },
      sendBeacon: (url, cuerpo) => { const c = JSON.parse(cuerpo); publicarEnBus(c.topic, c); return true; } },
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


/* ---------- girar la cámara no debe abrir otro micrófono ---------- */
(async () => {
  const v = crearVentana('visitante');

  const pedidos = [];
  const pistasVivas = [];
  v.navigator.mediaDevices.getUserMedia = async (c) => {
    pedidos.push(c);
    const ps = [];
    if (c.audio) ps.push({ kind: 'audio', enabled: true, vivo: true, stop() { this.vivo = false; } });
    if (c.video) ps.push({ kind: 'video', enabled: true, vivo: true, stop() { this.vivo = false; } });
    ps.forEach(p => pistasVivas.push(p));
    return { getTracks: () => ps, getAudioTracks: () => ps.filter(p => p.kind === 'audio'),
             getVideoTracks: () => ps.filter(p => p.kind === 'video'),
             addTrack(p) { ps.push(p); }, removeTrack(p) { const i = ps.indexOf(p); if (i >= 0) ps.splice(i, 1); } };
  };

  const visitante = v.Timbre.visitante();
  const resultados = [];

  await visitante.tocar('casa');
  await esperar(120);
  resultados.push(['la llamada arranca pidiendo micrófono y cámara', pedidos.length === 1 && !!pedidos[0].audio && !!pedidos[0].video]);

  const camaraNueva = await visitante.cambiarCamara();
  await esperar(50);

  resultados.push(['girar la cámara pide medios de nuevo', pedidos.length === 2]);
  resultados.push(['pero SIN audio (no abre otro micrófono)', pedidos[1].audio === false]);
  resultados.push(['y pide la cámara trasera', pedidos[1].video.facingMode === 'environment' && camaraNueva === 'environment']);

  const micsVivos = pistasVivas.filter(p => p.kind === 'audio' && p.vivo).length;
  const camsVivas = pistasVivas.filter(p => p.kind === 'video' && p.vivo).length;
  resultados.push(['queda un solo micrófono abierto', micsVivos === 1]);
  resultados.push(['queda una sola cámara abierta', camsVivas === 1]);

  /* si no hay segunda cámara, el estado no queda invertido */
  v.navigator.mediaDevices.getUserMedia = async () => { throw new Error('OverconstrainedError'); };
  let tiro = false;
  try { await visitante.cambiarCamara(); } catch (_) { tiro = true; }
  resultados.push(['si no hay otra cámara, avisa el error', tiro]);
  const vuelta = pedidos.length;
  visitante.colgar();
  await esperar(50);
  const todosCortados = pistasVivas.every(p => !p.vivo);
  resultados.push(['al colgar se cierran cámara y micrófono', todosCortados]);

  let malos = 0;
  for (const [n, ok] of resultados) { console.log((ok ? '  OK   ' : '  FALLA') + '  ' + n); if (!ok) malos++; }
  console.log('\n' + (malos ? malos + ' FALLO(S)' : 'TODO OK — ' + resultados.length + ' verificaciones'));
  process.exit(malos ? 1 : 0);
})();

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
