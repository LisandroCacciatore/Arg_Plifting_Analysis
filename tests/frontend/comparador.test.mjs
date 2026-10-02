/**
 * Tests del motor de Capa 02 — assets/js/comparador.js
 *
 * Corren el motor REAL (no una copia) contra el cohortes.json REAL, cargando el
 * script clásico en un contexto de vm igual que lo haría el navegador.
 *
 * Los criterios están numerados como en docs/03_Arquitectura/02_Fase_02/
 * 04_Testing_Capa02.md. Cada uno se verificó rompiéndolo a propósito: ver la
 * sección final de ese documento sobre por qué un test que no puede fallar es
 * decorativo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..', '..');
const COMPARADOR_JS = path.join(RAIZ, 'assets', 'js', 'comparador.js');
const COHORTES_JSON = path.join(RAIZ, 'assets', 'data', 'cohortes.json');

// ── Carga del motor y de los datos ──────────────────────────────────────────
function cargarMotor() {
  const src = fs.readFileSync(COMPARADOR_JS, 'utf8');
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.Comparador;
}

const M = cargarMotor();
const DATOS = JSON.parse(fs.readFileSync(COHORTES_JSON, 'utf8'));
const META = DATOS._meta;

const PERFIL = {
  sexo: 'M', edad: 27, peso: 88, equipamiento: 'Raw',
  levantamientos: { sentadilla: 220, banco: 140, despegue: 250 },
  alcance: 'mundial', ventana: 'desde_2018',
};

const copia = (cambios = {}, lev = {}) => ({
  ...PERFIL, ...cambios,
  levantamientos: { ...PERFIL.levantamientos, ...lev },
});

// ── Contrato ────────────────────────────────────────────────────────────────
// Nota: los arrays que salen del contexto de vm tienen otro prototipo que los del
// contexto de este test, así que deepStrictEqual los ve distintos aunque el
// contenido sea igual. Se copian con spread a un array local antes de comparar.
test('el motor declara un CONTRATO con lo mínimo que necesita del JSON', () => {
  assert.deepEqual([...M.CONTRATO.metricasFinas], ['dots']);
  assert.equal(M.CONTRATO.separador, '|');
  assert.ok(M.CONTRATO.metricasGruesas.length >= 6);
  assert.ok(M.CONTRATO.nMinimo > 0);
});

test('contrato: el CONTRATO del motor y el _meta del JSON dicen lo mismo', () => {
  assert.deepEqual(META.metricas_finas, [...M.CONTRATO.metricasFinas]);
  assert.deepEqual(META.metricas_gruesas, [...M.CONTRATO.metricasGruesas]);
  assert.equal(META.n_minimo, M.CONTRATO.nMinimo);
  assert.ok(Object.keys(DATOS.puntaje).includes('M'));
  assert.ok(Object.keys(DATOS.puntaje).includes('F'));
});

// ── Criterio 1: determinismo ────────────────────────────────────────────────
test('criterio 1: los mismos parámetros devuelven el mismo resultado', () => {
  const a = M.comparar(DATOS, PERFIL);
  const b = M.comparar(DATOS, PERFIL);
  assert.deepEqual(a, b);
  assert.equal(a.ok, true);
});

// ── Criterio 2: el eje sexo se usa ──────────────────────────────────────────
test('criterio 2: cambiar el sexo cambia el percentil de la misma marca', () => {
  const m = M.comparar(DATOS, copia({ sexo: 'M' }));
  const f = M.comparar(DATOS, copia({ sexo: 'F' }));
  assert.equal(m.ok, true);
  assert.equal(f.ok, true);
  assert.notEqual(m.cohorte.n, f.cohorte.n, 'las cohortes deberían tener n distinto');
  const dif = Math.abs(m.puntaje.percentil - f.puntaje.percentil);
  assert.ok(dif >= 10,
    `M=${m.puntaje.percentil} F=${f.puntaje.percentil}: la brecha debería ser >= 10 puntos, fue ${dif}`);
});

// ── Criterio 3: el eje edad se usa ──────────────────────────────────────────
test('criterio 3: cambiar la clase de edad cambia el percentil', () => {
  const joven = M.comparar(DATOS, copia({ edad: 27 }));
  const mayor = M.comparar(DATOS, copia({ edad: 47 }));
  assert.equal(joven.ok, true);
  assert.equal(mayor.ok, true);
  assert.equal(joven.cohorte.edadClase, '24-34');
  assert.equal(mayor.cohorte.edadClase, '45-49');
  assert.notEqual(joven.cohorte.n, mayor.cohorte.n);
  assert.notEqual(joven.puntaje.percentil, mayor.puntaje.percentil);
});

test('la clase de edad se mapea por entero y cubre los 18 tramos del dataset', () => {
  assert.equal(M.CLASES_EDAD.length, 18);
  assert.equal(M.claseDeEdad(27), '24-34');
  assert.equal(M.claseDeEdad(23), '20-23');
  assert.equal(M.claseDeEdad(24), '24-34');
  assert.equal(M.claseDeEdad(4), null);
  assert.equal(M.claseDeEdad(121), null);
  assert.equal(M.claseDeEdad(27.5), null);
});

// ── Criterio 4: alcance honesto ─────────────────────────────────────────────
test('criterio 4: nacional y mundial dan n distinto y el alcance se declara', () => {
  const nac = M.comparar(DATOS, copia({ alcance: 'nacional' }));
  const mun = M.comparar(DATOS, copia({ alcance: 'mundial' }));
  assert.equal(nac.ok, true);
  assert.equal(mun.ok, true);
  assert.equal(nac.cohorte.alcance, 'nacional');
  assert.equal(mun.cohorte.alcance, 'mundial');
  assert.notEqual(nac.cohorte.n, mun.cohorte.n);
  assert.ok(mun.cohorte.n > nac.cohorte.n, 'el mundial debería ser más grande');
});

test('criterio 4b: si la celda pedida no existe, se degrada y se DECLARA', () => {
  // Se busca el caso en los datos en vez de hardcodearlo: así el test no se
  // rompe si mañana cambia la densidad de una categoría.
  const celdas = DATOS.celdas;
  let caso = null;
  for (const clave of Object.keys(celdas)) {
    const [alc, vent, sexo, edad, equipo] = clave.split('|');
    if (alc !== 'mundial' || vent !== 'desde_2018') continue;
    if (celdas[`nacional|${vent}|${sexo}|${edad}|${equipo}`]) continue;
    caso = { sexo, edad, equipo };
    break;
  }
  assert.ok(caso, 'debería existir alguna celda que esté en mundial y no en nacional');

  const rango = M.CLASES_EDAD.find(([n]) => n === caso.edad);
  const r = M.comparar(DATOS, copia({
    sexo: caso.sexo, edad: rango[1], equipamiento: caso.equipo, alcance: 'nacional',
  }));
  assert.equal(r.ok, true);
  assert.equal(r.cohorte.alcance, 'mundial', 'debería haber caído al mundial');
  assert.equal(r.cohorte.esLaElegida, false);
  assert.ok(r.limitaciones.length > 0, 'debería declarar una limitación');
  const intentoFallido = r.cohorte.intentos.find(
    (i) => i.alcance === 'nacional' && !i.encontrada);
  assert.ok(intentoFallido,
    `los intentos deberían mostrar el fallo nacional: ${JSON.stringify(r.cohorte.intentos)}`);
});

test('criterio 4c: si no hay NINGUNA cohorte con esos ejes, no se inventa un percentil', () => {
  // 95 años: la clase 90-999 existe en el dataset pero con n<10, así que la celda
  // no se emite. En ningún alcance ni ventana debería haber datos.
  const r = M.comparar(DATOS, copia({ edad: 95 }));
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.errores) && r.errores.length > 0);
});

// ── Criterio 5: la ventana se aplica ────────────────────────────────────────
test('criterio 5: cambiar la ventana cambia el n', () => {
  const hist = M.comparar(DATOS, copia({ ventana: 'historico' }));
  const rec = M.comparar(DATOS, copia({ ventana: 'desde_2018' }));
  assert.equal(hist.ok, true);
  assert.equal(rec.ok, true);
  assert.ok(hist.cohorte.n > rec.cohorte.n,
    `histórico (${hist.cohorte.n}) debería ser mayor que 2018+ (${rec.cohorte.n})`);
});

// ── Criterios 6, 7, 8: el n y sus escalones ─────────────────────────────────
test('criterio 6/7: una cohorte con 10 <= n < 30 da banda, no un percentil exacto', () => {
  // Se busca en los datos una celda nacional con n en [10,30)
  const delgada = Object.entries(DATOS.celdas)
    .find(([k, v]) => k.startsWith('nacional') && v.n >= 10 && v.n < 30);
  assert.ok(delgada, 'debería existir alguna celda nacional con n entre 10 y 29');
  const [clave, celda] = delgada;
  const [, vent, sexo, edad, equipo] = clave.split('|');

  const rango = M.CLASES_EDAD.find(([n]) => n === edad);
  const r = M.comparar(DATOS, copia({
    sexo, edad: rango[1], equipamiento: equipo, alcance: 'nacional', ventana: vent,
  }));
  assert.equal(r.ok, true);
  assert.equal(r.cohorte.n, celda.n,
    'la cohorte pedida debería usarse aunque sea fina: la pedida gana si tiene datos');
  assert.equal(r.cohorte.calidad, 'banda');
  assert.equal(r.puntaje.percentil, null, 'no debería haber percentil exacto');
  assert.ok(Array.isArray(r.puntaje.banda) && r.puntaje.banda.length === 2);
  assert.ok(r.puntaje.banda[0] < r.puntaje.banda[1]);
  assert.ok(r.limitaciones.length > 0, 'debería avisar que la cohorte es chica');
  // Con una banda no se emite diagnóstico: los percentiles de las shares sobre
  // 16 casos no sostienen una conclusión.
  assert.equal(r.diagnostico.atrasado, null);
});

test('una cohorte fina ofrece alternativas en vez de cambiar de alcance en silencio', () => {
  const delgada = Object.entries(DATOS.celdas)
    .find(([k, v]) => k.startsWith('nacional') && v.n >= 10 && v.n < 30);
  assert.ok(delgada);
  const [, vent, sexo, edad, equipo] = delgada[0].split('|');
  const rango = M.CLASES_EDAD.find(([n]) => n === edad);

  const r = M.comparar(DATOS, copia({
    sexo, edad: rango[1], equipamiento: equipo, alcance: 'nacional', ventana: vent,
  }));
  assert.equal(r.ok, true);
  assert.ok(r.cohorte.alternativas.length > 0,
    'debería ofrecer la cohorte mundial como alternativa');
  const mundial = r.cohorte.alternativas.find((a) => a.alcance === 'mundial');
  assert.ok(mundial, `las alternativas no incluyen el mundial: ${JSON.stringify(r.cohorte.alternativas)}`);
  assert.ok(mundial.n > r.cohorte.n, 'la alternativa mundial debería ser más grande');
  assert.ok(['firme', 'acotada'].includes(mundial.calidad));
});

test('criterio 8: el n SIEMPRE está presente y es mayor que cero', () => {
  for (const perfil of [
    copia(), copia({ alcance: 'nacional' }), copia({ ventana: 'historico' }),
    copia({ sexo: 'F' }), copia({ edad: 60 }), copia({ equipamiento: 'Wraps' }),
  ]) {
    const r = M.comparar(DATOS, perfil);
    if (!r.ok) continue;
    assert.ok(Number.isInteger(r.cohorte.n) && r.cohorte.n > 0,
      `n inválido: ${r.cohorte.n} para ${JSON.stringify(perfil)}`);
  }
});

test('evaluarCalidad corta en los cuatro escalones declarados', () => {
  assert.equal(M.evaluarCalidad(101, 10), 'firme');
  assert.equal(M.evaluarCalidad(100, 10), 'firme');
  assert.equal(M.evaluarCalidad(99, 10), 'acotada');
  assert.equal(M.evaluarCalidad(30, 10), 'acotada');
  assert.equal(M.evaluarCalidad(29, 10), 'banda');
  assert.equal(M.evaluarCalidad(10, 10), 'banda');
  assert.equal(M.evaluarCalidad(9, 10), 'sin_percentil');
  assert.equal(M.evaluarCalidad(1, 10), 'sin_percentil');
});

// ── Criterios 9, 10, 11: defensivos ─────────────────────────────────────────
test('criterio 9: percentilDe no divide por cero con cuantiles repetidos', () => {
  const vector = [10, 10, 10, 20, 30];
  const grilla = [0, 10, 20, 30, 40];
  for (const v of [5, 10, 15, 20, 25, 30, 99]) {
    const p = M.percentilDe(v, vector, grilla);
    assert.ok(Number.isFinite(p), `percentilDe(${v}) devolvió ${p}`);
    assert.ok(p >= 0 && p <= 100);
  }
});

test('criterio 9b: percentilDe devuelve null en vez de explotar con entradas rotas', () => {
  assert.equal(M.percentilDe(10, null, [0, 50, 100]), null);
  assert.equal(M.percentilDe(NaN, [1, 2, 3], [0, 50, 100]), null);
  assert.equal(M.percentilDe(10, [1], [0]), null);
  assert.equal(M.percentilDe(Infinity, [1, 2, 3], [0, 50, 100]), null);
});

test('criterio 9c: el percentil es monótono — más peso nunca da peor percentil', () => {
  const celda = DATOS.celdas['mundial|desde_2018|M|24-34|Raw'];
  let previo = -1;
  for (const v of [250, 320, 385, 450, 520, 700]) {
    const p = M.percentilDe(v, celda.dots, META.grid_fina);
    assert.ok(p >= previo, `${v} kg dio p${p}, antes p${previo}`);
    previo = p;
  }
});

test('criterio 10: comparar() nunca lanza, siempre devuelve un objeto', () => {
  const casos = [
    null, undefined, {}, { sexo: 'M' }, copia({ sexo: 'X' }),
    copia({ edad: 'veintisiete' }), copia({ peso: -5 }),
    copia({}, { banco: 0 }), copia({}, { despegue: 'doscientos' }),
  ];
  for (const caso of casos) {
    const r = M.comparar(DATOS, caso);
    assert.equal(typeof r, 'object');
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.errores) && r.errores.length > 0);
  }
  // datos rotos tampoco
  assert.equal(M.comparar(null, PERFIL).ok, false);
  assert.equal(M.comparar({}, PERFIL).ok, false);
});

test('criterio 11: las shares del atleta suman 1', () => {
  for (const kg of [
    { sentadilla: 220, banco: 140, despegue: 250 },
    { sentadilla: 60, banco: 40, despegue: 80 },
    { sentadilla: 300, banco: 200, despegue: 320 },
  ]) {
    const s = M.sharesDe(kg);
    const suma = s.sentadilla + s.banco + s.despegue;
    assert.ok(Math.abs(suma - 1) < 1e-12, `las shares suman ${suma}`);
  }
});

// ── Criterio 12: entradas inválidas ─────────────────────────────────────────
test('criterio 12: cada entrada imposible se rechaza con su motivo', () => {
  const casos = [
    [copia({ sexo: 'Z' }), /sexo/i],
    [copia({ edad: 27.5 }), /entero/i],
    [copia({ edad: 400 }), /entre/i],
    [copia({ equipamiento: 'Kevlar' }), /equipamiento/i],
    [copia({ peso: 0 }), /peso/i],
    [copia({ peso: 900 }), /peso/i],
    [copia({}, { sentadilla: 0 }), /sentadilla/i],
    [copia({}, { banco: 5000 }), /banco/i],
    [copia({}, { despegue: -10 }), /despegue/i],
  ];
  for (const [perfil, patron] of casos) {
    const r = M.comparar(DATOS, perfil);
    assert.equal(r.ok, false, `debería rechazar ${JSON.stringify(perfil)}`);
    assert.ok(r.errores.some((e) => patron.test(e)),
      `ningún error matchea ${patron}: ${JSON.stringify(r.errores)}`);
  }
});

// ── Criterio 13: la tabla de referencia (golden master) ─────────────────────
test('criterio 13: la celda de referencia coincide con lo medido en el diseño', () => {
  // Valores de docs/03_Arquitectura/02_Fase_02/03_Reglas_Cohorte.md
  const ESPERADO = { 10: 310.0, 25: 345.7, 50: 385.0, 75: 425.6, 90: 463.1 };
  const celda = DATOS.celdas['mundial|desde_2018|M|24-34|Raw'];
  assert.ok(celda, 'falta la celda de referencia');
  assert.equal(celda.n, 140561, 'el n de la cohorte de referencia cambió');

  for (const [p, valor] of Object.entries(ESPERADO)) {
    const i = META.grid_fina.indexOf(Number(p));
    assert.ok(i >= 0, `el percentil ${p} no está en la grilla fina`);
    const real = celda.dots[i];
    const error = Math.abs(real - valor) / valor;
    assert.ok(error <= 0.01,
      `p${p}: esperado ${valor}, real ${real} (error ${(error * 100).toFixed(3)}%)`);
  }
});

test('criterio 13b: el reparto del total reproduce el hallazgo del diseño', () => {
  // En la mediana las shares suman ~1; en los extremos NO, porque la suma de
  // cuantiles no es el cuantil de la suma. Ese hallazgo está documentado en
  // 03_Reglas_Cohorte.md y este test lo congela: si alguien "arregla" la tabla
  // para que sume 1 en todos los percentiles, esto falla.
  const c = DATOS.celdas['mundial|desde_2018|M|24-34|Raw'];
  const suma = (p) => {
    const i = META.grid_gruesa.indexOf(p);
    return c.share_sentadilla[i] + c.share_banco[i] + c.share_despegue[i];
  };
  assert.ok(Math.abs(suma(50) - 1) < 0.005, `la mediana debería sumar ~1, suma ${suma(50)}`);
  assert.ok(suma(10) < 0.97, `p10 debería sumar bastante menos que 1, suma ${suma(10)}`);
  assert.ok(suma(90) > 1.03, `p90 debería sumar bastante más que 1, suma ${suma(90)}`);
});

// ── Criterio 14: trazabilidad ───────────────────────────────────────────────
test('criterio 14: el resultado declara de dónde salió el número', () => {
  const t = M.comparar(DATOS, PERFIL).trazabilidad;
  assert.match(t.dataset, /OpenDataRaw$/);
  assert.equal(t.ubicacion, 'southamerica-east1');
  assert.equal(t.fuente_sql, 'SQL/phase_3_scala/QueryCapa02.sql');
  assert.match(t.ultima_actualizacion, /^\d{4}-\d{2}-\d{2}$/);
});

// ── El puntaje (Dots) reconstruido desde el peso ────────────────────────────
test('el puntaje se reconstruye desde peso y total, y g es creciente con el peso', () => {
  const t = DATOS.puntaje;
  for (const sexo of ['M', 'F']) {
    assert.ok(t[sexo].peso.length >= 2);
    assert.equal(t[sexo].peso.length, t[sexo].g.length);
    // g crece con el peso (Dots = total*500/g, así que g mayor = puntaje menor)
    const a = M.gDePuntaje(t, sexo, t[sexo].peso_min + 10);
    const b = M.gDePuntaje(t, sexo, t[sexo].peso_max - 10);
    assert.ok(b.g > a.g, `${sexo}: g no crece con el peso (${a.g} -> ${b.g})`);
    assert.equal(a.clampeado, false);
  }
});

test('el peso fuera de rango se marca como clampeado, no se ignora', () => {
  const t = DATOS.puntaje;
  const bajo = M.gDePuntaje(t, 'M', 1);
  const alto = M.gDePuntaje(t, 'M', 999);
  assert.equal(bajo.clampeado, true);
  assert.equal(alto.clampeado, true);
  const r = M.comparar(DATOS, copia({ peso: 1 }));
  assert.ok(r.ok);
  assert.ok(r.limitaciones.some((l) => /peso/i.test(l)),
    `debería avisar del peso fuera de rango: ${JSON.stringify(r.limitaciones)}`);
});

test('un atleta en la mediana de su cohorte cae cerca del percentil 50', () => {
  // El total mediano de la cohorte de referencia (p50 = 590 kg) con el peso
  // mediano: el percentil del puntaje tiene que caer cerca de 50, no en los
  // extremos. Es la prueba de que el puntaje y la cohorte están en la misma
  // escala; si no lo estuvieran, el atleta mediano aparecería en p5 o p95.
  const celda = DATOS.celdas['mundial|desde_2018|M|24-34|Raw'];
  const iPeso = DATOS.puntaje.M.peso.findIndex((p) => p >= 88);
  const g = DATOS.puntaje.M.g[iPeso];
  const puntaje = (590 * 500) / g;
  const p = M.percentilDe(puntaje, celda.dots, META.grid_fina);
  assert.ok(p >= 35 && p <= 65,
    `el total mediano dio percentil ${p}, se esperaba cerca de 50`);
});

// ── El diagnóstico ──────────────────────────────────────────────────────────
test('el diagnóstico detecta el levantamiento atrasado y no inventa culpables', () => {
  const celda = DATOS.celdas['mundial|desde_2018|M|24-34|Raw'];
  const g = M.gDePuntaje(DATOS.puntaje, 'M', 88).g;

  // Banco claramente flojo: 220 / 100 / 250
  const flojo = M.comparar(DATOS, copia({}, { banco: 100 }));
  assert.equal(flojo.ok, true);
  assert.equal(flojo.diagnostico.atrasado, 'banco',
    `se esperaba banco atrasado, dio ${flojo.diagnostico.atrasado}`);
  assert.match(flojo.diagnostico.texto, /banco/);

  // Reparto parejo con la cohorte: 220 / 145 / 250 (proporciones cercanas a la mediana)
  const parejo = M.comparar(DATOS, copia({}, { sentadilla: 220, banco: 145, despegue: 252 }));
  assert.equal(parejo.ok, true);
  // No se afirma que sea "sin desbalances" (depende de la cohorte), pero sí que
  // el texto es coherente con el campo.
  assert.equal(parejo.diagnostico.texto,
    parejo.diagnostico.atrasado ? M.TEXTOS.atrasado[parejo.diagnostico.atrasado]
                                : M.TEXTOS.sinDesbalances);
  assert.ok(g > 0 && celda);
});

test('diagnosticar devuelve sin_datos en vez de romper si la celda no tiene shares', () => {
  const r = M.diagnosticar({}, META.grid_gruesa, { sentadilla: 0.3, banco: 0.2, despegue: 0.5 });
  assert.equal(r.atrasado, null);
  assert.equal(r.sinDatos, true);
});

// ── Convención de copy: sin tildes ──────────────────────────────────────────
test('los textos que ve el usuario van SIN tildes ni ñ (copy del sitio)', () => {
  const ACENTOS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
  const cadenas = [
    M.TEXTOS.sinDesbalances, M.TEXTOS.banda, M.TEXTOS.cohorteAmpliada,
    M.TEXTOS.cohorteMundial, M.TEXTOS.sinPercentil, M.TEXTOS.pesoFueraDeRango,
    M.TEXTOS.pesoNoEsEje, ...Object.values(M.TEXTOS.atrasado),
  ];
  for (const s of cadenas) {
    assert.ok(!ACENTOS.test(s), `texto con tilde o eñe: ${JSON.stringify(s)}`);
  }
});

test('los mensajes de error de validación también van sin tildes', () => {
  const ACENTOS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
  const perfiles = [
    copia({ sexo: 'Z' }), copia({ edad: 400 }), copia({ edad: 27.5 }),
    copia({ equipamiento: 'X' }), copia({ peso: 0 }), copia({ peso: 900 }),
    copia({}, { banco: 0 }), copia({}, { sentadilla: 5000 }),
    copia({ ventana: 5 }), copia({ alcance: 5 }), null,
  ];
  for (const p of perfiles) {
    const r = M.comparar(DATOS, p);
    assert.equal(r.ok, false);
    for (const e of r.errores) {
      assert.ok(!ACENTOS.test(e), `error con tilde: ${JSON.stringify(e)}`);
    }
  }
});

test('las limitaciones que se muestran al usuario van sin tildes', () => {
  const ACENTOS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
  const r = M.comparar(DATOS, copia({ alcance: 'nacional', edad: 52, sexo: 'F', peso: 60 }));
  if (r.ok) {
    for (const l of r.limitaciones) {
      assert.ok(!ACENTOS.test(l), `limitación con tilde: ${JSON.stringify(l)}`);
    }
  }
});
