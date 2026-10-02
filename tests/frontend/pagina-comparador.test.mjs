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
};

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
