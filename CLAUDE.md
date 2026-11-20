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

## Pendientes

- Probar el detector con más mensajes reales de estafas en Chile (WhatsApp, "su cuenta será bloqueada", encomiendas retenidas).
- Lo del README: autenticación real, base de datos, avisos push, huella/rostro en vez del PIN, telefonía (revisión legal).
