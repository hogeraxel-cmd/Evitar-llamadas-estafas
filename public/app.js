// App web del prototipo. Todo el texto de la API se inserta con textContent (nunca innerHTML).
const FAMILIA = 'f1';
const $app = document.getElementById('app');
const $quien = document.getElementById('quien');
const $salir = document.getElementById('salir');
let temporizadores = [];
let yo = null;

const api = async (ruta, opciones) => {
  const r = await fetch('/api' + ruta, opciones && { ...opciones, headers: { 'content-type': 'application/json' }, body: JSON.stringify(opciones.body) });
  const datos = await r.json();
  if (!r.ok) throw new Error(datos.error || 'Error');
  return datos;
};
const post = (ruta, body) => api(ruta, { method: 'POST', body });

function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const h of hijos.flat()) e.append(h instanceof Node ? h : document.createTextNode(h ?? ''));
  return e;
}
function pantalla(...nodos) { limpiar(); $app.replaceChildren(...nodos); }
function limpiar() { temporizadores.forEach(clearInterval); temporizadores = []; }
function cada(ms, fn) { fn(); temporizadores.push(setInterval(fn, ms)); }
function guardado(k, v) { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } }

// ---------- quien eres ----------
async function elegir() {
  yo = null; $quien.hidden = true; $salir.hidden = true;
  const miembros = await api(`/familias/${FAMILIA}/miembros`);
  pantalla(
    el('h1', {}, '¿Quién usa este teléfono?'),
    el('p', { class: 'muted' }, 'En el prototipo eliges a la persona. En la versión real se ingresa con su número y un código.'),
    el('div', { class: 'lista' }, miembros.map(m => el('button', { class: 'btn', type: 'button', onclick: () => entrar(m) }, m.nombre))),
  );
}
function entrar(m) {
  yo = m; guardado('yo', m.id);
  $quien.textContent = m.nombre; $quien.hidden = false; $salir.hidden = false;
  (m.rol === 'adulto_mayor' ? vistaMayor : vistaFamiliar)();
}
$salir.addEventListener('click', elegir);

// ---------- Rosa (adulto mayor) ----------
async function vistaMayor() {
  const otros = (await api(`/familias/${FAMILIA}/miembros`)).filter(m => m.id !== yo.id);
  const zonaVerif = el('div', { class: 'card' });
  const zonaTexto = el('div', { class: 'card' });
  pantalla(
    el('h1', {}, `Hola, ${yo.nombre.split(' ')[0]}`),
    el('div', { class: 'card' },
      el('h2', {}, '¿Alguien dice ser de su familia y le pide dinero?'),
      el('p', {}, 'No transfiera nada. Primero toque el nombre de quien dice ser:'),
      el('div', { class: 'lista' }, otros.map(m => el('button', { class: 'btn primario', type: 'button', onclick: () => verificar(m, zonaVerif) }, `Verificar a ${m.nombre}`))),
    ),
    zonaVerif, zonaTexto,
  );
  formularioTexto(zonaTexto);
  alertas();
}

async function verificar(objetivo, zona) {
  limpiarZonaTimers();
  let sol;
  try { sol = await post('/verificaciones', { solicitanteId: yo.id, objetivoId: objetivo.id }); }
  catch (e) { zona.replaceChildren(el('p', { class: 'estado mal' }, e.message)); return; }
  const numero = el('div', { class: 'numero' }, sol.desafio);
  const msg = el('p', { class: 'estado pendiente' }, sol.mensaje);
  zona.replaceChildren(el('h2', {}, `Verificando a ${objetivo.nombre}`), numero, msg);
  temporizadores.push(setInterval(async () => {
    try {
      const v = await api(`/verificaciones/${sol.id}/solicitante?quien=${encodeURIComponent(yo.id)}`);
      msg.textContent = v.mensaje;
      msg.className = 'estado ' + (v.estado === 'pendiente' ? 'pendiente' : v.estado === 'verificado' ? 'verificado' : 'mal');
      if (v.estado !== 'pendiente') { numero.hidden = true; limpiarZonaTimers(); }
    } catch { /* reintenta en el siguiente ciclo */ }
  }, 1500));
}
function limpiarZonaTimers() { // detiene el seguimiento de una verificacion, conserva el refresco de alertas
  temporizadores.filter(t => t !== alertasTimer).forEach(clearInterval);
  temporizadores = temporizadores.filter(t => t === alertasTimer);
}

function formularioTexto(zona) {
  const area = el('textarea', { id: 'texto', placeholder: 'Escriba o pegue lo que dijo quien llamó…' });
  const salida = el('div');
  zona.replaceChildren(
    el('h2', {}, '¿Es una estafa?'),
    el('label', { htmlFor: 'texto', class: 'muted' }, 'Cuente con sus palabras qué le pidieron.'),
    area,
    el('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!area.value.trim()) return;
      const r = await post('/analizar', { texto: area.value });
      salida.replaceChildren(
        el('p', { class: 'estado ' + (r.nivel === 'alto' ? 'mal' : r.nivel === 'medio' ? 'pendiente' : 'verificado') }, `Riesgo ${r.nivel} (${r.puntaje}%). ${r.recomendacion}`),
        el('div', { class: 'chips' }, r.senales.map(s => el('span', { class: 'chip' }, s.etiqueta))),
      );
    } }, 'Revisar'),
    salida,
  );
}

