/* ============================================================
   TimbreQR casero — CONFIGURACIÓN
   Este es el único archivo que necesitás tocar.
   ============================================================ */

window.TIMBRE_CONFIG = {

  /* Nombre que ve el visitante al escanear el QR. */
  casa: 'Casa Spinelli',

  /* Servidor de notificaciones. ntfy.sh es gratis y público.
     (Si algún día te armás tu propio ntfy, cambiás esta URL y listo.) */
  servidor: 'https://ntfy.sh',

  /* Topic secreto para la señalización de las llamadas.
     NO te suscribas a este desde la app del celular: es tráfico interno,
     no son timbrazos. */
  topicSenales: 'timbreqr-6b2df903cb3470b6-sig',

  /* A quién puede llamar el visitante.
     - 1 destino  -> el visitante ve un solo botón grande "Tocar timbre".
     - 2 o más    -> el visitante elige (igual que "elegís la unidad").
     Cada destino tiene su propio topic: en la app de ntfy del celular te
     suscribís solo a los topics que querés que te hagan sonar. */
  destinos: [
    {
      id: 'casa',
      nombre: 'Casa',
      detalle: 'Timbre principal',
      topic: 'timbreqr-6b2df903cb3470b6-casa'
    }
    // Ejemplo para sumar más (descomentá y cambiá el texto):
    // {
    //   id: 'gonzalo',
    //   nombre: 'Gonzalo',
    //   detalle: 'Suena solo en su celular',
    //   topic: 'timbreqr-6b2df903cb3470b6-gonzalo'
    // }
  ],

  /* Comportamiento de la llamada */
  llamada: {
    videoVisitante: true,   // el visitante se muestra con la cámara frontal
    videoResidente: true,   // vos también te mostrás al atender
    segundosSinRespuesta: 45, // después de esto se ofrece "dejar aviso"
    segundosMaxLlamada: 300   // corta sola a los 5 min
  },

  /* Verificación de ubicación: solo puede tocar el timbre quien
     está realmente en la puerta. Frena al que guarda el link y
     toca desde lejos.

     Para cargar las coordenadas, abrí ubicacion.html PARADO EN TU
     CASA: te las mide y te da este bloque listo para pegar acá. */
  ubicacion: {
    activa: false,          // ponelo en true cuando cargues lat y lon
    lat: null,
    lon: null,
    radioMetros: 150,       // hasta acá se considera "en la puerta"
    modo: 'bloquear',       // 'bloquear' = no deja llamar de lejos
                            // 'avisar'   = deja llamar, pero te avisa en la notificación
    segundosEspera: 15,     // cuánto esperar el GPS antes de rendirse
    precisionMinimaAceptada: 1000,  // si el GPS falla por más de esto, no alcanza
    dejarAvisoSiLejos: true // el de lejos igual puede dejarte un mensaje escrito
  },

  /* Textos que aparecen en la notificación del celular */
  textos: {
    tituloPush: '🔔 Timbre',
    cuerpoPush: 'Hay alguien en la puerta',
    avisoPush: 'Pasé y no había nadie'
  }
};
