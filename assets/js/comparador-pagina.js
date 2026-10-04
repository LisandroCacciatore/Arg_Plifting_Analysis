/**
 * Cableado de comparador.html.
 *
 * Separa el motor (comparador.js, puro y testeable) de la manipulación del DOM.
 * Regla de copy: los strings que ve el usuario van SIN tildes ni ñ, igual que el
 * resto del sitio. Los comentarios son notas y sí las llevan.
 *
 * Si cohortes.json no carga, la página NO muestra nada: ni un resultado, ni un
 * valor de reemplazo. Ver docs/03_Arquitectura/02_Fase_02/01_Arquitectura_Capa02.md.
 */
'use strict';

(function () {
  const C = globalThis.Comparador;
  const RUTA_DATOS = 'assets/data/cohortes.json';

  const ETIQUETAS = {
    alcance: { mundial: 'Mundial', nacional: 'Argentina' },
    ventana: { historico: 'Todo el historico', desde_2018: 'Desde 2018' },
    sexo: { M: 'Masculino', F: 'Femenino' },
    levantamiento: { sentadilla: 'Sentadilla', banco: 'Banco', despegue: 'Despegue' },
    formato: {
      Raw: 'Raw (sin equipo)',
      Wraps: 'Wraps',
      'Single-ply': 'Single-ply',
      'Multi-ply': 'Multi-ply',
      Unlimited: 'Unlimited',
    },
    calidad: {
      firme: 'cohorte firme',
      acotada: 'cohorte acotada',
      banda: 'cohorte chica: se muestra una banda',
      sin_percentil: 'sin casos suficientes',
    },
  };

  const el = (id) => document.getElementById(id);
  const num = (v) => Number(v);

  const form = el('cmp-form');
  const selSexo = el('cmp-sexo');
  const inpEdad = el('cmp-edad');
  const inpPeso = el('cmp-peso');
  const selEquipo = el('cmp-equipo');
  const selAlcance = el('cmp-alcance');
  const selVentana = el('cmp-ventana');
  const inpSentadilla = el('cmp-sentadilla');
  const inpBanco = el('cmp-banco');
  const inpDespegue = el('cmp-despegue');
  const inpTotal = el('cmp-total');
  const cajaError = el('cmp-error');
  const listaError = el('cmp-error-lista');
  const cajaRes = el('cmp-res');
  const estado = el('cmp-estado');
  const pie = el('cmp-pie');

  // Medidor vivo
  const cajaVivo = el('cmp-vivo');
  const vivoNivel = el('cmp-vivo-nivel');
  const vivoNivelSub = el('cmp-vivo-nivel-sub');
  const vivoDots = el('cmp-vivo-dots');
  const vivoPerc = el('cmp-vivo-perc');
  const vivoPercSub = el('cmp-vivo-perc-sub');
  const escalaMarca = el('cmp-escala-marca');
  const escalaEtq = el('cmp-escala-etq');
  const vivoAviso = el('cmp-vivo-aviso');
  const cajaPeso = el('cmp-peso-efecto');
  const pesoTit = el('cmp-peso-tit');
  const pesoFila = el('cmp-peso-fila');
  const pesoNota = el('cmp-peso-nota');

  let DATOS = null;
  let ultimoPerfil = null;

  // ── Utilidades de formato ──────────────────────────────────────────────────
  const fmt = (v, dec = 0) =>
    (v == null || !Number.isFinite(v)) ? 'sin dato'
      : v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const kg = (v) => `${fmt(v, 1)} kg`;
  const pct = (v, dec = 1) => (v == null ? 'sin dato' : `${fmt(v, dec)}%`);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function barra(p) {
    const ancho = p == null ? 0 : Math.max(0, Math.min(100, p));
    return `<div class="cmp-barra"><i style="width:${ancho}%"></i></div>`;
  }

  function badgeN(n, calidad) {
    const fina = calidad === 'banda' || calidad === 'sin_percentil' ? ' fina' : '';
    return `<span class="cmp-n${fina}">n = ${fmt(n)}</span>`;
  }

  // ── Arranque ───────────────────────────────────────────────────────────────
  function mostrarError(mensajes) {
    listaError.innerHTML = mensajes.map((m) => `<li>${esc(m)}</li>`).join('');
    cajaError.hidden = false;
    cajaRes.hidden = true;
  }

  function limpiarError() {
    cajaError.hidden = true;
    listaError.innerHTML = '';
  }

  function llenarSelect(sel, valores, etiquetas) {
    sel.innerHTML = valores
      .map((v) => `<option value="${esc(v)}">${esc(etiquetas[v] || v)}</option>`)
      .join('');
  }

  async function cargarDatos() {
    let resp;
    try {
      resp = await fetch(RUTA_DATOS);
    } catch (e) {
      throw new Error('no se pudo leer ' + RUTA_DATOS);
    }
    if (!resp.ok) throw new Error(`${RUTA_DATOS} respondio ${resp.status}`);
    const datos = await resp.json();
    if (!datos || !datos.celdas || !datos.puntaje || !datos._meta) {
      throw new Error(`${RUTA_DATOS} no tiene la forma esperada`);
    }
    return datos;
  }

  function inicializarControles() {
    const meta = DATOS._meta;
    llenarSelect(selEquipo, C.EQUIPAMIENTOS, ETIQUETAS.formato);
    llenarSelect(selAlcance, meta.alcances || ['mundial'], ETIQUETAS.alcance);
    llenarSelect(selVentana, Object.keys(meta.ventanas || {}), ETIQUETAS.ventana);

    // La ventana mas reciente primero: es la comparacion mas defendible.
    const ventanas = Object.keys(meta.ventanas || {});
    const masReciente = ventanas
      .slice()
      .sort((a, b) => (meta.ventanas[b] || '').localeCompare(meta.ventanas[a] || ''))[0];
    if (masReciente) selVentana.value = masReciente;

    // Todos los campos alimentan el medidor vivo y el total. Un solo handler para
    // que no puedan desincronizarse.
    alCambiar();
    for (const campo of [inpPeso, inpEdad, inpSentadilla, inpBanco, inpDespegue]) {
      campo.addEventListener('input', alCambiar);
    }
    for (const sel of [selSexo, selEquipo, selAlcance, selVentana]) {
      sel.addEventListener('change', alCambiar);
    }

    const t = DATOS._meta;
    pie.textContent =
      `Capa 02 · cohortes.json generado por ${t.generado_por || 'scripts/cohortes.py'} ` +
      `(${t.ultima_actualizacion || 'sin fecha'}) · dataset ${t.dataset || ''} · ` +
      `region ${t.ubicacion || ''}`;
  }

  function actualizarTotal() {
    const s = num(inpSentadilla.value);
    const b = num(inpBanco.value);
    const d = num(inpDespegue.value);
    const ok = [s, b, d].every((v) => Number.isFinite(v) && v > 0);
    inpTotal.value = ok ? fmt(s + b + d, 1) + ' kg' : '';
  }

  // ── Medidor vivo ──────────────────────────────────────────────────────────
  const rotulo = (mapa, v) => (mapa[v] || v);

  /** Coloca la marca en el percentil y resalta la banda que le toca. */
  function pintarEscala(percentil) {
    const p = Math.max(0, Math.min(100, percentil));
    escalaMarca.style.left = `calc(${p}% - 1px)`;
    const activo = C.nivelDe(percentil);
    escalaEtq.innerHTML = C.NIVELES
      .map((n, i) => `<span class="${activo && i === activo.indice ? 'on' : ''}">${esc(n.nombre)}</span>`)
      .join('');
  }

  /**
   * El efecto del peso: tres puntos con el mismo total.
   *
   * Es el hallazgo del proyecto puesto donde se ve. Si el motor devuelve null
   * —peso demasiado bajo para restarle 10 kg, o tabla ausente— el bloque se
   * oculta y NO se dibuja el punto que falta.
   */
  function pintarPeso(e) {
    if (!e) {
      cajaPeso.hidden = true;
      return;
    }
    pesoTit.textContent = 'El mismo total, distinto peso corporal';
    const punto = (p, esActual) => {
      const clase = p.delta == null ? '' : (p.delta > 0 ? 'positivo' : 'negativo');
      const delta = p.delta == null ? ''
        : `<div class="delta ${clase}">${p.delta > 0 ? '+' : ''}${fmt(p.delta, 1)}</div>`;
      return `<div class="cmp-peso-punto${esActual ? ' actual' : ''}">` +
        `<div class="kg">${fmt(p.peso, 1)} kg</div>` +
        `<div class="dots">${fmt(p.puntaje, 1)}</div>${delta}</div>`;
    };
    pesoFila.innerHTML = punto(e.menos) + punto(e.actual, true) + punto(e.mas);
    pesoNota.textContent = C.TEXTOS.efectoPesoNota;
    cajaPeso.hidden = false;
  }

  /**
   * Oculta el medidor vivo y el bloque del peso.
   *
   * Van juntos a proposito: si el medidor dice "sin datos" y el bloque del peso
   * sigue mostrando los numeros del perfil anterior, el panel se contradice.
   * Es una sola funcion justamente para que no haya dos lugares que se oculten
   * por caminos distintos (y dos tests distintos cubriendo el mismo hecho).
   */
  function ocultarMedidor() {
    cajaVivo.hidden = true;
    cajaPeso.hidden = true;
    vivoAviso.hidden = true;
  }

  /**
   * Repinta el medidor con el perfil tal como esta ahora.
   *
   * Corre el comparador completo en cada tecla. Es barato: todo vive en memoria,
   * no hay red ni BigQuery. Si la entrada todavia no alcanza para comparar
   * (un campo vacio mientras se tipea), el medidor se oculta en vez de mostrar
   * un numero a medio calcular.
   */
  function actualizarVivo() {
    if (!DATOS) {
      ocultarMedidor();
      return;
    }
    const r = C.comparar(DATOS, leerPerfil());
    if (!r.ok) {
      ocultarMedidor();
      return;
    }

    if (r.nivel) {
      vivoNivel.textContent = r.nivel.nombre;
      vivoNivelSub.textContent =
        `percentil ${fmt(r.nivel.percentil, 1)} · n = ${fmt(r.cohorte.n)}`;
    } else {
      vivoNivel.textContent = 'sin nivel';
      vivoNivelSub.textContent = r.puntaje.banda
        ? `banda ${fmt(r.puntaje.banda[0])}-${fmt(r.puntaje.banda[1])} · n = ${fmt(r.cohorte.n)}`
        : 'sin datos suficientes';
    }

    vivoDots.textContent = r.puntaje.valor == null ? 'sin dato' : fmt(r.puntaje.valor, 1);
    vivoPerc.textContent = r.puntaje.percentil != null
      ? `${fmt(r.puntaje.percentil, 1)}%`
      : (r.puntaje.banda ? `${fmt(r.puntaje.banda[0])}-${fmt(r.puntaje.banda[1])}%` : 'sin dato');
    vivoPercSub.textContent = r.cohorte.esLaElegida
      ? `${rotulo(ETIQUETAS.alcance, r.cohorte.alcance)} · ${rotulo(ETIQUETAS.ventana, r.cohorte.ventana)}`
      : `se uso ${rotulo(ETIQUETAS.alcance, r.cohorte.alcance)}: la pedida tenia pocos casos`;

    // Si el peso quedo fuera del rango con datos, el puntaje se calculo con el
    // extremo mas cercano de la tabla g — y el motor YA lo declara en sus
    // limitaciones. El medidor tiene que repetirlo: mostrar "Elite, percentil 100"
    // para un peso de 5 kg, sin la salvedad, seria afirmar un numero que no aplica
    // a ese peso. Ningun numero viaja sin su limitacion.
    //
    // Se lee de `limitaciones` y no de `efectoPeso.actual.clampeado` porque con un
    // peso muy bajo el efecto del peso es null (no hay peso - 10 que calcular), y
    // ahi el aviso se perderia justo cuando mas hace falta.
    const fueraDeRango = (r.limitaciones || []).includes(C.TEXTOS.pesoFueraDeRango);
    vivoAviso.textContent = fueraDeRango ? C.TEXTOS.pesoFueraDeRango : '';
    vivoAviso.hidden = !fueraDeRango;

    if (r.puntaje.percentil != null) pintarEscala(r.puntaje.percentil);
    pintarPeso(r.efectoPeso);
    cajaVivo.hidden = false;
  }

  /** Un solo handler para todos los campos: el medidor y el total se mueven juntos. */
  function alCambiar() {
    actualizarTotal();
    actualizarVivo();
  }

  function leerPerfil() {
    return {
      sexo: selSexo.value,
      edad: Math.trunc(num(inpEdad.value)),
      peso: num(inpPeso.value),
      equipamiento: selEquipo.value,
      alcance: selAlcance.value,
      ventana: selVentana.value,
      levantamientos: {
        sentadilla: num(inpSentadilla.value),
        banco: num(inpBanco.value),
        despegue: num(inpDespegue.value),
      },
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function bloqueCohorte(r) {
    const c = r.cohorte;
    const etq = (mapa, v) => (mapa[v] || v);
    const aviso = c.esLaElegida ? ''
      : '<div class="cmp-trace"><i class="fa-solid fa-circle-info"></i> La cohorte que se uso no es la ' +
        'elegida: la celda pedida no tiene datos suficientes. El detalle esta en las advertencias.</div>';

    return `
      <div class="cmp-bloque">
        <h3><i class="fa-solid fa-users"></i> La cohorte ${badgeN(c.n, c.calidad)}</h3>
        <div class="cmp-def">
          <strong>${esc(etq(ETIQUETAS.alcance, c.alcance))}</strong>
          &middot; ${esc(etq(ETIQUETAS.ventana, c.ventana))}
          &middot; ${esc(etq(ETIQUETAS.sexo, c.sexo))}
          &middot; clase de edad <strong>${esc(c.edadClase || 'sin clase')}</strong>
          &middot; ${esc(etq(ETIQUETAS.formato, c.equipamiento))}
          &middot; evento SBD<br>
          <span style="font-size:.78rem;color:#859399">${esc(ETIQUETAS.calidad[c.calidad] || c.calidad)}</span>
        </div>
        ${aviso}
      </div>`;
  }

  function bloquePuntaje(r) {
    const p = r.puntaje;

    // El nivel con nombre encabeza el bloque: es el win-state. Pero NUNCA va solo
    // — el percentil y el n van al lado, porque con quintos iguales "Elite" es el
    // 20% de arriba y la etiqueta no puede afirmar una rareza que no se midio.
    const nivelLinea = r.nivel
      ? `<div class="nivel-linea">
           <span class="nivel-nombre">${esc(r.nivel.nombre)}</span>
           ${badgeN(r.cohorte.n, r.cohorte.calidad)}
         </div>`
      : '';

    let distancia = '';
    if (r.distancia && r.distancia.esTope) {
      distancia = `<div class="nivel-dist">${esc(C.TEXTOS.nivelTope)}</div>`;
    } else if (r.distancia) {
      // En kg de TOTAL, no de un levantamiento puntual: decir "te faltan 9 kg de
      // banco" seria una prescripcion, y la capa no prescribe.
      distancia = `<div class="nivel-dist">Faltan <strong>${fmt(r.distancia.deltaKg, 1)} kg de total</strong>
        para el nivel ${esc(r.distancia.nivelSiguiente)}, que empieza en
        Dots ${fmt(r.distancia.dotsCorte, 1)} (percentil ${fmt(r.distancia.percentilCorte)}).</div>`;
    }

    const valor = p.percentil != null
      ? `<div class="cmp-perc">${fmt(p.percentil, 1)}<span class="u">de percentil</span></div>`
      : (p.banda
        ? `<div class="cmp-perc">${fmt(p.banda[0])} - ${fmt(p.banda[1])}<span class="u">de percentil (banda)</span></div>`
        : '<div class="cmp-perc" style="font-size:1.1rem">sin percentil</div>');

    return `
      <div class="cmp-bloque">
        <h3><i class="fa-solid fa-chart-simple"></i> Donde esta parado</h3>
        ${nivelLinea}
        ${valor}
        ${distancia}
        <div class="cmp-def" style="margin-top:.6rem">
          Dots reconstruido: <strong>${p.valor == null ? 'sin dato' : fmt(p.valor, 1)}</strong><br>
          <span style="font-size:.78rem;color:#859399">El puntaje normaliza por peso corporal, asi que
          permite comparar entre categorias. No se pide el Dots: se reconstruye desde el peso y el total.
          El nivel sale del percentil medido, no de un corte elegido a mano.</span>
        </div>
      </div>`;
  }

  function bloqueLevantamientos(r) {
    const filas = C.LEVANTAMIENTOS.map((lev) => {
      const d = r.levantamientos[lev];
      const p = d.percentil != null ? pct(d.percentil)
        : (d.banda ? `${fmt(d.banda[0])}-${fmt(d.banda[1])}%` : 'sin dato');
      const ancho = d.percentil != null ? d.percentil : (d.banda ? (d.banda[0] + d.banda[1]) / 2 : null);
      return `
        <tr>
          <td>${esc(ETIQUETAS.levantamiento[lev])}</td>
          <td class="num">${kg(d.kg)}</td>
          <td class="num">${fmt(d.share * 100, 1)}%</td>
          <td class="num">${p}</td>
          <td style="width:90px">${barra(ancho)}</td>
        </tr>`;
    }).join('');

    const ratios = `
      <tr><td colspan="5" style="border-top:none;padding-top:1rem;color:#859399;font-size:.78rem">
        Relaciones contra la sentadilla: banco <strong style="color:var(--text-primary)">${fmt(r.ratios.banco.valor, 3)}</strong>
        (${pct(r.ratios.banco.percentil)}) &middot;
        despegue <strong style="color:var(--text-primary)">${fmt(r.ratios.despegue.valor, 3)}</strong>
        (${pct(r.ratios.despegue.percentil)})
      </td></tr>`;

    return `
      <div class="cmp-bloque">
        <h3><i class="fa-solid fa-dumbbell"></i> Los tres levantamientos</h3>
        <table class="cmp-tabla">
          <thead>
            <tr><th>Levantamiento</th><th class="num">Peso</th><th class="num">Del total</th>
                <th class="num">Percentil</th><th></th></tr>
          </thead>
          <tbody>${filas}${ratios}</tbody>
        </table>
      </div>`;
  }

  function bloqueDiagnostico(r) {
    const atras = r.diagnostico.atrasado;
    const clase = atras ? 'atras' : 'ok';
    const icono = atras ? 'fa-triangle-exclamation' : 'fa-circle-check';
    const nota = atras
      ? 'Ese levantamiento esta en el percentil 25 o menos de la cohorte, mientras los otros no. ' +
        'Es una medicion de forma, no una prescripcion.'
      : 'Los tres levantamientos estan por encima del percentil 25 de la cohorte. No hay desbalance: ' +
        'es un resultado esperado, no un error.';

    return `
      <div class="cmp-bloque">
        <h3><i class="fa-solid ${icono}"></i> El diagnostico</h3>
        <div class="cmp-diag ${clase}">${esc(r.diagnostico.texto)}</div>
        <div class="cmp-def" style="margin-top:.6rem;font-size:.82rem">${esc(nota)}</div>
      </div>`;
  }

  function bloqueLimitaciones(r) {
    if (!r.limitaciones.length) return '';
    return `
      <div class="cmp-bloque">
        <h3><i class="fa-solid fa-circle-info"></i> Advertencias</h3>
        <ul class="cmp-lim">
          ${r.limitaciones.map((l) => `<li><i class="fa-solid fa-triangle-exclamation"></i><span>${esc(l)}</span></li>`).join('')}
        </ul>
      </div>`;
  }

  function bloqueAlternativas(r) {
    const alts = (r.cohorte.alternativas || []).filter((a) => a.n >= 30);
    if (!alts.length) return '';
    const botones = alts.map((a) => `
      <button type="button" data-alcance="${esc(a.alcance)}" data-ventana="${esc(a.ventana)}">
        ${esc(ETIQUETAS.alcance[a.alcance] || a.alcance)} &middot;
        ${esc(ETIQUETAS.ventana[a.ventana] || a.ventana)} &middot; n = ${fmt(a.n)}
      </button>`).join('');

    return `
      <div class="cmp-bloque">
        <h3><i class="fa-solid fa-shuffle"></i> Otras cohortes disponibles</h3>
        <div class="cmp-def" style="font-size:.82rem;margin-bottom:.4rem">
          Cambiar de cohorte cambia la pregunta. Estas son las alternativas con casos suficientes; la
          eleccion es de quien consulta, no del sistema.
        </div>
        <div class="cmp-alt" id="cmp-alt">${botones}</div>
      </div>`;
  }

  function bloqueTrazabilidad(r) {
    const t = r.trazabilidad;
    return `
      <div class="cmp-trace">
        <i class="fa-solid fa-code-branch"></i>
        Fuente: <strong>${esc(t.dataset || '')}</strong> (region ${esc(t.ubicacion || '')})
        &middot; SQL: ${esc(t.fuente_sql || '')}
        &middot; generado por ${esc(t.generado_por || '')} el ${esc(t.ultima_actualizacion || '')}.
        Esta pagina no tiene backend: los numeros salen de un archivo versionado en el repositorio.
      </div>`;
  }

  function render(r) {
    cajaRes.innerHTML = [
      bloqueCohorte(r),
      bloquePuntaje(r),
      bloqueLevantamientos(r),
      bloqueDiagnostico(r),
      bloqueLimitaciones(r),
      bloqueAlternativas(r),
      bloqueTrazabilidad(r),
    ].join('');
    cajaRes.hidden = false;

    // Los botones de alternativa re-corren la comparacion con la cohorte elegida.
    const alt = el('cmp-alt');
    if (alt) {
      alt.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-alcance]');
        if (!b || !ultimoPerfil) return;
        selAlcance.value = b.dataset.alcance;
        selVentana.value = b.dataset.ventana;
        correr();
      });
    }
  }

  function correr() {
    limpiarError();
    const perfil = leerPerfil();
    const r = C.comparar(DATOS, perfil);
    if (!r.ok) {
      mostrarError(r.errores);
      estado.textContent = '';
      return;
    }
    ultimoPerfil = perfil;
    render(r);
    estado.textContent = '';
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!DATOS) {
      mostrarError(['Los datos de cohortes todavia no se cargaron.']);
      return;
    }
    correr();
  });

  // ── Inicio ─────────────────────────────────────────────────────────────────
  (async function iniciar() {
    try {
      DATOS = await cargarDatos();
    } catch (e) {
      // Sin datos no se muestra NADA. Ni un resultado, ni un valor de reemplazo.
      form.hidden = true;
      mostrarError([
        'No se pudieron cargar los datos de cohortes: ' + e.message + '.',
        'Sin datos reales no hay comparacion. Esta pagina no usa valores de reemplazo.',
      ]);
      estado.textContent = '';
      return;
    }
    inicializarControles();
  })();
})();
