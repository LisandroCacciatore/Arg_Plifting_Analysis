// =============================================================================
// app.js — Powerlifting Argentina Data Analysis
// Lee data.json y renderiza todos los gráficos del dashboard Capa 01
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {

    // ── 1. Navegación ──────────────────────────────────────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        navbar.style.boxShadow = window.scrollY > 50
            ? '0 4px 6px -1px rgba(0,0,0,0.1)'
            : 'none';
        navbar.style.padding = window.scrollY > 50 ? '0.75rem 0' : '1rem 0';
    });

    // ── 2. Cargar datos ────────────────────────────────────────────────────────
    // Sin datos reales NO se dibuja nada.
    //
    // Antes, si el fetch fallaba, el dashboard caía a getDatosMuestra() y
    // mostraba valores inventados con el mismo aspecto que los reales. Eso es
    // fabricar, y es exactamente el defecto que este proyecto existe para
    // prevenir. Una falla tiene que verse como falla, no como un dato.
    let data;
    try {
        const res = await fetch('assets/data/data.json');
        if (!res.ok) throw new Error(`HTTP ${res.status} al pedir data.json`);
        data = await res.json();
        console.log('✅ data.json cargado correctamente');
    } catch (err) {
        console.error('❌ No se pudo cargar data.json. No se dibuja nada: '
            + 'mostrar datos de reemplazo sería fabricar.', err);
        mostrarErrorDeCarga(err);
        return;
    }

    actualizarMeta(data._meta);
    renderizarKPIs(data.q1_volumen);
    renderizarFederaciones(data.q3_federaciones);
    renderizarEdad(data.q7b_edad);

    // Charts
    renderDonut('chartSexo', data.q2_sexo, 'Sex', 'porcentaje');
    renderDonut('chartEventos', data.q4a_eventos, 'Event', 'porcentaje', true);
    renderDonut('chartEquipo', data.q4b_equipamiento, 'Equipment', 'porcentaje');
    renderDonut('chartAmbito', data.q8b_ambito, 'ambito_competencia', 'porcentaje');
    renderDonut('chartPlace', data.q9b_place, 'tipo_resultado', 'porcentaje',
        false, ['#10b981', '#ef4444', '#f59e0b', '#00d2ff', '#adc6ff', '#3c494e']);
    renderDonut('chartTotal', data.q10a_total, 'estado_total', 'porcentaje',
        false, ['#00d2ff', '#3c494e', '#ef4444']);

    inicializarTemporal(data.q5_temporal);
});


// =============================================================================
// KPIs — Q1
// =============================================================================
function renderizarKPIs(q1) {
    if (!q1) return;
    setKPI('kpiAtletas', q1.atletas_unicos, 0);
    setKPI('kpiParticipaciones', q1.participaciones_totales, 0);
    setKPI('kpiPromedio', q1.participaciones_promedio_por_atleta, 2);
}

function setKPI(id, numero, decimales = 0) {
    const el = document.getElementById(id);
    if (el) animarContador(el, numero, decimales);
}

// El contador recibe un NÚMERO y cuántos decimales mostrar, nunca un string ya
// formateado. Antes decidía si el valor era decimal mirando si el string
// contenía un punto — pero en es-AR el separador de MILES es el punto, así que
// 2521 formateado como "2.521" se leía como decimal y el contador salía por el
// camino corto: nunca animaba. El formato se aplica en el último paso, no antes.
function animarContador(el, numero, decimales = 0) {
    const destino = Number(numero) || 0;
    const duracion = 1200;
    const inicio = performance.now();

    const tick = (ahora) => {
        const progreso = Math.min((ahora - inicio) / duracion, 1);
        const eased = 1 - Math.pow(1 - progreso, 3);
        el.textContent = formatearNumero(eased * destino, decimales);
        if (progreso < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}


// =============================================================================
// Federaciones — Q3 (barras HTML)
// =============================================================================
function renderizarFederaciones(feds) {
    const container = document.getElementById('fedList');
    if (!container || !feds) return;
    container.innerHTML = '';

    // Mostrar top 6
    feds.slice(0, 6).forEach(f => {
        container.innerHTML += `
        <div class="bar-item">
            <div class="bar-meta">
                <span class="bar-name">${f.Federation}</span>
                <span class="bar-pct">${f.porcentaje}%</span>
            </div>
            <div class="bar-track">
                <div class="bar-fill" style="width:0%" data-target="${f.porcentaje}"></div>
            </div>
        </div>`;
    });

    // Animar barras con IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                container.querySelectorAll('.bar-fill').forEach(bar => {
                    bar.style.width = bar.dataset.target + '%';
                });
                observer.disconnect();
            }
        });
    }, { threshold: 0.3 });
    observer.observe(container);
}


// =============================================================================
// Estado etario — Q7b (status grid)
// =============================================================================
function renderizarEdad(edad) {
    const container = document.getElementById('edadStatus');
    if (!container || !edad) return;
    container.innerHTML = '';

    const colores = { 'Edad conocida': '#10b981', 'Solo AgeClass disponible': '#f59e0b', 'Sin información etaria': '#ef4444' };

    edad.forEach(d => {
        const color = colores[d.estado_edad] || '#859399';
        container.innerHTML += `
        <div class="status-item">
            <div class="status-dot" style="background:${color}"></div>
            <div class="status-text">
                <span class="status-name">${d.estado_edad}</span>
                <span class="status-val">${d.porcentaje}%</span>
            </div>
        </div>`;
    });
}


// =============================================================================
// Meta — fecha de actualización
// =============================================================================
function actualizarMeta(meta) {
    const el = document.getElementById('dataFecha');
    if (el && meta?.ultima_actualizacion) {
        el.textContent = meta.ultima_actualizacion;
    }
}


