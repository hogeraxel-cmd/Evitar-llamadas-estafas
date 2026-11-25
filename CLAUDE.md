# Aló Seguro: notas para Claude

Prototipo de verificación de familiares y detección de estafas telefónicas. Ver `README.md` para qué es y cómo correrlo.

## Datos útiles

- Rama principal: `claude/beautiful-newton-w8yy5x` (no hay `main`).
- Sin dependencias: basta Node 20+. `npm start` (puerto 3000, cambiable con `PORT`) y `npm test`.
- Responder en español. Antes de usar el puerto 3000, revisar que esté libre.
- En PowerShell 5.1, los mensajes de commit con comillas `"` se rompen: usar `git commit -F archivo`.

## Hecho (2026-11-20)

- El servidor no arrancaba en Windows (comparación `import.meta.url` vs `process.argv[1]`). Arreglado en `src/server.js`.
- Si Rosa tocaba dos veces "Verificar a Nico" se creaban dos solicitudes y los números no coincidían. Ahora se reusa la pendiente (`crear()` en `src/verificacion.js`), con prueba.
- Probado en el navegador: verificar con el número correcto, "No soy yo" (Rosa ve "Es una estafa", Camila y Nico ven la alerta alta) y la revisión de mensajes.
- Detector (`src/riesgo.js`): ahora reconoce el trato de "tú" (transfieras, no le digas, dime el código...). "Familiar en apuros o con número nuevo + dinero" es alto aunque no haya urgencia. Las frases seguras ("no necesita pagar") se quitan del texto antes de buscar señales.
- Textos con tildes y sin género fijo; las alertas dicen quién llamó a quién ("alguien llamó a Rosa haciéndose pasar por Nico").

- `npm run red`: servidor abierto al Wi-Fi para probar en celulares. El firewall de Windows ya permite Node (perfil Público).
- Sin HTTPS no existe `crypto.subtle`: el PIN usa un hash simple de respaldo (`public/app.js`).
- Mejoras para adultos mayores en `public/app.js`: baja sola al número y al resultado, cuenta regresiva de 2 min, resultado en palabras ("Cuidado: parece una estafa"), botones bloqueados mientras cargan, mensajes si falla la red, avisos que solo se redibujan si cambian.
- Plan de Firebase en `docs/PLAN-FIREBASE.md`; plan de app Android (aviso con números no guardados) en `docs/PLAN-ANDROID.md`.
- Rosa ahora elige "¿Quién dice ser?" y ve 3 formas de comprobarlo, en este orden (pedido de Axel): 1) verificar con el teléfono del familiar, 2) palabra de la familia, 3) cortar y llamar al número de siempre (enlace `tel:`, marcada como la más segura).
- Si un familiar nunca abrió la app (`usaLaApp`, se marca al consultar `/api/pendientes`), la opción 1 le advierte a Rosa que probablemente no le llegue el aviso.
- Hoy Nico solo ve el pedido con la app abierta (no hay push). El aviso por pasos (push → SMS con enlace → llamada automática → familia; WhatsApp más adelante) está en `docs/PLAN-FIREBASE.md`.
- Verificación: "dígale a quien la llama" y aviso de "si dice que perdió su celular, eso no lo confirma".
- "¿Es una estafa?" ahora es de preguntas Sí/No (`PREGUNTAS` y `analizar({texto, marcadas})` en `src/riesgo.js`); escribir queda en "Prefiero escribirlo".
- Familiares (Nico, Camila) guardan su número de siempre y la palabra de la familia en "Preparar la ayuda para la familia". Los números de la demo son ficticios.

## Hecho (2026-11-24)

- Etapa 2, pasos 2 y 3 del plan, en `firebase/` (independiente de la raíz): reglas de seguridad, lógica sobre Firestore y funciones, con 29 pruebas en el emulador (`cd firebase && npm install && npm test`; necesita Java). Detalle y decisiones en el final de `docs/PLAN-FIREBASE.md`.
- La app web actual sigue usando `src/server.js` (sin Firebase). Falta el paso 5 (cambiar `fetch('/api/...')` por el SDK).
- Si se vuelve a tocar el login: un intento previo de cuentas con token y `datos.json` se descartó a favor de Firebase Auth (estaba en la rama local `respaldo-cuentas-y-sesiones`, no subida).

## Firebase (2026-11-25)

- Proyecto creado por Axel: ID `alo-seguro`, plan Blaze con presupuesto de 10.000 CLP (solo avisa, no corta el gasto), Authentication por teléfono habilitado con SMS solo a Chile y dos números de prueba (borrarlos antes de usar con familia real), app web `alo-seguro-web` registrada. `firebase/.firebaserc` apunta a ese proyecto.
- Firestore está en Santiago (`southamerica-west1`). Reglas e índices ya publicados (2026-11-25). Funciones: Node 20 fue retirado por Google el 2026-10-30, el proyecto ahora usa `nodejs22` (`firebase/firebase.json`, `functions/package.json`); Las 8 funciones están publicadas (2026-11-25): 7 en Santiago y `vencerVerificaciones` en `southamerica-east1` (Cloud Scheduler no existe en west1). Quedó una copia vieja e inerte de `vencerVerificaciones` en west1 (el CLI no la puede borrar porque falla al borrar su reloj); se borra a mano en Cloud Run si se quiere. Falta mirar los registros de `vencerVerificaciones` en la consola: no se ha comprobado que corra bien.
- El `apiKey` de la app web es público por diseño, pero con el login por SMS se puede abusar: antes de publicar, restringir la clave por dominio en Google Cloud y activar App Check.

## Pendientes

- **Etapa 1**: probar con celulares reales en la casa (`npm run red`), idealmente con una persona mayor de verdad, y anotar qué le cuesta.
- **Etapa 2**: seguir `docs/PLAN-FIREBASE.md`. Pasos 2 y 3 listos en emulador. Axel: crear el proyecto en la consola (ubicación de Firestore en Santiago, plan Blaze con límite de presupuesto). Después, pasos 4 (login por teléfono e invitaciones) y 5 (app conectada).
- Probar el detector con más mensajes reales de estafas en Chile (WhatsApp, "su cuenta será bloqueada", encomiendas retenidas).
- Huella/rostro en vez del PIN y telefonía (revisión legal).
