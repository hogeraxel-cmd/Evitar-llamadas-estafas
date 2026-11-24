# Plan: pasar Aló Seguro a Firebase (Etapa 2)

Objetivo: que una familia real pueda usar la app desde sus celulares, con login de verdad,
datos guardados y avisos que lleguen aunque la app esté cerrada.

## Qué se usa de Firebase

| Hoy (prototipo)                         | Con Firebase                                             |
|-----------------------------------------|----------------------------------------------------------|
| Cada uno elige "soy Rosa / soy Nico"    | **Auth por número de teléfono** (código SMS)             |
| Datos en memoria del servidor           | **Firestore** (familias, miembros, verificaciones, alertas) |
| Nico ve el aviso solo con la app abierta | **Cloud Messaging (FCM)**: notificación push            |
| `node src/server.js` en el PC           | **Hosting** con HTTPS (app instalable) + **Cloud Functions** |
| PIN local                               | Se mantiene el PIN; después huella/rostro (WebAuthn)     |

## Datos en Firestore

```
familias/{familiaId}
  nombre, creada
  miembros/{uid}            nombre, rol ('adulto_mayor' | 'familiar' | 'admin'), telefono, tokensPush[]
  invitaciones/{codigo}     creadaPor, vence, usada
verificaciones/{id}         familiaId, solicitanteId, objetivoId, opciones[], estado, creada, expira
  privado/desafio           desafio            <- solo lo lee quien pidió (Rosa)
alertas/{id}                familiaId, solicitudId, gravedad, texto, cuando
```

El número correcto (`desafio`) va en una subcolección aparte para que las reglas de seguridad
impidan que Nico lo lea. Si Nico pudiera verlo, la verificación no serviría.

## Lógica en Cloud Functions (no en el celular)

La lógica de `src/verificacion.js` se mueve casi tal cual a funciones, porque el celular no es de fiar:

- `crearVerificacion` (callable): valida misma familia, reusa la pendiente, genera número y opciones, **envía push a Nico**.
- `responderVerificacion` (callable): solo el objetivo; compara con el desafío; crea alertas.
- `vencerVerificaciones` (programada cada minuto): pasa a `expirado` y avisa a la familia.
- `analizarTexto` (callable): usa `src/riesgo.js` tal cual.
- Al crear una alerta alta: **push a toda la familia**.

## Reglas de seguridad (resumen)

- Solo miembros de una familia leen sus miembros, verificaciones y alertas.
- Nadie escribe verificaciones ni alertas desde el celular: solo las Functions.
- `verificaciones/{id}/privado/desafio`: lectura solo para `solicitanteId`.
- Probar las reglas con el emulador (`firebase emulators:start`) y pruebas automáticas.

## Cómo se une una familia

1. Camila (hija) instala, entra con su número y crea la familia: queda como admin.
2. Agrega a Rosa y Nico: genera un **código o QR de invitación** que vence en 24 h.
3. Rosa y Nico entran con su número y escanean o escriben el código.
   Camila puede ayudar a Rosa a configurarlo en persona.

## Aviso a Nico por pasos (escalamiento)

Nico puede ir caminando con el teléfono en el bolsillo, o no tener la app instalada.
Por eso el aviso sube de intensidad hasta que alguien responde:

| Tiempo | Qué pasa | Necesita la app | Servicio |
|---|---|---|---|
| 0 s | **Push** (suena y vibra como WhatsApp) | Sí | FCM (gratis) |
| 30 s sin respuesta, o no tiene la app | **SMS con enlace** que abre una página con los 6 números y "No estoy hablando con Rosa", sin instalar nada | No | Proveedor de SMS (ej. Twilio): cobra por SMS |
| 60 s sin respuesta | **Llamada automática**: "Rosa está verificando una llamada. Si estás hablando con ella, marca el número que te dice. Si no, marca 9" | No (sirve hasta en un teléfono básico) | Voz de Twilio u otro: cobra por minuto |
| 2 min | Vence: aviso a toda la familia, y a Rosa le sale "No respondió. Corte y llámelo al número de siempre" | – | Ya existe en el prototipo |

