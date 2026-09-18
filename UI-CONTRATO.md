# Contrato de UI — TimbreQR casero

Este documento es para quien diseñe la interfaz. **La lógica ya está resuelta y
probada**: WebRTC, señalización, notificaciones push y PWA. La UI no tiene que
saber nada de eso.

## Regla de oro

| Se puede reescribir de cero | No se toca |
|---|---|
| `index.html` | `js/timbre.js` |
| `panel.html` | `js/rtc.js` |
| `estilos.css` | `js/ntfy.js` |
| | `js/geo.js` |
| `js/ui-visitante.js` | `config.js` (solo lo edita el dueño de casa) |
| `js/ui-residente.js` | |

Los cuatro archivos de la izquierda son **descartables**: están para que el
sistema funcione mientras se diseña. Reemplazalos enteros.

Lo único que hay que respetar es el orden de carga de los scripts:

```html
<script src="config.js"></script>
<script src="js/ntfy.js"></script>
<script src="js/rtc.js"></script>
<script src="js/geo.js"></script>
<script src="js/timbre.js"></script>
<script src="js/mi-ui.js"></script>   <!-- lo tuyo -->
```

---

## Las dos pantallas

**`index.html` — el visitante.** Es lo que se abre al escanear el QR de la
placa. Lo usa alguien parado en la puerta, apurado, con una mano, con sol
de frente y posiblemente con datos móviles lentos. Es la pantalla que más
importa.

**`panel.html` — el residente.** La abrís vos tocando la notificación que te
llega al celular. Tiene que poder atenderse en menos de dos segundos y
con el pulgar.

---

## API del visitante

```js
const timbre = Timbre.visitante();
```

### Métodos

| Método | Qué hace |
|---|---|
| `timbre.tocar(destinoId)` | Toca el timbre. `destinoId` sale de `Timbre.destinos()`. |
| `timbre.colgar()` | Corta. Sirve tanto llamando como en llamada. |
| `timbre.silenciarMicrofono(bool)` | Mutea/desmutea. |
| `timbre.cambiarCamara()` | Alterna frontal/trasera. Devuelve `'user'` o `'environment'`. |
| `timbre.dejarAviso(texto)` | Manda una notificación de texto si no atendieron. Devuelve promesa. |

### Datos

```js
Timbre.casa()               // 'Casa'   -> el nombre configurado
Timbre.destinos()           // [{ id, nombre, detalle, topic }, ...]
timbre.estado               // el estado actual, como string
timbre.destinoActual()      // a quién se está llamando
```

> Si `Timbre.destinos()` devuelve **un solo destino**, no muestres una lista:
> mostrá un único botón grande que diga "Tocar timbre". Si devuelve varios,
> ahí sí hay que elegir (equivale al "elegís la unidad" del original).

### Eventos

```js
timbre.on('estado', (e) => { /* e.estado, e.motivo, e.destino */ });
timbre.on('streamLocal',  (stream) => { videoPropio.srcObject = stream; });
timbre.on('streamRemoto', (stream) => { videoDelOtro.srcObject = stream; });
timbre.on('microfono', (activo) => {});
timbre.on('avisoEnviado', () => {});
timbre.on('fotoEnviada', () => {});   // se mandó la foto del visitante
timbre.on('error', (err) => {});
```

### Estados del visitante

| `e.estado` | Qué mostrar |
|---|---|
| `inicio` | El botón (o la lista de destinos). |
| `ubicando` | Comprobando que esté en la puerta. Dura 1–15 s. Solo aparece si la verificación de ubicación está activa. |
| `permisos` | "Permití cámara y micrófono". Dura 1–3 s. |
| `llamando` | Llamando. Es el momento más largo (hasta 45 s): merece animación y un botón de cancelar. |
| `enLlamada` | Video en vivo + controles. |
| `sinRespuesta` | Nadie atendió. Ofrecer "dejar aviso" y "llamar de nuevo". Si `e.hayFoto` es `true`, ya se envió una foto del visitante y conviene decirlo. |
| `lejos` | No se pudo confirmar que esté en la puerta, así que no puede llamar. `e.ubicacion.estado` dice por qué: `lejos` (con `e.ubicacion.distancia` en metros), `impreciso`, `sinPermiso`, `sinSenal` o `sinSoporte`. Ofrecer reintentar y dejar un mensaje escrito. |
| `rechazada` | No pueden atender ahora. |
| `finalizada` | Terminó. `e.motivo`: `cortasteVos`, `cortaronDelOtroLado`, `conexionPerdida`, `tiempo`. |
| `error` | `e.motivo`: `permisos`, `sinRed`, `webrtc`. |

---

## API del residente

```js
const panel = Timbre.residente();
panel.escuchar({
  llamadaId: new URLSearchParams(location.search).get('c'),
  destinoId: new URLSearchParams(location.search).get('d')
});
```

