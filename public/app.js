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
// Bloquea un boton mientras espera la respuesta (evita dobles toques).
async function ocupado(boton, fn) {
  if (boton.disabled) return;
  boton.disabled = true;
  try { return await fn(); } finally { boton.disabled = false; }
}
const mostrar = nodo => requestAnimationFrame(() => nodo.scrollIntoView({ behavior: 'smooth', block: 'start' }));

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
const corto = m => m.nombre.replace(/\s*\(.*\)\s*$/, '');
// Botón para cortar y llamar al número de siempre (enlace tel:, lo abre el marcador del teléfono).
function botonLlamar(m, clase = 'btn primario') {
  if (!m.telefono) return el('p', { class: 'muted' }, `${corto(m)} todavía no guarda su número en la app.`);
  return el('a', { class: clase, href: 'tel:' + m.telefono.replace(/[^\d+]/g, '') }, `Llamar a ${corto(m)} · ${m.telefono}`);
}

async function vistaMayor() {
  const otros = (await api(`/familias/${FAMILIA}/miembros`)).filter(m => m.id !== yo.id);
  const zonaOpciones = el('div', { class: 'card', hidden: true });
  const zonaVerif = el('div', { class: 'card', hidden: true });
  const zonaPreguntas = el('div', { class: 'card' });
  const botones = otros.map(m => el('button', { class: 'btn primario', type: 'button', ariaPressed: 'false', onclick: e => {
    botones.forEach(b => { b.ariaPressed = String(b === e.currentTarget); });
    limpiarZonaTimers(); zonaVerif.hidden = true;
    opcionesPara(m, zonaOpciones, zonaVerif);
  } }, `Dice ser ${m.nombre}`));
  pantalla(
    el('h1', {}, `Hola, ${yo.nombre.split(' ')[0]}`),
    el('div', { class: 'card' },
      el('h2', {}, '¿Alguien dice ser de su familia y le pide dinero?'),
      el('p', {}, 'No transfiera nada. ¿Quién dice ser?'),
      el('div', { class: 'lista' }, botones),
    ),
    zonaOpciones, zonaVerif, zonaPreguntas,
  );
  preguntas(zonaPreguntas);
  alertas();
}

// Las tres formas de comprobar si de verdad es el familiar.
async function opcionesPara(elegido, zona, zonaVerif) {
  // Se vuelve a pedir: el familiar pudo haber guardado su número hace un rato.
  const [{ palabra }, miembros] = await Promise.all([
    api(`/familias/${FAMILIA}/palabra?quien=${encodeURIComponent(yo.id)}`).catch(() => ({ palabra: null })),
    api(`/familias/${FAMILIA}/miembros`).catch(() => []),
  ]);
  const m = miembros.find(x => x.id === elegido.id) ?? elegido;
  const nombre = corto(m);
  let opcionPalabra;
  if (palabra) {
    const oculta = el('p', { class: 'palabra', hidden: true }, palabra);
    const ver = el('button', { class: 'btn', type: 'button', onclick: () => { oculta.hidden = !oculta.hidden; ver.textContent = oculta.hidden ? 'Ver la palabra' : 'Ocultar la palabra'; } }, 'Ver la palabra');
    opcionPalabra = [
      el('p', {}, 'Pregúntele: ', el('q', {}, '¿Cuál es la palabra de la familia?')),
      el('p', { class: 'consejo' }, 'No la diga usted: que se la diga quien llama. Si no la sabe o se enoja, corte.'),
      ver, oculta,
    ];
  } else {
    opcionPalabra = [el('p', { class: 'muted' }, 'Su familia todavía no elige una palabra. Pídales que la elijan en la app.')];
  }
  zona.replaceChildren(
    el('h2', {}, `Dice ser ${nombre}. Compruébelo:`),
    el('section', { class: 'opcion' },
      el('h3', {}, `1. Que lo confirme desde su teléfono`),
      el('p', {}, `A ${nombre} le llega un aviso. Si es de verdad, lo confirma.`),
      m.usaLaApp === false
        ? el('p', { class: 'estado pendiente' }, `${nombre} todavía no usa la app: es probable que no le llegue el aviso. Mejor use la palabra de la familia o llame a ${nombre}.`)
        : '',
      el('button', { class: 'btn primario', type: 'button', onclick: e => ocupado(e.currentTarget, () => verificar(m, zonaVerif)) }, `Verificar con el teléfono de ${nombre}`),
    ),
    el('section', { class: 'opcion' }, el('h3', {}, '2. La palabra de la familia'), ...opcionPalabra),
    el('section', { class: 'opcion segura' },
      el('h3', {}, `3. Cortar y llamar usted a ${nombre}`),
      el('p', {}, `Lo más seguro: corte y llame a ${nombre} al número de siempre.`),
      botonLlamar(m),
    ),
  );
  zona.hidden = false;
  mostrar(zona);
}

