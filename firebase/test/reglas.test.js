// Pruebas de las reglas de seguridad contra el emulador de Firestore.
// Se corren con: npm test (dentro de firebase/), que levanta el emulador solo.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

let env;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-alo-seguro',
    firestore: { host, port: Number(port), rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env.cleanup(); });

// Familia f1: Rosa (adulta mayor), Nico y Camila (familiares). Familia f2: Eva (ajena).
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'familias/f1'), { nombre: 'Los Perez' });
    for (const [uid, nombre, rol] of [['rosa', 'Rosa', 'adulto_mayor'], ['nico', 'Nico', 'familiar'], ['camila', 'Camila', 'familiar']]) {
      await setDoc(doc(db, `familias/f1/miembros/${uid}`), { nombre, rol, telefono: '+56 9 1111 1111' });
      await setDoc(doc(db, `usuarios/${uid}`), { familiaId: 'f1' });
    }
    await setDoc(doc(db, 'familias/f1/ajustes/palabra'), { palabra: 'chancho' });
    await setDoc(doc(db, 'familias/f2'), { nombre: 'Otra' });
    await setDoc(doc(db, 'familias/f2/miembros/eva'), { nombre: 'Eva', rol: 'familiar' });
    await setDoc(doc(db, 'usuarios/eva'), { familiaId: 'f2' });
    await setDoc(doc(db, 'verificaciones/v1'), { familiaId: 'f1', solicitanteId: 'rosa', objetivoId: 'nico', opciones: ['11', '22', '33', '44', '55', '66'], estado: 'pendiente' });
    await setDoc(doc(db, 'verificaciones/v1/privado/desafio'), { desafio: '33' });
    await setDoc(doc(db, 'alertas/a1'), { familiaId: 'f1', gravedad: 'alta', texto: 'x', cuando: 1 });
    await setDoc(doc(db, 'invitaciones/abc'), { familiaId: 'f1', usada: false });
  });
});
const como = uid => env.authenticatedContext(uid).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

test('sin sesion no se lee nada', async () => {
  const db = anonimo();
  for (const ruta of ['familias/f1', 'familias/f1/miembros/rosa', 'verificaciones/v1', 'alertas/a1', 'usuarios/rosa', 'familias/f1/ajustes/palabra']) {
    await assertFails(getDoc(doc(db, ruta)));
  }
});

test('un miembro lee su familia, los miembros, la palabra y las alertas', async () => {
  const db = como('camila');
  await assertSucceeds(getDoc(doc(db, 'familias/f1')));
  await assertSucceeds(getDoc(doc(db, 'familias/f1/miembros/rosa')));
  await assertSucceeds(getDoc(doc(db, 'familias/f1/ajustes/palabra')));
  const alertas = await assertSucceeds(getDocs(query(collection(db, 'alertas'), where('familiaId', '==', 'f1'))));
  assert.equal(alertas.size, 1);
});

test('otra familia no ve nada de f1', async () => {
  const db = como('eva');
  await assertFails(getDoc(doc(db, 'familias/f1')));
  await assertFails(getDoc(doc(db, 'familias/f1/miembros/rosa')));
  await assertFails(getDoc(doc(db, 'familias/f1/ajustes/palabra')));
  await assertFails(getDoc(doc(db, 'alertas/a1')));
  await assertFails(getDocs(query(collection(db, 'alertas'), where('familiaId', '==', 'f1'))));
  await assertFails(getDoc(doc(db, 'verificaciones/v1')));
});

test('el usuario solo lee su propio perfil', async () => {
  await assertSucceeds(getDoc(doc(como('rosa'), 'usuarios/rosa')));
  await assertFails(getDoc(doc(como('rosa'), 'usuarios/nico')));
});

test('Nico ve la verificacion pero NO el numero correcto', async () => {
  const db = como('nico');
  const v = await assertSucceeds(getDoc(doc(db, 'verificaciones/v1')));
  assert.equal(v.data().opciones.length, 6);
  assert.ok(!('desafio' in v.data()));
  await assertFails(getDoc(doc(db, 'verificaciones/v1/privado/desafio')));
});

