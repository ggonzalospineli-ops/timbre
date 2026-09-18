/* Verificación de ubicación: cálculo de distancia y efecto en la llamada.
   El GPS y ntfy están simulados; no sale nada a la red. */
const fs = require('fs'), vm = require('vm');

const publicados = [];

const CASA = { lat: -34.603722, lon: -58.381592 };   // punto de referencia

function crearVentana(geoloc, ubicacionCfg) {
  const v = {
    TIMBRE_CONFIG: {
      casa: 'Casa', servidor: 'https://ntfy.test', topicSenales: 'sig',
      destinos: [{ id: 'casa', nombre: 'Casa', detalle: '', topic: 'ring' }],
      llamada: { videoVisitante: true, videoResidente: true, segundosSinRespuesta: 45, segundosMaxLlamada: 300 },
      textos: { tituloPush: 'Timbre', cuerpoPush: 'Hay alguien', avisoPush: 'Pasé' },
      ubicacion: Object.assign({
        activa: true, lat: CASA.lat, lon: CASA.lon, radioMetros: 150,
        modo: 'bloquear', segundosEspera: 15, precisionMinimaAceptada: 1000,
        dejarAvisoSiLejos: true
      }, ubicacionCfg || {})
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
      geolocation: geoloc,
      sendBeacon: () => true
    },
    location: { href: 'https://ejemplo.github.io/timbre/index.html' },
    fetch: async (url, o) => { const c = JSON.parse(o.body); publicados.push(c); return { ok: true, json: async () => ({}) }; },
    EventSource: class { constructor() { setTimeout(() => this.onopen && this.onopen(), 1); } close() {} }
  };
  v.window = v;
  vm.createContext(v);
  for (const f of ['js/ntfy.js', 'js/rtc.js', 'js/geo.js', 'js/timbre.js']) {
    vm.runInContext(fs.readFileSync('C:/Users/gonza/TimbreQR/' + f, 'utf8'), v);
  }
  return v;
}

/* GPS que responde con una posición fija */
function gpsEn(lat, lon, precision) {
  return { getCurrentPosition: (ok) => setTimeout(() => ok({ coords: { latitude: lat, longitude: lon, accuracy: precision } }), 5) };
}
/* GPS que falla: code 1 = permiso denegado, 3 = timeout */
function gpsFalla(code) {
  return { getCurrentPosition: (ok, mal) => setTimeout(() => mal({ code, message: 'no' }), 5) };
}

