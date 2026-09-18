/* ============================================================
   ui-visitante.js — pegamento entre el motor y la pantalla.
   ESTE ARCHIVO ES DESCARTABLE: la UI definitiva puede reescribirlo
   entero. Lo único que no cambia es la API de `Timbre` que usa.
   ============================================================ */
(function () {
  'use strict';

  const cfg = window.TIMBRE_CONFIG;
  const timbre = window.Timbre.visitante();

  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

  const videoRemoto = $('#video-remoto');
  const videoLocal  = $('#video-local');
  let microfonoCortado = false;

  /* ---------- una vista a la vez ---------- */
  const VISTA_DE_ESTADO = {
    inicio:       'inicio',
    permisos:     'permisos',
    llamando:     'llamando',
    enLlamada:    'enLlamada',
    sinRespuesta: 'sinRespuesta',
    rechazada:    'finalizada',
    finalizada:   'finalizada',
    error:        'error'
  };

  function mostrar(vista) {
    $$('[data-vista]').forEach(function (s) {
      s.hidden = (s.getAttribute('data-vista') !== vista);
    });
  }

  /* ---------- pantalla inicial ---------- */
  $('#nombre-casa').textContent = cfg.casa;
  document.title = 'Timbre — ' + cfg.casa;

  const destinos = window.Timbre.destinos();
  const lista = $('#lista-destinos');
  destinos.forEach(function (d) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'destino';
    boton.dataset.destino = d.id;
    boton.innerHTML =
      '<span class="destino-nombre">' +
      (destinos.length === 1 ? 'Tocar timbre' : d.nombre) +
      '</span>' +
      (d.detalle ? '<span class="destino-detalle">' + d.detalle + '</span>' : '');
    boton.addEventListener('click', function () { timbre.tocar(d.id); });
    lista.appendChild(boton);
  });

  /* ---------- acciones ---------- */
  document.addEventListener('click', function (ev) {
    const boton = ev.target.closest('[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;

    if (accion === 'colgar') {
      timbre.colgar();

    } else if (accion === 'reintentar') {
      mostrar('inicio');

    } else if (accion === 'microfono') {
      microfonoCortado = !microfonoCortado;
      timbre.silenciarMicrofono(microfonoCortado);
      boton.textContent = microfonoCortado ? 'Activar micrófono' : 'Silenciar';

    } else if (accion === 'camara') {
      timbre.cambiarCamara();

    } else if (accion === 'aviso') {
      boton.disabled = true;
      timbre.dejarAviso().then(function () {
        boton.textContent = 'Aviso enviado ✓';
      }).catch(function () {
        boton.disabled = false;
        boton.textContent = 'No se pudo enviar, reintentá';
      });
    }
  });

  /* ---------- reacciones a los eventos del motor ---------- */
  timbre.on('estado', function (e) {
    mostrar(VISTA_DE_ESTADO[e.estado] || 'inicio');

    if (e.estado === 'llamando' && e.destino) {
      $('#texto-llamando').textContent =
        destinos.length === 1 ? 'Llamando…' : 'Llamando a ' + e.destino.nombre + '…';
    }
    if (e.estado === 'rechazada') {
      $('#texto-fin').textContent = 'No pueden atenderte ahora.';
    }
    if (e.estado === 'finalizada') {
      $('#texto-fin').textContent =
        e.motivo === 'conexionPerdida' ? 'Se cortó la llamada.' : 'Llamada finalizada.';
    }
    if (e.estado === 'error') {
      $('#texto-error').textContent =
        e.motivo === 'permisos'
          ? 'Necesitamos cámara y micrófono para poder llamar.'
          : e.motivo === 'sinRed'
            ? 'Sin conexión. Probá de nuevo.'
            : 'No se pudo establecer la llamada.';
    }
  });

  timbre.on('streamLocal',  function (s) { videoLocal.srcObject = s; });
  timbre.on('streamRemoto', function (s) { videoRemoto.srcObject = s; });
  timbre.on('error', function (e) { console.error('[timbre]', e); });

  mostrar('inicio');
})();
