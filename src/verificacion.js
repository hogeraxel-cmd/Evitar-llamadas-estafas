// Verificacion de familiar por canal aparte ("fuera de banda").
// Rosa recibe una llamada de alguien que dice ser Nico. Toca "Verificar a Nico":
//  - su pantalla muestra un numero (el desafio);
//  - al telefono real de Nico le llega un aviso con 3 numeros y un boton "No soy yo".
// Una voz clonada no tiene el telefono de Nico, asi que no puede responder.
import { randomInt, randomUUID } from 'node:crypto';

export const ESTADOS = Object.freeze({
  PENDIENTE: 'pendiente',
  VERIFICADO: 'verificado',   // Nico eligio el numero correcto: es el.
  RECHAZADO: 'rechazado',     // eligio un numero equivocado: no se confirma.
  NO_SOY_YO: 'no_soy_yo',     // Nico dice que no esta llamando: estafa confirmada.
  EXPIRADO: 'expirado',
});

const dosDigitos = () => String(randomInt(10, 100));
// "Rosa (abuela)" -> "Rosa", para frases más naturales.
const nombreCorto = m => m.nombre.replace(/\s*\(.*\)\s*$/, '');
// Deja solo dígitos, espacios y un "+" inicial (se usa en un enlace tel:).
const limpiarTelefono = t => String(t ?? '').replace(/[^\d+ ]/g, '').replace(/(?!^)\+/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);

