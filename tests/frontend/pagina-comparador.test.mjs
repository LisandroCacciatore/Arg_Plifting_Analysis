/**
 * Tests de comparador.html corriendo de verdad.
 *
 * Carga el HTML real, ejecuta comparador.js y comparador-pagina.js en un contexto
 * de vm con un DOM simulado, completa el formulario y verifica lo que se renderiza.
 *
 * Lo que este test protege y los de contrato estático no pueden: que la página
 * funcione de punta a punta con los datos reales, y que sin datos NO muestre nada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..', '..');
const HTML = path.join(RAIZ, 'comparador.html');
const MOTOR_JS = path.join(RAIZ, 'assets', 'js', 'comparador.js');
const PAGINA_JS = path.join(RAIZ, 'assets', 'js', 'comparador-pagina.js');
const COHORTES_JSON = path.join(RAIZ, 'assets', 'data', 'cohortes.json');

// Valores por defecto que trae el HTML en los inputs del formulario.
const VALORES_INICIALES = {
  'cmp-sexo': 'M', 'cmp-edad': '27', 'cmp-peso': '88',
  'cmp-sentadilla': '220', 'cmp-banco': '140', 'cmp-despegue': '250',
  'cmp-total': '', 'cmp-estado': '', 'cmp-error-lista': '', 'cmp-res': '',
  // Medidor vivo
  'cmp-vivo': '', 'cmp-vivo-nivel': '', 'cmp-vivo-nivel-sub': '', 'cmp-vivo-dots': '',
  'cmp-vivo-perc': '', 'cmp-vivo-perc-sub': '', 'cmp-escala-marca': '', 'cmp-escala-etq': '',
  'cmp-vivo-aviso': '',
  'cmp-peso-efecto': '', 'cmp-peso-tit': '', 'cmp-peso-fila': '', 'cmp-peso-nota': '',
};

/**
 * Elementos que en el HTML estático arrancan con el atributo `hidden`.
 *
 * El stub los marca como ocultos para que sea fiel: si no, un test podría pasar
 * porque el nodo nunca se ocultó, en vez de porque el JS lo ocultó.
 */
const OCULTOS_INICIALES = ['cmp-vivo', 'cmp-vivo-aviso', 'cmp-peso-efecto', 'cmp-error', 'cmp-res'];

/**
 * Nodo simulado.
 *
 * `innerHTML` imita el comportamiento de un <select>: al inyectar opciones,
 * adopta el value de la primera si todavía no tiene ninguno. Sin esto,
 * `selEquipo.value` quedaría vacío y la página fallaría por una razón que el
 * navegador real no tiene.
 */
function crearNodo(id) {
  const nodo = {
    id,
    value: VALORES_INICIALES[id] ?? '',
    textContent: '',
    hidden: false,
    dataset: {},
    style: {},
    _listeners: {},
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = String(v);
      if (!this.value) {
        const m = /<option value="([^"]*)"/.exec(this._html);
        if (m) this.value = m[1];
      }
    },
    addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
    dispatch(ev, arg = {}) {
      (this._listeners[ev] || []).forEach((fn) => fn({ preventDefault() {}, ...arg }));
    },
    closest() { return null; },
    querySelectorAll() { return []; },
  };
  return nodo;
}

async function ejecutarPagina(opciones = {}) {
  const html = fs.readFileSync(HTML, 'utf8');
  const motor = fs.readFileSync(MOTOR_JS, 'utf8');
  const pagina = fs.readFileSync(PAGINA_JS, 'utf8');
  const datos = JSON.parse(fs.readFileSync(COHORTES_JSON, 'utf8'));

  const nodos = {};
  const getEl = (id) => (nodos[id] = nodos[id] || crearNodo(id));
  const errores = [];

  // Precargar los nodos del formulario, para que existan antes de correr el JS.
  for (const id of Object.keys(VALORES_INICIALES)) getEl(id);
  // Fiel al HTML estático: estos arrancan con el atributo `hidden`.
  for (const id of OCULTOS_INICIALES) getEl(id).hidden = true;

  const sandbox = {
    document: { getElementById: getEl, addEventListener() {} },
    fetch: async () => {
      if (opciones.fetchFalla) throw new Error('fallo de red simulado');
      if (opciones.fetchStatus && opciones.fetchStatus !== 200) {
        return { ok: false, status: opciones.fetchStatus, json: async () => ({}) };
      }
      if (opciones.datosRotos) {
        return { ok: true, status: 200, json: async () => ({ nada: 1 }) };
      }
      return { ok: true, status: 200, json: async () => datos };
    },
    console: { log() {}, warn() {}, error: (...a) => errores.push(a.join(' ')) },
    setTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  try { vm.runInContext(motor, sandbox); } catch (e) { errores.push('motor: ' + e.message); }
  try { vm.runInContext(pagina, sandbox); } catch (e) { errores.push('pagina: ' + e.message); }
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));

  return {
    nodos, errores, datos, html,
    el: getEl,
    cargado: () => Boolean(sandbox.Comparador) && Boolean(sandbox.Comparador.comparar),
    enviar: () => getEl('cmp-form').dispatch('submit'),
    res: () => getEl('cmp-res').innerHTML,
    errorTexto: () => getEl('cmp-error-lista').innerHTML,
  };
}