// =============================================================================
// Estado de error de carga
// =============================================================================
// Si no hay datos reales, no hay dashboard: se marca el <body>, se muestra un
// banner con el motivo y el CSS oculta los bloques que solo tienen sentido con
// datos. Nada de números de reemplazo.
function mostrarErrorDeCarga(err) {
    document.body.classList.add('sin-datos');

    const banner = document.getElementById('bannerError');
    if (!banner) return;
    banner.hidden = false;

    const detalle = document.getElementById('bannerErrorDetalle');
    if (detalle) detalle.textContent = String((err && err.message) || err);
}


// =============================================================================
// Gráfico genérico tipo Doughnut
// =============================================================================
const PALETA_DEFAULT = ['#00d2ff', '#adc6ff', '#00d2ff', '#10b981', '#f59e0b', '#ef4444', '#3c494e'];

// Chart.js v4 lanza error si se crea un segundo gráfico sobre un canvas ya
// usado, y ese error aborta TODO el render. Destruir antes de crear hace que
// el render sea idempotente: se puede volver a llamar sin romper la página.
function destruirGrafico(canvas) {
    if (!canvas || !window.Chart || typeof Chart.getChart !== 'function') return;
    const previo = Chart.getChart(canvas);
    if (previo) previo.destroy();
}

function renderDonut(canvasId, datos, campoLabel, campoPct, esBarHorizontal = false, paleta = PALETA_DEFAULT) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !datos || !datos.length) return;
    destruirGrafico(canvas);

    const labels = datos.map(d => d[campoLabel]);
    const values = datos.map(d => d[campoPct]);
    const colors = paleta.slice(0, datos.length);

    if (esBarHorizontal) {
        new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + '%' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
        return;
    }

    new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: 'transparent',
                hoverOffset: 8
            }]
        },
        options: {
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } }
            }
        }
    });
}


// =============================================================================
// Evolución temporal — Q5
//   · gráfico unificado (participaciones + atletas únicos)
//   · un gráfico por métrica
//   · filtro de rango de años
// =============================================================================
const ANIO_DESDE_DEFAULT = 2012;

let temporalCompleto = [];
let temporalDesde = ANIO_DESDE_DEFAULT;

function inicializarTemporal(filas) {
    if (!filas || !filas.length) return;
    temporalCompleto = filas;

    const botones = document.querySelectorAll('#filtroTemporal .filtro-btn');
    botones.forEach(btn => {
        btn.addEventListener('click', () => {
            botones.forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            aplicarFiltroTemporal(Number(btn.dataset.desde));
        });
    });

    aplicarFiltroTemporal(ANIO_DESDE_DEFAULT);
}

// Expuesta como global para poder testear el filtro sin eventos del DOM.
function aplicarFiltroTemporal(desde) {
    temporalDesde = Number(desde);
    const visibles = temporalCompleto.filter(f => f.anio >= temporalDesde);

    const nota = document.getElementById('filtroNota');
    if (nota) {
        const primero = visibles[0]?.anio ?? '—';
        const ultimo = visibles[visibles.length - 1]?.anio ?? '—';
        nota.textContent = `mostrando ${visibles.length} de ${temporalCompleto.length} años (${primero}–${ultimo})`;
    }

    renderTemporal(visibles);
    renderTemporalMetrica('chartTiempoParticipaciones', visibles,
        'participaciones', 'Participaciones', '#00d2ff');
    renderTemporalMetrica('chartTiempoAtletas', visibles,
        'atletas_unicos', 'Atletas únicos', '#adc6ff');
    renderTemporalMetrica('chartTiempoFederaciones', visibles,
        'federaciones_activas', 'Federaciones activas', '#00d2ff');
}

// Gráfico unificado: participaciones + atletas únicos
function renderTemporal(filas) {
    const canvas = document.getElementById('chartTiempo');
    if (!canvas || !filas || !filas.length) return;
    destruirGrafico(canvas);

    const ctx = canvas.getContext('2d');
    const areaGrad = ctx.createLinearGradient(0, 0, 0, 260);
    areaGrad.addColorStop(0, 'rgba(0, 210, 255,0.35)');
    areaGrad.addColorStop(1, 'rgba(0, 210, 255,0)');

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: filas.map(f => f.anio),
            datasets: [
                {
                    label: 'Participaciones',
                    data: filas.map(f => f.participaciones),
                    borderColor: '#00d2ff',
                    backgroundColor: areaGrad,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#00d2ff'
                },
                {
                    label: 'Atletas únicos',
                    data: filas.map(f => f.atletas_unicos),
                    borderColor: '#adc6ff',
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    fill: false,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    borderDash: [5, 3],
                    pointBackgroundColor: '#adc6ff'
                }
            ]
        },
        options: {
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}

// Gráfico de una sola métrica (vista separada)
function renderTemporalMetrica(canvasId, filas, campo, etiqueta, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !filas || !filas.length) return;
    destruirGrafico(canvas);

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '00');

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: filas.map(f => f.anio),
            datasets: [{
                label: etiqueta,
                data: filas.map(f => f[campo]),
                borderColor: color,
                backgroundColor: grad,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: color
            }]
        },
        options: {
            plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}


// =============================================================================
// Utilidades
// =============================================================================
// Formato numérico con las convenciones de es-AR: miles con punto, decimales
// con coma. Se usa una sola función para que un número y su formato no se
// mezclen (el bug del contador venía de confundir ambos).
function formatearNumero(n, decimales = 0) {
    return Number(n).toLocaleString('es-AR', {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
    });
}
