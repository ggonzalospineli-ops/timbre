/* ============================================================
   ntfy.js — transporte
   Usa ntfy.sh como (a) campanilla push y (b) canal de señalización.
   No hay backend propio: solo HTTP POST + Server-Sent Events.
   ============================================================ */
(function (global) {
  'use strict';

  const cfg = () => global.TIMBRE_CONFIG;

  /* ---------- id corto, sin caracteres ambiguos ---------- */
  function uid(n) {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    const buf = new Uint8Array(n || 10);
    crypto.getRandomValues(buf);
    return Array.from(buf, b => abc[b % abc.length]).join('');
  }

  /* ---------- publicar ----------
     Se manda JSON al root del servidor para evitar headers custom
     (y por lo tanto el preflight de CORS).                        */
  async function publicar(topic, campos) {
    const cuerpo = Object.assign({ topic: topic }, campos || {});
    const res = await fetch(cfg().servidor + '/', {
      method: 'POST',
      body: JSON.stringify(cuerpo)
    });
    if (!res.ok) throw new Error('ntfy respondió ' + res.status);
    return res.json();
  }

  /* ---------- escuchar ----------
     `desde` acepta '10m', 'all', o un id de mensaje.
     Se devuelve un objeto con .cerrar(). EventSource reconecta solo;
     los repetidos se filtran por id.                                */
  function escuchar(topic, desde, alRecibir) {
    const url = cfg().servidor + '/' + encodeURIComponent(topic) +
                '/sse?since=' + encodeURIComponent(desde || '10m');
    const es = new EventSource(url);
    const vistos = new Set();

    es.onmessage = function (ev) {
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.event !== 'message') return;      // open / keepalive
      if (vistos.has(m.id)) return;
      vistos.add(m.id);
      alRecibir(m);
    };

    return {
      fuente: es,
      cerrar: function () { try { es.close(); } catch (_) {} }
    };
  }

  /* ---------- compresión ----------
     Un SDP pelado ronda los 2–4 KB y el límite de ntfy es 4096 bytes.
     Gzip lo baja a ~15–20% y después va en base64.                  */
  function bytesABase64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function base64ABytes(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function comprimir(texto) {
    if (typeof CompressionStream === 'undefined') {
      return 'r' + bytesABase64(new TextEncoder().encode(texto));
    }
    const flujo = new Blob([texto]).stream()
      .pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(flujo).arrayBuffer();
    return 'z' + bytesABase64(new Uint8Array(buf));
  }

  async function descomprimir(s) {
    const tipo = s.charAt(0);
    const u8 = base64ABytes(s.slice(1));
    if (tipo === 'r') return new TextDecoder().decode(u8);
    const flujo = new Blob([u8]).stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return new Response(flujo).text();
  }

  /* ---------- señalización (offer / answer / bye) ---------- */
  const MAX_TROZO = 2800;   // deja aire bajo los 4096 bytes de ntfy

  async function enviarSenal(sobre, texto) {
    const datos = texto == null ? '' : await comprimir(texto);
    const trozos = [];
    for (let i = 0; i < datos.length; i += MAX_TROZO) {
      trozos.push(datos.slice(i, i + MAX_TROZO));
    }
    if (!trozos.length) trozos.push('');

    for (let i = 0; i < trozos.length; i++) {
      await publicar(cfg().topicSenales, {
        message: JSON.stringify({
          t: sobre.tipo,
          c: sobre.llamada,
          s: sobre.sesion || null,
          p: i + 1,
          n: trozos.length,
          d: trozos[i]
        }),
        priority: 1,          // mínima: nunca hace sonar nada
        tags: ['gear']
      });
    }
  }

  /* Rearma los mensajes partidos. Devuelve una función que se le pasa
     a `escuchar` y que llama a `alCompletar(tipo, llamada, texto)`.   */
  function receptorDeSenales(alCompletar) {
    const buffer = new Map();
    return async function (msg) {
      let s;
      try { s = JSON.parse(msg.message); } catch (_) { return; }
      if (!s || !s.t || !s.c) return;

      const clave = s.c + '|' + s.t;
      let acc = buffer.get(clave);
      if (!acc) { acc = { total: s.n, partes: new Map() }; buffer.set(clave, acc); }
      acc.partes.set(s.p, s.d);
      if (acc.partes.size < acc.total) return;
      buffer.delete(clave);

      let unido = '';
      for (let i = 1; i <= acc.total; i++) unido += acc.partes.get(i);

      let texto = null;
      if (unido) {
        try { texto = await descomprimir(unido); }
        catch (e) { console.warn('señal ilegible', e); return; }
      }
      alCompletar(s.t, s.c, texto, msg, s.s || null);
    };
  }

  global.TimbreNtfy = {
    uid, publicar, escuchar,
    comprimir, descomprimir,
    enviarSenal, receptorDeSenales
  };
})(window);