// ── La página funciona ──────────────────────────────────────────────────────
test('la página carga sus dos scripts sin errores', async () => {
  const p = await ejecutarPagina();
  assert.deepEqual(p.errores, [], `errores al evaluar: ${JSON.stringify(p.errores)}`);
  assert.ok(p.cargado(), 'el motor no quedó disponible en globalThis');
});

test('los selects se llenan desde los ejes declarados en el JSON', async () => {
  const p = await ejecutarPagina();
  const equipos = p.el('cmp-equipo').innerHTML;
  for (const e of p.datos._meta.metricas_finas.length ? ['Raw', 'Wraps', 'Single-ply'] : []) {
    assert.ok(equipos.includes(e), `el select de equipamiento no ofrece ${e}`);
  }
  const alcances = p.el('cmp-alcance').innerHTML;
  assert.match(alcances, /mundial/i);
  assert.match(alcances, /nacional/i);
  const ventanas = p.el('cmp-ventana').innerHTML;
  assert.match(ventanas, /historico/i);
  assert.match(ventanas, /desde_2018/i);
});

test('la ventana por defecto es la más reciente, no la más amplia', async () => {
  const p = await ejecutarPagina();
  const meta = p.datos._meta;
  const masReciente = Object.keys(meta.ventanas)
    .sort((a, b) => meta.ventanas[b].localeCompare(meta.ventanas[a]))[0];
  assert.equal(p.el('cmp-ventana').value, masReciente,
    'la comparación por defecto debería ser la más defendible, no la más histórica');
});

test('el total se calcula solo y no se puede escribir a mano', async () => {
  const p = await ejecutarPagina();
  assert.equal(p.el('cmp-total').value, '610,0 kg');
  p.el('cmp-banco').value = '150';
  p.el('cmp-banco').dispatch('input');
  assert.equal(p.el('cmp-total').value, '620,0 kg');
  assert.match(p.html, /id="cmp-total"[^>]*readonly/);
});

test('una comparación contra el mundial renderiza n, percentil y diagnóstico', async () => {
  const p = await ejecutarPagina();
  p.enviar();
  const out = p.res();

  assert.notEqual(out, '', 'no se renderizó nada');
  assert.ok(p.el('cmp-res').hidden === false, 'el bloque de resultados sigue oculto');

  // El n de la cohorte de referencia, con separador de miles es-AR
  assert.ok(out.includes('140.561'),
    `no aparece el n de la cohorte mundial de referencia:\n${out.slice(0, 600)}`);

  assert.match(out, /de percentil/);
  assert.match(out, /Sentadilla/);
  assert.match(out, /Banco/);
  assert.match(out, /Despegue/);
  assert.match(out, /El diagnostico|sin desbalances/i);
  assert.ok(out.includes('Dots'), 'no se muestra el puntaje reconstruido');
});

test('el resultado declara de dónde salió: dataset, región y SQL', async () => {
  const p = await ejecutarPagina();
  p.enviar();
  const out = p.res();
  assert.ok(out.includes('OpenDataRaw'), 'no declara el dataset');
  assert.ok(out.includes('southamerica-east1'), 'no declara la región');
  assert.ok(out.includes('QueryCapa02.sql'), 'no declara el SQL de origen');
  assert.ok(out.includes('no tiene backend'), 'no declara que es estático');
});