test('Rosa ve la verificacion y el numero correcto', async () => {
  const db = como('rosa');
  await assertSucceeds(getDoc(doc(db, 'verificaciones/v1')));
  const d = await assertSucceeds(getDoc(doc(db, 'verificaciones/v1/privado/desafio')));
  assert.equal(d.data().desafio, '33');
});

test('Camila (de la familia, pero ajena a esa verificacion) no la ve ni ve el numero', async () => {
  const db = como('camila');
  await assertFails(getDoc(doc(db, 'verificaciones/v1')));
  await assertFails(getDoc(doc(db, 'verificaciones/v1/privado/desafio')));
});

test('Nico puede listar sus verificaciones pendientes, Camila no puede listar las de otros', async () => {
  const q = (db, campo, uid) => getDocs(query(collection(db, 'verificaciones'), where(campo, '==', uid)));
  assert.equal((await assertSucceeds(q(como('nico'), 'objetivoId', 'nico'))).size, 1);
  assert.equal((await assertSucceeds(q(como('rosa'), 'solicitanteId', 'rosa'))).size, 1);
  await assertFails(q(como('camila'), 'objetivoId', 'nico'));
  await assertFails(getDocs(collection(como('nico'), 'verificaciones')));
});

test('nadie escribe verificaciones, alertas, familias ni invitaciones desde el celular', async () => {
  for (const uid of ['rosa', 'nico', 'eva']) {
    const db = como(uid);
    await assertFails(setDoc(doc(db, 'verificaciones/nueva'), { familiaId: 'f1', solicitanteId: uid, objetivoId: 'rosa' }));
    await assertFails(updateDoc(doc(db, 'verificaciones/v1'), { estado: 'verificado' }));
    await assertFails(setDoc(doc(db, 'verificaciones/v1/privado/desafio'), { desafio: '11' }));
    await assertFails(setDoc(doc(db, 'alertas/falsa'), { familiaId: 'f1', gravedad: 'alta' }));
    await assertFails(deleteDoc(doc(db, 'alertas/a1')));
    await assertFails(setDoc(doc(db, 'familias/f9'), { nombre: 'X' }));
    await assertFails(setDoc(doc(db, 'familias/f1/ajustes/palabra'), { palabra: 'hackeada' }));
    await assertFails(getDoc(doc(db, 'invitaciones/abc')));
    await assertFails(setDoc(doc(db, 'invitaciones/otra'), { familiaId: 'f1' }));
    await assertFails(setDoc(doc(db, `usuarios/${uid}`), { familiaId: 'f9' }));
  }
});

test('nadie puede crearse un miembro ni cambiarse el rol, el telefono o el nombre', async () => {
  const db = como('nico');
  await assertFails(setDoc(doc(db, 'familias/f1/miembros/intruso'), { nombre: 'I', rol: 'familiar' }));
  await assertFails(updateDoc(doc(db, 'familias/f1/miembros/nico'), { rol: 'adulto_mayor' }));
  await assertFails(updateDoc(doc(db, 'familias/f1/miembros/nico'), { admin: true }));
  await assertFails(updateDoc(doc(db, 'familias/f1/miembros/nico'), { telefono: '+56 9 0000 0000' }));
  await assertFails(deleteDoc(doc(db, 'familias/f1/miembros/camila')));
  // ni siquiera el dueno del perfil puede mezclar "vistoEn" con otro campo
  await assertFails(updateDoc(doc(db, 'familias/f1/miembros/nico'), { vistoEn: serverTimestamp(), rol: 'adulto_mayor' }));
});

test('un miembro solo puede marcar su propio "vistoEn" con la hora del servidor', async () => {
  const db = como('nico');
  await assertSucceeds(updateDoc(doc(db, 'familias/f1/miembros/nico'), { vistoEn: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'familias/f1/miembros/nico'), { vistoEn: 123 })); // hora inventada
  await assertFails(updateDoc(doc(db, 'familias/f1/miembros/camila'), { vistoEn: serverTimestamp() })); // el de otro
});
