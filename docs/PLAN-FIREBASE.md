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
7. Hosting y prueba con la familia real.

## Antes de usarlo con personas reales

- Política de privacidad simple (se guardan números de teléfono y nombres).
- Botón para salir de la familia y borrar los datos.
- La parte de llamadas (grabar o transcribir) queda fuera hasta tener revisión legal.