test('la página muestra la advertencia de que no recomienda', async () => {
  const p = await ejecutarPagina();
  assert.match(p.html.toLowerCase(), /no recomienda/);
});

// ── Sin datos no se muestra nada ────────────────────────────────────────────
test('si cohortes.json no carga, NO se muestra ningún resultado', async () => {
  const p = await ejecutarPagina({ fetchFalla: true });
  assert.equal(p.res(), '', 'se renderizó un resultado sin datos');
  assert.equal(p.el('cmp-res').hidden, true, 'el bloque de resultados quedó visible');
  assert.equal(p.el('cmp-error').hidden, false, 'no se mostró el error');
  assert.equal(p.el('cmp-form').hidden, true, 'el formulario debería ocultarse');
  assert.match(p.errorTexto(), /No se pudieron cargar/, 'el error no explica qué pasó');
  assert.match(p.errorTexto(), /valores de reemplazo/,
    'no aclara que no se usan datos de reemplazo');
});

test('un HTTP de error tampoco produce resultados', async () => {
  const p = await ejecutarPagina({ fetchStatus: 404 });
  assert.equal(p.res(), '');
  assert.equal(p.el('cmp-res').hidden, true);
  assert.match(p.errorTexto(), /404/);
});

test('un JSON con forma inesperada se rechaza en vez de romper', async () => {
  const p = await ejecutarPagina({ datosRotos: true });
  assert.equal(p.res(), '');
  assert.equal(p.el('cmp-res').hidden, true);
  assert.match(p.errorTexto(), /forma esperada/);
});

// ── Validación en la interfaz ───────────────────────────────────────────────
test('un perfil inválido muestra los motivos y no un resultado', async () => {
  const p = await ejecutarPagina();
  p.el('cmp-edad').value = '400';
  p.enviar();
  assert.equal(p.res(), '', 'se renderizó un resultado con edad 400');
  assert.equal(p.el('cmp-res').hidden, true);
  assert.equal(p.el('cmp-error').hidden, false);
  assert.match(p.errorTexto(), /entre 5 y 120/);
});

test('el peso de un levantamiento en cero se rechaza con su nombre', async () => {
  const p = await ejecutarPagina();
  p.el('cmp-banco').value = '0';
  p.el('cmp-banco').dispatch('input');
  p.enviar();
  assert.equal(p.res(), '');
  assert.match(p.errorTexto(), /banco/i);
});

test('corregir la entrada limpia el error anterior', async () => {
  const p = await ejecutarPagina();
  p.el('cmp-edad').value = '400';
  p.enviar();
  assert.equal(p.el('cmp-error').hidden, false);

  p.el('cmp-edad').value = '27';
  p.enviar();
  assert.equal(p.el('cmp-error').hidden, true, 'el error anterior quedó pegado');
  assert.notEqual(p.res(), '', 'no se renderizó el resultado corregido');
});

// ── El medidor vivo ───────────────────────────────────────────────────────────
test('el medidor aparece al cargar, con nivel, puntaje y percentil reales', async () => {
  const p = await ejecutarPagina();
  assert.equal(p.el('cmp-vivo').hidden, false,
    'el medidor deberia estar visible con el perfil por defecto valido');
  assert.equal(p.el('cmp-vivo-nivel').textContent, 'Intermedio',
    `nivel inesperado: ${p.el('cmp-vivo-nivel').textContent}`);
  assert.match(p.el('cmp-vivo-dots').textContent, /399[,.]0/,
    `puntaje inesperado: ${p.el('cmp-vivo-dots').textContent}`);
  assert.match(p.el('cmp-vivo-perc').textContent, /59[,.]2/,
    `percentil inesperado: ${p.el('cmp-vivo-perc').textContent}`);
  // El n tiene que ir al lado del nivel: la etiqueta nunca viaja sola
  assert.match(p.el('cmp-vivo-nivel-sub').textContent, /140\.561/,
    'el nivel deberia mostrar el n de la cohorte al lado');
});

