# Etapa 2: Firebase (reglas, funciones y pruebas)

Pasos 2 y 3 de `../docs/PLAN-FIREBASE.md`. Esta carpeta es independiente de la app actual
(la raíz sigue sin dependencias y `npm test` allá no la toca).

```bash
cd firebase
npm install
npm test          # levanta el emulador de Firestore, corre 29 pruebas y lo apaga
```

Necesita Java (para el emulador) y Node 20+. No hace falta cuenta ni proyecto de Firebase: usa el proyecto de prueba `demo-alo-seguro`.

## Qué hay

- `firestore.rules`: el celular solo lee; todo lo que escribe cambia por funciones.
- `functions/src/logica.js`: la lógica de `../src/verificacion.js` sobre Firestore (familias, invitaciones, verificaciones, alertas, vencimiento).
- `functions/index.js`: las funciones que la app llamará y la tarea que vence verificaciones cada minuto.
- `test/reglas.test.js` (reglas) y `test/logica.test.js` (lógica), ambos contra el emulador.

## Aún no está

Login por teléfono, la app web conectada a Firebase (paso 5), push (paso 6), SMS y llamada automática (paso 7) y el detector de estafas como función. No se ha desplegado nada.
