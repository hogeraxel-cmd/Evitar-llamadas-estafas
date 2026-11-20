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
- Plan de Firebase en `docs/PLAN-FIREBASE.md`.

## Pendientes

- **Etapa 1**: probar con celulares reales en la casa (`npm run red`), idealmente con una persona mayor de verdad, y anotar qué le cuesta.
- **Etapa 2**: seguir `docs/PLAN-FIREBASE.md`. Primer paso: Axel crea el proyecto en la consola de Firebase.
- Probar el detector con más mensajes reales de estafas en Chile (WhatsApp, "su cuenta será bloqueada", encomiendas retenidas).
- Huella/rostro en vez del PIN y telefonía (revisión legal).
