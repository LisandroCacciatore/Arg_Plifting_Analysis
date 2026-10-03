/**
 * Capa 02 — motor de comparación y diagnóstico.
 *
 * Mide; no recomienda. Ver docs/03_Arquitectura/02_Fase_02/01_Arquitectura_Capa02.md
 *
 * Todo lo de este archivo son funciones PURAS: no tocan el DOM ni la red. El
 * cableado de la página vive en comparador-pagina.js, así el motor se puede
 * testear sin navegador.
 *
 * CONVENCIÓN DE TILDES: los comentarios son notas y llevan tildes. Los strings
 * de TEXTOS los ve el usuario, así que son COPY y van sin tildes ni ñ (regla del
 * sitio, ver CONTRIBUTING.md). No mezclar.
 */
'use strict';

/**
 * Espejo del contrato que emite scripts/cohortes.py. El generador lee este
 * objeto y falla si el JSON no coincide: si acá dice una métrica que el JSON no
 * trae, o al revés, la generación se aborta sin escribir.
 */
const CONTRATO = {
  metricasFinas: ['dots'],
  metricasGruesas: ['total', 'ratio_banco', 'ratio_despegue',
                    'share_sentadilla', 'share_banco', 'share_despegue'],
  separador: '|',
  nMinimo: 10,
  puntajeSexos: ['M', 'F'],
};

/** Escalones de n. Ver doc 03, "Escalones de n". */
const UMBRALES = { firme: 100, acotada: 30, banda: 10 };

/** Ancho de la banda que se muestra cuando el n es escaso (± este valor). */
const BANDA_ANCHO = 10;

/**
 * Clases de edad con sus límites enteros, verificados contra los valores reales
 * de AgeClass en el dataset (18 clases, todas presentes).
 *
 * Ojo con el borde: OpenPowerlifting clasifica por edad real con corte en .5
 * (la clase 20-23 llega hasta 23.0 y la 24-34 arranca en 23.5). Acá el usuario
 * entra una edad entera, así que se mapea por entero y la clase usada SIEMPRE se
 * muestra: nunca se le asigna una cohorte en silencio.
 */
const CLASES_EDAD = [
  ['5-12', 5, 12], ['13-15', 13, 15], ['16-17', 16, 17], ['18-19', 18, 19],
  ['20-23', 20, 23], ['24-34', 24, 34], ['35-39', 35, 39], ['40-44', 40, 44],
  ['45-49', 45, 49], ['50-54', 50, 54], ['55-59', 55, 59], ['60-64', 60, 64],
  ['65-69', 65, 69], ['70-74', 70, 74], ['75-79', 75, 79], ['80-84', 80, 84],
  ['85-89', 85, 89], ['90-999', 90, 999],
];

const EQUIPAMIENTOS = ['Raw', 'Wraps', 'Single-ply', 'Multi-ply', 'Unlimited'];
const LEVANTAMIENTOS = ['sentadilla', 'banco', 'despegue'];
/** Los sexos comparables. Sale del contrato: es la misma lista que emite el
 *  generador, así no puede desincronizarse. */
const SEXOS = CONTRATO.puntajeSexos;
const P25 = 25;
const EDAD_MIN = 5;
const EDAD_MAX = 120;

/** Literales que ve el usuario. COPY: sin tildes. */
const TEXTOS = {
  sinDesbalances: 'sin desbalances',
  atrasado: {
    sentadilla: 'sentadilla atrasada',
    banco: 'banco atrasado',
    despegue: 'despegue atrasado',
  },
  banda: 'entre el percentil',
  cohorteAmpliada: 'La cohorte elegida tenia pocos casos: se amplio la ventana.',
  cohorteMundial: 'La cohorte elegida tenia pocos casos: se comparo contra el alcance mundial.',
  sinPercentil: 'Con menos de 10 casos no se emite un percentil. Se muestra la medicion cruda.',
  pesoFueraDeRango: 'El peso esta fuera del rango con datos: se uso el extremo mas cercano.',
  pesoNoEsEje: 'El peso corporal no se usa como filtro: el puntaje ya lo normaliza.',
  nivelTope: 'Ya esta en el nivel mas alto de la cohorte.',
  efectoPesoMenos: 'Con 10 kg menos y el mismo total, el puntaje seria',
  efectoPesoMas: 'Con 10 kg mas y el mismo total, el puntaje seria',
  efectoPesoNota: 'El puntaje divide por una funcion del peso: a igual total, mas peso corporal da menos puntaje.',
};

