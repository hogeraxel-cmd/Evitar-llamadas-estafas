// Logica de Alo Seguro sobre Firestore (etapa 2). Es la de src/verificacion.js, pero guardada en
// la nube y ejecutada por Cloud Functions: el celular no es de fiar, asi que nada de esto corre alli.
//
// Cada funcion recibe `db` (Firestore de firebase-admin), el `uid` de quien llama (ya autenticado
// por Firebase) y los datos. Todas aceptan `ahora` para poder probarlas con un reloj falso.
import { randomBytes, randomInt, createHash } from 'node:crypto';

export class ErrorApp extends Error {
  // codigo usa los mismos nombres que HttpsError: 'invalid-argument', 'permission-denied',
  // 'not-found', 'failed-precondition', 'resource-exhausted'.
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}

export const ESTADOS = Object.freeze({
  PENDIENTE: 'pendiente', VERIFICADO: 'verificado', RECHAZADO: 'rechazado', NO_SOY_YO: 'no_soy_yo', EXPIRADO: 'expirado',
});
export const ROLES = ['adulto_mayor', 'familiar'];
export const VIGENCIA_VERIFICACION_MS = 120_000;
export const VIGENCIA_INVITACION_MS = 24 * 3600_000;   // plan: la invitacion vence en 24 h
export const MAX_INTENTOS_INVITACION = 10;             // por persona y por hora
const NUM_OPCIONES = 6;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin 0/O/1/I

const sha = s => createHash('sha256').update(s).digest('hex');
const dosDigitos = () => String(randomInt(10, 100));
// "Rosa (abuela)" -> "Rosa", para frases mas naturales.
export const nombreCorto = n => String(n).replace(/\s*\(.*\)\s*$/, '');
// Deja solo digitos, espacios y un "+" inicial (se usa en un enlace tel:).
export const limpiarTelefono = t => String(t ?? '').replace(/[^\d+ ]/g, '').replace(/(?!^)\+/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);

function mezclar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function texto(valor, campo, { min = 1, max = 60 } = {}) {
  const v = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (v.length < min) throw new ErrorApp('invalid-argument', `Falta ${campo}`);
  if (v.length > max) throw new ErrorApp('invalid-argument', `${campo} es demasiado largo`);
  return v;
}
function telefonoOpcional(t) {
  const v = limpiarTelefono(t);
  if (v && v.replace(/\D/g, '').length < 8) throw new ErrorApp('invalid-argument', 'Número muy corto');
  return v;
}

// ---- lo que ve cada parte (los textos salen de la app actual) ----
export function vistaSolicitante(v, desafio) {
  const textos = {
    [ESTADOS.PENDIENTE]: `Esperando que ${v.objetivo} toque el número ${desafio} en su teléfono…`,
    [ESTADOS.VERIFICADO]: `${v.objetivo} confirmó desde su teléfono. La llamada es de verdad.`,
    [ESTADOS.RECHAZADO]: 'No se pudo confirmar. No transfiera dinero ni entregue datos.',
    [ESTADOS.NO_SOY_YO]: `${v.objetivo} dice que no está llamando. Es una estafa: corte la llamada.`,
    [ESTADOS.EXPIRADO]: 'Se acabó el tiempo sin respuesta. Trate como no verificado y llame a su familiar al número de siempre.',
  };
  return { id: v.id, estado: v.estado, desafio, expira: v.expira, mensaje: textos[v.estado] };
}

const refUsuario = (db, uid) => db.doc(`usuarios/${uid}`);

async function familiaDe(tx, db, uid) {
  const u = await tx.get(refUsuario(db, uid));
  if (!u.exists) throw new ErrorApp('permission-denied', 'No pertenece a ninguna familia');
  return u.data().familiaId;
}

// ---------- familias e invitaciones ----------
export async function crearFamilia(db, uid, datos, { ahora = Date.now() } = {}) {
  const nombreFamilia = texto(datos?.nombreFamilia, 'el nombre de la familia');
  const nombre = texto(datos?.nombre, 'el nombre');
  if (!ROLES.includes(datos?.rol)) throw new ErrorApp('invalid-argument', 'Rol invalido');
  const telefono = telefonoOpcional(datos?.telefono);
  return db.runTransaction(async tx => {
    if ((await tx.get(refUsuario(db, uid))).exists) throw new ErrorApp('failed-precondition', 'Ya pertenece a una familia');
    const familiaRef = db.collection('familias').doc();
    tx.set(familiaRef, { nombre: nombreFamilia, creada: ahora });
    tx.set(familiaRef.collection('miembros').doc(uid), { nombre, rol: datos.rol, admin: true, telefono, creada: ahora });
    tx.set(refUsuario(db, uid), { familiaId: familiaRef.id });
    return { familiaId: familiaRef.id };
  });
}

