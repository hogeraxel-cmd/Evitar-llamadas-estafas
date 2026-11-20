import test from 'node:test';
import assert from 'node:assert/strict';
import { analizarTexto } from '../src/riesgo.js';

test('falso banco que pide codigo por SMS es riesgo alto', () => {
  const r = analizarTexto('Le hablo del banco. Detectamos movimientos sospechosos y debemos actuar hoy mismo. Necesito que me dicte el código que le llegó por SMS.');
  assert.equal(r.nivel, 'alto');
  assert.ok(r.senales.some(s => s.id === 'codigo'));
});

test('nieto en apuros con numero nuevo, dinero y secreto es riesgo alto', () => {
  const r = analizarTexto('Abuela, soy yo, cambié de número. Tuve un accidente, necesito que me transfieras plata ahora mismo y no le diga a nadie.');
  assert.equal(r.nivel, 'alto');
  assert.ok(r.puntaje >= 90);
  assert.match(r.recomendacion, /Verificar familiar/);
});

test('farmacia que avisa una receta es riesgo bajo', () => {
  const r = analizarTexto('Buenas tardes, llamo de una farmacia del barrio. Su receta ya está lista. No necesita pagar nada por teléfono, solo pasar a retirarla.');
  assert.equal(r.nivel, 'bajo');
});

test('consultorio que confirma una hora es riesgo bajo', () => {
  assert.equal(analizarTexto('Llamo del consultorio para confirmar su hora de control del jueves.').nivel, 'bajo');
});

test('sorteo que pide datos de tarjeta es alto', () => {
  assert.equal(analizarTexto('Ganó un sorteo, solo debe confirmar el número de su tarjeta para enviarle el premio.').nivel, 'alto');
});

test('nieto que habla de "tu": transfieras y no le digas son riesgo alto', () => {
  const r = analizarTexto('Hola abuela soy yo, cambié de número, necesito que me transfieras 300 mil urgente y no le digas a mi mamá');
  assert.equal(r.nivel, 'alto');
  const ids = r.senales.map(s => s.id);
  for (const id of ['dinero', 'secreto', 'numero_nuevo', 'urgencia']) assert.ok(ids.includes(id), id);
});

test('familiar en apuros que pide plata es alto aunque no diga "urgente"', () => {
  const r = analizarTexto('Abuela soy tu nieto, choqué el auto y estoy detenido, el abogado necesita plata ya');
  assert.equal(r.nivel, 'alto');
});

test('pedir el codigo tuteando tambien se detecta', () => {
  const r = analizarTexto('Te llamo del banco, dime el código que te llegó por mensaje');
  assert.equal(r.nivel, 'alto');
});

test('hospital que avisa sin pedir pago sigue siendo bajo', () => {
  assert.equal(analizarTexto('Llamo del hospital para confirmar su hora de control. No necesita pagar nada.').nivel, 'bajo');
});

test('"no necesita pagar" no tapa un pedido de transferencia', () => {
  const r = analizarTexto('Su nieto tuvo un accidente, no necesita pagar el hospital, solo transfiera para el abogado');
  assert.equal(r.nivel, 'alto');
});

test('texto vacio no rompe', () => {
  assert.equal(analizarTexto('').puntaje, 0);
  assert.equal(analizarTexto(undefined).nivel, 'bajo');
});