/**
 * Escalones de nivel. Cinco particiones IGUALES de la escala de percentil.
 *
 * POR QUE IGUALES, y no los cortes de otro sistema: la escala de percentil es
 * uniforme por construccion, asi que partirla en quintos es la unica division que
 * NO requiere elegir umbrales. Las bandas de strengthlevel.com son mas densas
 * arriba (su "Elite" es mucho mas raro que el 20% de arriba), pero importarlas
 * seria copiar umbrales sin verificar de donde salen — y este proyecto tiene una
 * regla explicita contra eso.
 *
 * CONSECUENCIA QUE HAY QUE ASUMIR: con quintos iguales, "Elite" es el 20% de
 * arriba, que es una banda ancha. No es un error de calculo, es el costo de no
 * inventar cortes. Lo que lo hace honesto es que el nombre NUNCA viaja solo: se
 * muestra siempre con el percentil y el n al lado, asi que la etiqueta no puede
 * afirmar una rareza que la medicion no respalda.
 *
 * Los bordes (20, 40, 60, 80) caen sobre puntos de la grilla fina, asi que la
 * distancia al nivel siguiente se lee exacta. Hay un test que lo fija: si alguien
 * mueve un borde a un valor que no esta en la grilla, el test avisa.
 */
const NIVELES = [
  { nombre: 'Inicial', desde: 0, hasta: 20 },
  { nombre: 'Base', desde: 20, hasta: 40 },
  { nombre: 'Intermedio', desde: 40, hasta: 60 },
  { nombre: 'Avanzado', desde: 60, hasta: 80 },
  { nombre: 'Elite', desde: 80, hasta: 100 },
];

/** Cuantos kg de peso corporal para arriba y para abajo muestra el efecto. */
const PASO_PESO = 10;