// Solo el admin invita. El codigo se guarda como hash: ni leyendo la base se puede usar.
export async function crearInvitacion(db, uid, { ahora = Date.now() } = {}) {
  return db.runTransaction(async tx => {
    const familiaId = await familiaDe(tx, db, uid);
    const yo = await tx.get(db.doc(`familias/${familiaId}/miembros/${uid}`));
    if (!yo.exists || yo.data().admin !== true) throw new ErrorApp('permission-denied', 'Solo quien creó la familia puede invitar');
    const codigo = Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
    const vence = ahora + VIGENCIA_INVITACION_MS;
    tx.set(db.doc(`invitaciones/${sha(codigo)}`), { familiaId, creadaPor: uid, vence, usada: false });
    return { codigo, vence };
  });
}

// Cuenta el intento ANTES de mirar el codigo y en su propia transaccion: si no, un intento
// fallido revertiria su propio conteo y se podrian probar codigos sin limite.
async function contarIntento(db, uid, ahora) {
  await db.runTransaction(async tx => {
    const ref = db.doc(`intentosInvitacion/${uid}`);
    const d = await tx.get(ref);
    const { n = 0, desde = 0 } = d.exists ? d.data() : {};
    const nuevaVentana = ahora - desde >= 3600_000;
    if (!nuevaVentana && n >= MAX_INTENTOS_INVITACION) throw new ErrorApp('resource-exhausted', 'Demasiados intentos. Espere una hora.');
    tx.set(ref, nuevaVentana ? { n: 1, desde: ahora } : { n: n + 1, desde });
  });
}

