// Funciones que la app llama (callable) y la tarea programada. La logica esta en src/logica.js.
// Region: Santiago. Debe coincidir con la ubicacion de Firestore elegida al crear el proyecto.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as L from './src/logica.js';

initializeApp();
const REGION = 'southamerica-west1';
// Cloud Scheduler no existe en Santiago (southamerica-west1): publicar ahi la tarea falla con
// "not a valid location". La tarea va en Sao Paulo, que es la region mas cercana que lo tiene;
// igual escribe en Firestore (Santiago) sin problema.
const REGION_TAREA = 'southamerica-east1';

// Exige sesion (Firebase Auth) y traduce los errores de la logica a errores que la app entiende.
// El uid sale SIEMPRE de la sesion, nunca de lo que mande el celular.
function llamable(fn) {
  return onCall({ region: REGION }, async req => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Inicie sesión.');
    try {
      return await fn(getFirestore(), req.auth.uid, req.data ?? {});
    } catch (e) {
      if (e instanceof L.ErrorApp) throw new HttpsError(e.codigo, e.message);
      throw e;
    }
  });
}

export const crearFamilia = llamable(L.crearFamilia);
export const crearInvitacion = llamable(L.crearInvitacion);
export const unirse = llamable(L.unirse);
export const definirTelefono = llamable(L.definirTelefono);
export const definirPalabraClave = llamable(L.definirPalabraClave);
export const crearVerificacion = llamable(L.crearVerificacion);
export const responderVerificacion = llamable(L.responderVerificacion);

export const vencerVerificaciones = onSchedule({ region: REGION_TAREA, schedule: 'every 1 minutes' }, async () => {
  await L.vencerPendientes(getFirestore());
});