test('el peso es el unico campo que ahora mueve algo: cambia el puntaje en vivo', async () => {
  const p = await ejecutarPagina();
  const antes = p.el('cmp-vivo-dots').textContent;

  p.el('cmp-peso').value = '98';
  p.el('cmp-peso').dispatch('input');

  const despues = p.el('cmp-vivo-dots').textContent;
  assert.notEqual(antes, despues,
    'cambiar el peso con el mismo total tiene que cambiar el puntaje');
  assert.match(despues, /378[,.]8/,
    `a 98 kg el puntaje deberia ser 378,8; dio ${despues}`);
  assert.equal(p.el('cmp-total').value, '610,0 kg',
    'el total no deberia cambiar: solo se movio el peso');
});

test('la marca de la escala sigue al percentil', async () => {
  const p = await ejecutarPagina();
  const marca = p.el('cmp-escala-marca');
  assert.match(marca.style.left, /59/, `la marca deberia estar en ~59%: ${marca.style.left}`);

  // Un peso mucho mayor baja el percentil y la marca se corre a la izquierda
  p.el('cmp-peso').value = '120';
  p.el('cmp-peso').dispatch('input');
  const nuevo = parseFloat(p.el('cmp-escala-marca').style.left.replace(/[^\d.]/g, ''));
  assert.ok(nuevo < 59, `con mas peso la marca deberia retroceder, fue a ${nuevo}`);
});

test('la escala dibuja los cinco niveles y resalta el que toca', async () => {
  const p = await ejecutarPagina();
  const etq = p.el('cmp-escala-etq').innerHTML;
  for (const n of p.datos._meta && ['Inicial', 'Base', 'Intermedio', 'Avanzado', 'Elite']) {
    assert.ok(etq.includes(n), `falta la etiqueta de nivel ${n}`);
  }
  assert.equal((etq.match(/class="on"/g) || []).length, 1,
    'tiene que haber exactamente una banda resaltada');
  // Con percentil 59,2 la resaltada es Intermedio: se fija el par exacto
  // atributo+nombre para no depender de un indexOf que matchearia por accidente.
  assert.match(etq, /class="on">Intermedio</,
    `la banda resaltada deberia ser Intermedio: ${etq}`);
  assert.ok(!/class="on">(Inicial|Base|Avanzado|Elite)</.test(etq),
    'no deberia haber ninguna otra banda resaltada');
});

test('el bloque del peso muestra los tres puntos con su delta', async () => {
  const p = await ejecutarPagina();
  assert.equal(p.el('cmp-peso-efecto').hidden, false, 'el bloque del peso deberia estar visible');
  const fila = p.el('cmp-peso-fila').innerHTML;
  assert.match(fila, /78[,.]0 kg/);
  assert.match(fila, /88[,.]0 kg/);
  assert.match(fila, /98[,.]0 kg/);
  assert.match(fila, /427[,.]0/);
  assert.match(fila, /399[,.]0/);
  assert.match(fila, /378[,.]8/);
  // Los deltas: mas liviano suma, mas pesado resta
  assert.ok(fila.includes('positivo'), 'el punto liviano deberia marcar delta positivo');
  assert.ok(fila.includes('negativo'), 'el punto pesado deberia marcar delta negativo');
  assert.ok(fila.includes('+28'), `falta el delta de 78 kg: ${fila.slice(0, 400)}`);
  assert.equal(p.el('cmp-peso-efecto').hidden, false);
});

test('el medidor se oculta cuando la entrada no alcanza, y vuelve al corregirla', async () => {
  const p = await ejecutarPagina();
  assert.equal(p.el('cmp-vivo').hidden, false);

  p.el('cmp-peso').value = '';
  p.el('cmp-peso').dispatch('input');
  assert.equal(p.el('cmp-vivo').hidden, true,
    'con el peso vacio no deberia mostrarse un numero a medio calcular');
  assert.equal(p.el('cmp-peso-efecto').hidden, true, 'el bloque del peso tambien se oculta');

  p.el('cmp-peso').value = '88';
  p.el('cmp-peso').dispatch('input');
  assert.equal(p.el('cmp-vivo').hidden, false, 'al corregir deberia volver');
  assert.equal(p.el('cmp-peso-efecto').hidden, false);
});

test('el medidor no se muestra si los datos no cargaron', async () => {
  const p = await ejecutarPagina({ fetchFalla: true });
  assert.equal(p.el('cmp-vivo').hidden, true,
    'sin cohortes.json no hay medidor: no se inventa una cohorte');
});

