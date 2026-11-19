// API HTTP minima (sin dependencias) para el prototipo. Datos en memoria.
// IMPORTANTE: sin autenticacion real. No exponer a internet; es solo para pruebas locales.
import http from 'node:http';
import { analizarTexto } from './riesgo.js';
import { ServicioVerificacion } from './verificacion.js';

export function crearServidor(servicio = new ServicioVerificacion()) {
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const leer = req => new Promise((ok, fail) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 100_000) { fail(new Error('Cuerpo muy grande')); req.destroy(); } });
    req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { fail(new Error('JSON invalido')); } });
  });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ruta = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'POST' && url.pathname === '/api/analizar') {
        const { texto } = await leer(req);
        return json(res, 200, analizarTexto(texto));
      }
      if (req.method === 'POST' && url.pathname === '/api/miembros') {
        return json(res, 201, servicio.registrarMiembro(await leer(req)));
      }
      if (req.method === 'POST' && url.pathname === '/api/verificaciones') {
        return json(res, 201, servicio.crear(await leer(req)));
      }
      if (ruta[0] === 'api' && ruta[1] === 'verificaciones' && ruta[2]) {
        const id = ruta[2];
        const quien = url.searchParams.get('quien');
        if (req.method === 'GET' && ruta[3] === 'solicitante') return json(res, 200, servicio.verSolicitante(id, quien));
        if (req.method === 'GET' && ruta[3] === 'objetivo') return json(res, 200, servicio.verObjetivo(id, quien));
        if (req.method === 'POST' && ruta[3] === 'responder') {
          const { quienId, eleccion, noSoyYo } = await leer(req);
          return json(res, 200, servicio.responder(id, quienId, { eleccion, noSoyYo }));
        }
      }
      if (req.method === 'GET' && ruta[0] === 'api' && ruta[1] === 'alertas' && ruta[2]) {
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
  crearServidor().listen(puerto, '127.0.0.1', () => console.log(`Aló Seguro (prototipo) en http://127.0.0.1:${puerto}`));
}