Los parámetros `c` y `d` los pone la notificación push. **Hay que pasarlos**:
sin ellos el panel no engancha la llamada que ya está sonando.

### Métodos

| Método | Qué hace |
|---|---|
| `panel.atender({ video: true })` | Atiende. `video: false` = solo audio. |
| `panel.rechazar()` | Rechaza; al visitante le aparece `rechazada`. |
| `panel.colgar()` | Corta una llamada en curso. |
| `panel.silenciarMicrofono(bool)` | Mutea. |
| `panel.apagarCamara(bool)` | Apaga el video propio sin cortar. |
| `panel.detener()` | Deja de escuchar (al salir de la pantalla). |

### Eventos

```js
panel.on('estado', (e) => {});
panel.on('entrante', (llamada) => { /* llamada.hora, llamada.destino */ });
panel.on('streamLocal',  (s) => {});
panel.on('streamRemoto', (s) => {});
panel.on('error', (e) => {});
```

### Estados del residente

| `e.estado` | Qué mostrar |
|---|---|
| `conectando` | Enganchando con el servidor de notificaciones. |
| `escuchando` | Todo listo. Si viene `e.motivo`, es el desenlace de la llamada anterior. |
| `reconectando` | Se cayó la conexión; se reintenta sola. |
| `entrante` | **Están tocando.** Atender / Solo audio / Rechazar. |
| `enLlamada` | Video + controles. |
| `error` | `e.motivo`: `permisos`, `webrtc`. |

`e.motivo` al volver a `escuchando`: `cortasteVos`, `rechazaste`,
`cortaronAntesDeAtender`, `cortaronDelOtroLado`, `atendidaEnOtroDispositivo`,
`conexionPerdida`, `tiempo`.

---

## Verificación de ubicación

Si está activa en `config.js`, el motor le pide la ubicación al visitante
**antes** de pedirle la cámara, y puede cortar el flujo con el estado `lejos`.
La UI no hace nada de esto: solo dibuja los dos estados nuevos.

`timbre.ubicacion()` devuelve el último resultado: `{ estado, distancia, precision }`.

Tres cosas a tener en cuenta al diseñar:

- **`ubicando` puede durar hasta 15 segundos.** Bajo techo el primer fix del GPS
  tarda. Merece una animación, no un cartel quieto.
- **`lejos` no siempre es un troll.** Puede ser un visitante real con mal GPS o
  que negó el permiso sin querer. El tono no debería acusar, y siempre tiene que
  quedar una salida: reintentar, o dejar un mensaje escrito.
- **El rótulo del encabezado no puede afirmar lo que está en duda.** En `ubicando`
  y `lejos` no corresponde decir "estás en la puerta".

## Foto del visitante

Si nadie atiende, el motor manda una foto del visitante junto al aviso. La
captura se hace apenas empieza a sonar (con la cámara ya entregando imagen),
no al final: para entonces los medios ya están cortados.

**La UI tiene que avisarlo.** Sacarle una foto a alguien sin decírselo no
está bien: el aviso va en la pantalla de `llamando`, antes de que la foto
exista. Está puesto, no lo saques al rediseñar.

## Historial en el panel

`panel.html` muestra los últimos timbrazos leyendo lo que ntfy ya guarda
(`TimbreNtfy.historial(topic, '24h')`). Ese contenido **llega de la red**: hay
que pintarlo con `textContent`, nunca con `innerHTML`.

## Detalles que la UI tiene que resolver

1. **`<video>` siempre con `autoplay playsinline`**, y el propio además `muted`.
   Sin `playsinline`, iOS abre el video a pantalla completa y rompe el diseño.
2. **El audio remoto no se mutea nunca.** Si el video remoto se oculta (modo
   solo audio), el elemento tiene que seguir en el DOM reproduciendo.
3. **Atender es una acción de un solo toque.** El botón grande, abajo, al
   alcance del pulgar. Nada de confirmaciones.
4. **`safe-area-inset`** en los bordes: estas pantallas se usan a pantalla
   completa en el celular.
5. **Sirve el modo oscuro**, pero el visitante suele estar al sol: alto
   contraste y botones grandes ganan siempre.
6. **La campanilla de la página** (`ui-residente.js` la genera con WebAudio, sin
   archivos de audio) y `navigator.vibrate` solo funcionan con el panel abierto.
   Quien despierta al celular es la notificación de ntfy.
7. **Estado `llamando`:** es el que más se ve y el más incierto. Una animación
   que dé sensación de progreso evita que el visitante toque cinco veces.

## Para probar sin tener a alguien en la puerta

Abrí `index.html` en una pestaña y `panel.html` en otra, en el mismo navegador.
Funciona igual que entre dos dispositivos. Usá auriculares para que no se acople.
