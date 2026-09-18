/* ============================================================
   geo.js — ¿el que toca está realmente en la puerta?
   Le pide la ubicación al navegador del visitante y la compara
   con la de la casa. Sirve para frenar al que guardó el link y
   toca desde lejos.
   ============================================================ */
(function (global) {
  'use strict';

  const cfg = () => global.TIMBRE_CONFIG;

  /* ---------- distancia entre dos puntos, en metros ----------
     Fórmula del semiverseno. A escala de cuadras es exacta.   */
  function distancia(lat1, lon1, lat2, lon2) {
    const R = 6371000;                 // radio de la Tierra en metros
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /* ---------- pedirle la posición al navegador ---------- */
  function posicionActual(msEspera) {
    return new Promise(function (resolver, rechazar) {
      if (!global.navigator || !navigator.geolocation) {
        const e = new Error('sin geolocalización');
        e.code = 0;
        return rechazar(e);
      }
      navigator.geolocation.getCurrentPosition(
        function (p) {
          resolver({
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            precision: p.coords.accuracy    // radio de incertidumbre, en metros
          });
        },
        rechazar,
        {
          enableHighAccuracy: true,
          timeout: msEspera || 15000,
          maximumAge: 30000               // un fix de hace medio minuto sirve
        }
      );
    });
  }

  /* ---------- el veredicto ----------
     Devuelve { estado, distancia, precision }, con estado:
       cerca       -> está en la puerta
       lejos       -> está fuera del radio
       impreciso   -> el fix es tan malo que no se puede afirmar nada
       sinPermiso  -> no quiso dar la ubicación
       sinSenal    -> no la pudo obtener (bajo techo, sin GPS, tardó)
       sinSoporte  -> el navegador no tiene geolocalización
       apagada     -> la verificación está desactivada en config.js
       sinPunto    -> está activada pero falta cargar las coordenadas
  */
  async function verificar() {
    const u = cfg().ubicacion;
    if (!u || !u.activa) return { estado: 'apagada' };
    if (typeof u.lat !== 'number' || typeof u.lon !== 'number') {
      return { estado: 'sinPunto' };
    }

    let pos;
    try {
      pos = await posicionActual((u.segundosEspera || 15) * 1000);
    } catch (e) {
      /* code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT */
      if (e && e.code === 0) return { estado: 'sinSoporte' };
      return { estado: (e && e.code === 1) ? 'sinPermiso' : 'sinSenal', error: e };
    }

    const metros = distancia(u.lat, u.lon, pos.lat, pos.lon);
    const tope = u.precisionMinimaAceptada || 1000;

    /* Un fix de varios kilómetros (típico de la ubicación por IP) haría
       pasar a cualquiera: si el margen de error es mayor que el tope,
       no alcanza para afirmar que está en la puerta.                  */
    if (pos.precision > tope) {
      return {
        estado: 'impreciso',
        distancia: Math.round(metros),
        precision: Math.round(pos.precision)
      };
    }

    /* Se le concede el beneficio de la duda por el margen del GPS:
       alcanza con que el círculo de incertidumbre toque el radio.    */
    const cerca = (metros - pos.precision) <= u.radioMetros;

    return {
      estado: cerca ? 'cerca' : 'lejos',
      distancia: Math.round(metros),
      precision: Math.round(pos.precision)
    };
  }

  /* ¿este resultado habilita a tocar el timbre? */
  function habilita(resultado) {
    const u = cfg().ubicacion;
    if (!u || !u.activa) return true;
    if (resultado.estado === 'apagada' || resultado.estado === 'sinPunto') return true;
    if (u.modo === 'avisar') return true;      // deja pasar, pero queda marcado
    return resultado.estado === 'cerca';
  }

  global.TimbreGeo = { distancia, posicionActual, verificar, habilita };
})(window);
