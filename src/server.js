// API HTTP minima (sin dependencias) + archivos de la app web. Datos en memoria.
// IMPORTANTE: sin autenticacion real (el "quien" lo declara el cliente). Solo para pruebas locales.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analizarTexto } from './riesgo.js';
import { ServicioVerificacion } from './verificacion.js';

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
};
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export function sembrarDemo(servicio) {
  servicio.registrarMiembro({ id: 'rosa', nombre: 'Rosa (abuela)', familiaId: 'f1', rol: 'adulto_mayor' });
  servicio.registrarMiembro({ id: 'nico', nombre: 'Nico (nieto)', familiaId: 'f1', rol: 'familiar' });
  servicio.registrarMiembro({ id: 'camila', nombre: 'Camila (hija)', familiaId: 'f1', rol: 'familiar' });
}

export function crearServidor(servicio = new ServicioVerificacion()) {
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const leer = req => new Promise((ok, fail) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 100_000) { fail(new Error('Cuerpo muy grande')); req.destroy(); } });
    req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { fail(new Error('JSON invalido')); } });
  });

  async function estatico(res, pathname) {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const abs = path.resolve(PUBLICO, rel);
    if (abs !== PUBLICO && !abs.startsWith(PUBLICO + path.sep)) return json(res, 404, { error: 'No encontrado' });
    try {
      const data = await readFile(abs);
      res.writeHead(200, {
        'content-type': TIPOS[path.extname(abs)] ?? 'application/octet-stream',
        'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache',
      });
      res.end(data);
    } catch { json(res, 404, { error: 'No encontrado' }); }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ruta = url.pathname.split('/').filter(Boolean);
    try {
      if (ruta[0] !== 'api') {
        if (req.method !== 'GET') return json(res, 405, { error: 'Metodo no permitido' });
        return await estatico(res, url.pathname);
      }
      if (req.method === 'POST' && url.pathname === '/api/analizar') {
        const { texto } = await leer(req);
        return json(res, 200, analizarTexto(texto));
      }
      if (req.method === 'POST' && url.pathname === '/api/miembros') {
        return json(res, 201, servicio.registrarMiembro(await leer(req)));
      }
      if (req.method === 'GET' && ruta[1] === 'familias' && ruta[2] && ruta[3] === 'miembros') {
        return json(res, 200, servicio.miembrosDe(ruta[2]));
      }
      if (req.method === 'GET' && url.pathname === '/api/pendientes') {
        return json(res, 200, servicio.pendientesDe(url.searchParams.get('quien')));
      }
      if (req.method === 'POST' && url.pathname === '/api/verificaciones') {
        return json(res, 201, servicio.crear(await leer(req)));
      }
      if (ruta[1] === 'verificaciones' && ruta[2]) {
        const id = ruta[2];
        const quien = url.searchParams.get('quien');
        if (req.method === 'GET' && ruta[3] === 'solicitante') return json(res, 200, servicio.verSolicitante(id, quien));
        if (req.method === 'GET' && ruta[3] === 'objetivo') return json(res, 200, servicio.verObjetivo(id, quien));
        if (req.method === 'POST' && ruta[3] === 'responder') {
          const { quienId, eleccion, noSoyYo } = await leer(req);
          return json(res, 200, servicio.responder(id, quienId, { eleccion, noSoyYo }));
        }
      }
      if (req.method === 'GET' && ruta[1] === 'alertas' && ruta[2]) {
        return json(res, 200, servicio.alertasDe(ruta[2]));
      }
      json(res, 404, { error: 'No encontrado' });
    } catch (e) {
      json(res, e.message === 'No autorizado' ? 403 : 400, { error: e.message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const puerto = Number(process.env.PORT) || 3000;
  const servicio = new ServicioVerificacion();
  if (!process.env.SIN_DEMO) sembrarDemo(servicio);
  crearServidor(servicio).listen(puerto, '127.0.0.1', () => console.log(`Aló Seguro (prototipo) en http://127.0.0.1:${puerto}`));
}
