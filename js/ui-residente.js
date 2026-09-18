(function () {
  'use strict';
  const panel = Timbre.residente(), params = new URLSearchParams(location.search), $ = s => document.querySelector(s);
  const local = $('#video-local'), remoto = $('#video-remoto');
  let silenciado = false, camaraApagada = false, atendiendo = false, conVideo = true, instalacion = null, bloqueo = null;
  let contexto = null, campana = null;
  const motivos = {cortasteVos:'Terminaste la llamada.', rechazaste:'Avisamos que ahora no podés atender.', cortaronAntesDeAtender:'La visita cortó antes de que atendieras.', cortaronDelOtroLado:'La visita terminó la llamada.', atendidaEnOtroDispositivo:'Atendieron desde otro dispositivo.', conexionPerdida:'Se perdió la conexión de la llamada.', tiempo:'Se alcanzó el tiempo máximo de llamada.'};
  $('#nombre-casa').textContent = Timbre.casa(); document.title = 'Tu panel · ' + Timbre.casa();
  function mostrar(vista) {
    document.querySelectorAll('[data-vista]').forEach(s => { s.hidden = s.dataset.vista !== vista; });
    $('#mensaje-accion').textContent = '';
    const titulo = $('[data-vista="' + vista + '"] h1');
    $('#anuncio').textContent = titulo.textContent; titulo.focus({preventScroll:true});
  }
  async function prepararSonido() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Audio no disponible');
    contexto = contexto || new Audio(); await contexto.resume();
  }
  function ding() {
    if (!contexto || contexto.state !== 'running') return;
    [880,660].forEach((hz,i) => {
      const osc = contexto.createOscillator(), volumen = contexto.createGain(), t = contexto.currentTime + i * .35;
      osc.frequency.value = hz; osc.connect(volumen); volumen.connect(contexto.destination);
      volumen.gain.setValueAtTime(.0001,t); volumen.gain.exponentialRampToValueAtTime(.2,t+.02); volumen.gain.exponentialRampToValueAtTime(.0001,t+.32);
      osc.start(t); osc.stop(t+.34); osc.onended = () => {osc.disconnect();volumen.disconnect();};
    });
  }
  function parar() { clearInterval(campana); campana = null; if (navigator.vibrate) navigator.vibrate(0); }
  function controles() {
    const mic = $('[data-accion="microfono"]'), cam = $('[data-accion="camara"]');
    mic.textContent = silenciado ? 'Activar micrófono' : 'Silenciar micrófono'; mic.setAttribute('aria-pressed',String(silenciado));
    cam.textContent = camaraApagada ? 'Prender cámara' : 'Apagar cámara'; cam.setAttribute('aria-pressed',String(camaraApagada));
    cam.hidden = !conVideo; local.hidden = !conVideo || camaraApagada;
  }
  function bloquear(valor) {
    atendiendo = valor;
    ['atender','atender-audio','rechazar','reintentar'].forEach(a => { $('[data-accion="' + a + '"]').disabled = valor; });
    $('#atendiendo').textContent = valor ? 'Permití el micrófono si el navegador lo pide. Conectando…' : '';
  }
  async function atender(video) {
    if (atendiendo) return;
    conVideo = video; silenciado = false; camaraApagada = false; controles(); parar(); bloquear(true);
    try { await panel.atender({video}); } finally { bloquear(false); }
  }
  function reproducir() {
    remoto.play().then(() => { $('[data-accion="reproducir"]').hidden = true; }).catch(() => { $('[data-accion="reproducir"]').hidden = false; });
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-accion]'); if (!b || b.disabled) return;
    const a = b.dataset.accion;
    try {
      if (a === 'atender' || a === 'reintentar') await atender(a === 'reintentar' ? conVideo : true);
      if (a === 'atender-audio') await atender(false);
      if (a === 'rechazar') { parar(); await panel.rechazar(); }
      if (a === 'colgar' || a === 'volver') { parar(); panel.colgar(); }
      if (a === 'microfono') { silenciado = !silenciado; panel.silenciarMicrofono(silenciado); controles(); }
      if (a === 'camara') { camaraApagada = !camaraApagada; panel.apagarCamara(camaraApagada); controles(); }
      if (a === 'reproducir') reproducir();
      if (a === 'sonido') { await prepararSonido(); ding(); b.textContent = 'Campanilla activada ✓'; b.disabled = true; }
      if (a === 'instalar' && instalacion) { await instalacion.prompt(); await instalacion.userChoice; instalacion = null; b.hidden = true; }
    } catch (_) { bloquear(false); $('#mensaje-accion').textContent = 'No pudimos completar esa acción. Probá de nuevo.'; }
  });
  panel.on('estado', e => {
    const vista = ['entrante','enLlamada','error'].includes(e.estado) ? e.estado : 'escuchando'; mostrar(vista);
    const estados = {inicio:'Panel desconectado',conectando:'Conectando…',reconectando:'Reconectando…',escuchando:'Conectado · Todo listo',entrante:'Están tocando',enLlamada:'En llamada',error:'No se pudo conectar'};
    $('#estado-conexion').textContent = estados[e.estado] || '';
    if (e.estado !== 'entrante') { parar(); bloquear(false); }
    if (vista === 'escuchando') {
      $('#estado-grande').textContent = e.estado === 'escuchando' ? 'LISTO PARA ATENDER' : e.estado === 'reconectando' ? 'RECONECTANDO' : 'CONECTANDO';
      $('[data-vista="escuchando"] .bajada').textContent = e.estado === 'escuchando' ? 'Tu timbre está conectado. Te avisamos cuando alguien toque.' : e.estado === 'reconectando' ? 'Se interrumpió la conexión. Estamos intentando volver automáticamente.' : 'Estamos conectando tu timbre.';
      if (e.motivo) $('#ultimo-motivo').textContent = motivos[e.motivo] || '';
      local.srcObject = null; remoto.srcObject = null; silenciado = false; camaraApagada = false; controles(); $('[data-accion="reproducir"]').hidden = true;
    }
    if (e.estado === 'error') {
      $('#texto-error').textContent = e.motivo === 'permisos' ? 'Permití el micrófono' + (conVideo ? ' y la cámara' : '') + ' desde los permisos del sitio, junto a la dirección del navegador. Después, volvé a atender.' : 'No se pudo establecer la llamada. Volvé al panel para esperar otro timbrazo.';
      $('[data-accion="reintentar"]').hidden = e.motivo !== 'permisos';
    }
    if (e.estado === 'enLlamada' && remoto.srcObject) reproducir();
    mantenerPantalla();
  });
  panel.on('entrante', llamada => {
    silenciado = false; camaraApagada = false; bloquear(false);
    $('#texto-entrante').textContent = (llamada.destino ? llamada.destino.nombre + ' · ' : '') + new Date(llamada.hora).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    parar(); ding(); campana = setInterval(ding,2000);
    if (navigator.vibrate) navigator.vibrate([400,200,400,200,400]);
  });
  panel.on('streamLocal', s => { local.srcObject = s; conVideo = s.getVideoTracks().length > 0; controles(); });
  panel.on('streamRemoto', s => { remoto.srcObject = s; $('#video-placeholder').textContent = s.getVideoTracks().length ? 'Conectando imagen…' : 'Llamada de audio'; reproducir(); });
  panel.on('error', () => { $('#mensaje-accion').textContent = 'Revisá los permisos y la conexión antes de reintentar.'; });
  async function mantenerPantalla() {
    try {
      if (panel.estado === 'enLlamada' && document.visibilityState === 'visible' && 'wakeLock' in navigator && !bloqueo) {
        const nuevo = await navigator.wakeLock.request('screen');
        if (panel.estado !== 'enLlamada') { await nuevo.release(); return; }
        bloqueo = nuevo; nuevo.addEventListener('release',() => { if (bloqueo === nuevo) bloqueo = null; });
      } else if (panel.estado !== 'enLlamada' && bloqueo) { await bloqueo.release(); bloqueo = null; }
    } catch (_) {}
  }
  document.addEventListener('visibilitychange',mantenerPantalla);
  const escuchar = () => panel.escuchar({llamadaId:params.get('c'),destinoId:params.get('d')});
  window.addEventListener('pagehide',() => { parar(); panel.detener(); });
  window.addEventListener('pageshow',e => { if (e.persisted) escuchar(); });
  window.addEventListener('beforeinstallprompt',e => { e.preventDefault(); instalacion = e; $('[data-accion="instalar"]').hidden = false; });
  window.addEventListener('appinstalled',() => { instalacion = null; $('[data-accion="instalar"]').hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  escuchar();
})();