test('el resultado muestra el nivel y la distancia en kg de total', async () => {
  const p = await ejecutarPagina();
  p.enviar();
  const out = p.res();
  assert.match(out, /nivel-nombre">Intermedio/, 'el nivel deberia encabezar el bloque');
  assert.match(out, /Faltan <strong>[\d,.]+ kg de total<\/strong>/,
    `falta la distancia en kg de total:\n${out.slice(0, 700)}`);
  assert.match(out, /no de un corte elegido a mano/,
    'el bloque deberia aclarar de donde sale el nivel');
});

test('en el nivel mas alto el resultado dice que no hay nivel siguiente', async () => {
  const p = await ejecutarPagina();
  p.el('cmp-sentadilla').value = '330';
  p.el('cmp-banco').value = '240';
  p.el('cmp-despegue').value = '330';
  for (const id of ['cmp-sentadilla', 'cmp-banco', 'cmp-despegue']) p.el(id).dispatch('input');
  assert.equal(p.el('cmp-vivo-nivel').textContent, 'Elite');
  p.enviar();
  assert.match(p.res(), /Ya esta en el nivel mas alto/);
  assert.ok(!/Faltan <strong>/.test(p.res()), 'no deberia prometer un nivel que no existe');
});

test('con una cohorte chica el medidor no inventa un nivel', async () => {
  const p = await ejecutarPagina();
  const delgada = Object.entries(p.datos.celdas)
    .find(([k, v]) => k.startsWith('nacional') && v.n >= 10 && v.n < 30);
  assert.ok(delgada);
  const [, vent, sexo, edad, equipo] = delgada[0].split('|');
  const edades = { '13-15': 14, '16-17': 16, '18-19': 18, '20-23': 21, '24-34': 27,
                   '35-39': 37, '40-44': 42, '45-49': 47, '50-54': 52, '55-59': 57,
                   '60-64': 62, '65-69': 67, '70-74': 72, '75-79': 77 };
  p.el('cmp-sexo').value = sexo;
  p.el('cmp-edad').value = String(edades[edad] ?? 27);
  p.el('cmp-equipo').value = equipo;
  p.el('cmp-alcance').value = 'nacional';
  p.el('cmp-ventana').value = vent;
  p.el('cmp-alcance').dispatch('change');

  assert.equal(p.el('cmp-vivo-nivel').textContent, 'sin nivel',
    'una cohorte con banda no sostiene un nivel con nombre');
  assert.match(p.el('cmp-vivo-nivel-sub').textContent, /banda/);
  assert.equal(p.el('cmp-peso-efecto').hidden, false,
    'el efecto del peso no depende de la cohorte: sigue siendo valido');
});

test('el medidor no muestra un numero exacto cuando la cohorte es chica', async () => {
  const p = await ejecutarPagina();
  const delgada = Object.entries(p.datos.celdas)
    .find(([k, v]) => k.startsWith('nacional') && v.n >= 10 && v.n < 30);
  const [, vent, sexo, edad, equipo] = delgada[0].split('|');
  const edades = { '13-15': 14, '16-17': 16, '18-19': 18, '20-23': 21, '24-34': 27,
                   '35-39': 37, '40-44': 42, '45-49': 47, '50-54': 52, '55-59': 57,
                   '60-64': 62, '65-69': 67, '70-74': 72, '75-79': 77 };
  p.el('cmp-sexo').value = sexo;
  p.el('cmp-edad').value = String(edades[edad] ?? 27);
  p.el('cmp-equipo').value = equipo;
  p.el('cmp-alcance').value = 'nacional';
  p.el('cmp-ventana').value = vent;
  p.el('cmp-alcance').dispatch('change');

  const perc = p.el('cmp-vivo-perc').textContent;
  assert.match(perc, /-/, `con banda el percentil deberia ser un rango, dio ${perc}`);
  assert.ok(!/^\d+[,.]\d+%$/.test(perc), `no deberia ser un numero exacto: ${perc}`);
});

test('si el peso queda fuera del rango con datos, el medidor lo advierte', async () => {
  const p = await ejecutarPagina();
  assert.equal(p.el('cmp-vivo-aviso').hidden, true,
    'con 88 kg no deberia haber aviso: el peso esta dentro del rango con datos');

  // 5 kg pasa la validacion (LIMITES.peso es 400) pero queda FUERA del rango con
  // datos, asi que la tabla g se clampea al extremo mas cercano y el puntaje sale
  // de un peso que no es el tipeado. El medidor no puede callarlo.
  p.el('cmp-peso').value = '5';
  p.el('cmp-peso').dispatch('input');
  assert.equal(p.el('cmp-vivo-aviso').hidden, false,
    'con un peso fuera del rango el medidor tiene que advertirlo');
  assert.match(p.el('cmp-vivo-aviso').textContent, /fuera del rango/,
    `aviso inesperado: ${p.el('cmp-vivo-aviso').textContent}`);
  assert.equal(p.el('cmp-vivo').hidden, false,
    'el medidor igual muestra el numero: se advierte, no se esconde');

  p.el('cmp-peso').value = '88';
  p.el('cmp-peso').dispatch('input');
  assert.equal(p.el('cmp-vivo-aviso').hidden, true,
    'al volver dentro del rango el aviso se va');
});

test('el aviso tambien se va cuando el medidor entero se oculta', async () => {
  const p = await ejecutarPagina();
  p.el('cmp-peso').value = '5';
  p.el('cmp-peso').dispatch('input');
  assert.equal(p.el('cmp-vivo-aviso').hidden, false);

  p.el('cmp-peso').value = '';
  p.el('cmp-peso').dispatch('input');
  assert.equal(p.el('cmp-vivo').hidden, true);
  assert.equal(p.el('cmp-vivo-aviso').hidden, true,
    'no puede quedar un aviso colgado sin el medidor que lo explica');
});

// ── La cohorte pedida manda ────────────────────────────────────────────────
test('elegir nacional cambia el n y el resultado lo declara', async () => {
  const p = await ejecutarPagina();
  p.enviar();
  const mundial = p.res();

  p.el('cmp-alcance').value = 'nacional';
  p.enviar();
  const nacional = p.res();

  assert.notEqual(mundial, nacional, 'cambiar el alcance no cambió el resultado');
  assert.ok(nacional.includes('Argentina'), 'el resultado no declara el alcance nacional');

  // El n de la cohorte ELEGIDA es el nacional, no el mundial
  const esperado = p.datos.celdas['nacional|desde_2018|M|24-34|Raw'].n;
  assert.ok(nacional.includes(`n = ${esperado.toLocaleString('es-AR')}`),
    `la cohorte nacional debería mostrar n = ${esperado}:\n${nacional.slice(0, 500)}`);
  assert.ok(mundial.includes('n = 140.561'),
    'la comparación mundial perdió su n');

  // El mundial sigue apareciendo, pero como ALTERNATIVA ofrecida, no como
  // cohorte usada. Ese es el punto: ofrecer no es cambiar.
  assert.ok(nacional.includes('Otras cohortes disponibles'),
    'no se ofrecen cohortes alternativas');
  assert.ok(nacional.includes('140.561'),
    'la alternativa mundial debería aparecer con su n');
});

test('una cohorte chica se resuelve con una banda y lo advierte', async () => {
  const p = await ejecutarPagina();
  // Buscar en los datos una celda nacional con 10 <= n < 30 y pedirla
  const delgada = Object.entries(p.datos.celdas)
    .find(([k, v]) => k.startsWith('nacional') && v.n >= 10 && v.n < 30);
  assert.ok(delgada, 'no hay celdas nacionales finas para probar');
  const [, vent, sexo, edad, equipo] = delgada[0].split('|');
  const rango = p.datos._meta && delgada[0];

  // La clase de edad ya viene en la clave: se usa un representante de ese tramo
  const edades = { '13-15': 14, '16-17': 16, '35-39': 37, '40-44': 42, '45-49': 47,
                   '50-54': 52, '55-59': 57, '60-64': 62, '65-69': 67, '70-74': 72,
                   '75-79': 77, '18-19': 18, '20-23': 21, '24-34': 27 };
  p.el('cmp-sexo').value = sexo;
  p.el('cmp-edad').value = String(edades[edad] ?? 27);
  p.el('cmp-equipo').value = equipo;
  p.el('cmp-alcance').value = 'nacional';
  p.el('cmp-ventana').value = vent;
  p.enviar();

  const out = p.res();
  assert.notEqual(out, '', 'una cohorte fina debería dar una banda, no nada');
  assert.match(out, /banda/, `no se muestra una banda:\n${out.slice(0, 700)}`);
  assert.ok(rango);
});