async function verificar(objetivo, zona) {
  limpiarZonaTimers();
  let sol;
  try { sol = await post('/verificaciones', { solicitanteId: yo.id, objetivoId: objetivo.id }); }
  catch (e) { zona.hidden = false; zona.replaceChildren(el('p', { class: 'estado mal' }, 'No se pudo conectar. Intente de nuevo.')); mostrar(zona); return; }
  const numero = el('div', { class: 'numero', ariaLabel: `Número ${sol.desafio}` }, sol.desafio);
  const msg = el('p', { class: 'estado pendiente grande' }, sol.mensaje);
  const reloj = el('p', { class: 'muted reloj' });
  const nombre = corto(objetivo);
  const pasos = el('ol', { class: 'pasos' },
    el('li', {}, 'Ponga el altavoz, para seguir escuchando mientras mira esta pantalla.'),
    el('li', {}, 'Dígale a quien la llama: ', el('q', {}, `Te llegó un aviso de Aló Seguro. Toca el número ${sol.desafio}.`)),
    el('li', {}, 'Espere aquí la respuesta.'),
  );
  const consejo = el('div', { class: 'consejo' },
    el('p', {}, el('b', {}, `Si dice que perdió su celular o que no puede tocarlo: `), `eso no lo confirma. Corte y llame a ${nombre} al número de siempre.`),
    el('p', {}, 'Si le cambia el tema o le pide que se apure, corte. No transfiera nada.'),
  );
  const llamar = el('div', { hidden: true }, botonLlamar(objetivo));
  zona.replaceChildren(el('h2', {}, `Verificando a ${nombre}`), numero, pasos, msg, reloj, consejo, llamar);
  zona.hidden = false;
  mostrar(zona);
  const tic = () => {
    const s = Math.max(0, Math.round((sol.expira - Date.now()) / 1000));
    reloj.textContent = `Quedan ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} para que responda.`;
  };
  tic();
  temporizadores.push(setInterval(tic, 1000));
  temporizadores.push(setInterval(async () => {
    try {
      const v = await api(`/verificaciones/${sol.id}/solicitante?quien=${encodeURIComponent(yo.id)}`);
      msg.textContent = v.mensaje;
      msg.className = 'estado grande ' + (v.estado === 'pendiente' ? 'pendiente' : v.estado === 'verificado' ? 'verificado' : 'mal');
      if (v.estado !== 'pendiente') {
        numero.hidden = pasos.hidden = reloj.hidden = consejo.hidden = true;
        llamar.hidden = v.estado === 'verificado'; // si no se confirmó, ofrecer llamar al número de siempre
        limpiarZonaTimers(); mostrar(zona);
      }
    } catch { /* reintenta en el siguiente ciclo */ }
  }, 1500));
}
function limpiarZonaTimers() { // detiene el seguimiento de una verificacion, conserva el refresco de alertas
  temporizadores.filter(t => t !== alertasTimer).forEach(clearInterval);
  temporizadores = temporizadores.filter(t => t === alertasTimer);
}