function mezclar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class ServicioVerificacion {
  constructor({ ahora = () => Date.now(), vigenciaMs = 120_000, maxIntentos = 1, numOpciones = 6 } = {}) {
    this.numOpciones = numOpciones;
    this.ahora = ahora;
    this.vigenciaMs = vigenciaMs;
    this.maxIntentos = maxIntentos;
    this.miembros = new Map();      // id -> { id, nombre, familiaId, rol }
    this.solicitudes = new Map();   // id -> solicitud
    this.alertas = [];              // alertas para la familia
    this.palabras = new Map();      // familiaId -> { palabra, definidaPor, cuando }
  }

  registrarMiembro({ id, nombre, familiaId, rol = 'familiar', telefono = '' }) {
    if (!id || !nombre || !familiaId) throw new Error('Faltan id, nombre o familiaId');
    const m = { id, nombre, familiaId, rol, telefono: limpiarTelefono(telefono) };
    this.miembros.set(id, m);
    return m;
  }

  // El "número de siempre": Rosa puede cortar y llamar ahí, aunque el familiar no tenga la app.
  definirTelefono(miembroId, quienId, telefono) {
    const m = this.miembros.get(miembroId);
    if (!m || miembroId !== quienId) throw new Error('No autorizado');
    const t = limpiarTelefono(telefono);
    if (t.replace(/\D/g, '').length < 8) throw new Error('Número muy corto');
    m.telefono = t;
    return m;
  }

  // Palabra clave de la familia: la conoce solo la familia; quien llama debe decirla.
  definirPalabraClave(familiaId, quienId, palabra) {
    const m = this.miembros.get(quienId);
    if (!m || m.familiaId !== familiaId) throw new Error('No autorizado');
    const p = String(palabra ?? '').trim();
    if (p.length < 3 || p.length > 40) throw new Error('La palabra debe tener entre 3 y 40 letras');
    this.palabras.set(familiaId, { palabra: p, definidaPor: m.id, cuando: this.ahora() });
    return { definida: true };
  }

  verPalabraClave(familiaId, quienId) {
    const m = this.miembros.get(quienId);
    if (!m || m.familiaId !== familiaId) throw new Error('No autorizado');
    return { palabra: this.palabras.get(familiaId)?.palabra ?? null };
  }

  crear({ solicitanteId, objetivoId }) {
    const sol = this.miembros.get(solicitanteId);
    const obj = this.miembros.get(objetivoId);
    if (!sol || !obj) throw new Error('Miembro desconocido');
    if (sol.familiaId !== obj.familiaId) throw new Error('Solo se puede verificar a alguien de la misma familia');
    if (sol.id === obj.id) throw new Error('No se puede verificar a uno mismo');
    // Si ya hay una pendiente de esta persona hacia el mismo familiar (p. ej. tocó dos veces),
    // se devuelve esa misma: así Rosa y Nico siempre ven el mismo número.
    for (const id of this.solicitudes.keys()) {
      const previa = this.#obtener(id);
      if (previa.solicitanteId === solicitanteId && previa.objetivoId === objetivoId
          && previa.estado === ESTADOS.PENDIENTE) {
        return this.#vistaSolicitante(previa);
      }
    }
    const desafio = dosDigitos();
    const distractores = new Set();
    while (distractores.size < this.numOpciones - 1) {
      const d = dosDigitos();
      if (d !== desafio) distractores.add(d);
    }
    const s = {
      id: randomUUID(),
      solicitanteId, objetivoId,
      familiaId: sol.familiaId,
      desafio,
      opciones: mezclar([desafio, ...distractores]),
      estado: ESTADOS.PENDIENTE,
      creada: this.ahora(),
      expira: this.ahora() + this.vigenciaMs,
      intentos: 0,
    };
    this.solicitudes.set(s.id, s);
    return this.#vistaSolicitante(s);
  }

  // Lo que ve quien pide la verificacion (Rosa): el desafio, nunca las opciones.
  verSolicitante(id, quienId) {
    const s = this.#obtener(id);
    if (s.solicitanteId !== quienId) throw new Error('No autorizado');
    return this.#vistaSolicitante(s);
  }

  // Lo que ve el verificado (Nico): las opciones, NUNCA cual es la correcta.
  verObjetivo(id, quienId) {
    const s = this.#obtener(id);
    if (s.objetivoId !== quienId) throw new Error('No autorizado');
    const sol = this.miembros.get(s.solicitanteId);
    return {
      id: s.id, estado: s.estado, expira: s.expira,
      solicitante: nombreCorto(sol),
      mensaje: `${nombreCorto(sol)} está verificando una llamada. ¿Estás hablando con ${nombreCorto(sol)} ahora?`,
      opciones: s.opciones,
    };
  }

  responder(id, quienId, { eleccion, noSoyYo = false }) {
    const s = this.#obtener(id);
    if (s.objetivoId !== quienId) throw new Error('No autorizado');
    if (s.estado !== ESTADOS.PENDIENTE) return this.#vistaSolicitante(s);
    const sol = nombreCorto(this.miembros.get(s.solicitanteId));
    const obj = nombreCorto(this.miembros.get(s.objetivoId));
    if (noSoyYo) {
      s.estado = ESTADOS.NO_SOY_YO;
      this.#alertar(s, 'alta', `Intento de estafa: alguien llamó a ${sol} haciéndose pasar por ${obj}. ${obj} confirmó que no estaba llamando.`);
      return this.#vistaSolicitante(s);
    }
    s.intentos++;
    if (String(eleccion) === s.desafio) {
      s.estado = ESTADOS.VERIFICADO;
    } else {
      s.estado = ESTADOS.RECHAZADO;
      this.#alertar(s, 'media', `${sol} pidió verificar a ${obj} y se eligió un número equivocado. No se pudo confirmar la llamada.`);
    }
    return this.#vistaSolicitante(s);
  }

  miembrosDe(familiaId) {
    return [...this.miembros.values()].filter(m => m.familiaId === familiaId);
  }

  // Solicitudes que esperan respuesta de este miembro (lo que ve Nico al abrir la app).
  pendientesDe(objetivoId) {
    const salida = [];
    for (const id of this.solicitudes.keys()) {
      const s = this.#obtener(id);
      if (s.objetivoId === objetivoId && s.estado === ESTADOS.PENDIENTE) salida.push(this.verObjetivo(id, objetivoId));
    }
    return salida;
  }

  alertasDe(familiaId) {
    return this.alertas.filter(a => a.familiaId === familiaId);
  }

  #obtener(id) {
    const s = this.solicitudes.get(id);
    if (!s) throw new Error('Solicitud inexistente');
    if (s.estado === ESTADOS.PENDIENTE && this.ahora() >= s.expira) {
      s.estado = ESTADOS.EXPIRADO;
      const sol = nombreCorto(this.miembros.get(s.solicitanteId));
      const obj = nombreCorto(this.miembros.get(s.objetivoId));
      this.#alertar(s, 'media', `${sol} pidió verificar a ${obj} y no hubo respuesta. Conviene llamar a ${obj} por otro medio.`);
    }
    return s;
  }

  #vistaSolicitante(s) {
    const obj = this.miembros.get(s.objetivoId);
    const textos = {
      [ESTADOS.PENDIENTE]: `Esperando que ${nombreCorto(obj)} toque el número ${s.desafio} en su teléfono…`,
      [ESTADOS.VERIFICADO]: `${obj.nombre} confirmó desde su teléfono. La llamada es de verdad.`,
      [ESTADOS.RECHAZADO]: 'No se pudo confirmar. No transfiera dinero ni entregue datos.',
      [ESTADOS.NO_SOY_YO]: `${obj.nombre} dice que no está llamando. Es una estafa: corte la llamada.`,
      [ESTADOS.EXPIRADO]: 'Se acabó el tiempo sin respuesta. Trate como no verificado y llame a su familiar al número de siempre.',
    };
    return { id: s.id, estado: s.estado, desafio: s.desafio, expira: s.expira, mensaje: textos[s.estado] };
  }

  #alertar(s, gravedad, texto) {
    this.alertas.push({
      id: randomUUID(), familiaId: s.familiaId, solicitudId: s.id,
      gravedad, texto, cuando: this.ahora(),
    });
  }
}
