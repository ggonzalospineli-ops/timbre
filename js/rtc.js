/* ============================================================
   rtc.js — la parte de WebRTC
   La llamada es punto a punto: el audio y el video NO pasan por
   ningún servidor. Solo se usan STUN (gratis) y, como red de
   seguridad cuando la NAT es hostil, un TURN público abierto.
   ============================================================ */
(function (global) {
  'use strict';

  const SERVIDORES_ICE = [
    { urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.cloudflare.com:3478'
    ] },
    /* TURN público de Open Relay (plan gratuito de metered.ca).
       Solo se usa si el P2P directo no logra conectar.
       Si alguna vez falla, en el README está cómo poner uno propio. */
    { urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject', credential: 'openrelayproject' }
  ];

  function crearConexion() {
    return new RTCPeerConnection({
      iceServers: SERVIDORES_ICE,
      iceCandidatePoolSize: 4
    });
  }

  /* Se junta todo el ICE antes de mandar el SDP (nada de trickle):
     así la señalización es UN mensaje por lado en vez de veinte,
     que es lo que conviene yendo por ntfy. */
  function esperarIce(pc, ms) {
    return new Promise(function (resolver) {
      if (pc.iceGatheringState === 'complete') return resolver();
      const reloj = setTimeout(terminar, ms || 3000);
      function terminar() {
        clearTimeout(reloj);
        pc.removeEventListener('icegatheringstatechange', revisar);
        resolver();
      }
      function revisar() {
        if (pc.iceGatheringState === 'complete') terminar();
      }
      pc.addEventListener('icegatheringstatechange', revisar);
    });
  }

  /* Pide cámara y micrófono. Si la cámara falla o no hay, cae a
     solo audio en vez de romper la llamada.                      */
  async function pedirMedios(opciones) {
    const quiereVideo = !!(opciones && opciones.video);
    const camara = (opciones && opciones.camara) || 'user';

    if (quiereVideo) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: { facingMode: camara, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
        console.warn('Sin cámara, sigo con audio solo:', e && e.name);
      }
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
  }

  /* Solo la cámara, sin tocar el micrófono. Se usa al girar la cámara
     durante una llamada: pedir audio de nuevo abriría un segundo
     micrófono que quedaría vivo y sin usar.                        */
  function pedirSoloVideo(camara) {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: camara || 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  }

  function cortarMedios(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
  }

  global.TimbreRTC = {
    SERVIDORES_ICE, crearConexion, esperarIce, pedirMedios, pedirSoloVideo, cortarMedios
  };
})(window);