// "¿Es una estafa?": preguntas de Sí/No con botones grandes; escribir queda como opción.
async function preguntas(zona) {
  const lista = await api('/preguntas').catch(() => []);
  const marcadas = new Set();
  const toggles = lista.map(p => el('button', { class: 'btn toggle', type: 'button', ariaPressed: 'false', onclick: e => {
    const b = e.currentTarget;
    marcadas.has(p.id) ? marcadas.delete(p.id) : marcadas.add(p.id);
    b.ariaPressed = String(marcadas.has(p.id));
    b.querySelector('.marca').textContent = marcadas.has(p.id) ? 'Sí' : '';
  } }, el('span', { class: 'marca', ariaHidden: 'true' }), p.texto));
  const area = el('textarea', { id: 'texto', placeholder: 'Escriba lo que dijo quien llamó…' });
  const salida = el('div', { class: 'lista' });
  zona.replaceChildren(
    el('h2', {}, '¿Es una estafa?'),
    el('p', {}, 'Toque lo que le pasó en la llamada:'),
    el('div', { class: 'lista' }, toggles),
    el('details', {}, el('summary', {}, 'Prefiero escribirlo'),
      el('label', { htmlFor: 'texto', class: 'muted' }, 'Cuente con sus palabras qué le pidieron.'), area),
    el('button', { class: 'btn primario', type: 'button', onclick: e => ocupado(e.currentTarget, async () => {
      if (!marcadas.size && !area.value.trim()) {
        salida.replaceChildren(el('p', { class: 'estado pendiente' }, 'No marcó nada. Si igual tiene dudas, corte y llame a su familiar al número de siempre.'));
        mostrar(salida); return;
      }
      let r;
      try { r = await post('/analizar', { texto: area.value, marcadas: [...marcadas] }); }
      catch { salida.replaceChildren(el('p', { class: 'estado mal' }, 'No se pudo revisar. Intente de nuevo.')); return; }
      const titulo = { alto: 'Cuidado: parece una estafa.', medio: 'Tenga cuidado.', bajo: 'No vemos señales de estafa.' }[r.nivel];
      salida.replaceChildren(
        el('div', { class: 'estado grande ' + (r.nivel === 'alto' ? 'mal' : r.nivel === 'medio' ? 'pendiente' : 'verificado') },
          el('p', {}, titulo), el('p', { class: 'normal' }, r.recomendacion)),
        r.senales.length ? el('p', { class: 'muted' }, 'Lo que nos hizo dudar:') : '',
        el('div', { class: 'chips' }, r.senales.map(s => el('span', { class: 'chip' }, s.etiqueta))),
      );
      mostrar(salida);
    }) }, 'Revisar'),
    salida,
  );
}

