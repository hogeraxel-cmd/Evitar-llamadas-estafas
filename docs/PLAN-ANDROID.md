# Plan: app de Android que avisa con llamadas de números no guardados (Etapa 3)

Va **después de Firebase** (`PLAN-FIREBASE.md`): reusa el mismo login, datos y avisos.

## Qué haría

1. Entra una llamada de un **número que Rosa no tiene guardado**.
2. Mientras suena, o al contestar, aparece un **aviso discreto** (no la app completa):
   *"Llamada de un número no guardado. Si le piden dinero, toque aquí."*
3. Si Rosa lo toca, se abre Aló Seguro directo en "¿Quién dice ser?".
4. Al cortar esa llamada, un segundo aviso: *"¿Le pidieron dinero en esa llamada?"* Abre las preguntas Sí/No.

Las llamadas de contactos guardados (Nico, el doctor, la vecina) no muestran nada.

## Cómo se hace en Android

- **Capacitor** envuelve la app web actual en una app nativa: casi todo el código se reusa.
- Un plugin nativo pequeño (Kotlin) con **`CallScreeningService`** (Android 10 o más nuevo):
  - Rosa le da a Aló Seguro el permiso de **"app de identificación de llamadas y spam"** una sola vez (`RoleManager.ROLE_CALL_SCREENING`).
  - Android avisa a la app de cada llamada entrante **antes de que suene**, con el número.
  - Según la documentación, Android solo consulta a estas apps por **números que no están en contactos**, justo lo que queremos. **Confirmar en el prototipo.**
  - No hace falta pedir permiso de registro de llamadas (`READ_CALL_LOG`), que Google Play restringe mucho.
- Avisos: notificación de prioridad alta con un botón que abre la app. Evitar ventanas flotantes sobre otras apps (`SYSTEM_ALERT_WINDOW`): Google Play las revisa con lupa y confunden a las personas mayores.
- Saber cuándo termina la llamada: `TelephonyCallback` (requiere `READ_PHONE_STATE`; evaluar si vale la pena o basta con el primer aviso).

## Qué NO se puede (y no se intentará)

- **Escuchar o transcribir la llamada**: Android lo bloquea para apps normales desde Android 10, y además requiere revisión legal.
- **Bloquear llamadas automáticamente**: no conviene; también llaman el consultorio o el banco de verdad desde números no guardados.

## iPhone

Apple no deja que una app vea las llamadas entrantes ni se abra durante una llamada. Alternativas:
- **Acceso directo grande** en la pantalla de inicio y un widget.
- **"Oye Siri, abre Aló Seguro"**.
- El filtro de llamadas de números desconocidos que trae el propio iPhone (Ajustes > Teléfono).
- La familia practica con Rosa: "si te piden plata, abre la app verde".

## Opcional (a conversar con la familia)

- Avisar a la familia si Rosa recibe una llamada larga de un número no guardado **y** después marca en la app que le pidieron dinero. Solo con su consentimiento: es información privada.

## Orden de trabajo

1. Terminar Firebase (login, datos, avisos push).
2. Crear el proyecto Capacitor con la app web y probarlo en un Android real.
3. Plugin `CallScreeningService` + aviso. Probar con llamadas de un número no guardado.
4. Pantalla de primera configuración que explique el permiso con palabras simples.
5. Publicar como prueba interna en Google Play (cuenta de desarrollador: pago único).