export async function unirse(db, uid, datos, { ahora = Date.now() } = {}) {
  const nombre = texto(datos?.nombre, 'el nombre');
  if (!ROLES.includes(datos?.rol)) throw new ErrorApp('invalid-argument', 'Rol invalido');
  const telefono = telefonoOpcional(datos?.telefono);
  const codigo = String(datos?.codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  await contarIntento(db, uid, ahora);
  return db.runTransaction(async tx => {
    if ((await tx.get(refUsuario(db, uid))).exists) throw new ErrorApp('failed-precondition', 'Ya pertenece a una familia');
    const refInv = db.doc(`invitaciones/${sha(codigo)}`);
    const inv = await tx.get(refInv);
    if (!codigo || !inv.exists || inv.data().usada || inv.data().vence <= ahora) throw new ErrorApp('not-found', 'Código inválido o vencido');
    const { familiaId } = inv.data();
    tx.set(db.doc(`familias/${familiaId}/miembros/${uid}`), { nombre, rol: datos.rol, admin: false, telefono, creada: ahora });
    tx.set(refUsuario(db, uid), { familiaId });
    tx.update(refInv, { usada: true, usadaPor: uid, usadaEn: ahora });   // un solo uso
    return { familiaId };
  });
}

// ---------- perfil y palabra de la familia ----------
// El "numero de siempre": Rosa puede cortar y llamar ahi, aunque el familiar no tenga la app.
export async function definirTelefono(db, uid, { telefono }) {
  const t = limpiarTelefono(telefono);
  if (t.replace(/\D/g, '').length < 8) throw new ErrorApp('invalid-argument', 'Número muy corto');
  return db.runTransaction(async tx => {
    const familiaId = await familiaDe(tx, db, uid);
    tx.update(db.doc(`familias/${familiaId}/miembros/${uid}`), { telefono: t });
    return { telefono: t };
  });
}

export async function definirPalabraClave(db, uid, { palabra }, { ahora = Date.now() } = {}) {
  const p = String(palabra ?? '').trim();
  if (p.length < 3 || p.length > 40) throw new ErrorApp('invalid-argument', 'La palabra debe tener entre 3 y 40 letras');
  return db.runTransaction(async tx => {
    const familiaId = await familiaDe(tx, db, uid);
    tx.set(db.doc(`familias/${familiaId}/ajustes/palabra`), { palabra: p, definidaPor: uid, cuando: ahora });
    return { definida: true };
  });
}

// ---------- verificaciones ----------
export async function crearVerificacion(db, uid, { objetivoId }, { ahora = Date.now(), vigenciaMs = VIGENCIA_VERIFICACION_MS } = {}) {
  return db.runTransaction(async tx => {
    const familiaId = await familiaDe(tx, db, uid);
    if (!objetivoId || typeof objetivoId !== 'string') throw new ErrorApp('invalid-argument', 'Falta a quién verificar');
    if (objetivoId === uid) throw new ErrorApp('invalid-argument', 'No se puede verificar a uno mismo');
    const [yo, obj] = await Promise.all([
      tx.get(db.doc(`familias/${familiaId}/miembros/${uid}`)),
      tx.get(db.doc(`familias/${familiaId}/miembros/${objetivoId}`)),
    ]);
    if (!obj.exists) throw new ErrorApp('invalid-argument', 'Solo se puede verificar a alguien de la misma familia');

    // Si ya hay una pendiente hacia el mismo familiar (toco dos veces), se devuelve esa:
    // asi Rosa y Nico siempre ven el mismo numero.
    const previas = await tx.get(db.collection('verificaciones')
      .where('solicitanteId', '==', uid).where('objetivoId', '==', objetivoId).where('estado', '==', ESTADOS.PENDIENTE));
    const vigente = previas.docs.find(d => d.data().expira > ahora);
    if (vigente) {
      const priv = await tx.get(vigente.ref.collection('privado').doc('desafio'));
      return vistaSolicitante({ id: vigente.id, ...vigente.data() }, priv.data().desafio);
    }

    const desafio = dosDigitos();
    const distractores = new Set();
    while (distractores.size < NUM_OPCIONES - 1) { const d = dosDigitos(); if (d !== desafio) distractores.add(d); }
    const ref = db.collection('verificaciones').doc();
    const v = {
      familiaId, solicitanteId: uid, objetivoId,
      solicitante: nombreCorto(yo.data().nombre), objetivo: nombreCorto(obj.data().nombre),
      opciones: mezclar([desafio, ...distractores]),
      estado: ESTADOS.PENDIENTE, creada: ahora, expira: ahora + vigenciaMs, intentos: 0,
    };
    tx.set(ref, v);
    tx.set(ref.collection('privado').doc('desafio'), { desafio });
    return vistaSolicitante({ id: ref.id, ...v }, desafio);
  });
}

function nuevaAlerta(db, tx, v, gravedad, textoAlerta, ahora) {
  tx.set(db.collection('alertas').doc(), { familiaId: v.familiaId, solicitudId: v.id, gravedad, texto: textoAlerta, cuando: ahora });
}
function textoVencida(v) {
  return `${v.solicitante} pidió verificar a ${v.objetivo} y no hubo respuesta. Conviene llamar a ${v.objetivo} por otro medio.`;
}

export async function responderVerificacion(db, uid, { id, eleccion, noSoyYo = false }, { ahora = Date.now() } = {}) {
  if (!id || typeof id !== 'string') throw new ErrorApp('invalid-argument', 'Falta la verificación');
  return db.runTransaction(async tx => {
    const ref = db.doc(`verificaciones/${id}`);
    const [snap, priv] = await Promise.all([tx.get(ref), tx.get(db.doc(`verificaciones/${id}/privado/desafio`))]);
    if (!snap.exists) throw new ErrorApp('not-found', 'Verificación inexistente');
    const v = { id, ...snap.data() };
    if (v.objetivoId !== uid) throw new ErrorApp('permission-denied', 'No autorizado');
    const desafio = priv.data().desafio;
    if (v.estado !== ESTADOS.PENDIENTE) return vistaSolicitante(v, desafio);   // una respuesta final no se cambia

    if (v.expira <= ahora) {                                                     // se paso el tiempo
      tx.update(ref, { estado: ESTADOS.EXPIRADO });
      nuevaAlerta(db, tx, v, 'media', textoVencida(v), ahora);
      return vistaSolicitante({ ...v, estado: ESTADOS.EXPIRADO }, desafio);
    }
    if (noSoyYo === true) {
      tx.update(ref, { estado: ESTADOS.NO_SOY_YO });
      nuevaAlerta(db, tx, v, 'alta', `Intento de estafa: alguien llamó a ${v.solicitante} haciéndose pasar por ${v.objetivo}. ${v.objetivo} confirmó que no estaba llamando.`, ahora);
      return vistaSolicitante({ ...v, estado: ESTADOS.NO_SOY_YO }, desafio);
    }
    if (String(eleccion) === desafio) {
      tx.update(ref, { estado: ESTADOS.VERIFICADO, intentos: v.intentos + 1 });
      return vistaSolicitante({ ...v, estado: ESTADOS.VERIFICADO }, desafio);
    }
    tx.update(ref, { estado: ESTADOS.RECHAZADO, intentos: v.intentos + 1 });
    nuevaAlerta(db, tx, v, 'media', `${v.solicitante} pidió verificar a ${v.objetivo} y se eligió un número equivocado. No se pudo confirmar la llamada.`, ahora);
    return vistaSolicitante({ ...v, estado: ESTADOS.RECHAZADO }, desafio);
  });
}

// Pasa a "expirado" las verificaciones que se quedaron sin respuesta y avisa a la familia.
// La corre una funcion programada cada minuto; responderVerificacion tambien lo hace al vuelo.
export async function vencerPendientes(db, { ahora = Date.now() } = {}) {
  const vencidas = await db.collection('verificaciones')
    .where('estado', '==', ESTADOS.PENDIENTE).where('expira', '<=', ahora).get();
  let n = 0;
  for (const d of vencidas.docs) {
    const hecho = await db.runTransaction(async tx => {
      const s = await tx.get(d.ref);                                             // otra instancia pudo cambiarla
      if (!s.exists || s.data().estado !== ESTADOS.PENDIENTE || s.data().expira > ahora) return false;
      const v = { id: s.id, ...s.data() };
      tx.update(d.ref, { estado: ESTADOS.EXPIRADO });
      nuevaAlerta(db, tx, v, 'media', textoVencida(v), ahora);
      return true;
    });
    if (hecho) n++;
  }
  return n;
}
