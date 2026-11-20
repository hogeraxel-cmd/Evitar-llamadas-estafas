import test from 'node:test';
import assert from 'node:assert/strict';
import { ServicioVerificacion, ESTADOS } from '../src/verificacion.js';

function nuevo(extra = {}) {
  const hora = { t: 1_000_000 };
  const s = new ServicioVerificacion({ ahora: () => hora.t, ...extra });
  s.registrarMiembro({ id: 'rosa', nombre: 'Rosa', familiaId: 'f1', rol: 'adulto_mayor' });
  s.registrarMiembro({ id: 'nico', nombre: 'Nico', familiaId: 'f1' });
  s.registrarMiembro({ id: 'otro', nombre: 'Otro', familiaId: 'f2' });
  return { s, hora };
}

test('Nico elige el numero que ve Rosa: verificado', () => {
  const { s } = nuevo();
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  const vistaNico = s.verObjetivo(sol.id, 'nico');
  assert.equal(vistaNico.opciones.length, 6);
  assert.ok(vistaNico.opciones.includes(sol.desafio));
  const r = s.responder(sol.id, 'nico', { eleccion: sol.desafio });
  assert.equal(r.estado, ESTADOS.VERIFICADO);
});

test('si Rosa toca dos veces, se reusa la misma solicitud y Nico ve un solo pendiente', () => {
  const { s, hora } = nuevo();
  const a = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  const b = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  assert.equal(b.id, a.id);
  assert.equal(b.desafio, a.desafio);
  assert.equal(s.pendientesDe('nico').length, 1);
  // Ya respondida o vencida, un nuevo toque si crea una solicitud nueva.
  s.responder(a.id, 'nico', { eleccion: a.desafio });
  const c = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  assert.notEqual(c.id, a.id);
  hora.t += 200_000;
  const d = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  assert.notEqual(d.id, c.id);
});

test('la vista de Nico no revela cual numero es el correcto', () => {
  const { s } = nuevo();
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  const vista = JSON.stringify(s.verObjetivo(sol.id, 'nico'));
  assert.ok(!vista.includes('desafio'));
});

test('numero equivocado: rechazado y alerta media', () => {
  const { s } = nuevo();
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  const mal = s.verObjetivo(sol.id, 'nico').opciones.find(o => o !== sol.desafio);
  assert.equal(s.responder(sol.id, 'nico', { eleccion: mal }).estado, ESTADOS.RECHAZADO);
  assert.equal(s.alertasDe('f1')[0].gravedad, 'media');
});

test('"No soy yo": estafa confirmada y alerta alta a la familia', () => {
  const { s } = nuevo();
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  const r = s.responder(sol.id, 'nico', { noSoyYo: true });
  assert.equal(r.estado, ESTADOS.NO_SOY_YO);
  assert.match(r.mensaje, /estafa/i);
  assert.equal(s.alertasDe('f1')[0].gravedad, 'alta');
});

test('sin respuesta a tiempo: expirado, y no se puede responder despues', () => {
  const { s, hora } = nuevo({ vigenciaMs: 60_000 });
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  hora.t += 61_000;
  const r = s.responder(sol.id, 'nico', { eleccion: sol.desafio });
  assert.equal(r.estado, ESTADOS.EXPIRADO);
});

test('una respuesta final no se puede cambiar', () => {
  const { s } = nuevo();
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  s.responder(sol.id, 'nico', { noSoyYo: true });
  assert.equal(s.responder(sol.id, 'nico', { eleccion: sol.desafio }).estado, ESTADOS.NO_SOY_YO);
});

test('solo el verificado puede responder y solo quien pide ve el desafio', () => {
  const { s } = nuevo();
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  assert.throws(() => s.responder(sol.id, 'rosa', { eleccion: sol.desafio }), /No autorizado/);
  assert.throws(() => s.verSolicitante(sol.id, 'nico'), /No autorizado/);
});

test('no se puede verificar a alguien de otra familia ni a uno mismo', () => {
  const { s } = nuevo();
  assert.throws(() => s.crear({ solicitanteId: 'rosa', objetivoId: 'otro' }), /misma familia/);
  assert.throws(() => s.crear({ solicitanteId: 'rosa', objetivoId: 'rosa' }), /uno mismo/);
});

test('si Nico no responde a tiempo, la familia recibe un aviso', () => {
  const { s, hora } = nuevo({ vigenciaMs: 60_000 });
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  hora.t += 61_000;
  assert.equal(s.verSolicitante(sol.id, 'rosa').estado, ESTADOS.EXPIRADO);
  s.verSolicitante(sol.id, 'rosa'); // consultar de nuevo no duplica el aviso
  const a = s.alertasDe('f1');
  assert.equal(a.length, 1);
  assert.match(a[0].texto, /no hubo respuesta/);
});

test('se sabe si un familiar usa la app, sin exponer cuando', () => {
  const { s } = nuevo();
  const nico = () => s.miembrosDe('f1').find(m => m.id === 'nico');
  assert.equal(nico().usaLaApp, false);
  s.marcarVisto('nico');
  assert.equal(nico().usaLaApp, true);
  assert.equal(nico().vistoEn, undefined);
  s.marcarVisto('no-existe'); // no rompe
});

test('cada uno guarda solo su propio numero de siempre', () => {
  const { s } = nuevo();
  assert.equal(s.definirTelefono('nico', 'nico', '+56 9 1234-5678 <script>').telefono, '+56 9 12345678');
  assert.throws(() => s.definirTelefono('nico', 'rosa', '+56 9 0000 0000'), /No autorizado/);
  assert.throws(() => s.definirTelefono('nico', 'nico', '123'), /corto/);
});

test('palabra clave: solo la familia la define y la ve', () => {
  const { s } = nuevo();
  assert.equal(s.verPalabraClave('f1', 'rosa').palabra, null);
  s.definirPalabraClave('f1', 'nico', '  empanada  ');
  assert.equal(s.verPalabraClave('f1', 'rosa').palabra, 'empanada');
  assert.throws(() => s.verPalabraClave('f1', 'otro'), /No autorizado/);
  assert.throws(() => s.definirPalabraClave('f1', 'otro', 'chancho'), /No autorizado/);
  assert.throws(() => s.definirPalabraClave('f1', 'nico', 'ab'), /entre 3 y 40/);
});

test('la alerta de "No soy yo" dice a quien llamaron y por quien se hicieron pasar', () => {
  const { s } = nuevo();
  const sol = s.crear({ solicitanteId: 'rosa', objetivoId: 'nico' });
  const vista = s.verObjetivo(sol.id, 'nico');
  assert.equal(vista.solicitante, 'Rosa');
  assert.match(vista.mensaje, /¿Estás hablando con Rosa ahora\?/);
  s.responder(sol.id, 'nico', { noSoyYo: true });
  const [a] = s.alertasDe('f1');
  assert.equal(a.gravedad, 'alta');
  assert.match(a.texto, /llamó a Rosa haciéndose pasar por Nico/);
});