// ---------- familiar (Nico, Camila) ----------
async function vistaFamiliar() {
  const zona = el('div', { class: 'lista' });
  const ajustes = el('details', { class: 'card' });
  pantalla(el('h1', {}, `Hola, ${yo.nombre.split(' ')[0]}`), zona, el('div', { id: 'zalertas' }), ajustes);
  ajustesFamiliar(ajustes);
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

// Lo que un familiar deja preparado para ayudar a Rosa: su número de siempre y la palabra de la familia.
async function ajustesFamiliar(cont) {
  const { palabra } = await api(`/familias/${FAMILIA}/palabra?quien=${encodeURIComponent(yo.id)}`).catch(() => ({ palabra: null }));
  const tel = el('input', { type: 'tel', id: 'tel', value: yo.telefono ?? '', autocomplete: 'tel', placeholder: '+56 9 …' });
  const pal = el('input', { type: 'text', id: 'pal', autocomplete: 'off', placeholder: palabra ? 'Escribe una nueva para cambiarla' : 'Ej.: una comida o un apodo familiar' });
  const msgTel = el('p', { class: 'muted', role: 'status' });
  const msgPal = el('p', { class: 'muted', role: 'status' }, palabra ? 'Tu familia ya tiene una palabra.' : 'Tu familia todavía no tiene una palabra.');
  cont.open = !yo.telefono || !palabra; // abierto si falta algo por configurar
  cont.replaceChildren(
    el('summary', {}, 'Preparar la ayuda para la familia'),
    el('div', { class: 'lista' },
      el('label', { htmlFor: 'tel' }, el('b', {}, 'Tu número de siempre'), el('br'), el('span', { class: 'muted' }, 'Si alguien llama haciéndose pasar por ti, la app le dirá a tu familia que corte y te llame a este número.')),
      tel,
      el('button', { class: 'btn', type: 'button', onclick: e => ocupado(e.currentTarget, async () => {
        try { yo = await post(`/miembros/${yo.id}/telefono`, { quienId: yo.id, telefono: tel.value }); tel.value = yo.telefono; msgTel.textContent = 'Número guardado.'; }
        catch (err) { msgTel.textContent = err.message; }
      }) }, 'Guardar número'),
      msgTel,
      el('label', { htmlFor: 'pal' }, el('b', {}, 'Palabra de la familia'), el('br'), el('span', { class: 'muted' }, 'Una palabra que solo sepa la familia. No la compartas por mensaje ni en redes: cuéntala en persona.')),
      pal,
      el('button', { class: 'btn', type: 'button', onclick: e => ocupado(e.currentTarget, async () => {
        try { await post(`/familias/${FAMILIA}/palabra`, { quienId: yo.id, palabra: pal.value }); pal.value = ''; msgPal.textContent = 'Palabra guardada. Cuéntasela a la familia en persona.'; }
        catch (err) { msgPal.textContent = err.message; }
      }) }, 'Guardar palabra'),
      msgPal,
    ),
  );
}

async function tarjetaPendiente(p, alTerminar) {
  const cont = el('div', { class: 'card' });
  const respuesta = async body => {
    cont.querySelectorAll('button').forEach(b => { b.disabled = true; });
    let r;
    try { r = await post(`/verificaciones/${p.id}/responder`, { quienId: yo.id, ...body }); }
    catch {
      cont.querySelectorAll('button').forEach(b => { b.disabled = false; });
      cont.append(el('p', { class: 'estado mal' }, 'No se pudo enviar. Intente de nuevo.'));
      return;
    }
    alTerminar();
    const textos = { verificado: 'Gracias. Confirmado.', no_soy_yo: 'Listo. Avisamos a la familia.', expirado: 'Este pedido ya venció.' };
    cont.replaceChildren(el('p', { class: 'estado ' + (r.estado === 'verificado' ? 'verificado' : 'mal') }, textos[r.estado] ?? 'No coincidió el número. Avisamos a la familia.'));
  };
  const quien = p.solicitante ?? 'esa persona';
  const mostrarOpciones = () => cont.replaceChildren(
    el('h2', {}, p.mensaje),
    el('p', { class: 'respuesta-titulo' }, el('b', {}, 'Sí: '), `toca el número que ${quien} te dice.`),
    el('div', { class: 'opciones' }, p.opciones.map(o => el('button', { class: 'btn', type: 'button', onclick: () => respuesta({ eleccion: o }) }, o))),
    el('p', { class: 'respuesta-titulo' }, el('b', {}, 'No: '), `alguien se está haciendo pasar por ti.`),
    el('button', { class: 'btn peligro', type: 'button', onclick: () => respuesta({ noSoyYo: true }) }, `No estoy hablando con ${quien}`),
  );
  await compuertaPin(cont, mostrarOpciones);
  return cont;
}

// PIN local para abrir el aviso. Es una proteccion basica del prototipo:
// en la version real se usa huella/rostro del telefono (WebAuthn).
async function hash(pin) {
  const texto = `${yo.id}:${pin}`;
  if (globalThis.crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  // Sin HTTPS (celular entrando por http://192.168...) el navegador no ofrece crypto.subtle.
  // Solo para el prototipo en la red de la casa: hash simple FNV-1a.
  let h = 0x811c9dc5;
  for (const c of texto) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'fnv:' + h.toString(16);
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
  let ultima = null;
  const pintar = async () => {
    const lista = await api(`/alertas/${FAMILIA}`).catch(() => null);
    if (!lista) return;
    // Solo redibuja si cambió: así no parpadea ni el lector de pantalla repite los avisos.
    const firma = lista.map(a => a.id).join();
    if (firma === ultima) return;
    ultima = firma;
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
