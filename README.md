# TimbreQR casero

Un timbre con código QR para tu casa. El visitante escanea la placa, se abre una
página web y te hace una videollamada al celular. Sin cables, sin obra, sin
abono y **sin gastar un peso** más allá de la placa de metal.

## Cómo funciona

```
  Visitante                      ntfy.sh (gratis)                  Tu celular
 ┌──────────┐                   ┌───────────────┐                ┌──────────┐
 │ escanea  │──── "tocaron" ───▶│  notificación │───── push ────▶│  suena   │
 │  el QR   │                   │   urgente     │                │          │
 │          │                   └───────────────┘                │  tocás   │
 │          │◀─── señalización (offer/answer, comprimida) ──────▶│ atender  │
 │  habla   │◀═══════ video y audio punto a punto ══════════════▶│  hablás  │
 └──────────┘         (WebRTC: no pasa por ningún servidor)      └──────────┘
```

Tres piezas, todas gratuitas:

- **GitHub Pages** aloja la página. HTTPS incluido, que es obligatorio para
  poder usar la cámara.
- **[ntfy.sh](https://ntfy.sh)** hace sonar el celular. Es el reemplazo del
  cable del timbre. También se usa como canal de señalización.
- **WebRTC** transporta el video y el audio directamente entre los dos
  teléfonos. Nadie lo intermedia, ni lo graba, ni lo ve.

---

## Puesta en marcha

### 1. Elegí el nombre y los destinos

Abrí `config.js`. Ya viene con un topic secreto aleatorio generado para vos
(`timbreqr-6b2df903cb3470b6-…`). Cambiá el nombre de la casa y, si querés que
suene en varios celulares por separado, agregá destinos.

> El topic es la única llave del sistema: **no lo publiques en ningún lado.**
> Quien lo conozca puede hacer sonar tu timbre.

### 2. Instalá ntfy en el celular

1. Bajá **ntfy** de [Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
   o [App Store](https://apps.apple.com/us/app/ntfy/id1625396347). Es gratis y de código abierto.
2. Tocá **+**, y suscribite al topic de tu destino: `timbreqr-6b2df903cb3470b6-casa`
   (el de `config.js`, exactamente igual).
3. Entrá a la suscripción → **⋮** → y ponele:
   - un **sonido** fuerte y distinto al de los mensajes,
   - **prioridad máxima**,
   - permiso para **saltear el modo No molestar** (Android: Ajustes → Apps →
     ntfy → Notificaciones → permitir interrupción).

> No te suscribas al topic terminado en `-sig`: ese es tráfico interno de las
> llamadas, no son timbrazos.

### 3. Subilo a GitHub Pages

**Ya está hecho.** El timbre vive en:

### https://ggonzalospineli-ops.github.io/timbre/

Repositorio: https://github.com/ggonzalospineli-ops/timbre

Para publicar cambios, desde esta carpeta:

```bash
git add -A && git commit -m "lo que cambiaste" && git push
```

En un minuto ya están arriba.

### 4. Probalo antes de gastar en la placa

1. Abrí `https://ggonzalospineli-ops.github.io/timbre/panel.html` en el celular y dejalo abierto.
2. Abrí `https://ggonzalospineli-ops.github.io/timbre/` en otro dispositivo (o en la compu).
3. Tocá el timbre. Tiene que sonar la notificación **y** funcionar el video.
4. Cerrá el panel y volvé a tocar: la notificación tiene que llegar igual, y al
   tocarla tiene que abrirse el panel con la llamada enganchada.

Recién cuando eso funcione, seguí.

### 5. El QR y la placa

Abrí `https://ggonzalospineli-ops.github.io/timbre/qr.html`, verificá que la dirección sea
la correcta y descargá **placa-timbre.svg**. Eso le mandás al que graba.

**La dirección queda grabada para siempre.** El contenido lo podés cambiar
cuando quieras, pero la URL no: no borres ni renombres nunca ese repositorio.

Para grabado en acero: el SVG es vectorial, escala a cualquier tamaño. Un QR de
6 cm de lado se lee sin problemas desde unos 40 cm. El QR se genera con
corrección de errores alta, así que sigue funcionando rayado o sucio.

### 6. Instalá el panel como app

En el celular, abrí `panel.html` → menú del navegador → **Agregar a pantalla de
inicio**. Queda como una app y abre al instante.

---

## Lo que cuesta y lo que no

| | |
|---|---|
| Hosting (GitHub Pages) | $0, sin límite práctico |
| Notificaciones (ntfy.sh) | $0. Tope de ~250 mensajes por día. Un timbrazo usa 2–4. |
| Video y audio (WebRTC) | $0, va directo entre los celulares |
| Consumo de datos | ~1 MB por minuto de videollamada |
| **La placa de metal** | **lo único que pagás** |

---

## Privacidad

El video y el audio van punto a punto: no pasan por ningún servidor, no quedan
grabados. Por ntfy.sh solo viaja el aviso de "tocaron" y el SDP de WebRTC
(comprimido), que sirve únicamente para armar la conexión. No se manda tu número
de teléfono a ningún lado, y el visitante nunca lo ve.

### La contra honesta

Al no haber servidor propio, **el topic viaja dentro del JavaScript de la
página**. Cualquiera que escanee tu QR y mire el código fuente puede quedarse
con él y, más adelante, hacer sonar tu timbre desde cualquier lado. Con
GitHub Pages gratis el repositorio además es público, así que también está ahí.

Para una casa esto suele ser aceptable: el que está parado en tu puerta puede
tocar el timbre igual. El riesgo real no es el vecino, es el troleo remoto.

Lo que sí resuelve el diseño: **el QR no contiene el topic**, apunta a la
página. Así que si alguna vez te molestan, cambiás el topic en `config.js`,
lo cambiás en la app del celular, y listo — **la placa de metal sigue
sirviendo, no hay que grabar nada de nuevo.** Rotarlo lleva dos minutos.

Si querés cerrarlo del todo, sin gastar:

- **Cloudflare Workers** (plan gratuito, 100.000 pedidos por día): un proxy de
  20 líneas que guarda el topic del lado del servidor y limita cuántos
  timbrazos por minuto se aceptan. La página llama al Worker en vez de a ntfy.
- **ntfy autohospedado** en una Raspberry o una PC vieja, con usuarios y
  permisos de verdad. Solo hay que cambiar `servidor` en `config.js`.

---

## Si algo no anda

**No suena la notificación.** Fijate que el topic esté escrito idéntico en la
app y en `config.js`, y que Android no tenga a ntfy en optimización de batería
(Ajustes → Apps → ntfy → Batería → Sin restricciones).

**Suena pero el video no conecta.** Casi siempre es la NAT del operador móvil.
Ya viene configurado un TURN público de respaldo, pero a veces está saturado.
Solución gratis: creá una cuenta en [metered.ca](https://www.metered.ca/tools/openrelay/)
(plan gratuito, 500 MB por mes, de sobra para un timbre), y pegá tus credenciales
en `js/rtc.js`, en `SERVIDORES_ICE`.

**No pide la cámara.** Solo funciona por HTTPS. En `http://` o abriendo el
archivo con doble clic, el navegador bloquea la cámara. Probá siempre contra
la URL de GitHub Pages.

**Atienden dos celulares a la vez.** Está contemplado: el primero que atiende se
queda con la llamada y al otro le aparece "atendieron desde otro dispositivo".

---

## Plan B en dos minutos

Si querés algo funcionando hoy mismo mientras terminás esto, grabá en la placa
un QR que apunte a:

```
https://wa.me/549XXXXXXXXXX?text=Hola,%20estoy%20en%20la%20puerta
```

Se abre WhatsApp con el chat listo y el visitante te puede videollamar. Gratis y
sin nada que mantener. La contra es que le mostrás tu número a cualquiera que
escanee, y por eso conviene el sistema de acá.

---

## Para más adelante

- **Abrir la puerta desde el celular:** un ESP32 con un relé conectado al
  portero eléctrico, suscrito a un topic de ntfy. Unos pocos miles de pesos y
  entra en el mismo esquema: un botón más en el panel.
- **Registro de visitas:** la página puede guardar quién tocó y cuándo.
- **Horarios:** que fuera de cierto horario mande aviso en vez de llamar.

---

## Pruebas

La lógica está cubierta por pruebas que corren sin navegador ni servidor
(WebRTC y ntfy simulados en memoria). Si tocás algo del motor, corrélas:

```bash
node pruebas/flujo.js       # timbrazo -> atender -> hablar -> colgar
node pruebas/bordes.js      # rechazo, dos celulares a la vez, aviso, cierre de panel
node pruebas/camara.js      # girar la cámara sin abrir otro micrófono
node pruebas/senales.js     # el SDP entra en el límite de 4 KB de ntfy
node pruebas/peor-caso.js   # partido en trozos y rearmado desordenado
```

---

## Estructura

```
config.js              lo único que editás vos
index.html             pantalla del visitante (la abre el QR)
panel.html             pantalla del residente (la abrís vos)
qr.html                generador del SVG de la placa
estilos.css            provisorio, se reemplaza al diseñar
js/ntfy.js             transporte: push + señalización comprimida
js/rtc.js              WebRTC: conexión, STUN/TURN, cámara y micrófono
js/timbre.js           la lógica: estados de la llamada
js/ui-visitante.js     pegamento con la pantalla (descartable)
js/ui-residente.js     pegamento con la pantalla (descartable)
sw.js                  service worker (que el panel abra rápido)
UI-CONTRATO.md         la guía para quien diseñe la interfaz
```
