/* ============================================================
   ui-residente.js — pegamento del panel. También descartable.
   ============================================================ */
(function () {
  'use strict';

  const panel = window.Timbre.residente();
  const params = new URLSearchParams(location.search);

  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

  const videoRemoto = $('#video-remoto');
  const videoLocal  = $('#video-local');
  let microfonoCortado = false, camaraApagada = false;

  const VISTA_DE_ESTADO = {
    inicio:       'escuchando',
    conectando:   'escuchando',
    reconectando: 'escuchando',
    escuchando:   'escuchando',
    entrante:     'entrante',
    enLlamada:    'enLlamada',
    error:        'error'
  };

  const MOTIVOS = {
    atendidaEnOtroDispositivo: 'Atendieron desde otro dispositivo.',
    cortaronAntesDeAtender:    'Cortaron antes de que atendieras.',
    cortaronDelOtroLado:       'La otra persona cortó.',
    conexionPerdida:           'Se perdió la conexión.',
    rechazaste:                'Rechazaste la llamada.',
    tiempo:                    'La llamada llegó al tiempo máximo.',
    cortasteVos:               ''
  };

  function mostrar(vista) {
    $$('[data-vista]').forEach(function (s) {
      s.hidden = (s.getAttribute('data-vista') !== vista);
    });
  }

  /* ---------- campanilla local, sin archivos de audio ----------
     Suena solo si el panel ya está abierto. Si está cerrado, quien
     avisa es la notificación de ntfy en el celular.              */
  const campanilla = (function () {
    let ctx = null, reloj = null;

    function ding() {
      if (!ctx) return;
      [880, 660].forEach(function (hz, i) {
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.frequency.value = hz;
        osc.type = 'sine';
        osc.connect(vol); vol.connect(ctx.destination);
        const t0 = ctx.currentTime + i * 0.35;
        vol.gain.setValueAtTime(0.0001, t0);
        vol.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        vol.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
        osc.start(t0); osc.stop(t0 + 0.34);
      });
    }

    return {
      arrancar: function () {
        try {
          ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
          if (ctx.state === 'suspended') ctx.resume();
        } catch (_) { return; }
        ding();
        clearInterval(reloj);
        reloj = setInterval(ding, 2000);
      },
      parar: function () { clearInterval(reloj); reloj = null; }
    };
  })();

  /* ---------- acciones ---------- */
  document.addEventListener('click', function (ev) {
    const boton = ev.target.closest('[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;

    if (accion === 'atender') {
      campanilla.parar(); panel.atender({ video: true });

    } else if (accion === 'atender-audio') {
      campanilla.parar(); panel.atender({ video: false });

    } else if (accion === 'rechazar') {
      campanilla.parar(); panel.rechazar();

    } else if (accion === 'colgar') {
      panel.colgar();

    } else if (accion === 'volver') {
      mostrar('escuchando');

    } else if (accion === 'microfono') {
      microfonoCortado = !microfonoCortado;
      panel.silenciarMicrofono(microfonoCortado);
      boton.textContent = microfonoCortado ? 'Activar micrófono' : 'Silenciar';

    } else if (accion === 'camara') {
      camaraApagada = !camaraApagada;
      panel.apagarCamara(camaraApagada);
      boton.textContent = camaraApagada ? 'Prender cámara' : 'Apagar cámara';

    } else if (accion === 'instalar' && window.promptInstalacion) {
      window.promptInstalacion.prompt();
    }
  });

  /* ---------- eventos del motor ---------- */
  panel.on('estado', function (e) {
    mostrar(VISTA_DE_ESTADO[e.estado] || 'escuchando');

    const cartel = $('#estado-conexion');
    if (e.estado === 'conectando')        cartel.textContent = 'Conectando…';
    else if (e.estado === 'reconectando') cartel.textContent = 'Reconectando…';
    else if (e.estado === 'escuchando')   cartel.textContent = 'Todo listo';
    else if (e.estado === 'enLlamada')    cartel.textContent = 'En llamada';

    if (e.estado === 'escuchando') {
      campanilla.parar();
      $('#ultimo-motivo').textContent = MOTIVOS[e.motivo] || '';
      microfonoCortado = false; camaraApagada = false;
    }
    if (e.estado === 'error') {
      campanilla.parar();
      $('#texto-error').textContent = (e.motivo === 'permisos')
        ? 'Hay que permitir el micrófono para poder atender.'
        : 'No se pudo conectar la llamada.';
    }
  });

  panel.on('entrante', function (llamada) {
    campanilla.arrancar();
    const hora = llamada.hora.toLocaleTimeString('es-AR',
      { hour: '2-digit', minute: '2-digit' });
    $('#texto-entrante').textContent =
      'Están tocando ' + (llamada.destino ? llamada.destino.nombre : '') + ' · ' + hora;
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  });

  panel.on('streamLocal',  function (s) { videoLocal.srcObject = s; });
  panel.on('streamRemoto', function (s) { videoRemoto.srcObject = s; });
  panel.on('error', function (e) { console.error('[panel]', e); });

  /* ---------- arranque ---------- */
  panel.escuchar({
    llamadaId: params.get('c'),   // viene del click en la notificación
    destinoId: params.get('d')
  });

  /* mantener viva la pantalla mientras hay una llamada */
  let bloqueo = null;
  panel.on('estado', async function (e) {
    try {
      if (e.estado === 'enLlamada' && 'wakeLock' in navigator && !bloqueo) {
        bloqueo = await navigator.wakeLock.request('screen');
      } else if (e.estado !== 'enLlamada' && bloqueo) {
        bloqueo.release(); bloqueo = null;
      }
    } catch (_) {}
  });

  /* PWA */
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    window.promptInstalacion = ev;
    const b = document.querySelector('[data-accion="instalar"]');
    if (b) b.hidden = false;
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
