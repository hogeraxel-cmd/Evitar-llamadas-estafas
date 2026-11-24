// Pruebas de la logica (functions/src/logica.js) contra el emulador de Firestore.
import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as L from '../functions/src/logica.js';

const PROYECTO = 'demo-alo-seguro';
const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let db;
// Misma configuracion por defecto que usa functions/index.js (initializeApp() sin opciones).
process.env.GCLOUD_PROJECT ??= PROYECTO;
before(() => { db = getFirestore(initializeApp()); });
beforeEach(async () => { await fetch(`http://${host}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' }); });

const T0 = 1_800_000_000_000;
const falla = (promesa, codigo, patron) => assert.rejects(promesa, e => e instanceof L.ErrorApp && e.codigo === codigo && (!patron || patron.test(e.message)), `esperaba ${codigo}`);
const alertas = async () => (await db.collection('alertas').orderBy('cuando').get()).docs.map(d => d.data());

// Camila crea la familia (admin) e invita a Rosa y Nico.
async function familia() {
  const { familiaId } = await L.crearFamilia(db, 'camila', { nombreFamilia: 'Los Perez', nombre: 'Camila (hija)', rol: 'familiar', telefono: '+56 9 2222 2222' }, { ahora: T0 });
  const unir = async (uid, nombre, rol) => {
    const { codigo } = await L.crearInvitacion(db, 'camila', { ahora: T0 });
    await L.unirse(db, uid, { codigo, nombre, rol }, { ahora: T0 });
  };
  await unir('rosa', 'Rosa (abuela)', 'adulto_mayor');
  await unir('nico', 'Nico (nieto)', 'familiar');
  return familiaId;
}

test('crear familia deja a quien la crea como admin y no se puede crear otra', async () => {
  const { familiaId } = await L.crearFamilia(db, 'camila', { nombreFamilia: 'Los Perez', nombre: 'Camila', rol: 'familiar' }, { ahora: T0 });
  const m = (await db.doc(`familias/${familiaId}/miembros/camila`).get()).data();
  assert.equal(m.admin, true);
  assert.equal((await db.doc('usuarios/camila').get()).data().familiaId, familiaId);
  await falla(L.crearFamilia(db, 'camila', { nombreFamilia: 'Otra', nombre: 'C', rol: 'familiar' }), 'failed-precondition');
});

test('datos invalidos no crean nada', async () => {
  await falla(L.crearFamilia(db, 'x', { nombreFamilia: '  ', nombre: 'C', rol: 'familiar' }), 'invalid-argument');
  await falla(L.crearFamilia(db, 'x', { nombreFamilia: 'F', nombre: 'C', rol: 'admin' }), 'invalid-argument');
  await falla(L.crearFamilia(db, 'x', { nombreFamilia: 'F', nombre: 'C', rol: 'familiar', telefono: '123' }), 'invalid-argument');
  assert.equal((await db.collection('familias').get()).size, 0);
});

test('invitaciones: solo el admin invita, el codigo es de un solo uso y se guarda como hash', async () => {
  const fid = await familia();
  const { codigo } = await L.crearInvitacion(db, 'camila', { ahora: T0 });
  const ids = (await db.collection('invitaciones').get()).docs.map(d => d.id);
  assert.ok(!ids.some(id => id.includes(codigo)), 'el codigo no debe estar en claro');
  await L.unirse(db, 'eva', { codigo, nombre: 'Eva', rol: 'familiar' }, { ahora: T0 });
  assert.equal((await db.doc('usuarios/eva').get()).data().familiaId, fid);
  await falla(L.unirse(db, 'otro', { codigo, nombre: 'Otro', rol: 'familiar' }, { ahora: T0 }), 'not-found', /inválido o vencido/);
  await falla(L.crearInvitacion(db, 'rosa'), 'permission-denied');   // Rosa no es admin
  await falla(L.crearInvitacion(db, 'desconocido'), 'permission-denied');
});

test('una invitacion vence a las 24 horas y los codigos falsos no sirven', async () => {
  await L.crearFamilia(db, 'camila', { nombreFamilia: 'F', nombre: 'Camila', rol: 'familiar' }, { ahora: T0 });
  const { codigo } = await L.crearInvitacion(db, 'camila', { ahora: T0 });
  await falla(L.unirse(db, 'a', { codigo, nombre: 'A', rol: 'familiar' }, { ahora: T0 + L.VIGENCIA_INVITACION_MS + 1 }), 'not-found');
  await falla(L.unirse(db, 'a', { codigo: 'ZZZZZZZZ', nombre: 'A', rol: 'familiar' }, { ahora: T0 }), 'not-found');
  await falla(L.unirse(db, 'a', { codigo: '', nombre: 'A', rol: 'familiar' }, { ahora: T0 }), 'not-found');
});

test('unirse con nombre invalido no gasta el codigo', async () => {
  await L.crearFamilia(db, 'camila', { nombreFamilia: 'F', nombre: 'Camila', rol: 'familiar' }, { ahora: T0 });
  const { codigo } = await L.crearInvitacion(db, 'camila', { ahora: T0 });
  await falla(L.unirse(db, 'a', { codigo, nombre: '  ', rol: 'familiar' }, { ahora: T0 }), 'invalid-argument');
  await L.unirse(db, 'a', { codigo, nombre: 'Ana', rol: 'familiar' }, { ahora: T0 });   // el mismo codigo aun sirve
});

test('adivinar codigos queda limitado a 10 intentos por hora y luego se reinicia', async () => {
  await L.crearFamilia(db, 'camila', { nombreFamilia: 'F', nombre: 'Camila', rol: 'familiar' }, { ahora: T0 });
  for (let i = 0; i < L.MAX_INTENTOS_INVITACION; i++) await falla(L.unirse(db, 'atacante', { codigo: 'AAAAAAA' + i, nombre: 'X', rol: 'familiar' }, { ahora: T0 }), 'not-found');
  await falla(L.unirse(db, 'atacante', { codigo: 'AAAAAAAZ', nombre: 'X', rol: 'familiar' }, { ahora: T0 + 1000 }), 'resource-exhausted');
  // ni siquiera con el codigo bueno, mientras dure el bloqueo
  const { codigo } = await L.crearInvitacion(db, 'camila', { ahora: T0 });
  await falla(L.unirse(db, 'atacante', { codigo, nombre: 'X', rol: 'familiar' }, { ahora: T0 + 2000 }), 'resource-exhausted');
  await L.unirse(db, 'atacante', { codigo, nombre: 'X', rol: 'familiar' }, { ahora: T0 + 3600_001 });
});

test('verificar: crea 6 opciones, el numero correcto esta en privado y entre las opciones', async () => {
  await familia();
  const r = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  const v = (await db.doc(`verificaciones/${r.id}`).get()).data();
  const priv = (await db.doc(`verificaciones/${r.id}/privado/desafio`).get()).data();
  assert.equal(v.opciones.length, 6);
  assert.equal(new Set(v.opciones).size, 6);
  assert.ok(v.opciones.includes(priv.desafio));
  assert.equal(r.desafio, priv.desafio);
  assert.ok(!JSON.stringify(v).includes('desafio'), 'el documento que lee Nico no debe traer el numero');
  assert.equal(v.expira, T0 + L.VIGENCIA_VERIFICACION_MS);
  assert.equal(v.solicitante, 'Rosa');   // nombre corto, sin "(abuela)"
  assert.match(r.mensaje, /Esperando que Nico/);
});

test('verificar: validaciones de familia, de uno mismo y de sesion', async () => {
  await familia();
  await L.crearFamilia(db, 'eva', { nombreFamilia: 'Otra', nombre: 'Eva', rol: 'familiar' }, { ahora: T0 });
  await falla(L.crearVerificacion(db, 'rosa', { objetivoId: 'eva' }), 'invalid-argument', /misma familia/);
  await falla(L.crearVerificacion(db, 'rosa', { objetivoId: 'rosa' }), 'invalid-argument', /uno mismo/);
  await falla(L.crearVerificacion(db, 'rosa', {}), 'invalid-argument');
  await falla(L.crearVerificacion(db, 'nadie', { objetivoId: 'nico' }), 'permission-denied');
  await falla(L.crearVerificacion(db, 'eva', { objetivoId: 'nico' }), 'invalid-argument');
});

test('si Rosa toca dos veces, se reusa la pendiente y los numeros coinciden; vencida, se crea otra', async () => {
  await familia();
  const a = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  const b = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 + 5000 });
  assert.equal(b.id, a.id);
  assert.equal(b.desafio, a.desafio);
  assert.equal((await db.collection('verificaciones').get()).size, 1);
  const c = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 + L.VIGENCIA_VERIFICACION_MS + 1 });
  assert.notEqual(c.id, a.id);
});

test('Nico elige el numero correcto: verificado y sin alertas', async () => {
  await familia();
  const r = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  const out = await L.responderVerificacion(db, 'nico', { id: r.id, eleccion: r.desafio }, { ahora: T0 + 10_000 });
  assert.equal(out.estado, 'verificado');
  assert.match(out.mensaje, /es de verdad/);
  assert.equal((await alertas()).length, 0);
});

test('numero equivocado: rechazado y alerta media', async () => {
  await familia();
  const r = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  const mal = (await db.doc(`verificaciones/${r.id}`).get()).data().opciones.find(o => o !== r.desafio);
  assert.equal((await L.responderVerificacion(db, 'nico', { id: r.id, eleccion: mal }, { ahora: T0 + 1000 })).estado, 'rechazado');
  const [a] = await alertas();
  assert.equal(a.gravedad, 'media');
  assert.match(a.texto, /número equivocado/);
});

test('"No soy yo": estafa confirmada y alerta alta que nombra a las dos personas', async () => {
  await familia();
  const r = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  const out = await L.responderVerificacion(db, 'nico', { id: r.id, noSoyYo: true }, { ahora: T0 + 1000 });
  assert.equal(out.estado, 'no_soy_yo');
  assert.match(out.mensaje, /estafa/i);
  const [a] = await alertas();
  assert.equal(a.gravedad, 'alta');
  assert.match(a.texto, /alguien llamó a Rosa haciéndose pasar por Nico/);
  assert.equal(a.familiaId, (await db.doc('usuarios/rosa').get()).data().familiaId);
});

test('solo Nico responde; Rosa o Camila no pueden responder por el', async () => {
  await familia();
  const r = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  for (const uid of ['rosa', 'camila']) await falla(L.responderVerificacion(db, uid, { id: r.id, eleccion: r.desafio }, { ahora: T0 }), 'permission-denied');
  await falla(L.responderVerificacion(db, 'nico', { id: 'no-existe', eleccion: '11' }, { ahora: T0 }), 'not-found');
  assert.equal((await db.doc(`verificaciones/${r.id}`).get()).data().estado, 'pendiente');
});

test('una respuesta final no se puede cambiar', async () => {
  await familia();
  const r = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  await L.responderVerificacion(db, 'nico', { id: r.id, noSoyYo: true }, { ahora: T0 + 1000 });
  const out = await L.responderVerificacion(db, 'nico', { id: r.id, eleccion: r.desafio }, { ahora: T0 + 2000 });
  assert.equal(out.estado, 'no_soy_yo');
  assert.equal((await alertas()).length, 1);
});

test('responder tarde: expirado y aviso a la familia, aunque el numero sea el correcto', async () => {
  await familia();
  const r = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  const out = await L.responderVerificacion(db, 'nico', { id: r.id, eleccion: r.desafio }, { ahora: T0 + L.VIGENCIA_VERIFICACION_MS });
  assert.equal(out.estado, 'expirado');
  assert.match((await alertas())[0].texto, /no hubo respuesta/);
});

test('la tarea programada vence las pendientes una sola vez', async () => {
  await familia();
  const r1 = await L.crearVerificacion(db, 'rosa', { objetivoId: 'nico' }, { ahora: T0 });
  await L.crearVerificacion(db, 'rosa', { objetivoId: 'camila' }, { ahora: T0 + 60_000 });
  assert.equal(await L.vencerPendientes(db, { ahora: T0 + 30_000 }), 0);                 // nada vencido aun
  assert.equal(await L.vencerPendientes(db, { ahora: T0 + L.VIGENCIA_VERIFICACION_MS }), 1);   // solo la primera
  assert.equal((await db.doc(`verificaciones/${r1.id}`).get()).data().estado, 'expirado');
  assert.equal(await L.vencerPendientes(db, { ahora: T0 + L.VIGENCIA_VERIFICACION_MS }), 0);   // no duplica
  assert.equal((await alertas()).length, 1);
  assert.equal(await L.vencerPendientes(db, { ahora: T0 + 10 * L.VIGENCIA_VERIFICACION_MS }), 1);
  assert.equal((await alertas()).length, 2);
});

test('numero de siempre y palabra de la familia: validan y exigen ser miembro', async () => {
  const fid = await familia();
  assert.deepEqual(await L.definirTelefono(db, 'nico', { telefono: '+56 (9) 1111-1111' }), { telefono: '+56 9 11111111' });
  assert.equal((await db.doc(`familias/${fid}/miembros/nico`).get()).data().telefono, '+56 9 11111111');
  await falla(L.definirTelefono(db, 'nico', { telefono: '12' }), 'invalid-argument');
  await falla(L.definirTelefono(db, 'intruso', { telefono: '+56 9 1111 1111' }), 'permission-denied');
  await L.definirPalabraClave(db, 'rosa', { palabra: ' chancho ' }, { ahora: T0 });
  assert.equal((await db.doc(`familias/${fid}/ajustes/palabra`).get()).data().palabra, 'chancho');
  await falla(L.definirPalabraClave(db, 'rosa', { palabra: 'ab' }), 'invalid-argument');
  await falla(L.definirPalabraClave(db, 'intruso', { palabra: 'chancho' }), 'permission-denied');
});

test('el modulo de funciones carga y expone todo lo que la app va a llamar', async () => {
  const idx = await import('../functions/index.js');
  for (const n of ['crearFamilia', 'crearInvitacion', 'unirse', 'definirTelefono', 'definirPalabraClave', 'crearVerificacion', 'responderVerificacion', 'vencerVerificaciones']) {
    assert.equal(typeof idx[n], 'function', n);
  }
});
