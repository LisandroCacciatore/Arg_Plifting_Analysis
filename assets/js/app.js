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
    let data;
    try {
        const res = await fetch('assets/data/data.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        console.log('✅ data.json cargado correctamente');
        ocultarBannerMuestra();
    } catch (err) {
        console.warn('⚠️ No se pudo cargar data.json. Usando datos de muestra.', err);
        data = getDatosMuestra();
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
        false, ['#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#8b5cf6', '#475569']);
    renderDonut('chartTotal', data.q10a_total, 'estado_total', 'porcentaje',
        false, ['#3b82f6', '#475569', '#ef4444']);

    renderTemporal(data.q5_temporal);
});


// =============================================================================
// KPIs — Q1
// =============================================================================
function renderizarKPIs(q1) {
    if (!q1) return;
    setKPI('kpiAtletas', formatNum(q1.atletas_unicos));
    setKPI('kpiParticipaciones', formatNum(q1.participaciones_totales));
    setKPI('kpiPromedio', q1.participaciones_promedio_por_atleta.toFixed(2));
}

function setKPI(id, valor) {
    const el = document.getElementById(id);
    if (el) animarContador(el, valor);
}

function animarContador(el, valorFinal) {
    const esDecimal = valorFinal.toString().includes('.');
    if (esDecimal) { el.textContent = valorFinal; return; }

    const numFinal = parseInt(valorFinal.replace(/\D/g, ''), 10);
    const duracion = 1200;
    const inicio = performance.now();

    const tick = (ahora) => {
        const progreso = Math.min((ahora - inicio) / duracion, 1);
        const eased = 1 - Math.pow(1 - progreso, 3);
        el.textContent = formatNum(Math.floor(eased * numFinal));
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

    const colores = { 'Edad conocida': '#22c55e', 'Solo AgeClass disponible': '#f59e0b', 'Sin información etaria': '#ef4444' };

    edad.forEach(d => {
        const color = colores[d.estado_edad] || '#64748b';
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
// Ocultar badge de muestra si los datos son reales
// =============================================================================
function ocultarBannerMuestra() {
    document.querySelectorAll('.sample-badge').forEach(el => el.remove());
}


// =============================================================================
// Gráfico genérico tipo Doughnut
// =============================================================================
const PALETA_DEFAULT = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#475569'];

function renderDonut(canvasId, datos, campoLabel, campoPct, esBarHorizontal = false, paleta = PALETA_DEFAULT) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !datos || !datos.length) return;

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
// Gráfico temporal — Q5 (Line chart con área)
// =============================================================================
function renderTemporal(filas) {
    const canvas = document.getElementById('chartTiempo');
    if (!canvas || !filas || !filas.length) return;

    const ctx = canvas.getContext('2d');
    const años = filas.map(f => f.anio);
    const part = filas.map(f => f.participaciones);
    const atls = filas.map(f => f.atletas_unicos);

    const areaGrad = ctx.createLinearGradient(0, 0, 0, 260);
    areaGrad.addColorStop(0, 'rgba(59,130,246,0.35)');
    areaGrad.addColorStop(1, 'rgba(59,130,246,0)');

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: años,
            datasets: [
                {
                    label: 'Participaciones',
                    data: part,
                    borderColor: '#3b82f6',
                    backgroundColor: areaGrad,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#3b82f6'
                },
                {
                    label: 'Atletas únicos',
                    data: atls,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    fill: false,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    borderDash: [5, 3],
                    pointBackgroundColor: '#8b5cf6'
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


// =============================================================================
// Utilidades
// =============================================================================
function formatNum(n) {
    return Number(n).toLocaleString('es-AR');
}


// =============================================================================
// Datos de muestra — fallback mientras data.json no existe
// (Reemplazados automáticamente cuando data.json carga correctamente)
// =============================================================================
function getDatosMuestra() {
    return {
        _meta: { ultima_actualizacion: 'datos de muestra' },
        q1_volumen: { atletas_unicos: 3847, participaciones_totales: 11203, participaciones_promedio_por_atleta: 2.91 },
        q2_sexo: [
            { Sex: 'M', participaciones: 7102, porcentaje: 63.4 },
            { Sex: 'F', participaciones: 4101, porcentaje: 36.6 }
        ],
        q3_federaciones: [
            { Federation: 'APLE', participaciones: 4279, porcentaje: 38.2, atletas_unicos: 1820 },
            { Federation: 'WAP', participaciones: 2767, porcentaje: 24.7, atletas_unicos: 1150 },
            { Federation: 'IPF (APF)', participaciones: 2117, porcentaje: 18.9, atletas_unicos: 870 },
            { Federation: 'WPC', participaciones: 1154, porcentaje: 10.3, atletas_unicos: 480 },
            { Federation: 'Otras', participaciones: 886, porcentaje: 7.9, atletas_unicos: 390 }
        ],
        q4a_eventos: [
            { Event: 'SBD', participaciones: 7976, porcentaje: 71.2 },
            { Event: 'B', participaciones: 1658, porcentaje: 14.8 },
            { Event: 'S', participaciones: 818, porcentaje: 7.3 },
            { Event: 'BD', participaciones: 515, porcentaje: 4.6 },
            { Event: 'SD', participaciones: 235, porcentaje: 2.1 }
        ],
        q4b_equipamiento: [
            { Equipment: 'Raw', participaciones: 7663, porcentaje: 68.4 },
            { Equipment: 'Single-ply', participaciones: 1815, porcentaje: 16.2 },
            { Equipment: 'Wraps', participaciones: 1221, porcentaje: 10.9 },
            { Equipment: 'Multi-ply', participaciones: 504, porcentaje: 4.5 }
        ],
        q5_temporal: [
            { anio: 2012, participaciones: 148, atletas_unicos: 95, federaciones_activas: 2 },
            { anio: 2013, participaciones: 210, atletas_unicos: 140, federaciones_activas: 2 },
            { anio: 2014, participaciones: 287, atletas_unicos: 190, federaciones_activas: 3 },
            { anio: 2015, participaciones: 395, atletas_unicos: 260, federaciones_activas: 3 },
            { anio: 2016, participaciones: 520, atletas_unicos: 340, federaciones_activas: 4 },
            { anio: 2017, participaciones: 680, atletas_unicos: 440, federaciones_activas: 4 },
            { anio: 2018, participaciones: 890, atletas_unicos: 580, federaciones_activas: 5 },
            { anio: 2019, participaciones: 1120, atletas_unicos: 710, federaciones_activas: 5 },
            { anio: 2020, participaciones: 430, atletas_unicos: 290, federaciones_activas: 3 },
            { anio: 2021, participaciones: 760, atletas_unicos: 490, federaciones_activas: 4 },
            { anio: 2022, participaciones: 1080, atletas_unicos: 690, federaciones_activas: 5 },
            { anio: 2023, participaciones: 1350, atletas_unicos: 860, federaciones_activas: 6 },
            { anio: 2024, participaciones: 1510, atletas_unicos: 960, federaciones_activas: 6 },
            { anio: 2025, participaciones: 1420, atletas_unicos: 905, federaciones_activas: 6 }
        ],
        q7b_edad: [
            { estado_edad: 'Edad conocida', participaciones: 6878, porcentaje: 61.4 },
            { estado_edad: 'Solo AgeClass disponible', participaciones: 3002, porcentaje: 26.8 },
            { estado_edad: 'Sin información etaria', participaciones: 1323, porcentaje: 11.8 }
        ],
        q8b_ambito: [
            { ambito_competencia: 'Nacional', participaciones: 9198, porcentaje: 82.1 },
            { ambito_competencia: 'Internacional', participaciones: 1602, porcentaje: 14.3 },
            { ambito_competencia: 'No especificado', participaciones: 403, porcentaje: 3.6 }
        ],
        q9b_place: [
            { tipo_resultado: 'Posición válida', participaciones: 9881, porcentaje: 88.2 },
            { tipo_resultado: 'Descalificado', participaciones: 605, porcentaje: 5.4 },
            { tipo_resultado: 'No presentado', participaciones: 426, porcentaje: 3.8 },
            { tipo_resultado: 'Invitado/Guest', participaciones: 190, porcentaje: 1.7 },
            { tipo_resultado: 'Doping descalificado', participaciones: 101, porcentaje: 0.9 }
        ],
        q10a_total: [
            { estado_total: 'Total reportado', participaciones: 9478, porcentaje: 84.6 },
            { estado_total: 'Total no reportado', participaciones: 1378, porcentaje: 12.3 },
            { estado_total: 'Total = 0 o inválido', participaciones: 347, porcentaje: 3.1 }
        ]
    };
}