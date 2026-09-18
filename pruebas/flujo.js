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

/* ---------- la prueba ---------- */
(async () => {
  const vVisitante = crearVentana('visitante');
  const vResidente = crearVentana('residente');

  const visitante = vVisitante.Timbre.visitante();
  const residente = vResidente.Timbre.residente();

  const estadosV = [], estadosR = [];
  visitante.on('estado', e => estadosV.push(e.estado));
  residente.on('estado', e => estadosR.push(e.estado));

  let streamRemotoV = false, streamRemotoR = false, entranteVisto = null;
  visitante.on('streamRemoto', () => { streamRemotoV = true; });
  residente.on('streamRemoto', () => { streamRemotoR = true; });
  residente.on('entrante', ll => { entranteVisto = ll; });

  residente.escuchar({ llamadaId: null, destinoId: 'casa' });
  await esperar(50);

  await visitante.tocar('casa');
  await esperar(150);

  const huboPush = publicados.some(p => p.topic === 'ring' && p.cuerpo.priority === 5);
  const clickAlPanel = publicados.find(p => p.topic === 'ring');

  if (!entranteVisto) return fallar('el residente nunca vio la llamada entrante');

  await residente.atender({ video: true });
  await esperar(150);

  /* ---------- verificaciones ---------- */
  const checks = [
    ['el residente queda escuchando', estadosR.includes('escuchando')],
    ['sale la notificación con prioridad urgente', huboPush],
    ['la notificación abre el panel con el id de llamada', !!clickAlPanel && /panel\.html\?c=\w+&d=casa/.test(clickAlPanel.cuerpo.click)],
    ['la notificación trae botón Atender', !!clickAlPanel && clickAlPanel.cuerpo.actions[0].label === 'Atender'],
    ['el residente detecta la llamada entrante', !!entranteVisto && !!entranteVisto.sdp],
    ['al residente le llega el SDP correcto del visitante', !!entranteVisto && entranteVisto.sdp.includes('SDP-OFERTA-DE-visitante')],
    ['el residente pasa a enLlamada', estadosR.includes('enLlamada')],
    ['el visitante pasa a enLlamada', estadosV.includes('enLlamada')],
    ['el visitante recibe video del residente', streamRemotoV],
    ['el residente recibe video del visitante', streamRemotoR],
    ['el timbrazo no viajó por el topic de señalización', !publicados.some(p => p.topic === 'sig' && p.cuerpo.priority === 5)],
    ['las señales van con prioridad mínima', publicados.filter(p => p.topic === 'sig').every(p => p.cuerpo.priority === 1)]
  ];

  /* colgar */
  residente.colgar();
  await esperar(120);
  checks.push(['al colgar el residente, el visitante se entera', estadosV[estadosV.length - 1] === 'finalizada']);
  checks.push(['el residente vuelve a escuchar', estadosR[estadosR.length - 1] === 'escuchando']);

  let malos = 0;
  for (const [nombre, ok] of checks) {
    console.log((ok ? '  OK   ' : '  FALLA') + '  ' + nombre);
    if (!ok) malos++;
  }
  console.log('\nvisitante: ' + estadosV.join(' -> '));
  console.log('residente: ' + estadosR.join(' -> '));
  console.log('\n' + (malos ? malos + ' FALLO(S)' : 'TODO OK — ' + checks.length + ' verificaciones'));
  process.exit(malos ? 1 : 0);

  function fallar(m) { console.log('FALLA: ' + m); process.exit(1); }
})();

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
