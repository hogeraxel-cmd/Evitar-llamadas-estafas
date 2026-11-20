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

## Pendientes

- **Detector (`src/riesgo.js`) no reconoce el trato de "tú"**. Ejemplo: "cambié de número, necesito que me transfieras 300 mil urgente y no le digas a mi mamá" sale **medio** en vez de **alto**:
  - `dinero` usa `transfer\w*`, que no calza con "transfieras/transfiere".
  - `secreto` solo tiene "diga/cuente/avise", falta "digas/cuentes/avises".
- "Abuela soy tu nieto, choqué el auto y estoy detenido, el abogado necesita plata ya" sale **medio**: "ya" no cuenta como urgencia. Evaluar si debe ser alto.
- Textos sin tildes en mensajes al usuario ("suplantacion", "esta llamando", "¿Que numero ve ella?" en `src/verificacion.js`).
- La alerta alta no dice quién pidió ni a quién se intentó suplantar ("la persona verificada").
- El mensaje a Nico dice "¿Qué número ve **ella**?" fijo, aunque quien pide sea hombre.
- Lo del README: autenticación real, base de datos, avisos push, huella/rostro en vez del PIN, telefonía (revisión legal).