// ── Validación de la entrada ─────────────────────────────────────────────────
function esNumeroPositivo(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function claseDeEdad(edad) {
  if (!Number.isInteger(edad) || edad < EDAD_MIN || edad > EDAD_MAX) return null;
  const par = CLASES_EDAD.find(([, min, max]) => edad >= min && edad <= max);
  return par ? par[0] : null;
}

// Límites de plausibilidad. No son récords: son redes para typos. El total
// mundial equipado ronda los 1.200 kg y el peso corporal más alto registrado
// está muy por debajo de 400 kg, así que un valor por encima de esto es un error
// de tipeo (un cero de más), no un atleta excepcional.
const LIMITES = { levantamiento: 1000, peso: 400 };

/**
 * Devuelve la lista de problemas de la entrada. Vacía = entrada válida.
 *
 * Se rechaza antes de comparar: un percentil calculado sobre una entrada
 * imposible tiene la misma cara de certeza que uno válido.
 */
function validarPerfil(perfil) {
  const errores = [];
  if (!perfil || typeof perfil !== 'object') return ['No se recibio ningun perfil.'];

  if (!SEXOS.includes(perfil.sexo)) {
    errores.push(`El sexo tiene que ser uno de: ${SEXOS.join(', ')}.`);
  }
  if (!Number.isInteger(perfil.edad)) {
    errores.push('La edad tiene que ser un numero entero.');
  } else if (!claseDeEdad(perfil.edad)) {
    errores.push(`La edad tiene que estar entre ${EDAD_MIN} y ${EDAD_MAX}.`);
  }
  if (!EQUIPAMIENTOS.includes(perfil.equipamiento)) {
    errores.push(`El equipamiento tiene que ser uno de: ${EQUIPAMIENTOS.join(', ')}.`);
  }
  if (!esNumeroPositivo(perfil.peso)) {
    errores.push('El peso corporal tiene que ser un numero mayor que cero.');
  } else if (perfil.peso > LIMITES.peso) {
    errores.push(`El peso corporal no puede superar los ${LIMITES.peso} kg.`);
  }
  if (perfil.ventana != null && typeof perfil.ventana !== 'string') {
    errores.push('La ventana tiene que ser un texto.');
  }
  if (perfil.alcance != null && typeof perfil.alcance !== 'string') {
    errores.push('El alcance tiene que ser un texto.');
  }

  const kg = perfil.levantamientos;
  if (!kg || typeof kg !== 'object') {
    errores.push('Faltan los tres levantamientos.');
    return errores;
  }
  for (const lev of LEVANTAMIENTOS) {
    if (!esNumeroPositivo(kg[lev])) {
      errores.push(`El peso de ${lev} tiene que ser un numero mayor que cero.`);
    } else if (kg[lev] > LIMITES.levantamiento) {
      errores.push(`El peso de ${lev} no puede superar los ${LIMITES.levantamiento} kg.`);
    }
  }
  return errores;
}

// ── Puntaje (Dots) y coherencia con el total ─────────────────────────────────
/**
 * Interpola g(peso) de la tabla y devuelve el puntaje reconstruido.
 *
 * Dots = TotalKg * 500 / g(peso, sexo). g se deriva del propio dataset
 * (ver QueryCapa02.sql, bloque puntaje): reconstruye el Dots almacenado con un
 * error máximo medido de 0,10% sobre 8.000 filas al azar.
 */
function gDePuntaje(tabla, sexo, peso) {
  const d = tabla && tabla[sexo];
  if (!d || !Array.isArray(d.peso) || !Array.isArray(d.g) || d.peso.length < 2) {
    return null;
  }
  const xs = d.peso;
  const ys = d.g;
  if (peso <= xs[0]) return { g: ys[0], clampeado: peso < xs[0] };
  if (peso >= xs[xs.length - 1]) {
    return { g: ys[ys.length - 1], clampeado: peso > xs[xs.length - 1] };
  }
  for (let i = 0; i < xs.length - 1; i++) {
    if (peso >= xs[i] && peso <= xs[i + 1]) {
      const ancho = xs[i + 1] - xs[i];
      if (ancho === 0) return { g: ys[i], clampeado: false };
      const t = (peso - xs[i]) / ancho;
      return { g: ys[i] + t * (ys[i + 1] - ys[i]), clampeado: false };
    }
  }
  return null;
}

/**
 * Percentil de un valor dentro de una distribución dada como vector de cuantiles.
 *
 * `vector[k]` es el valor del percentil `grilla[k]`. Se busca el tramo que
 * contiene al valor y se interpola linealmente. No se asume monotonía estricta:
 * si dos cuantiles consecutivos son iguales, se devuelve el percentil del
 * primero en vez de dividir por cero.
 */
function percentilDe(valor, vector, grilla) {
  if (!Array.isArray(vector) || !Array.isArray(grilla)) return null;
  const n = Math.min(vector.length, grilla.length);
  if (n < 2 || !Number.isFinite(valor)) return null;
  if (valor <= vector[0]) return grilla[0];
  if (valor >= vector[n - 1]) return grilla[n - 1];
  for (let i = 0; i < n - 1; i++) {
    const a = vector[i];
    const b = vector[i + 1];
    if (valor >= a && valor <= b) {
      if (b === a) return grilla[i];
      const t = (valor - a) / (b - a);
      return grilla[i] + t * (grilla[i + 1] - grilla[i]);
    }
  }
  return null;
}

/** Calidad de la cohorte según su n. */
function evaluarCalidad(n, nMinimo) {
  const min = nMinimo == null ? UMBRALES.banda : nMinimo;
  if (!Number.isFinite(n) || n < min) return 'sin_percentil';
  if (n >= UMBRALES.firme) return 'firme';
  if (n >= UMBRALES.acotada) return 'acotada';
  return 'banda';
}

/** Reparto del total entre los tres levantamientos. */
function sharesDe(kg) {
  const total = kg.sentadilla + kg.banco + kg.despegue;
  return {
    total,
    sentadilla: kg.sentadilla / total,
    banco: kg.banco / total,
    despegue: kg.despegue / total,
  };
}

/** El peso ordenado de la ventana más amplia disponible. */
function ventanaMasAmplia(ventanas) {
  if (!ventanas) return null;
  let elegida = null;
  let masVieja = null;
  for (const [nombre, desde] of Object.entries(ventanas)) {
    if (masVieja === null || desde < masVieja) {
      masVieja = desde;
      elegida = nombre;
    }
  }
  return elegida;
}

function claveCelda(alcance, ventana, sexo, edad, equipo) {
  return [alcance, ventana, sexo, edad, equipo].join(CONTRATO.separador);
}

function buscarCelda(datos, alcance, ventana, sexo, edad, equipo) {
  const celdas = (datos && datos.celdas) || {};
  const clave = claveCelda(alcance, ventana, sexo, edad, equipo);
  const celda = celdas[clave];
  return celda ? { celda, clave } : null;
}

/**
 * Resuelve qué cohorte usar.
 *
 * Regla de precedencia: **la cohorte pedida gana si tiene datos**. Solo se sube
 * un escalón cuando la celda no existe. El motivo es que cambiar de alcance
 * cambia la pregunta: "contra los argentinos de mi categoría" y "contra el mundo"
 * no son la misma medición, y una respuesta sólida a la pregunta equivocada no es
 * mejor que una respuesta gruesa a la pregunta correcta.
 *
 * Escalera, en orden:
 *   1. la pedida (alcance + ventana)
 *   2. la misma, con la ventana más amplia  (misma población, más historia)
 *   3. el alcance mundial
 * Se acepta la primera que exista con n >= 10. Si la pedida existe pero es fina
 * (10 <= n < 30), se usa igual y se devuelve una BANDA en vez de un percentil
 * exacto: eso es un resultado, no un fracaso.
 *
 * Las candidatas que no se usaron se devuelven en `alternativas` para que la
 * interfaz pueda OFRECERLAS. El diseño dice "ofrecer el alcance mundial", no
 * "cambiarlo": ofrecer es del usuario, cambiar en silencio es del sistema.
 *
 * `intentos` registra cada escalón con su resultado. Importa porque las celdas
 * con n < 10 no se emiten: en la práctica "no hay percentil posible" aparece como
 * "esa celda no existe", y sin el registro el usuario no puede distinguir "no hay
 * datos de tu categoría" de "elegiste mal un filtro".
 */
function resolverCohorte(datos, perfil) {
  const meta = (datos && datos._meta) || {};
  const edad = claseDeEdad(perfil.edad);
  const amplia = ventanaMasAmplia(meta.ventanas);
  const alcances = meta.alcances || [];
  const ventanas = Object.keys(meta.ventanas || {});

  const alcancePedido = alcances.includes(perfil.alcance) ? perfil.alcance : alcances[0];
  const ventanaPedida = ventanas.includes(perfil.ventana) ? perfil.ventana : ventanas[0];
  const mundial = alcances.includes('mundial') ? 'mundial' : alcances[0];

  const intentos = [];
  const agregar = (alcance, ventana, motivo) => {
    if (!alcance || !ventana) return;
    if (intentos.some((i) => i.alcance === alcance && i.ventana === ventana)) return;
    intentos.push({ alcance, ventana, motivo });
  };

  agregar(alcancePedido, ventanaPedida, 'elegida');
  agregar(alcancePedido, amplia, 'ventana_ampliada');
  agregar(mundial, ventanaPedida, 'alcance_mundial');
  agregar(mundial, amplia, 'alcance_mundial');

  const registro = [];
  const encontradas = [];

  for (const intento of intentos) {
    const hallada = buscarCelda(datos, intento.alcance, intento.ventana,
                                perfil.sexo, edad, perfil.equipamiento);
    registro.push({
      alcance: intento.alcance,
      ventana: intento.ventana,
      motivo: intento.motivo,
      encontrada: Boolean(hallada),
      n: hallada ? hallada.celda.n : null,
    });
    if (!hallada) continue;
    encontradas.push({ ...hallada, alcance: intento.alcance, ventana: intento.ventana,
                       motivo: intento.motivo });
  }

  if (!encontradas.length) return null;

  // La pedida gana si tiene datos suficientes para al menos una banda.
  const usable = encontradas.find((c) => c.celda.n >= UMBRALES.banda);
  const elegida = usable || encontradas.reduce((a, b) => (b.celda.n > a.celda.n ? b : a));

  const alternativas = encontradas
    .filter((c) => c.clave !== elegida.clave)
    .map((c) => ({
      alcance: c.alcance, ventana: c.ventana, clave: c.clave, n: c.celda.n,
      calidad: evaluarCalidad(c.celda.n, meta.n_minimo),
      motivo: c.motivo,
    }))
    .sort((a, b) => b.n - a.n);

  return { ...elegida, intentos: registro, alternativas };
}

/**
 * Diagnóstico de desbalance.
 *
 * Se compara el reparto del total del atleta contra el reparto de la cohorte. El
 * levantamiento con el percentil más bajo es el atrasado, y solo se declara
 * atrasado si ese percentil cae en p25 o menos. Si los tres están por encima de
 * p25 el resultado es `sin desbalances`, que es un resultado esperado y válido:
 * un diagnóstico que siempre encuentra un culpable va a inventar uno.
 *
 * Se usa el reparto del total y no el ratio contra un levantamiento puntual
 * porque los ratios comparten denominador y leerlos como tres señales
 * independientes sobreinterpreta la estructura (ver doc 03).
 */
function diagnosticar(celda, grilla, shares) {
  const percentiles = {};
  for (const lev of LEVANTAMIENTOS) {
    percentiles[lev] = percentilDe(shares[lev], celda[`share_${lev}`], grilla);
  }
  const validos = LEVANTAMIENTOS.filter((l) => Number.isFinite(percentiles[l]));
  if (!validos.length) {
    return { atrasado: null, percentiles, sinDatos: true };
  }
  const menor = validos.reduce((a, b) => (percentiles[b] < percentiles[a] ? b : a));
  const atrasado = percentiles[menor] <= P25 ? menor : null;
  return { atrasado, percentiles, menor, sinDatos: false };
}

/** Redondea un percentil a un decimal, para no mostrar precisión falsa. */
function redondear(p, decimales = 1) {
  if (!Number.isFinite(p)) return null;
  const f = 10 ** decimales;
  return Math.round(p * f) / f;
}

/** Convierte un percentil en banda cuando el n no da para un punto exacto. */
function bandaDe(p) {
  if (!Number.isFinite(p)) return null;
  return [Math.max(0, Math.round(p - BANDA_ANCHO)), Math.min(100, Math.round(p + BANDA_ANCHO))];
}

/**
 * Valor del cuantil `p` en una distribución dada como vector + grilla.
 *
 * Es la inversa de `percentilDe`: mientras esa convierte un valor en percentil,
 * esta convierte un percentil en valor. Se necesita para traducir un corte de
 * nivel a un puntaje concreto ("el nivel Avanzado empieza en Dots 425,5").
 *
 * Interpola si `p` no cae exacto sobre un punto de la grilla. Hoy los bordes de
 * NIVELES (20, 40, 60, 80) sí caen, y hay un test que lo fija.
 */
function valorEnPercentil(vector, grilla, p) {
  if (!Array.isArray(vector) || !Array.isArray(grilla)) return null;
  const n = Math.min(vector.length, grilla.length);
  if (n < 2 || !Number.isFinite(p)) return null;
  if (p <= grilla[0]) return vector[0];
  if (p >= grilla[n - 1]) return vector[n - 1];
  for (let i = 0; i < n - 1; i++) {
    if (p >= grilla[i] && p <= grilla[i + 1]) {
      const ancho = grilla[i + 1] - grilla[i];
      if (ancho === 0) return vector[i];
      const t = (p - grilla[i]) / ancho;
      return vector[i] + t * (vector[i + 1] - vector[i]);
    }
  }
  return null;
}

/**
 * Nivel al que corresponde un percentil. Devuelve null si no es un número.
 *
 * Los bordes se resuelven por abajo: el percentil 40 exacto es el primer caso de
 * "Intermedio", no el último de "Base". Sin esa regla explícita el 20 y el 40
 * caerían en dos bandas a la vez.
 */
function nivelDe(percentil) {
  if (!Number.isFinite(percentil)) return null;
  const p = Math.max(0, Math.min(100, percentil));
  const i = NIVELES.findIndex(
    (n) => p >= n.desde && (p < n.hasta || n.hasta === 100));
  if (i < 0) return null;
  return { ...NIVELES[i], indice: i, percentil: p };
}

/**
 * Distancia al nivel siguiente, en kilos de TOTAL.
 *
 * Se expresa en kg de total y NO en kg de un levantamiento puntual a propósito:
 * decir "te faltan 9 kg de banco" sería una prescripción de entrenamiento, y la
 * capa no prescribe (ver doc 01, "el borde"). El total es una medición.
 */
function distanciaAlNivel(nivel, dotsActual, celda, grilla, g) {
  if (!nivel || !celda) return null;
  if (nivel.indice >= NIVELES.length - 1) return { esTope: true };
  const dotsCorte = valorEnPercentil(celda.dots, grilla, nivel.hasta);
  if (!Number.isFinite(dotsCorte) || !Number.isFinite(dotsActual) || !g) return null;
  const deltaDots = dotsCorte - dotsActual;
  return {
    esTope: false,
    nivelSiguiente: NIVELES[nivel.indice + 1].nombre,
    percentilCorte: nivel.hasta,
    dotsCorte: redondear(dotsCorte, 1),
    deltaDots: redondear(deltaDots, 1),
    deltaKg: deltaDots > 0 ? redondear((deltaDots * g) / 500, 1) : 0,
  };
}

/**
 * Efecto del peso corporal a total constante. ES EL HALLAZGO DEL PROYECTO.
 *
 * A igual total, más peso corporal da menos puntaje, porque el Dots divide por
 * g(peso) y g crece con el peso. Medido sobre el dataset: con un total fijo de
 * 610 kg, pasar de 88 a 103 kg de peso baja el Dots de 399,0 a 370,8.
 *
 * Devuelve los tres puntos (peso - PASO, peso, peso + PASO) con su puntaje, más
 * el delta contra el actual. Si algún punto no se puede calcular —peso negativo o
 * tabla ausente— devuelve null y la interfaz no muestra la comparación: no se
 * inventa el punto que falta.
 */
function efectoDelPeso(tabla, sexo, peso, total) {
  if (!tabla || !esNumeroPositivo(peso) || !esNumeroPositivo(total)) return null;
  const bajos = peso - PASO_PESO;
  if (bajos <= 0) return null;

  const punto = (p) => {
    const r = gDePuntaje(tabla, sexo, p);
    if (!r || !Number.isFinite(r.g) || r.g <= 0) return null;
    return {
      peso: redondear(p, 1),
      puntaje: redondear((total * 500) / r.g, 1),
      clampeado: r.clampeado,
    };
  };

  const menos = punto(bajos);
  const actual = punto(peso);
  const mas = punto(peso + PASO_PESO);
  if (!menos || !actual || !mas) return null;

  menos.delta = redondear(menos.puntaje - actual.puntaje, 1);
  mas.delta = redondear(mas.puntaje - actual.puntaje, 1);
  return { paso: PASO_PESO, menos, actual, mas };
}

/**
 * Corre la comparación completa y devuelve el resultado.
 *
 * Devuelve siempre un objeto: `{ok:true, ...}` o `{ok:false, errores:[...]}`.
 * No lanza por una entrada mala del usuario.
 */
function comparar(datos, perfil) {
  const errores = validarPerfil(perfil);
  if (errores.length) return { ok: false, errores };
  if (!datos || typeof datos !== 'object') {
    return { ok: false, errores: ['No se cargaron los datos de cohortes.'] };
  }

  const meta = datos._meta || {};
  const grilla = { fina: meta.grid_fina, gruesa: meta.grid_gruesa };
  const limitaciones = [];

  const kg = perfil.levantamientos;
  const shares = sharesDe(kg);

  // Puntaje reconstruido desde peso + total
  const g = gDePuntaje(datos.puntaje, perfil.sexo, perfil.peso);
  let puntaje = null;
  if (g) {
    puntaje = (shares.total * 500) / g.g;
    if (g.clampeado) limitaciones.push(TEXTOS.pesoFueraDeRango);
  }

  const hallada = resolverCohorte(datos, perfil);
  if (!hallada) {
    return {
      ok: false,
      errores: ['No hay ninguna cohorte con esos ejes en los datos cargados.'],
    };
  }
  const { celda, clave, alcance, ventana, motivo, intentos, alternativas } = hallada;
  const calidad = evaluarCalidad(celda.n, meta.n_minimo);

  if (motivo === 'ventana_ampliada') limitaciones.push(TEXTOS.cohorteAmpliada);
  if (motivo === 'alcance_mundial') limitaciones.push(TEXTOS.cohorteMundial);
  if (calidad === 'sin_percentil') limitaciones.push(TEXTOS.sinPercentil);
  if (calidad === 'banda') limitaciones.push(TEXTOS.pesoNoEsEje);

  const exacto = calidad === 'firme' || calidad === 'acotada';

  // Cuando la cohorte es fina NO se emite el percentil del puntaje, ni siquiera
  // "de yapa" al lado de la banda: un número exacto sobre 16 casos tiene la misma
  // cara de certeza que uno sobre 140.000. Se reemplaza, no se acompaña.
  const puntajePercentil = puntaje == null
    ? null
    : percentilDe(puntaje, celda.dots, grilla.fina);

  const celdaPuntaje = {
    valor: puntaje == null ? null : redondear(puntaje, 1),
    percentil: exacto && puntajePercentil != null ? redondear(puntajePercentil, 1) : null,
  };
  if (!exacto && puntajePercentil != null) {
    celdaPuntaje.banda = bandaDe(puntajePercentil);
  }

  const levs = {};
  for (const lev of LEVANTAMIENTOS) {
    const p = percentilDe(shares[lev], celda[`share_${lev}`], grilla.gruesa);
    levs[lev] = {
      kg: kg[lev],
      share: shares[lev],
      percentil: exacto ? redondear(p, 1) : null,
      banda: exacto ? null : bandaDe(p),
    };
  }

  const ratios = {};
  const ratioBanco = kg.banco / kg.sentadilla;
  const ratioDespegue = kg.despegue / kg.sentadilla;
  ratios.banco = {
    valor: redondear(ratioBanco, 3),
    percentil: percentilDe(ratioBanco, celda.ratio_banco, grilla.gruesa),
  };
  ratios.despegue = {
    valor: redondear(ratioDespegue, 3),
    percentil: percentilDe(ratioDespegue, celda.ratio_despegue, grilla.gruesa),
  };
  for (const r of Object.values(ratios)) {
    if (r.percentil != null) r.percentil = redondear(r.percentil, 1);
  }

  const diag = exacto
    ? diagnosticar(celda, grilla.gruesa, shares)
    : { atrasado: null, percentiles: {}, sinDatos: true };

  // Nivel con nombre, distancia al siguiente y efecto del peso. Los tres salen de
  // la MISMA grilla de Dots que ya se uso para el percentil: son otra forma de
  // presentar la medicion, no datos nuevos. Si el percentil es exacto se calculan;
  // si la cohorte es chica (banda) no, porque una etiqueta sobre 14 casos es
  // precisamente la precision falsa que el sistema evita.
  const nivel = exacto ? nivelDe(celdaPuntaje.percentil) : null;
  const distancia = exacto && g && Number.isFinite(puntaje)
    ? distanciaAlNivel(nivel, puntaje, celda, grilla.fina, g.g)
    : null;
  const efectoPeso = efectoDelPeso(datos.puntaje, perfil.sexo, perfil.peso, shares.total);

  return {
    ok: true,
    cohorte: {
      alcance, ventana, sexo: perfil.sexo, edadClase: claseDeEdad(perfil.edad),
      equipamiento: perfil.equipamiento, n: celda.n, clave, calidad,
      esLaElegida: motivo === 'elegida',
      intentos,
      alternativas,
    },
    perfil: {
      sexo: perfil.sexo, edad: perfil.edad, peso: perfil.peso,
      equipamiento: perfil.equipamiento, levantamientos: { ...kg }, total: shares.total,
    },
    puntaje: celdaPuntaje,
    levantamientos: levs,
    ratios,
    diagnostico: {
      atrasado: diag.atrasado,
      percentiles: diag.percentiles,
      texto: diag.atrasado ? TEXTOS.atrasado[diag.atrasado] : TEXTOS.sinDesbalances,
    },
    nivel,
    distancia,
    efectoPeso,
    limitaciones,
    trazabilidad: {
      generado_por: meta.generado_por || null,
      dataset: meta.dataset || null,
      ubicacion: meta.ubicacion || null,
      fuente_sql: meta.fuente_sql || null,
      ultima_actualizacion: meta.ultima_actualizacion || null,
    },
  };
}

const Comparador = {
  CONTRATO, UMBRALES, BANDA_ANCHO, LIMITES, NIVELES, PASO_PESO,
  CLASES_EDAD, EQUIPAMIENTOS, LEVANTAMIENTOS, TEXTOS,
  claseDeEdad, validarPerfil, sharesDe, percentilDe, gDePuntaje, evaluarCalidad,
  ventanaMasAmplia, claveCelda, buscarCelda, resolverCohorte, diagnosticar,
  bandaDe, redondear, valorEnPercentil, nivelDe, distanciaAlNivel, efectoDelPeso,
  comparar,
};

if (typeof globalThis !== 'undefined') globalThis.Comparador = Comparador;
if (typeof module !== 'undefined' && module.exports) module.exports = Comparador;
