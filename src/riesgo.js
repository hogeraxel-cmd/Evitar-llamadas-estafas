// Detector de senales de estafa sobre el TEXTO de una llamada (transcripcion).
// No analiza la voz: los detectores de voz sintetica son poco fiables en audio telefonico.
// Reglas simples y explicables; se pueden reemplazar o complementar con un modelo despues.

// Las reglas cubren el trato de "usted" y el de "tú" (transfiera/transfieras, no le diga/no le digas).
const REGLAS = [
  { id: 'urgencia', etiqueta: 'Urgencia', peso: 0.25,
    re: /\b(ahora mismo|ahora ya|urgente|urgencia|de inmediato|hoy mismo|rapido|cuanto antes|no se demore|no te demores|sin perder tiempo|antes de que)\b/ },
  { id: 'secreto', etiqueta: 'Pide guardar el secreto', peso: 0.45,
    re: /\b(no (le |les |se lo |selo )?(digas?|cuentes?|avises?|comentes?)|es un secreto|que (quede|esto quede) entre (nosotros|nos))\b/ },
  { id: 'codigo', etiqueta: 'Pide un código o clave', peso: 0.7,
    re: /\b(codigo|clave|pin|token)\b.*\b(sms|mensaje|llego|recibio|recibiste|cajero|tarjeta|banco)\b|\b(dicte|dictame|digame|dime|entregueme|deme|dame|necesito|pasame)\b.*\b(codigo|clave|pin)\b/ },
  { id: 'dinero', etiqueta: 'Pide dinero o una transferencia', peso: 0.45,
    re: /\b(transf(er|ier|ir)\w*|deposit\w*|giro|girar|girame|plata|dinero|lucas|pagar|pago|pague|pagues|gift ?card|tarjeta de regalo|efectivo|fianza)\b/ },
  { id: 'tarjeta', etiqueta: 'Pide datos de tarjeta', peso: 0.7,
    re: /\b(numero|datos)\b.*\btarjeta\b|\bcvv\b|\bclave (de|del) (cajero|banco|tarjeta)\b/ },
  { id: 'autoridad', etiqueta: 'Dice ser banco o autoridad', peso: 0.3,
    re: /\b(del banco|ejecutivo|carabineros|pdi|fiscalia|tribunal|servicio de impuestos|sii|registro civil|policia|soporte tecnico)\b/ },
  { id: 'apuros', etiqueta: 'Familiar en apuros', peso: 0.4,
    re: /\b(accidente|detenid[oa]|preso|presa|hospital|secuestr\w*|problema legal|choque|chocamos)\b/ },
  { id: 'numero_nuevo', etiqueta: 'Dice que tiene un número nuevo', peso: 0.4,
    re: /\b(nuevo|otro) (numero|celular|telefono)\b|\bcambie de (numero|celular|telefono)\b|\bperdi (mi|el) (celular|telefono)\b/ },
  { id: 'premio', etiqueta: 'Promete un premio', peso: 0.5,
    re: /\b(gano|ganaste|ganador|sorteo|premio)\b/ },
  { id: 'acceso_remoto', etiqueta: 'Pide instalar una aplicación', peso: 0.8,
    re: /\b(anydesk|teamviewer|instale|instala|instalar)\b.*\b(aplicacion|programa|app)\b|\banydesk\b|\bteamviewer\b/ },
];

const SEGURAS = [
  { id: 'sin_dinero', etiqueta: 'No pide dinero ni códigos', re: /\bno (necesita|tiene que|debe) pagar\b|\bsolo (pasar|retirar|confirmar su hora)\b/ },
];

export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nivelDe(puntaje) {
  if (puntaje >= 70) return 'alto';
  if (puntaje >= 35) return 'medio';
  return 'bajo';
}

export function analizarTexto(texto) {
  const t = normalizar(texto);
  // "No necesita pagar" no es un pedido de dinero: se quita antes de buscar señales.
  const sinFrasesSeguras = SEGURAS.reduce((txt, s) => txt.replace(new RegExp(s.re.source, 'g'), ' '), t);
  const senales = REGLAS.filter(r => r.re.test(sinFrasesSeguras));
  // Probabilidad combinada: cada senal suma evidencia sin pasar de 100.
  let ausencia = 1;
  for (const s of senales) ausencia *= 1 - s.peso;
  let puntaje = (1 - ausencia) * 100;
  // Una persona que dice ser familiar y pide dinero con urgencia es el patron mas dañino.
  const ids = new Set(senales.map(s => s.id));
  const segura = SEGURAS.some(s => s.re.test(t));
  const familiarPideDinero = ids.has('dinero') && (ids.has('apuros') || ids.has('numero_nuevo'));
  if (familiarPideDinero && ids.has('urgencia')) puntaje = Math.max(puntaje, 90);
  // Aun sin palabras de urgencia, "estoy en apuros / tengo otro número" + dinero ya es riesgo alto.
  else if (familiarPideDinero) puntaje = Math.max(puntaje, 75);
  if (segura && senales.length <= 1) puntaje = Math.min(puntaje, 15);
  puntaje = Math.round(Math.min(puntaje, 99));
  return {
    puntaje,
    nivel: nivelDe(puntaje),
    senales: senales.map(s => ({ id: s.id, etiqueta: s.etiqueta })),
    recomendacion: recomendar(nivelDe(puntaje), ids),
  };
}

function recomendar(nivel, ids) {
  if (nivel === 'alto') {
    return ids.has('apuros') || ids.has('numero_nuevo')
      ? 'No transfiera nada. Corte y use "Verificar familiar" en la aplicación.'
      : 'Corte la llamada. Ningún banco ni institución pide códigos o claves por teléfono.';
  }
  if (nivel === 'medio') return 'Desconfíe y consulte a un familiar antes de seguir.';
  return 'Sin señales de estafa en esta llamada.';
}
