/**
 * Tests del dashboard completo, tal como lo ejecuta el navegador.
 *
 * Correr:  node --test tests/frontend/pagina.test.mjs
 *
 * Cada test nació de un bug real encontrado en la auditoría:
 *   · un gráfico que no renderizaba (faltaba su clave en data.json)
 *   · un gráfico con etiquetas undefined (campo mal nombrado)
 *   · KPIs hardcodeados que nunca se actualizaban (faltaba el id en el HTML)
 *   · un <script> inline con datos de muestra que dibujaba primero y mataba
 *     el render de app.js ("Canvas is already in use")
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ejecutarPagina, CANVAS_ESPERADOS } from './harness.mjs';

const pag = await ejecutarPagina();
const { datos, nodos } = pag;

const anios = (min) => datos.q5_temporal.filter((f) => f.anio >= min).map((f) => f.anio);


// ── Integridad de la página ──────────────────────────────────────────────────
test('la página no lanza errores de JavaScript', () => {
  assert.deepEqual(pag.errores, [],
    `la página lanzó errores y el render muere ahí: ${JSON.stringify(pag.errores, null, 2)}`);
});

test('no queda ningún <script> inline con datos de muestra', () => {
  assert.deepEqual(pag.inline, [],
    `index.html todavía tiene ${pag.inline.length} bloque(s) <script> inline; ` +
    'el bloque de datos de muestra fue el que rompía el render');
});

test('no quedan valores de muestra quemados en el HTML', () => {
  const quemados = ['63.4', '36.6', '68.4', '71.2', '3.847', '11.203', 'APLE', '14.8', '2.91'];
  const encontrados = quemados.filter((v) => pag.html.includes(v));
  assert.deepEqual(encontrados, [],
    `index.html todavía tiene valores de muestra hardcodeados: ${encontrados}`);
});


// ── Los gráficos ─────────────────────────────────────────────────────────────
test(`los ${CANVAS_ESPERADOS.length} gráficos quedan dibujados`, () => {
  const faltan = CANVAS_ESPERADOS.filter((id) => !pag.chart(id));
  assert.deepEqual(faltan, [], `no se renderizaron: ${faltan}`);
  assert.equal(pag.graficos.length, CANVAS_ESPERADOS.length,
    `se esperaban ${CANVAS_ESPERADOS.length} gráficos, hay ${pag.graficos.length}`);
});

test('ningún gráfico tiene etiquetas undefined o null', () => {
  for (const g of [...pag.graficos]) {
    const labels = g.data.labels || [];
    assert.ok(labels.length > 0, `#${g.canvasId} no tiene etiquetas`);
    const malas = labels.filter((l) => l === undefined || l === null);
    assert.equal(malas.length, 0, `#${g.canvasId} tiene ${malas.length} etiquetas undefined`);
  }
});

test('ningún gráfico tiene valores undefined o NaN', () => {
  for (const g of [...pag.graficos]) {
    const vals = (g.data.datasets[0] || {}).data || [];
    assert.ok(vals.length > 0, `#${g.canvasId} no tiene datos`);
    const malos = vals.filter((v) => v === undefined || v === null || Number.isNaN(v));
    assert.equal(malos.length, 0, `#${g.canvasId} tiene ${malos.length} valores inválidos`);
  }
});

test('los gráficos muestran los datos REALES, no los de muestra', () => {
  const sexo = pag.chart('chartSexo');
  assert.deepEqual(sexo.data.datasets[0].data, datos.q2_sexo.map((d) => d.porcentaje),
    '#chartSexo sigue con los porcentajes de muestra (63.4 / 36.6)');

  const equipo = pag.chart('chartEquipo');
  assert.deepEqual(equipo.data.datasets[0].data, datos.q4b_equipamiento.map((d) => d.porcentaje),
    '#chartEquipo sigue con el equipamiento de muestra (68.4 / 16.2 / ...)');

  const eventos = pag.chart('chartEventos');
  assert.deepEqual(eventos.data.datasets[0].data, datos.q4a_eventos.map((d) => d.porcentaje),
    '#chartEventos sigue con los eventos de muestra');
});

test('chartPlace usa la clasificación tipo_resultado', () => {
  const etiquetas = pag.chart('chartPlace').data.labels;
  assert.ok(etiquetas.includes('Posición válida'),
    `esperaba las categorías clasificadas, tiene ${JSON.stringify(etiquetas)}`);
  assert.ok(!etiquetas.some((l) => /^\d+$/.test(String(l))),
    'chartPlace está mostrando el valor crudo de Place en vez de la clasificación');
});


// ── Filtro temporal ──────────────────────────────────────────────────────────
test('por defecto el temporal arranca en 2012', () => {
  const t = pag.chart('chartTiempo');
  assert.deepEqual(t.data.labels, anios(2012),
    'el gráfico unificado no está filtrado a 2012 por defecto');
  assert.ok(t.data.labels.length < datos.q5_temporal.length,
    'debería estar ocultando los años previos a 2012');
});

test('los 3 gráficos por métrica arrancan alineados con el unificado', () => {
  const esperado = anios(2012);
  assert.deepEqual(pag.chart('chartTiempoParticipaciones').data.labels, esperado);
  assert.deepEqual(pag.chart('chartTiempoAtletas').data.labels, esperado);
  assert.deepEqual(pag.chart('chartTiempoFederaciones').data.labels, esperado);
});

test('los gráficos por métrica usan la columna correcta', () => {
  const desde = anios(2012);
  const casos = [
    ['chartTiempoParticipaciones', 'participaciones'],
    ['chartTiempoAtletas', 'atletas_unicos'],
    ['chartTiempoFederaciones', 'federaciones_activas'],
  ];
  for (const [id, campo] of casos) {
    const esperado = datos.q5_temporal.filter((f) => f.anio >= 2012).map((f) => f[campo]);
    assert.deepEqual(pag.chart(id).data.datasets[0].data, esperado,
      `#${id} no grafica la columna '${campo}'`);
  }
  assert.ok(desde.length > 0);
});

test('el filtro "todo el histórico" muestra los 49 años', () => {
  pag.clickFiltro(1964);
  const t = pag.chart('chartTiempo');
  assert.deepEqual(t.data.labels, anios(1964), 'el filtro no trajo el histórico completo');
  assert.equal(t.data.labels.length, datos.q5_temporal.length);
  assert.equal(t.data.labels[0], 1964, 'el primer año del histórico debería ser 1964');
});

test('volver a "desde 2012" recorta de nuevo', () => {
  pag.clickFiltro(2012);
  assert.deepEqual(pag.chart('chartTiempo').data.labels, anios(2012));
});

test('la nota del filtro informa cuántos años se muestran', () => {
  const nota = nodos.filtroNota;
  assert.ok(nota?.textContent, 'no se llenó #filtroNota');
  assert.match(nota.textContent, /mostrando \d+ de \d+ años/,
    `la nota dice: "${nota.textContent}"`);
  assert.match(nota.textContent, /2012–2025/,
    `la nota debería decir el rango visible, dice: "${nota.textContent}"`);
});

test('re-renderizar no rompe la página (canvas reutilizado)', () => {
  for (const desde of [1964, 2012, 1964, 2012]) pag.clickFiltro(desde);
  assert.deepEqual(pag.errores, [], 'el render dejó de ser idempotente');
  assert.equal(pag.graficos.length, CANVAS_ESPERADOS.length,
    'quedaron gráficos duplicados tras varios re-render');
});


// ── KPIs ─────────────────────────────────────────────────────────────────────
test('los KPIs se llenaron con datos reales', () => {
  assert.equal(nodos.kpiAtletas?.textContent,
    Number(datos.q1_volumen.atletas_unicos).toLocaleString('es-AR'));
  assert.equal(nodos.kpiParticipaciones?.textContent,
    Number(datos.q1_volumen.participaciones_totales).toLocaleString('es-AR'));
  assert.equal(nodos.kpiPromedio?.textContent,
    Number(datos.q1_volumen.participaciones_promedio_por_atleta).toLocaleString('es-AR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }));
});

test('el contador de KPIs realmente anima', () => {
  // El bug: el contador decidía si un valor era decimal mirando si el string
  // formateado contenía un punto. En es-AR el separador de MILES es el punto,
  // así que formatNum(2521) = "2.521" se interpretaba como decimal y el contador
  // salía por el camino corto. Cero frames de animación.
  assert.ok(pag.rafCalls() >= 3,
    `solo se pidieron ${pag.rafCalls()} frames; el contador no está animando`);
});

test('el formato de números respeta las convenciones de es-AR', () => {
  const f = pag.sandbox.formatearNumero;
  assert.equal(f(2521, 0), '2.521', 'miles con punto');
  assert.equal(f(11514, 0), '11.514', 'miles con punto');
  assert.equal(f(4.57, 2), '4,57', 'decimales con coma');
  assert.equal(f(0, 0), '0');
  assert.equal(f(0, 2), '0,00');
});

test('la fecha de actualización viene de data.json', () => {
  assert.equal(nodos.dataFecha?.textContent, datos._meta.ultima_actualizacion);
});

test('se usaron datos reales, no datos de reemplazo', () => {
  assert.equal(nodos.kpiAtletas?.textContent,
    Number(datos.q1_volumen.atletas_unicos).toLocaleString('es-AR'));
  assert.equal(datos.q1_volumen.atletas_unicos, 2521);
});

// ── Sin datos reales no hay dashboard ────────────────────────────────────────
// La tesis del caso de estudio: los datos de ejemplo son un pasivo, no una
// comodidad. Si sobreviven al desarrollo se convierten en el peor defecto del
// sistema, porque parecen datos. Estas pruebas fijan ese contrato.

test('app.js no tiene datos de reemplazo', () => {
  assert.ok(!/function\s+getDatosMuestra/.test(pag.appjs),
    'app.js todavía define getDatosMuestra()');
  for (const numero of ['3847', '11203', 'APLE', '68.4', '82.1']) {
    assert.ok(!pag.appjs.includes(numero),
      `app.js todavía contiene el valor de muestra ${numero}`);
  }
  assert.ok(/mostrarErrorDeCarga/.test(pag.appjs),
    'debe existir un camino de error explícito');
});

test('si data.json no carga, no se dibuja ABSOLUTAMENTE nada', async () => {
  const sinDatos = await ejecutarPagina({ fetchFalla: true });

  assert.equal(sinDatos.graficos.length, 0,
    'sin datos reales no se debe instanciar ningún gráfico');
  assert.equal(sinDatos.nodos.kpiAtletas, undefined,
    'sin datos reales no se deben escribir los KPIs');
  assert.ok(sinDatos.nodos.bannerError, 'debe mostrarse el banner de error');
  assert.equal(sinDatos.nodos.bannerError.hidden, false,
    'el banner de error debe quedar visible');
  assert.ok(sinDatos.nodos.body.classList.contains('sin-datos'),
    'el body debe marcarse con .sin-datos para ocultar los bloques de datos');
  assert.ok(sinDatos.errores.length > 0, 'la falla debe registrarse en consola');
});

test('un HTTP de error tampoco produce datos', async () => {
  const p = await ejecutarPagina({ fetchStatus: 500 });
  assert.equal(p.graficos.length, 0, 'un 500 no debe dibujar gráficos');
  assert.equal(p.nodos.bannerError.hidden, false, 'debe mostrar el error');
  assert.ok(p.nodos.body.classList.contains('sin-datos'));
});

test('con datos reales el body NO se marca como sin datos', () => {
  assert.equal(pag.nodos.body.classList.contains('sin-datos'), false,
    'los datos cargaron: no debe marcarse el estado de error');
});

test('el banner de error viene oculto en el HTML', () => {
  assert.ok(/id="bannerError"[^>]*\bhidden\b/.test(pag.html),
    'el banner debe traer el atributo hidden para no aparecer con datos OK');
});
