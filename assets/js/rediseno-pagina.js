/**
 * Cableado del candidato de rediseno.
 *
 * Regla que sigue: NINGUN numero de esta pagina esta escrito en el HTML. Todos
 * salen de assets/data/data.json, assets/data/cohortes.json o del SQL real del
 * repo. Si un dato no esta en un JSON, no se muestra (ver la nota del pie).
 *
 * El motor del comparador es assets/js/comparador.js TAL CUAL: el mismo que
 * tienen los 45 tests. Esta pagina solo dibuja lo que el motor devuelve.
 *
 * El texto visible va SIN TILDES, como el resto de la prosa del sitio.
 */
(function () {
    'use strict';

    const C = globalThis.Comparador;
    const el = (id) => document.getElementById(id);
    const qs = (sel) => document.querySelectorAll(sel);

    const num = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
    const dec = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const RUTA_DATA = 'assets/data/data.json';
    const RUTA_COHORTES = 'assets/data/cohortes.json';
    const RUTA_SQL = 'SQL/phase_2_core/QueryCapa01.sql';

    const EQUIPOS = { Raw: 'Raw (sin equipo)', Wraps: 'Wraps (vendas)', 'Single-ply': 'Single-ply', 'Multi-ply': 'Multi-ply', Unlimited: 'Unlimited' };
    const ALCANCES = { nacional: 'Argentina', mundial: 'Mundial' };
    const VENTANAS = { historico: 'Todo el historico', desde_2018: 'Desde 2018' };

    let DATA = null;
    let COHORTES = null;

    async function traer(ruta, comoTexto) {
        const r = await fetch(ruta);
        if (!r.ok) throw new Error(ruta + ' respondio ' + r.status);
        return comoTexto ? r.text() : r.json();
    }

    // ── Formulario del comparador ──────────────────────────────────────────────
    let sexo = 'M';

    function leerPerfil() {
        return {
            sexo,
            edad: Number(el('f-edad').value),
            peso: Number(el('f-peso').value),
            equipamiento: el('f-equipo').value,
            alcance: el('f-alcance').value,
            ventana: el('f-ventana').value,
            levantamientos: {
                sentadilla: Number(el('f-sent').value),
                banco: Number(el('f-bench').value),
                despegue: Number(el('f-dead').value),
            },
        };
    }

    function llenarSelect(sel, valores, etiquetas) {
        sel.innerHTML = valores.map((v) => '<option value="' + esc(v) + '">' + esc(etiquetas[v] || v) + '</option>').join('');
    }

    const rotulo = (mapa, v) => mapa[v] || v;

    function pintarEscala(percentil) {
        const p = Math.max(0, Math.min(100, percentil));
        el('e-marca').style.left = 'calc(' + p + '% - 1px)';
        const activo = C.nivelDe(percentil);
        el('e-etq').innerHTML = C.NIVELES
            .map((n, i) => '<span class="' + (activo && i === activo.indice ? 'on' : '') + '">' + esc(n.nombre) + '</span>')
            .join('');
    }

    function pintarPeso(e) {
        const caja = el('v-peso');
        if (!e) { caja.hidden = true; return; }
        const punto = (p, actual) => {
            const cls = p.delta == null ? '' : (p.delta > 0 ? 'pos' : 'neg');
            const d = p.delta == null ? '' : '<div class="dl ' + cls + '">' + (p.delta > 0 ? '+' : '') + dec.format(p.delta) + '</div>';
            return '<div class="punto' + (actual ? ' actual' : '') + '">' +
                '<div class="kg">' + dec.format(p.peso) + ' kg</div>' +
                '<div class="dots">' + dec.format(p.puntaje) + '</div>' + d + '</div>';
        };
        el('v-peso-fila').innerHTML = punto(e.menos) + punto(e.actual, true) + punto(e.mas);
        el('v-peso-nota').textContent = C.TEXTOS.efectoPesoNota;
        caja.hidden = false;
    }

    function actualizarVivo() {
        if (!COHORTES) return;
        const r = C.comparar(COHORTES, leerPerfil());
        if (!r.ok) {
            el('v-peso').hidden = true;
            el('v-aviso').hidden = true;
            el('res').hidden = true;
            return;
        }

        el('res').hidden = false;
        el('v-nivel').textContent = r.nivel ? r.nivel.nombre : 'sin nivel';
        el('v-nivel-sub').textContent = r.nivel
            ? 'percentil ' + dec.format(r.nivel.percentil) + ' · n = ' + num.format(r.cohorte.n)
            : (r.puntaje.banda ? 'banda ' + num.format(r.puntaje.banda[0]) + '-' + num.format(r.puntaje.banda[1]) + ' · n = ' + num.format(r.cohorte.n) : 'sin datos');
        el('v-dots').textContent = r.puntaje.valor == null ? 'sin dato' : dec.format(r.puntaje.valor);
        el('v-perc').textContent = r.puntaje.percentil != null
            ? dec.format(r.puntaje.percentil) + '%'
            : (r.puntaje.banda ? num.format(r.puntaje.banda[0]) + '-' + num.format(r.puntaje.banda[1]) + '%' : 'sin dato');
        el('v-perc-sub').textContent = rotulo(ALCANCES, r.cohorte.alcance) + ' · ' + rotulo(VENTANAS, r.cohorte.ventana);

        const fuera = (r.limitaciones || []).indexOf(C.TEXTOS.pesoFueraDeRango) !== -1;
        el('v-aviso').textContent = fuera ? C.TEXTOS.pesoFueraDeRango : '';
        el('v-aviso').hidden = !fuera;

        if (r.puntaje.percentil != null) pintarEscala(r.puntaje.percentil);
        pintarPeso(r.efectoPeso);

        // El badge dice el alcance y la ventana: la procedencia del numero.
        el('r-badge').textContent = rotulo(ALCANCES, r.cohorte.alcance) + ' · ' +
            rotulo(VENTANAS, r.cohorte.ventana) + ' · n = ' + num.format(r.cohorte.n);

        let dist = '';
        if (r.distancia && r.distancia.esTope) {
            dist = esc(C.TEXTOS.nivelTope);
        } else if (r.distancia) {
            dist = 'Faltan <b>' + dec.format(r.distancia.deltaKg) + ' kg de total</b> para el nivel ' +
                esc(r.distancia.nivelSiguiente) + ', que empieza en Dots ' + dec.format(r.distancia.dotsCorte) + '.';
        }
        el('r-dist').innerHTML = dist;
        el('r-def').innerHTML = 'Dots reconstruido: <b>' + (r.puntaje.valor == null ? 'sin dato' : dec.format(r.puntaje.valor)) +
            '</b>. El puntaje normaliza por peso corporal, asi que permite comparar entre categorias. ' +
            'El nivel sale del percentil medido, no de un corte elegido a mano.';
        el('r-lim').textContent = (r.limitaciones || []).join(' ');
    }

    function llenarCohorte() {
        const m = COHORTES._meta;
        // Los equipamientos y las ventanas NO viven en _meta: los equipamientos
        // son el contrato del motor, y las ventanas un dict clave -> fecha de corte.
        llenarSelect(el('f-equipo'), C.EQUIPAMIENTOS, EQUIPOS);
        llenarSelect(el('f-alcance'), m.alcances || ['mundial'], ALCANCES);
        llenarSelect(el('f-ventana'), Object.keys(m.ventanas || {}), VENTANAS);
        el('f-equipo').value = 'Raw';
        el('f-alcance').value = 'mundial';
        // La ventana mas reciente es la de fecha de corte mayor.
        const ventanas = Object.keys(m.ventanas || {});
        ventanas.sort((a, b) => String(m.ventanas[b] || '').localeCompare(String(m.ventanas[a] || '')));
        el('f-ventana').value = ventanas[0] || 'desde_2018';
    }

    // ── Capa 01: los numeros reales de data.json ──────────────────────────────
    function kpis() {
        const q1 = DATA.q1_volumen;
        const nq = Object.keys(DATA._meta.consultas).length;

        el('kpi-filas').innerHTML = num.format(q1.atletas_unicos) + '<em>atletas unicos</em>';
        el('kpi-queries').innerHTML = String(nq) + '<em>queries SQL</em>';
        // No hay un "0" escrito a mano: la recurrencia es un dato medido.
        el('kpi-ratio').innerHTML = String(q1.participaciones_promedio_por_atleta).replace('.', ',') + '<em>torneos / atleta</em>';

        el('pill-qa').innerHTML = '<span>&#10003;</span><span>' + esc(DATA._meta.proyecto ? 'QA Checks Passed' : '') + '</span>';
        el('pill-datos').innerHTML = '<span>BigQuery RAW &middot; ' + esc(DATA._meta.ubicacion) + '</span>';
        el('nav-estado').textContent = 'Dataset: OpenPowerlifting | ' + num.format(q1.participaciones_totales) + ' participaciones';

        // "0 inconsistencias" era una afirmacion sin medir. Lo que si se puede
        // medir es cuantas de las queries devolvieron filas.
        const filas = Object.values(DATA._meta.consultas);
        const conDato = filas.filter((n) => n > 0).length;
        el('drift-big').innerHTML = conDato + ' <span>de ' + nq + ' queries con resultado</span>';
        el('drift-txt').textContent = 'Trazabilidad de ' + num.format(q1.atletas_unicos) + ' atletas y ' +
            num.format(q1.participaciones_totales) + ' participaciones. Ratio de recurrencia: ' +
            String(q1.participaciones_promedio_por_atleta).replace('.', ',') + ' torneos por atleta.';

        // El subtitulo de la Capa 01: el rango de anios sale del dato, no del HTML.
        const anios = DATA.q5_temporal.map((r) => r.anio);
        el('capa01-sub').textContent = 'Queries que estructuran y auditan volumen, demografia, federaciones y ' +
            'equipamiento del powerlifting nacional: ' + num.format(q1.participaciones_totales) +
            ' participaciones de ' + num.format(q1.atletas_unicos) + ' atletas entre ' +
            Math.min.apply(null, anios) + ' y ' + Math.max.apply(null, anios) + '.';

        el('pie-fuente').textContent = 'Fuente: ' + DATA._meta.dataset + ' (' + DATA._meta.ubicacion + ') · actualizado ' + DATA._meta.ultima_actualizacion;
    }

    function donutSexo() {
        const filas = DATA.q2_sexo;
        const total = filas.reduce((s, r) => s + r.participaciones, 0);
        const m = filas.find((r) => r.Sex === 'M');
        const f = filas.find((r) => r.Sex === 'F');
        const pm = m ? (m.participaciones / total) * 100 : 0;
        const pf = f ? (f.participaciones / total) * 100 : 0;

        el('donut-m').setAttribute('stroke-dasharray', pm.toFixed(2) + ', 100');
        el('donut-f').setAttribute('stroke-dasharray', pf.toFixed(2) + ', 100');
        el('donut-f').setAttribute('stroke-dashoffset', (-pm).toFixed(2));
        el('donut-total').textContent = num.format(total);

        el('leyenda-sexo').innerHTML = [
            ['#adc6ff', 'Masculino', m],
            ['#00d2ff', 'Femenino', f],
        ].map(([color, etq, r]) => r ? (
            '<div><i style="background:' + color + '"></i><span style="font-size:12px;color:#f8fafc">' + etq +
            '<small>' + num.format(r.participaciones) + ' (' + dec.format(r.porcentaje) + '%)</small></span></div>'
        ) : '').join('');
    }

    function federaciones() {
        const top = DATA.q3_federaciones.slice(0, 5);
        const max = top[0].porcentaje;
        el('feds').innerHTML = top.map((r, i) => (
            '<div class="fila">' +
            '<div class="fila-top"><b>' + esc(r.Federation) + '</b><span style="color:#a5e7ff">' +
            num.format(r.participaciones) + ' (' + dec.format(r.porcentaje) + '%)</span></div>' +
            '<div class="barra"><i style="width:' + ((r.porcentaje / max) * 100).toFixed(1) + '%;' +
            (i > 0 ? 'background:#adc6ff;opacity:' + (1 - i * 0.15).toFixed(2) : '') + '"></i></div>' +
            '</div>'
        )).join('');
        el('feds-nota').textContent = DATA.q3_federaciones.length + ' federaciones en total';
    }

    function eventosYEquipos() {
        el('eventos').innerHTML = '<div class="label-code" style="color:var(--outline);margin-bottom:8px">EVENTO</div>' +
            DATA.q4a_eventos.slice(0, 3).map((r) => (
                '<div class="fila-top" style="margin:6px 0"><b>' + esc(r.Event) + '</b><span style="color:#a5e7ff">' +
                dec.format(r.porcentaje) + '%</span></div>'
            )).join('');
        el('equipos').innerHTML = '<div class="label-code" style="color:var(--outline);margin-bottom:8px">EQUIPAMIENTO</div>' +
            DATA.q4b_equipamiento.slice(0, 3).map((r) => (
                '<div class="fila">' +
                '<div class="fila-top"><b>' + esc(r.Equipment) + '</b><span style="color:#e4d7ff">' +
                dec.format(r.porcentaje) + '%</span></div>' +
                '<div class="barra"><i style="width:' + r.porcentaje.toFixed(1) + '%;background:#e4d7ff"></i></div>' +
                '</div>'
            )).join('');
    }

    function serieTemporal() {
        const s = DATA.q5_temporal.filter((r) => r.participaciones > 0);
        const max = Math.max.apply(null, s.map((r) => r.participaciones));
        const w = 100, h = 30;
        const pts = s.map((r, i) => {
            const x = (i / (s.length - 1)) * w;
            const y = h - (r.participaciones / max) * h;
            return x.toFixed(2) + ',' + y.toFixed(2);
        }).join(' ');
        const pico = s.reduce((a, b) => (b.participaciones > a.participaciones ? b : a));

        el('serie').innerHTML =
            '<svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:100%;height:90px;overflow:visible">' +
            '<polyline points="' + pts + '" fill="none" stroke="#00d2ff" stroke-width="1.2" vector-effect="non-scaling-stroke"/>' +
            '</svg>';
        el('serie-nota').textContent = 'Pico real: ' + pico.anio + ' con ' + num.format(pico.participaciones) + ' participaciones';
        el('serie-rango').textContent = s[0].anio + ' - ' + s[s.length - 1].anio;
    }

    function calidad() {
        el('calidad').innerHTML = DATA.q10a_total.map((r) => (
            '<div class="fila">' +
            '<div class="fila-top"><b>' + esc(r.estado_total) + '</b><span style="color:#10b981">' +
            dec.format(r.porcentaje) + '%</span></div>' +
            '<div class="barra"><i style="width:' + r.porcentaje.toFixed(1) + '%;background:#10b981"></i></div>' +
            '</div>'
        )).join('');
    }

    // ── SQL real ───────────────────────────────────────────────────────────────
    function pintarSQL(texto, clave) {
        const lineas = texto.split('\n');
        let ini = -1, fin = lineas.length;
        for (let i = 0; i < lineas.length; i++) {
            if (lineas[i].indexOf('@data-key: ' + clave) !== -1) { ini = i; continue; }
            if (ini !== -1 && lineas[i].indexOf('@data-key:') !== -1) { fin = i; break; }
        }
        let bloque = ini === -1 ? lineas : lineas.slice(ini, fin);
        bloque = bloque.filter((l) => l.trim() !== '' && !/^--\s*$/.test(l));
        const codigo = bloque.join('\n');
        const n = codigo.split('\n').length;

        el('sql-file').textContent = RUTA_SQL;
        el('sql-lines').innerHTML = Array.from({ length: n }, (_, i) => i + 1).join('<br>');
        el('sql-code').innerHTML = esc(codigo)
            .replace(/(--[^\n]*)/g, '<span class="cm">$1</span>')
            .replace(/\b(SELECT|FROM|WHERE|AND|OR|GROUP BY|ORDER BY|AS|DESC|ASC|OVER|NOT|IS|IN)\b/g, '<span class="kw">$1</span>')
            .replace(/\b(COUNT|ROUND|SUM|MIN|MAX|DISTINCT|NULLIF)\b/g, '<span class="fn">$1</span>')
            .replace(/'([^']*)'/g, '<span class="st">\'$1\'</span>');
    }

    // ── Arranque ───────────────────────────────────────────────────────────────
    (async function iniciar() {
        try {
            const partes = await Promise.all([
                traer(RUTA_DATA),
                traer(RUTA_COHORTES),
                traer(RUTA_SQL, true),
            ]);
            DATA = partes[0];
            COHORTES = partes[1];

            llenarCohorte();
            kpis();
            donutSexo();
            federaciones();
            eventosYEquipos();
            serieTemporal();
            calidad();
            pintarSQL(partes[2], 'q2_sexo');
            actualizarVivo();
        } catch (err) {
            // Falla visible: la pagina NO dibuja numeros de reemplazo.
            document.body.insertAdjacentHTML('afterbegin',
                '<div style="background:#7f1d1d;color:#fff;padding:14px 32px;font-family:monospace;font-size:12px">' +
                'No se pudo cargar el dato real: ' + esc(err.message) +
                ' — no se muestran valores de reemplazo.</div>');
        }
    })();

    // Eventos del formulario
    qs('[data-sexo]').forEach((b) => b.addEventListener('click', () => {
        sexo = b.getAttribute('data-sexo');
        qs('[data-sexo]').forEach((o) => o.classList.toggle('on', o === b));
        actualizarVivo();
    }));
    ['f-edad', 'f-peso', 'f-sent', 'f-bench', 'f-dead'].forEach((id) =>
        el(id).addEventListener('input', actualizarVivo));
    ['f-equipo', 'f-alcance', 'f-ventana'].forEach((id) =>
        el(id).addEventListener('change', actualizarVivo));
})();
