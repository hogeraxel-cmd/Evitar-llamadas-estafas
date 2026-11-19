import test from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor, sembrarDemo } from '../src/server.js';
import { ServicioVerificacion } from '../src/verificacion.js';

async function levantar() {
  const servicio = new ServicioVerificacion();
  sembrarDemo(servicio);
  const srv = crearServidor(servicio);
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, cerrar: () => new Promise(ok => srv.close(ok)) };
}
const post = (base, ruta, body) => fetch(base + ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('sirve la app y no deja salir de la carpeta public', async () => {
  const { base, cerrar } = await levantar();
  try {
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    for (const p of ['/..%2fpackage.json', '/%2e%2e/package.json', '/../package.json']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 404, p);
    }
  } finally { await cerrar(); }
});

test('flujo completo: Rosa pide, Nico ve el pendiente y responde', async () => {
  const { base, cerrar } = await levantar();
  try {
    const sol = await (await post(base, '/api/verificaciones', { solicitanteId: 'rosa', objetivoId: 'nico' })).json();
    const pend = await (await fetch(`${base}/api/pendientes?quien=nico`)).json();
    assert.equal(pend.length, 1);
    assert.equal(pend[0].opciones.length, 6);
    assert.equal((await (await fetch(`${base}/api/pendientes?quien=camila`)).json()).length, 0);
    const r = await (await post(base, `/api/verificaciones/${sol.id}/responder`, { quienId: 'nico', eleccion: sol.desafio })).json();
    assert.equal(r.estado, 'verificado');
    assert.equal((await (await fetch(`${base}/api/pendientes?quien=nico`)).json()).length, 0);
  } finally { await cerrar(); }
});

test('un tercero no puede responder por Nico', async () => {
  const { base, cerrar } = await levantar();
  try {
    const sol = await (await post(base, '/api/verificaciones', { solicitanteId: 'rosa', objetivoId: 'nico' })).json();
    const r = await post(base, `/api/verificaciones/${sol.id}/responder`, { quienId: 'camila', eleccion: sol.desafio });
    assert.equal(r.status, 403);
  } finally { await cerrar(); }
});