/* desplaza un punto N metros hacia el norte */
function aMetros(lat, lon, metros) {
  return { lat: lat + (metros / 111320), lon: lon };
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const res = [];

  /* ---------- 1. la fórmula de distancia ---------- */
  {
    const v = crearVentana(gpsEn(0, 0, 10));
    const d = v.TimbreGeo.distancia;
    const gradoLat = d(0, 0, 1, 0);
    const gradoLon = d(0, 0, 0, 1);
    const cien = d(CASA.lat, CASA.lon, aMetros(CASA.lat, CASA.lon, 100).lat, CASA.lon);
    res.push(['un grado de latitud da ~111,2 km', Math.abs(gradoLat - 111194) < 300]);
    res.push(['un grado de longitud en el ecuador da ~111,3 km', Math.abs(gradoLon - 111319) < 300]);
    res.push(['100 metros medidos dan 100 metros', Math.abs(cien - 100) < 1]);
    res.push(['el mismo punto da distancia cero', d(CASA.lat, CASA.lon, CASA.lat, CASA.lon) === 0]);
  }

  /* ---------- 2. está en la puerta ---------- */
  {
    publicados.length = 0;
    const cerca = aMetros(CASA.lat, CASA.lon, 20);
    const v = crearVentana(gpsEn(cerca.lat, cerca.lon, 12));
    const t = v.Timbre.visitante();
    const estados = [];
    t.on('estado', e => estados.push(e.estado));
    await t.tocar('casa');
    await esperar(120);
    const push = publicados.find(p => p.topic === 'ring');
    res.push(['el que está en la puerta puede llamar', estados.includes('llamando')]);
    res.push(['pasa por el estado "ubicando"', estados.includes('ubicando')]);
    res.push(['la notificación dice que está en la puerta', !!push && /en la puerta \(a \d+ m\)/.test(push.message)]);
    res.push(['y no quedó marcada como sospechosa', !!push && !push.message.includes('⚠️')]);
  }

  /* ---------- 3. está lejos: no puede llamar ---------- */
  {
    publicados.length = 0;
    const lejos = aMetros(CASA.lat, CASA.lon, 3000);
    const v = crearVentana(gpsEn(lejos.lat, lejos.lon, 15));
    const t = v.Timbre.visitante();
    let ultimo = null;
    t.on('estado', e => { ultimo = e; });
    await t.tocar('casa');
    await esperar(120);
    res.push(['el que está lejos queda bloqueado', ultimo.estado === 'lejos']);
    res.push(['se informa a qué distancia está', ultimo.ubicacion.distancia > 2900 && ultimo.ubicacion.distancia < 3100]);
    res.push(['no se le hizo sonar el timbre', !publicados.some(p => p.topic === 'ring')]);
    res.push(['tampoco se le pidió la cámara', ultimo.estado !== 'permisos']);

    /* pero sí puede dejar un mensaje escrito */
    await t.dejarAviso('Te dejé un paquete en portería');
    await esperar(40);
    const aviso = publicados[publicados.length - 1];
    res.push(['igual puede dejar un aviso escrito', !!aviso && aviso.message === 'Te dejé un paquete en portería']);
  }

  /* ---------- 4. justo en el borde del radio ---------- */
  {
    const borde = aMetros(CASA.lat, CASA.lon, 140);
    const v = crearVentana(gpsEn(borde.lat, borde.lon, 5));
    const t = v.Timbre.visitante();
    let ultimo = null;
    t.on('estado', e => { ultimo = e; });
    await t.tocar('casa');
    await esperar(120);
    res.push(['a 140 m con radio de 150 entra', ultimo.estado !== 'lejos']);

    const afuera = aMetros(CASA.lat, CASA.lon, 400);
    const v2 = crearVentana(gpsEn(afuera.lat, afuera.lon, 5));
    const t2 = v2.Timbre.visitante();
    let u2 = null;
    t2.on('estado', e => { u2 = e; });
    await t2.tocar('casa');
    await esperar(120);
    res.push(['a 400 m con radio de 150 no entra', u2.estado === 'lejos']);
  }

  /* ---------- 5. GPS impreciso: no alcanza para afirmar nada ---------- */
  {
    const lejos = aMetros(CASA.lat, CASA.lon, 4000);
    /* precisión de 5 km: típico de ubicación por IP. Si se aceptara el
       margen sin tope, este troll pasaría como si estuviera en la puerta. */
    const v = crearVentana(gpsEn(lejos.lat, lejos.lon, 5000));
    const t = v.Timbre.visitante();
    let ultimo = null;
    t.on('estado', e => { ultimo = e; });
    await t.tocar('casa');
    await esperar(120);
    res.push(['una ubicación de 5 km de error no alcanza', ultimo.estado === 'lejos']);
    res.push(['y se explica que fue por imprecisión', ultimo.ubicacion.estado === 'impreciso']);
  }

  /* ---------- 6. margen del GPS a favor del visitante ---------- */
  {
    const punto = aMetros(CASA.lat, CASA.lon, 200);
    /* está a 200 m pero el GPS tiene 80 m de error: 200-80=120 < 150 -> entra */
    const v = crearVentana(gpsEn(punto.lat, punto.lon, 80));
    const t = v.Timbre.visitante();
    let ultimo = null;
    t.on('estado', e => { ultimo = e; });
    await t.tocar('casa');
    await esperar(120);
    res.push(['se le concede el margen de error del GPS', ultimo.estado !== 'lejos']);
  }

  /* ---------- 7. no da permiso / no hay señal ---------- */
  {
    for (const [code, nombre, esperado] of [[1, 'niega el permiso', 'sinPermiso'], [3, 'el GPS no responde', 'sinSenal']]) {
      const v = crearVentana(gpsFalla(code));
      const t = v.Timbre.visitante();
      let ultimo = null;
      t.on('estado', e => { ultimo = e; });
      await t.tocar('casa');
      await esperar(120);
      res.push(['si ' + nombre + ', no puede llamar', ultimo.estado === 'lejos']);
      res.push(['  y se distingue el motivo (' + esperado + ')', ultimo.ubicacion.estado === esperado]);
    }
  }

  /* ---------- 8. modo "avisar": deja pasar pero marca ---------- */
  {
    publicados.length = 0;
    const lejos = aMetros(CASA.lat, CASA.lon, 5000);
    const v = crearVentana(gpsEn(lejos.lat, lejos.lon, 20), { modo: 'avisar' });
    const t = v.Timbre.visitante();
    const estados = [];
    t.on('estado', e => estados.push(e.estado));
    await t.tocar('casa');
    await esperar(120);
    const push = publicados.find(p => p.topic === 'ring');
    res.push(['en modo avisar la llamada sale igual', estados.includes('llamando')]);
    res.push(['pero la notificación avisa la distancia', !!push && push.message.includes('⚠️') && push.message.includes('5 km')]);
  }

  /* ---------- 9. desactivada: todo sigue como antes ---------- */
  {
    publicados.length = 0;
    const v = crearVentana(gpsFalla(1), { activa: false });
    const t = v.Timbre.visitante();
    const estados = [];
    t.on('estado', e => estados.push(e.estado));
    await t.tocar('casa');
    await esperar(120);
    const push = publicados.find(p => p.topic === 'ring');
    res.push(['con la verificación apagada no se pide ubicación', !estados.includes('ubicando')]);
    res.push(['y la notificación queda limpia', !!push && !push.message.includes('⚠️')]);
  }

  /* ---------- 10. activada pero sin coordenadas cargadas ---------- */
  {
    const v = crearVentana(gpsEn(CASA.lat, CASA.lon, 10), { lat: null, lon: null });
    const t = v.Timbre.visitante();
    const estados = [];
    t.on('estado', e => estados.push(e.estado));
    await t.tocar('casa');
    await esperar(120);
    res.push(['sin coordenadas cargadas no deja a nadie afuera', !estados.includes('lejos')]);
  }

  let malos = 0;
  for (const [n, ok] of res) { console.log((ok ? '  OK   ' : '  FALLA') + '  ' + n); if (!ok) malos++; }
  console.log('\n' + (malos ? malos + ' FALLO(S)' : 'TODO OK — ' + res.length + ' verificaciones'));
  process.exit(malos ? 1 : 0);
})();