Detalles:
- El enlace del SMS lleva un **código de un solo uso** que vence con la verificación. La página **nunca pide datos, claves ni login**: solo muestra los 6 números. Explicarle esto a la familia, porque los estafadores también mandan SMS con enlaces.
- La llamada automática: si Nico está hablando con Rosa desde su número, le entra como llamada en espera. Puede contestar o seguir con el SMS o el push.
- Cada familiar elige en la app qué pasos quiere (por ejemplo, "no me llamen, mándenme SMS").
- **WhatsApp con botón** reemplazaría al SMS más adelante, porque es lo que más se mira en Chile. Requiere la API de WhatsApp Business: empresa verificada en Meta, plantillas de mensaje aprobadas y cobro por conversación. Dejarlo para cuando haya usuarios reales.
- Costos: con pocas familias son unos pocos pesos por verificación. Poner límite de gasto en el proveedor.
- La lógica va en una Cloud Function programada (cada 15-30 s revisa las verificaciones pendientes y avanza el paso).

## Avisos push: detalles importantes

- **Android**: funciona desde el navegador (Chrome), instalada o no.
- **iPhone**: solo si la app está **agregada a la pantalla de inicio** (iOS 16.4 o más nuevo).
  Hay que mostrar instrucciones paso a paso al configurar.
- Si el push falla, queda la alerta en la app y el aviso por vencimiento a la familia.

## Costos

- Auth por teléfono: Firebase cobra los SMS después de una cuota gratuita (revisar el precio por SMS a Chile).
- Firestore, Functions, Hosting y FCM: para una o pocas familias entra en el plan gratuito o cuesta muy poco.
- Cloud Functions exige el plan **Blaze** (pago por uso). Conviene poner un **límite de presupuesto**.

## Orden de trabajo sugerido

1. Crear el proyecto Firebase (lo hace Axel en la consola) y conectar con el emulador local.
2. Pasar `verificacion.js` y `riesgo.js` a Cloud Functions, con las pruebas actuales funcionando en el emulador.
3. Firestore y reglas de seguridad, con pruebas de reglas.
4. Login por teléfono y flujo de invitación a la familia.
5. App web: cambiar `fetch('/api/...')` por Firebase SDK, y escuchar cambios en tiempo real en vez de consultar cada 2 s.
6. Push con FCM, incluyendo instrucciones para iPhone.
7. Escalamiento: SMS con enlace y llamada automática (ver "Aviso a Nico por pasos").
8. Hosting y prueba con la familia real.
9. Más adelante: WhatsApp con botón en vez de SMS.

## Antes de usarlo con personas reales

- Política de privacidad simple (se guardan números de teléfono y nombres).
- Botón para salir de la familia y borrar los datos.
- La parte de llamadas (grabar o transcribir) queda fuera hasta tener revisión legal.

## Avance (2026-11-24): pasos 2 y 3 hechos en el emulador

Código en `firebase/`, con 29 pruebas contra el emulador (`cd firebase && npm test`). Sin proyecto real ni despliegue.

Decisiones que difieren del esquema de arriba:

- **`usuarios/{uid}`** (`{familiaId}`): la app necesita saber a qué familia pertenece quien entró. Cada uno lee solo el suyo.
- **`invitaciones/{sha256(codigo)}`** va en la raíz y no dentro de `familias/`: así `unirse` la encuentra por el código sin conocer la familia. El código nunca se guarda en claro. Vence a las 24 h y es de un solo uso.
- **`intentosInvitacion/{uid}`**: máximo 10 intentos de código por hora por persona, contados en una transacción aparte (si no, un intento fallido revertiría su propio conteo). Falta sumar App Check para frenar abuso desde muchas cuentas.
- **`admin` es un campo** del miembro (`rol` queda en `adulto_mayor` | `familiar`). Solo el admin invita.
- **`familias/{id}/ajustes/palabra`**: la palabra de la familia. La leen los miembros; solo la función la escribe.
- La verificación guarda los **nombres cortos** (`solicitante`, `objetivo`) para armar los avisos sin más lecturas.
- El único campo que el celular escribe es `vistoEn` (con la hora del servidor), para saber si el familiar usa la app.

Pendiente de este bloque:

- Elegir la ubicación de Firestore en la consola: debe ser Santiago (`southamerica-west1`) para coincidir con la región de las funciones.
- La tarea `vencerVerificaciones` necesita el plan Blaze (Cloud Scheduler). Mientras tanto, `responderVerificacion` ya vence al vuelo si llega tarde, y la app puede comparar `expira` con la hora.
- Solo se probó que `functions/index.js` carga y expone las funciones; los envoltorios `onCall` se probarán cuando haya emulador de Functions o proyecto.
- `analizarTexto` como función y el aviso por push/SMS/llamada siguen en los pasos 5 a 7.
