/**
 * Harness: ejecuta index.html como lo hace el navegador.
 *
 * Orden real: app.js se carga y registra el handler de DOMContentLoaded,
 * después corren los <script> inline, y al final se dispara DOMContentLoaded.
 *
 * El stub de Chart.js es deliberadamente FIEL a v4: lanza error si se crea un
 * segundo gráfico sobre un canvas ya usado. Ese error aborta todo el render, y
 * es exactamente lo que pasaba con el bloque inline de datos de muestra.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(__dirname, '..', '..');
export const HTML = path.join(RAIZ, 'index.html');
export const APP_JS = path.join(RAIZ, 'assets', 'js', 'app.js');
export const DATA_JSON = path.join(RAIZ, 'assets', 'data', 'data.json');

/** Canvases que el dashboard debe dibujar. */
export const CANVAS_ESPERADOS = [
  'chartSexo', 'chartEventos', 'chartEquipo', 'chartAmbito',
  'chartPlace', 'chartTotal',
  'chartTiempo',
  'chartTiempoParticipaciones', 'chartTiempoAtletas', 'chartTiempoFederaciones',
];

export async function ejecutarPagina(opciones = {}) {
  const html = fs.readFileSync(HTML, 'utf8');
  const appjs = fs.readFileSync(APP_JS, 'utf8');
  const datos = JSON.parse(fs.readFileSync(DATA_JSON, 'utf8'));

  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).filter((s) => s.trim());

  const graficos = [];
  const errores = [];
  const avisos = [];
  let onDomReady = null;
  let rafCalls = 0;   // frames de animación pedidos (0 = no animó nada)

  class ChartStub {
    static defaults = { color: null, font: {} };
    constructor(target, config) {
      if (typeof target === 'string') target = { id: target };
      const canvas = target.canvas || target;
      const id = canvas.id || '(sin id)';
      const previo = graficos.find((g) => g.canvasId === id);
      if (previo) {
        throw new Error(
          `Canvas is already in use. Chart with ID '${previo.chartId}' must be ` +
          `destroyed before the canvas with ID '${id}' can be reused.`);
      }
      this.canvasId = id;
      this.chartId = String(graficos.length);
      this.data = config.data;
      this.config = config;
      graficos.push(this);
    }
    destroy() {
      const i = graficos.indexOf(this);
      if (i >= 0) graficos.splice(i, 1);
    }
    static getChart(target) {
      const canvas = target?.canvas || target;
      return graficos.find((g) => g.canvasId === canvas?.id) || null;
    }
  }

  const nodos = {};
  const crearNodo = (id) => {
    const nodo = {
      id, style: {}, dataset: {}, innerHTML: '', textContent: '',
      _listeners: {},
      querySelectorAll: () => [],
      addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
      scrollIntoView() {},
      classList: {
        _c: new Set(),
        add(...c) { c.forEach((x) => this._c.add(x)); },
        remove(...c) { c.forEach((x) => this._c.delete(x)); },
        contains(c) { return this._c.has(c); },
      },
    };
    nodo.getContext = () => ({
      canvas: nodo,
      createLinearGradient: () => ({ addColorStop() {} }),
    });
    return nodo;
  };
  const getEl = (id) => (nodos[id] = nodos[id] || crearNodo(id));

  // Botones del filtro temporal, como los declararía el HTML
  const botones = ['2012', '1964'].map((desde, i) => {
    const b = crearNodo(`btn-filtro-${desde}`);
    b.dataset.desde = desde;
    if (i === 0) b.classList.add('is-active');
    return b;
  });

  const sandbox = {
    document: {
      title: 'test',
      body: getEl('body'),
      addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') onDomReady = fn; },
      getElementById: getEl,
      querySelector: () => crearNodo('_q'),
      querySelectorAll: (sel) => (String(sel).includes('filtro-btn') ? botones : []),
    },
    window: { addEventListener() {}, scrollY: 0 },
    Chart: ChartStub,
    performance: { now: () => 0 },
    // Un solo tick con timestamp final: el contador animado llega a su valor en
    // un paso y no se recursiona. Pero se CUENTA cuántas veces se pidió frame:
    // si el contador sale por el camino corto (bug del separador de miles),
    // rafCalls queda en 0 y el test lo detecta.
    requestAnimationFrame: (fn) => { rafCalls++; return fn(1e9); },
    IntersectionObserver: class {
      constructor(cb) { this.cb = cb; }
      observe() { this.cb([{ isIntersecting: true }], this); }
      disconnect() {}
    },
    // Con opciones.fetchFalla se simula que data.json no responde, para poder
    // testear que el dashboard NO muestre datos de reemplazo.
    fetch: async () => {
      if (opciones.fetchFalla) throw new Error('fallo de red simulado');
      if (opciones.fetchStatus && opciones.fetchStatus !== 200) {
        return { ok: false, status: opciones.fetchStatus, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => datos };
    },
    console: {
      log() {},
      warn: (...a) => avisos.push('warn: ' + a.join(' ')),
      error: (...a) => errores.push('error: ' + a.join(' ')),
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window.Chart = ChartStub;
  vm.createContext(sandbox);

  try { vm.runInContext(appjs, sandbox); } catch (e) { errores.push('app.js: ' + e.message); }
  for (const [i, src] of inline.entries()) {
    try { vm.runInContext(src, sandbox); } catch (e) { errores.push(`inline[${i}]: ` + e.message); }
  }
  if (onDomReady) {
    try { await onDomReady(); } catch (e) { errores.push('domready: ' + e.message); }
  }

  return {
    graficos, nodos, datos, errores, avisos, botones, inline, html, appjs,
    rafCalls: () => rafCalls,
    // Las funciones declaradas con `function` en un script clásico quedan como
    // globales del contexto; se exponen para poder testearlas directamente.
    sandbox,
    // Lookup SIEMPRE actual: al filtrar, los gráficos se destruyen y se
    // recrean, así que un Map capturado al inicio quedaría obsoleto.
    chart: (id) => graficos.find((g) => g.canvasId === id) || null,
    // dispara el click del botón del filtro por su data-desde
    clickFiltro: (desde) => {
      const b = botones.find((x) => x.dataset.desde === String(desde));
      if (!b) throw new Error(`no hay botón de filtro con data-desde="${desde}"`);
      (b._listeners.click || []).forEach((fn) => fn());
    },
    inline,
    html,
  };
}
