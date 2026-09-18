/* ============================================================
   timbre.js — la lógica del timbre (sin nada de interfaz)
   La UI no toca WebRTC ni ntfy: crea un objeto, se suscribe a
   sus eventos y llama a sus métodos. Todo lo visual es libre.
   Contrato completo en UI-CONTRATO.md
   ============================================================ */
(function (global) {
  'use strict';

  const Ntfy = global.TimbreNtfy;
  const RTC  = global.TimbreRTC;
  const cfg  = () => global.TIMBRE_CONFIG;

  /* ---------- mini emisor de eventos ---------- */
  function conEventos(obj) {
    const oyentes = {};
    obj.on = function (evento, fn) {
      (oyentes[evento] = oyentes[evento] || []).push(fn);
      return obj;
    };
    obj.off = function (evento, fn) {
      const l = oyentes[evento];
      if (l) oyentes[evento] = l.filter(f => f !== fn);
      return obj;
    };
    obj.emitir = function (evento) {
      const args = Array.prototype.slice.call(arguments, 1);
      (oyentes[evento] || []).forEach(function (fn) {
        try { fn.apply(null, args); } catch (e) { console.error(e); }
      });
    };
    return obj;
  }

  function buscarDestino(id) {
    const ds = cfg().destinos;
    return ds.find(d => d.id === id) || ds[0];
  }

  /* ============================================================
     VISITANTE — el que escanea el QR
     ============================================================ */
  function crearVisitante() {
    const yo = conEventos({});
    const sesion = Ntfy.uid(6);

    let estado = 'inicio';
    let pc = null, local = null, remoto = null;
    let canal = null, llamadaId = null, destino = null;
    let camara = 'user';
    let relojSinRespuesta = null, relojMaximo = null;

    function ir(nuevo, extra) {
      estado = nuevo;
      yo.estado = nuevo;
      yo.emitir('estado', Object.assign({ estado: nuevo }, extra || {}));
    }

    function limpiarRelojes() {
      clearTimeout(relojSinRespuesta); relojSinRespuesta = null;
      clearTimeout(relojMaximo); relojMaximo = null;
    }

    function desarmar() {
      limpiarRelojes();
      if (canal) { canal.cerrar(); canal = null; }
      if (pc) { try { pc.close(); } catch (_) {} pc = null; }
      RTC.cortarMedios(local); local = null;
      remoto = null;
    }

    yo.destinos = () => cfg().destinos.slice();
    yo.estado = estado;
    yo.llamadaActual = () => llamadaId;
    yo.destinoActual = () => destino;

    /* --- tocar el timbre --- */
    yo.tocar = async function (destinoId) {
      if (estado === 'llamando' || estado === 'enLlamada') return;
      destino = buscarDestino(destinoId);
      llamadaId = Ntfy.uid(8);

      try {
        ir('permisos', { destino: destino });
        local = await RTC.pedirMedios({
          video: cfg().llamada.videoVisitante,
          camara: camara
        });
        yo.emitir('streamLocal', local);
      } catch (e) {
        ir('error', { motivo: 'permisos', error: e });
        yo.emitir('error', e);
        return;
      }

      ir('llamando', { destino: destino });

      /* escuchar la respuesta antes de hablar */
      canal = Ntfy.escuchar(cfg().topicSenales, '1m',
        Ntfy.receptorDeSenales(async function (tipo, id, texto, msg, quien) {
          if (id !== llamadaId) return;
          if (tipo === 'answer' && pc && !pc.currentRemoteDescription) {
            try {
              await pc.setRemoteDescription({ type: 'answer', sdp: texto });
              limpiarRelojes();
              ir('enLlamada', { destino: destino });
              relojMaximo = setTimeout(function () { yo.colgar('tiempo'); },
                cfg().llamada.segundosMaxLlamada * 1000);
            } catch (e) { yo.emitir('error', e); }
          } else if (tipo === 'no') {
            desarmar(); ir('rechazada', { destino: destino });
          } else if (tipo === 'bye' && quien !== sesion) {
            desarmar(); ir('finalizada', { motivo: 'cortaronDelOtroLado' });
          }
        }));

      /* la campanilla: esto es lo que hace sonar el celular */
      const urlPanel = new URL(
        'panel.html?c=' + llamadaId + '&d=' + destino.id, location.href
      ).href;
      try {
        await Ntfy.publicar(destino.topic, {
          title: cfg().textos.tituloPush,
          message: cfg().textos.cuerpoPush + ' — ' + destino.nombre,
          priority: 5,
          tags: ['bell'],
          click: urlPanel,
          actions: [{ action: 'view', label: 'Atender', url: urlPanel, clear: true }]
        });
      } catch (e) {
        desarmar(); ir('error', { motivo: 'sinRed', error: e });
        yo.emitir('error', e); return;
      }

      /* la oferta WebRTC */
      try {
        pc = RTC.crearConexion();
        local.getTracks().forEach(function (t) { pc.addTrack(t, local); });
        pc.ontrack = function (ev) {
          remoto = ev.streams[0];
          yo.emitir('streamRemoto', remoto);
        };
        pc.onconnectionstatechange = function () {
          if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')
              && estado === 'enLlamada') {
            desarmar(); ir('finalizada', { motivo: 'conexionPerdida' });
          }
        };
        const oferta = await pc.createOffer({
          offerToReceiveAudio: true, offerToReceiveVideo: true
        });
        await pc.setLocalDescription(oferta);
        await RTC.esperarIce(pc, 3000);
        await Ntfy.enviarSenal(
          { tipo: 'offer', llamada: llamadaId, sesion: sesion },
          pc.localDescription.sdp
        );
      } catch (e) {
        desarmar(); ir('error', { motivo: 'webrtc', error: e });
        yo.emitir('error', e); return;
      }

      relojSinRespuesta = setTimeout(function () {
        if (estado === 'llamando') {
          desarmar(); ir('sinRespuesta', { destino: destino });
        }
      }, cfg().llamada.segundosSinRespuesta * 1000);
    };

    /* --- controles durante la llamada --- */
    yo.silenciarMicrofono = function (silenciar) {
      if (!local) return false;
      local.getAudioTracks().forEach(function (t) { t.enabled = !silenciar; });
      yo.emitir('microfono', !silenciar);
      return silenciar;
    };

    yo.cambiarCamara = async function () {
      if (!local || !pc) return;
      const anterior = camara;
      camara = (camara === 'user') ? 'environment' : 'user';
      let nuevo;
      try {
        /* solo video: el micrófono que ya está abierto se sigue usando */
        nuevo = await RTC.pedirSoloVideo(camara);
      } catch (e) {
        camara = anterior;   // no hay segunda cámara: queda como estaba
        throw e;
      }
      const pista = nuevo.getVideoTracks()[0];
      const emisor = pc.getSenders().find(function (s) {
        return s.track && s.track.kind === 'video';
      });
      if (emisor && pista) await emisor.replaceTrack(pista);
      local.getVideoTracks().forEach(function (t) {
        local.removeTrack(t); t.stop();
      });
      if (pista) local.addTrack(pista);
      yo.emitir('streamLocal', local);
      return camara;
    };

    yo.colgar = function (motivo) {
      if (llamadaId && (estado === 'llamando' || estado === 'enLlamada')) {
        Ntfy.enviarSenal({ tipo: 'bye', llamada: llamadaId, sesion: sesion }, null)
            .catch(function () {});
      }
      desarmar();
      ir('finalizada', { motivo: motivo || 'cortasteVos' });
    };

    /* --- si no atendieron, dejar constancia --- */
    yo.dejarAviso = async function (texto) {
      const d = destino || cfg().destinos[0];
      await Ntfy.publicar(d.topic, {
        title: '📩 Aviso en la puerta',
        message: texto || cfg().textos.avisoPush,
        priority: 4,
        tags: ['envelope']
      });
      yo.emitir('avisoEnviado', texto);
    };

    return yo;
  }

  /* ============================================================
     RESIDENTE — el que atiende
     ============================================================ */
  function crearResidente() {
    const yo = conEventos({});
    const sesion = Ntfy.uid(6);

    let estado = 'inicio';
    let pc = null, local = null, remoto = null;
    let canal = null, entrante = null, relojMaximo = null;
    const cerradas = new Set();

    function ir(nuevo, extra) {
      estado = nuevo;
      yo.estado = nuevo;
      yo.emitir('estado', Object.assign({ estado: nuevo }, extra || {}));
    }

    function desarmarLlamada() {
      clearTimeout(relojMaximo); relojMaximo = null;
      if (pc) { try { pc.close(); } catch (_) {} pc = null; }
      RTC.cortarMedios(local); local = null;
      remoto = null; entrante = null;
    }

    yo.estado = estado;
    yo.entrante = function () { return entrante; };

    /* --- quedarse a la escucha --- */
    yo.escuchar = function (opciones) {
      const esperado = (opciones && opciones.llamadaId) || null;
      ir('conectando');

      canal = Ntfy.escuchar(cfg().topicSenales, '10m',
        Ntfy.receptorDeSenales(function (tipo, id, texto, msg, quien) {
          if (tipo === 'offer') {
            if (cerradas.has(id)) return;
            /* no revivir timbrazos viejos que ntfy reenvía al reconectar */
            const antiguedad = Date.now() / 1000 - (msg.time || 0);
            if (id !== esperado && antiguedad > 90) return;
            if (entrante || estado === 'enLlamada') return;
            entrante = {
              id: id,
              sdp: texto,
              destino: buscarDestino((opciones && opciones.destinoId) || null),
              hora: new Date((msg.time || Date.now() / 1000) * 1000)
            };
            ir('entrante', { llamada: entrante });
            yo.emitir('entrante', entrante);
          } else if (tipo === 'answer' && quien !== sesion) {
            cerradas.add(id);
            if (entrante && entrante.id === id) {
              desarmarLlamada();
              ir('escuchando', { motivo: 'atendidaEnOtroDispositivo' });
            }
          } else if (tipo === 'bye' || tipo === 'no') {
            cerradas.add(id);
            if (entrante && entrante.id === id) {
              desarmarLlamada();
              ir('escuchando', { motivo: 'cortaronAntesDeAtender' });
            } else if (estado === 'enLlamada' && quien !== sesion) {
              desarmarLlamada();
              ir('escuchando', { motivo: 'cortaronDelOtroLado' });
            }
          }
        }));

      canal.fuente.onopen = function () {
        if (estado === 'conectando' || estado === 'reconectando') ir('escuchando');
      };
      canal.fuente.onerror = function () {
        if (estado === 'conectando' || estado === 'escuchando') ir('reconectando');
      };
      return yo;
    };

    /* --- atender --- */
    yo.atender = async function (opciones) {
      if (!entrante) return;
      const conVideo = (opciones && 'video' in opciones)
        ? opciones.video : cfg().llamada.videoResidente;
      const llamada = entrante;

      try {
        local = await RTC.pedirMedios({ video: conVideo, camara: 'user' });
        yo.emitir('streamLocal', local);
      } catch (e) {
        ir('error', { motivo: 'permisos', error: e });
        yo.emitir('error', e); return;
      }

      try {
        pc = RTC.crearConexion();
        pc.ontrack = function (ev) {
          remoto = ev.streams[0];
          yo.emitir('streamRemoto', remoto);
        };
        pc.onconnectionstatechange = function () {
          if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')
              && estado === 'enLlamada') {
            desarmarLlamada();
            ir('escuchando', { motivo: 'conexionPerdida' });
          }
        };
        await pc.setRemoteDescription({ type: 'offer', sdp: llamada.sdp });
        local.getTracks().forEach(function (t) { pc.addTrack(t, local); });
        const respuesta = await pc.createAnswer();
        await pc.setLocalDescription(respuesta);
        await RTC.esperarIce(pc, 3000);
        await Ntfy.enviarSenal(
          { tipo: 'answer', llamada: llamada.id, sesion: sesion },
          pc.localDescription.sdp
        );
        cerradas.add(llamada.id);
        ir('enLlamada', { llamada: llamada });
        relojMaximo = setTimeout(function () { yo.colgar('tiempo'); },
          cfg().llamada.segundosMaxLlamada * 1000);
      } catch (e) {
        desarmarLlamada();
        ir('error', { motivo: 'webrtc', error: e });
        yo.emitir('error', e);
      }
    };

    yo.rechazar = async function () {
      if (!entrante) return;
      const id = entrante.id;
      cerradas.add(id);
      desarmarLlamada();
      ir('escuchando', { motivo: 'rechazaste' });
      try {
        await Ntfy.enviarSenal({ tipo: 'no', llamada: id, sesion: sesion }, null);
      } catch (_) {}
    };

    yo.silenciarMicrofono = function (silenciar) {
      if (!local) return false;
      local.getAudioTracks().forEach(function (t) { t.enabled = !silenciar; });
      yo.emitir('microfono', !silenciar);
      return silenciar;
    };

    yo.apagarCamara = function (apagar) {
      if (!local) return false;
      local.getVideoTracks().forEach(function (t) { t.enabled = !apagar; });
      yo.emitir('camara', !apagar);
      return apagar;
    };

    yo.colgar = function (motivo) {
      const id = entrante && entrante.id;
      if (id) {
        cerradas.add(id);
        Ntfy.enviarSenal({ tipo: 'bye', llamada: id, sesion: sesion }, null)
            .catch(function () {});
      }
      desarmarLlamada();
      ir('escuchando', { motivo: motivo || 'cortasteVos' });
    };

    /* Se llama al cerrar la pestaña: hay que avisarle al visitante que
       no espere más, y tiene que salir antes de que muera la página. */
    yo.detener = function () {
      const id = entrante && entrante.id;
      if (id && (estado === 'enLlamada' || estado === 'entrante')) {
        cerradas.add(id);
        Ntfy.avisarAlCerrar({ tipo: 'bye', llamada: id, sesion: sesion });
      }
      if (canal) { canal.cerrar(); canal = null; }
      desarmarLlamada();
      ir('inicio');
    };

    return yo;
  }

  global.Timbre = {
    visitante: crearVisitante,
    residente: crearResidente,
    destinos: function () { return cfg().destinos.slice(); },
    casa: function () { return cfg().casa; }
  };
})(window);
