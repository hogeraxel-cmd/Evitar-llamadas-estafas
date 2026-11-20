# Aló Seguro (prototipo)

Verificación de familiares y detección de señales de estafa telefónica, pensada para adultos mayores.

## Cómo probarlo

```bash
npm start            # http://127.0.0.1:3000 (familia de ejemplo: Rosa, Nico y Camila)
npm test             # 30 pruebas
```

Abre la app en dos ventanas (una normal y otra de incógnito, porque la app recuerda en el navegador quién eres): una como **Rosa** y otra como **Nico**.

**En celulares del mismo Wi-Fi:** `npm run red` muestra la dirección (por ejemplo `http://192.168.0.180:3000`) para abrir en cada celular. Sin login real: úsalo solo en la red de la casa. Sin HTTPS no se puede instalar como app ni recibir avisos; eso llega con Firebase (ver `docs/PLAN-FIREBASE.md`).
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