// ---------- familiar (Nico, Camila) ----------
async function vistaFamiliar() {
  const zona = el('div', { class: 'lista' });
  pantalla(el('h1', {}, `Hola, ${yo.nombre.split(' ')[0]}`), zona, el('div', { id: 'zalertas' }));
  let mostrando = null;
  cada(2000, async () => {
    const pend = await api(`/pendientes?quien=${encodeURIComponent(yo.id)}`).catch(() => []);
    const actual = pend[0]?.id ?? null;
    if (actual === mostrando) return;
    mostrando = actual;
    zona.replaceChildren(...(pend[0] ? [await tarjetaPendiente(pend[0], () => { mostrando = 'fin'; })] : [el('p', { class: 'muted' }, 'Nadie le ha pedido verificar una llamada.')]));
  });
  alertas();
}

async function tarjetaPendiente(p, alTerminar) {
  const cont = el('div', { class: 'card' });
  const respuesta = async body => {
    const r = await post(`/verificaciones/${p.id}/responder`, { quienId: yo.id, ...body });
    alTerminar();
    cont.replaceChildren(el('p', { class: 'estado ' + (r.estado === 'verificado' ? 'verificado' : 'mal') }, r.estado === 'verificado' ? 'Gracias. Confirmado.' : 'Listo. Avisamos a la familia.'));
  };
  const mostrarOpciones = () => cont.replaceChildren(
    el('h2', {}, p.mensaje),
    el('div', { class: 'opciones' }, p.opciones.map(o => el('button', { class: 'btn', type: 'button', onclick: () => respuesta({ eleccion: o }) }, o))),
    el('button', { class: 'btn peligro', type: 'button', onclick: () => respuesta({ noSoyYo: true }) }, 'No soy yo, no estoy llamando'),
  );
  await compuertaPin(cont, mostrarOpciones);
  return cont;
}

// PIN local para abrir el aviso. Es una proteccion basica del prototipo:
// en la version real se usa huella/rostro del telefono (WebAuthn).
async function hash(pin) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${yo.id}:${pin}`));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function compuertaPin(cont, continuar) {
  const guardada = guardado('pin_' + yo.id);
  const campo = el('input', { type: 'password', inputMode: 'numeric', maxLength: 4, id: 'pin', autocomplete: 'off' });
  const error = el('p', { class: 'estado mal', hidden: true });
  cont.replaceChildren(
    el('h2', {}, 'Alguien pidió verificar una llamada'),
    el('label', { htmlFor: 'pin', class: 'muted' }, guardada ? 'Ingrese su PIN de 4 dígitos para ver el aviso.' : 'Cree un PIN de 4 dígitos para proteger estos avisos.'),
    campo, error,
    el('button', { class: 'btn primario', type: 'button', onclick: async () => {
      if (!/^\d{4}$/.test(campo.value)) { error.hidden = false; error.textContent = 'Use 4 números.'; return; }
      const h = await hash(campo.value);
      if (!guardada) { guardado('pin_' + yo.id, h); return continuar(); }
      if (h === guardada) return continuar();
      error.hidden = false; error.textContent = 'PIN incorrecto.';
    } }, 'Continuar'),
  );
}

// ---------- alertas de la familia ----------
let alertasTimer = null;
function alertas() {
  const zona = document.getElementById('zalertas') ?? el('div');
  if (!zona.id) { zona.id = 'zalertas'; $app.append(zona); }
  const pintar = async () => {
    const lista = await api(`/alertas/${FAMILIA}`).catch(() => []);
    zona.replaceChildren(
      el('h2', {}, 'Avisos de la familia'),
      ...(lista.length ? lista.slice().reverse().map(a => el('div', { class: 'alerta ' + (a.gravedad === 'alta' ? 'alta' : '') },
        el('b', {}, a.gravedad === 'alta' ? 'Alerta alta' : 'Aviso'), el('p', {}, a.texto),
        el('small', {}, new Date(a.cuando).toLocaleTimeString('es-CL')))) : [el('p', { class: 'muted' }, 'Sin avisos por ahora.')]),
    );
  };
  pintar();
  alertasTimer = setInterval(pintar, 3000);
  temporizadores.push(alertasTimer);
}

// ---------- inicio ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
(async () => {
  const id = guardado('yo');
  const m = id && (await api(`/familias/${FAMILIA}/miembros`)).find(x => x.id === id);
  m ? entrar(m) : elegir();
})().catch(e => pantalla(el('p', { class: 'estado mal' }, 'No se pudo conectar: ' + e.message)));
