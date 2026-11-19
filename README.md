# Aló Seguro (prototipo)

Verificación de familiares y detección de señales de estafa telefónica, pensada para adultos mayores.

## Cómo probarlo

```bash
npm start            # http://127.0.0.1:3000 (familia de ejemplo: Rosa, Nico y Camila)
npm test             # 18 pruebas
```

Abre la app en dos pestañas (o dos teléfonos en la misma red, cambiando el host del servidor): una como **Rosa** y otra como **Nico**.
Rosa toca "Verificar a Nico", Nico crea un PIN, y elige el número que ve Rosa, o toca "No soy yo".

## Qué es y qué no es

- **Es**: núcleo de verificación fuera de banda, detector de señales sobre texto, API y app web instalable (PWA).
- **No es todavía**: producto listo para usuarios reales. Faltan autenticación real (hoy cada cliente declara quién es), base de datos, avisos push, huella o rostro en vez del PIN local, y la parte de telefonía (pendiente de revisión legal).
- Los datos viven en memoria y se pierden al reiniciar.

## Estructura

- `src/verificacion.js`: flujo de verificación y alertas.
- `src/riesgo.js`: reglas de riesgo en español.
- `src/server.js`: API HTTP y archivos estáticos.
- `public/`: app web (PWA).
