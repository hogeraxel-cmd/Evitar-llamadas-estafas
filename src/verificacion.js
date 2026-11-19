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
  }

  registrarMiembro({ id, nombre, familiaId, rol = 'familiar' }) {
    if (!id || !nombre || !familiaId) throw new Error('Faltan id, nombre o familiaId');
    const m = { id, nombre, familiaId, rol };
    this.miembros.set(id, m);
    return m;
  }

  crear({ solicitanteId, objetivoId }) {
    const sol = this.miembros.get(solicitanteId);
    const obj = this.miembros.get(objetivoId);
    if (!sol || !obj) throw new Error('Miembro desconocido');
    if (sol.familiaId !== obj.familiaId) throw new Error('Solo se puede verificar a alguien de la misma familia');
    if (sol.id === obj.id) throw new Error('No se puede verificar a uno mismo');
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
      mensaje: `${sol.nombre} quiere verificar una llamada. ¿Que numero ve ella?`,
      opciones: s.opciones,
    };
  }

  responder(id, quienId, { eleccion, noSoyYo = false }) {
    const s = this.#obtener(id);
    if (s.objetivoId !== quienId) throw new Error('No autorizado');
    if (s.estado !== ESTADOS.PENDIENTE) return this.#vistaSolicitante(s);
    if (noSoyYo) {
      s.estado = ESTADOS.NO_SOY_YO;
      this.#alertar(s, 'alta', 'Intento de suplantacion confirmado: la persona verificada dice que no esta llamando.');
      return this.#vistaSolicitante(s);
    }
    s.intentos++;
    if (String(eleccion) === s.desafio) {
      s.estado = ESTADOS.VERIFICADO;
    } else {
      s.estado = ESTADOS.RECHAZADO;
      this.#alertar(s, 'media', 'Se respondio un numero equivocado en una verificacion.');
    }
    return this.#vistaSolicitante(s);
  }

  alertasDe(familiaId) {
    return this.alertas.filter(a => a.familiaId === familiaId);
  }

  #obtener(id) {
    const s = this.solicitudes.get(id);
    if (!s) throw new Error('Solicitud inexistente');
    if (s.estado === ESTADOS.PENDIENTE && this.ahora() >= s.expira) {
      s.estado = ESTADOS.EXPIRADO;
      const sol = this.miembros.get(s.solicitanteId);
      const obj = this.miembros.get(s.objetivoId);
      this.#alertar(s, 'media', `${sol.nombre} pidio verificar a ${obj.nombre} y no hubo respuesta. Conviene llamar a ${obj.nombre} por otro medio.`);
    }
    return s;
  }

  #vistaSolicitante(s) {
    const obj = this.miembros.get(s.objetivoId);
    const textos = {
      [ESTADOS.PENDIENTE]: `Dígale a ${obj.nombre} el número ${s.desafio}. Si es él de verdad, lo elegirá en su teléfono.`,
      [ESTADOS.VERIFICADO]: `${obj.nombre} confirmó desde su teléfono. Es él.`,
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
