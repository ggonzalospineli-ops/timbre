(function () {
  'use strict';
  const timbre = Timbre.visitante(), $ = s => document.querySelector(s);
  const destinos = Timbre.destinos();
  let silenciado = false, ocupada = false, avisoEnCurso = false;
  const local = $('#video-local'), remoto = $('#video-remoto');
  function mostrar(vista) {
    document.querySelectorAll('[data-vista]').forEach(s => { s.hidden = s.dataset.vista !== vista; });
    $('#mensaje-accion').textContent = '';
    const titulo = $('[data-vista="' + vista + '"] h1');
    $('#anuncio').textContent = titulo.textContent;
    titulo.focus({ preventScroll: true });
  }
  function microfono(activo) {
    silenciado = !activo;
    const b = $('[data-accion="microfono"]');
    b.textContent = silenciado ? 'Activar micrófono' : 'Silenciar micrófono';
    b.setAttribute('aria-pressed', String(silenciado));
  }
  function reproducir() {
    remoto.play().then(() => { $('[data-accion="reproducir"]').hidden = true; }).catch(() => {
      $('[data-accion="reproducir"]').hidden = false;
    });
  }
  async function llamar(id) {
    if (ocupada) return;
    ocupada = true;
    microfono(true);
    $('[data-accion="aviso"]').disabled = false;
    $('[data-accion="aviso"]').textContent = 'Avisar que pasé';
    $('#aviso-estado').textContent = '';
    try { await timbre.tocar(id); } catch (_) { ocupada = false; mostrar('error'); $('#texto-error').textContent = 'No pudimos iniciar la llamada. Reintentá en unos segundos.'; }
  }
  $('#nombre-casa').textContent = Timbre.casa();
  document.title = 'Timbre · ' + Timbre.casa();
  if (destinos.length > 1) {
    $('[data-vista="inicio"] h1').textContent = '¿A quién visitás?';
    $('[data-vista="inicio"] .bajada').textContent = 'Elegí a quién llamar. Te atiende por acá, sin instalar nada.';
  }
  destinos.forEach(d => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'destino';
    const contenido = document.createElement('span'), nombre = document.createElement('span');
    nombre.className = 'destino-nombre'; nombre.textContent = destinos.length === 1 ? 'Tocar timbre' : d.nombre;
    contenido.appendChild(nombre);
    if (d.detalle) { const detalle = document.createElement('span'); detalle.className = 'destino-detalle'; detalle.textContent = d.detalle; contenido.appendChild(detalle); }
    b.appendChild(contenido); b.addEventListener('click', () => llamar(d.id)); $('#lista-destinos').appendChild(b);
  });
  if (!destinos.length) $('#lista-destinos').textContent = 'Este timbre todavía no tiene un destino configurado.';
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-accion]'); if (!b || b.disabled) return;
    const a = b.dataset.accion;
    try {
      if (a === 'colgar') timbre.colgar();
      if (a === 'inicio') mostrar('inicio');
      if (a === 'reintentar') { const d = timbre.destinoActual() || destinos[0]; if (d) await llamar(d.id); }
      if (a === 'microfono') timbre.silenciarMicrofono(!silenciado);
      if (a === 'reproducir') reproducir();
      if (a === 'camara') { b.disabled = true; await timbre.cambiarCamara(); b.disabled = false; }
      if (a === 'aviso' && !avisoEnCurso) {
        avisoEnCurso = true; b.disabled = true; b.textContent = 'Enviando…';
        try {
          await timbre.dejarAviso($('#texto-aviso').value.trim() || undefined);
          b.textContent = 'Aviso enviado ✓'; $('#aviso-estado').textContent = 'Listo, avisamos que pasaste.';
        } catch (_) { b.disabled = false; b.textContent = 'Reintentar envío'; $('#aviso-estado').textContent = 'No se pudo enviar. Revisá tu conexión y probá de nuevo.'; }
        finally { avisoEnCurso = false; }
      }
    } catch (_) { b.disabled = false; $('#mensaje-accion').textContent = 'No pudimos completar esa acción. Probá de nuevo.'; }
  });
  timbre.on('estado', e => {
    ocupada = ['permisos', 'llamando', 'enLlamada'].includes(e.estado);
    mostrar(e.estado === 'rechazada' ? 'finalizada' : e.estado);
    if (!ocupada) { local.srcObject = null; remoto.srcObject = null; $('[data-accion="reproducir"]').hidden = true; }
    if (e.estado === 'llamando') $('#texto-llamando').textContent = destinos.length > 1 && e.destino ? 'Llamando a ' + e.destino.nombre + '…' : 'Esperando que atiendan…';
    if (e.estado === 'enLlamada' && remoto.srcObject) reproducir();
    if (e.estado === 'rechazada') {
      $('[data-vista="finalizada"] h1').textContent = 'Ahora no pueden atender.';
      $('#texto-fin').textContent = 'Podés volver a intentar más tarde.';
    }
    if (e.estado === 'finalizada') {
      $('[data-vista="finalizada"] h1').textContent = 'Terminó la llamada.';
      $('#texto-fin').textContent = ({cortasteVos:'Cortaste la llamada.', cortaronDelOtroLado:'La otra persona terminó la llamada.', conexionPerdida:'Se perdió la conexión. Podés llamar de nuevo.', tiempo:'Se alcanzó el tiempo máximo de llamada.'})[e.motivo] || 'La llamada finalizó.';
    }
    if (e.estado === 'error') $('#texto-error').textContent = ({permisos:'Permití cámara y micrófono desde los permisos del sitio, junto a la dirección del navegador. Después, tocá Reintentar.', sinRed:'No hay conexión. Revisá tus datos móviles o Wi-Fi y reintentá.', webrtc:'No se pudo establecer la llamada. Revisá tu conexión y reintentá.'})[e.motivo] || 'No pudimos iniciar la llamada.';
    $('#anuncio').textContent = $('[data-vista]:not([hidden]) h1').textContent;
  });
  timbre.on('microfono', microfono);
  timbre.on('streamLocal', s => { local.srcObject = s; local.hidden = !s.getVideoTracks().length; $('[data-accion="camara"]').hidden = !s.getVideoTracks().length; });
  timbre.on('streamRemoto', s => { remoto.srcObject = s; $('#video-placeholder').textContent = s.getVideoTracks().length ? 'Conectando imagen…' : 'Llamada de audio'; reproducir(); });
  timbre.on('error', () => { $('#mensaje-accion').textContent = 'Si el problema sigue, revisá los permisos y la conexión.'; });
})();
