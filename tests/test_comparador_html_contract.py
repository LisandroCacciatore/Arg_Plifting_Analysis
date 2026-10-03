"""Contrato estático entre comparador-pagina.js y comparador.html.

Los tests de render corren con un DOM simulado que crea cualquier elemento que se
le pida, así que NO pueden detectar que el HTML real no tenga el elemento. Este
test cierra ese hueco, igual que test_html_contract.py lo hace para app.js.

Además verifica la convención de copy del sitio (prosa sin tildes) sobre la página
nueva: es la regla que ya se rompió una vez en el banner de error del dashboard.
"""
import re
import struct
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HTML = RAIZ / "comparador.html"
PAGINA_JS = RAIZ / "assets" / "js" / "comparador-pagina.js"
MOTOR_JS = RAIZ / "assets" / "js" / "comparador.js"

ACENTOS = "áéíóúüñÁÉÍÓÚÜÑ"


def _html() -> str:
    return HTML.read_text(encoding="utf-8")


def _js() -> str:
    return PAGINA_JS.read_text(encoding="utf-8")


def ids_del_html() -> set[str]:
    return set(re.findall(r'\bid="([^"]+)"', _html()))


def ids_que_la_pagina_necesita() -> set[str]:
    """Ids que el JS busca en el DOM, tomados de `el(...)`."""
    js = _js()
    ids: set[str] = set()
    # el helper `el(id)` envuelve a getElementById; los dos patrones cuentan.
    ids |= set(re.findall(r"\bel\(\s*'([^']+)'\s*\)", js))
    ids |= set(re.findall(r"getElementById\(\s*'([^']+)'\s*\)", js))
    ids |= set(re.findall(r'querySelectorAll\(\s*\'[^\']*#([\w-]+)', js))
    return ids


def ids_que_el_js_crea() -> set[str]:
    """Ids que el propio JS emite en sus plantillas de HTML al renderizar.

    Existen sólo después del render, así que no pueden estar en el HTML estático
    y el contrato no puede exigirlos. Hoy es uno solo: `cmp-alt`, el contenedor de
    los botones de cohorte alternativa, que se arma junto con el resultado.
    """
    return set(re.findall(r'id="([^"]+)"', _js()))


# ── El hueco que el DOM simulado no puede ver ───────────────────────────────
def test_el_detector_encuentra_los_ids_clave():
    """Si el extractor deja de encontrar nada, el test estaría pasando en falso."""
    necesarios = ids_que_la_pagina_necesita()
    for esperado in ("cmp-form", "cmp-sexo", "cmp-edad", "cmp-peso", "cmp-equipo",
                     "cmp-alcance", "cmp-ventana", "cmp-sentadilla", "cmp-banco",
                     "cmp-despegue", "cmp-total", "cmp-error", "cmp-error-lista",
                     "cmp-res", "cmp-estado", "cmp-pie"):
        assert esperado in necesarios, (
            f"el extractor no detectó '{esperado}'; el test estaría pasando en falso")


def test_todos_los_ids_que_la_pagina_busca_existen_o_los_crea_ella():
    """Todo id que el JS busca tiene que existir: en el HTML estático o en el
    propio render del JS. Si no está en ninguno de los dos, el elemento nunca se
    actualiza (falla silenciosa)."""
    faltantes = sorted(ids_que_la_pagina_necesita() - ids_del_html() - ids_que_el_js_crea())
    assert not faltantes, (
        f"comparador-pagina.js busca estos ids y no existen ni en comparador.html "
        f"ni entre los que el propio JS crea: {faltantes}\n"
        f"→ esos elementos nunca se actualizan (falla silenciosa)")


def test_el_contenedor_de_alternativas_es_creado_por_el_js_a_proposito():
    """`cmp-alt` es el único id que el JS busca y crea a la vez.

    Si el JS dejara de crear el contenedor, el listener de los botones de cohorte
    alternativa se perdería en silencio. Se fija que siga existiendo en las dos
    puntas: se emite en la plantilla y se busca después del render.
    """
    creados = ids_que_el_js_crea()
    assert "cmp-alt" in creados, "el JS dejó de emitir el contenedor de alternativas"
    assert "cmp-alt" in ids_que_la_pagina_necesita(), \
        "el JS crea el contenedor de alternativas pero ya no le engancha el listener"


def test_los_ids_que_el_js_crea_no_chocan_con_los_del_html_estatico():
    choque = sorted(ids_que_el_js_crea() & ids_del_html())
    assert not choque, (
        f"estos ids se emiten en el render pero ya existen en el HTML estático: "
        f"{choque}. Al inyectar el resultado quedarían dos elementos con el mismo id.")


def test_los_ids_del_html_no_estan_repetidos():
    todos = re.findall(r'\bid="([^"]+)"', _html())
    repetidos = sorted({i for i in todos if todos.count(i) > 1})
    assert not repetidos, f"ids duplicados en comparador.html: {repetidos}"


# ── Carga de los scripts ────────────────────────────────────────────────────
def test_la_pagina_carga_el_motor_y_el_cableado():
    html = _html()
    assert 'src="assets/js/comparador.js"' in html
    assert 'src="assets/js/comparador-pagina.js"' in html


def test_el_motor_se_carga_antes_que_el_cableado():
    """El cableado usa globalThis.Comparador al evaluarse: el orden importa."""
    html = _html()
    motor = html.index("assets/js/comparador.js")
    cableado = html.index("assets/js/comparador-pagina.js")
    assert motor < cableado, "comparador-pagina.js se carga antes que comparador.js"


def test_la_pagina_no_carga_datos_de_reemplazo():
    """Sin datos reales no hay comparación: la página no trae valores de arranque
    para los resultados (los inputs sí traen un ejemplo, pero el resultado no)."""
    html = _html()
    assert 'id="cmp-res" hidden' in html, "el bloque de resultados debe arrancar oculto"
    assert 'id="cmp-error" hidden' in html, "el bloque de error debe arrancar oculto"
    # El motor no puede tener datos embebidos
    motor = MOTOR_JS.read_text(encoding="utf-8")
    assert "getDatosMuestra" not in motor
    assert not re.search(r"celdas\s*:\s*\{\s*['\"]", motor), \
        "el motor no debe traer celdas embebidas"


# ── El bug del `hidden` que pisa el `display:` ──────────────────────────────
def test_los_elementos_con_hidden_tienen_regla_que_los_oculte():
    """Un `display:` de autor pisa el `[hidden] { display: none }` del navegador.

    Si un elemento trae `hidden` y su clase define un `display:`, se ve igual.
    Hace falta un override explícito `.clase[hidden]`. Ya pasó en este proyecto
    con el banner de error del dashboard.
    """
    html = _html()
    problemas = []

    for tag in re.findall(r"<[a-z]+[^>]*\bhidden\b[^>]*>", html):
        clases = re.search(r'class="([^"]+)"', tag)
        if not clases:
            continue
        for clase in clases.group(1).split():
            regla = re.search(rf"\.{re.escape(clase)}\s*\{{([^}}]*)\}}", html)
            if not regla or not re.search(r"display\s*:", regla.group(1)):
                continue          # sin `display:` propio, `hidden` funciona
            # El `{` al final es imprescindible: sin él, `.clase[hidden]` matchea
            # como prefijo y el test pasa en falso.
            if not re.search(rf"\.{re.escape(clase)}\[hidden\]\s*\{{", html):
                problemas.append(clase)

    assert not problemas, (
        f"estas clases traen `hidden` pero su `display:` lo pisa, así que se "
        f"verían siempre: {sorted(set(problemas))}. Agregá `.clase[hidden] "
        f"{{ display: none; }}`")


# ── Convención de copy ──────────────────────────────────────────────────────
def test_la_prosa_de_la_pagina_va_sin_tildes():
    """Convención del proyecto: la prosa del sitio va sin tildes ni eñe.

    No se prohíbe todo lo no-ASCII: el `·` de los separadores y los emoji de los
    íconos son deliberados. Se prohíben solo las letras acentuadas.
    """
    problemas = []
    for n, linea in enumerate(_html().split("\n"), 1):
        hallados = sorted({c for c in linea if c in ACENTOS})
        if hallados:
            problemas.append(f"L{n} {''.join(hallados)}: {linea.strip()[:70]}")

    assert not problemas, (
        "comparador.html usa tildes donde el proyecto va sin ellas:\n  "
        + "\n  ".join(problemas))


def test_los_textos_visibles_del_cableado_van_sin_tildes():
    """Los strings de ETIQUETAS y de los bloques son copy: sin tildes.

    Los comentarios del archivo sí llevan tildes (son notas), así que el chequeo
    se limita a los literales entre comillas simples que contienen letras.
    """
    js = _js()
    problemas = []
    for n, linea in enumerate(js.split("\n"), 1):
        codigo = linea.split("//")[0]
        if re.match(r"\s*\*", linea):      # continuación de bloque de comentario
            continue
        for literal in re.findall(r"'([^'\\]*)'", codigo):
            hallados = sorted({c for c in literal if c in ACENTOS})
            if hallados:
                problemas.append(f"L{n} {''.join(hallados)}: {literal[:60]}")

    assert not problemas, (
        "comparador-pagina.js tiene textos visibles con tildes:\n  "
        + "\n  ".join(problemas))


def test_la_pagina_no_promete_un_plan_de_entrenamiento():
    """El corte de alcance es explícito: la capa mide, no recomienda.

    Si alguien agrega copy que prometa 'plan', 'rutina' o 'programa' en esta
    página, el test falla: no es una omisión, es una decisión de diseño
    (docs/03_Arquitectura/02_Fase_02/01_Arquitectura_Capa02.md, 'el borde').
    """
    texto = (_html() + _js()).lower()
    for promesa in ("plan de entrenamiento", "te recomendamos", "rutina sugerida",
                    "programa sugerido", "plan sugerido"):
        assert promesa not in texto, f"la pagina promete '{promesa}'"
    assert "no recomienda" in _html().lower(), \
        "la pagina deberia declarar explicitamente que no recomienda"


def test_la_pagina_declara_que_no_tiene_backend():
    assert "no tiene backend" in _html().lower() or "no tiene backend" in _js().lower(), \
        "la pagina deberia declarar que los numeros salen de un archivo versionado"


# ── Tarjeta social (Open Graph) ─────────────────────────────────────────────
BASE = "https://lisandrocacciatore.github.io/Arg_Plifting_Analysis/"
TARJETA = RAIZ / "assets" / "img" / "og-capa02.png"
GENERADOR = RAIZ / "scripts" / "og_capa02.html"


def meta(prop: str) -> str | None:
    """Valor de un meta por property= o por name=, con el orden de atributos que sea."""
    html = _html()
    for pat in (rf'<meta[^>]+property="{re.escape(prop)}"[^>]+content="([^"]*)"',
                rf'<meta[^>]+content="([^"]*)"[^>]+property="{re.escape(prop)}"',
                rf'<meta[^>]+name="{re.escape(prop)}"[^>]+content="([^"]*)"',
                rf'<meta[^>]+content="([^"]*)"[^>]+name="{re.escape(prop)}"'):
        m = re.search(pat, html)
        if m:
            return m.group(1)
    return None


def dimensiones_png(ruta: Path) -> tuple[int, int]:
    """Ancho y alto leidos del header IHDR. Sin dependencias: el PNG los trae."""
    d = ruta.read_bytes()
    assert d[:8] == b"\x89PNG\r\n\x1a\n", f"{ruta.name} no es un PNG valido"
    return struct.unpack(">II", d[16:24])


def test_la_pagina_declara_los_metadatos_de_la_tarjeta_social():
    """Sin og: el link sale pelado cuando alguien lo pega en LinkedIn o X.

    No es cosmetico: es el lugar donde el link consigue o pierde el clic, y es el
    unico canal por el que el articulo lleva al comparador.
    """
    for prop in ("og:type", "og:title", "og:description", "og:url",
                 "og:image", "og:image:width", "og:image:height", "og:image:alt",
                 "twitter:card", "twitter:image"):
        assert meta(prop), f"falta el meta {prop} en comparador.html"
    assert meta("twitter:card") == "summary_large_image"


def test_la_imagen_de_la_tarjeta_existe_en_el_repo():
    """El og:image apunta a una URL publicada: el archivo tiene que estar.

    Este es el chequeo que evita el fallo mas comun y mas silencioso: un og:image
    que apunta a una ruta que no existe. La tarjeta sale sin imagen y nadie se
    entera hasta que alguien pega el link.
    """
    url = meta("og:image")
    assert url.startswith(BASE), f"og:image no apunta al sitio publicado: {url}"
    ruta = RAIZ / url[len(BASE):]
    assert ruta.is_file(), (
        f"og:image apunta a {url} pero ese archivo no existe en el repo "
        f"(se esperaba {ruta.relative_to(RAIZ)})")
    assert TARJETA.is_file(), f"falta {TARJETA.relative_to(RAIZ)}"
    assert ruta.resolve() == TARJETA.resolve(), (
        f"og:image apunta a {ruta.name} y el generador escribe {TARJETA.name}")


def test_las_dimensiones_declaradas_son_las_reales_y_las_que_pide_linkedin():
    """1200x630 es la medida de LinkedIn. Se verifica contra el PNG, no contra el
    numero escrito a mano: son dos fuentes y pueden discrepar."""
    declarado = (int(meta("og:image:width")), int(meta("og:image:height")))
    assert declarado == (1200, 630), f"declarado {declarado}, se espera (1200, 630)"
    real = dimensiones_png(TARJETA)
    assert real == declarado, (
        f"el PNG mide {real} y el meta declara {declarado}: "
        f"la tarjeta saldria recortada o estirada")
    # La misma imagen en las dos tarjetas: si una queda vieja, la otra miente
    assert meta("twitter:image") == meta("og:image")


def test_el_og_url_es_la_url_publicada_de_esta_pagina():
    """Si apunta a otro lado, el scraper de LinkedIn marca la tarjeta como ajena."""
    assert meta("og:url") == BASE + "comparador.html"


def test_el_generador_de_la_tarjeta_muestra_los_numeros_del_motor():
    """Los numeros de la tarjeta son una medicion, no una ilustracion: tienen que
    ser los mismos que devuelve el motor del comparador a 610 kg de total.

    Se leen los <div class="valor"> y <div class="delta"> REALES, no el texto del
    archivo: los numeros tambien aparecen en el comentario de cabecera, asi que un
    `in gen` sobre el archivo entero sigue dando True aunque la tarjeta muestre
    otra cosa. Ese fue un falso OK real de este test (la rotura #38 del
    verificador lo cazo).
    """
    gen = GENERADOR.read_text(encoding="utf-8")
    valores = re.findall(r'<div class="valor">([^<]+)</div>', gen)
    assert valores == ["427,0", "399,0", "378,8"], (
        f"los puntajes de la tarjeta son {valores}, se esperaba "
        f"['427,0', '399,0', '378,8'] (los que devuelve el motor a 610 kg)")
    deltas = re.findall(r'<div class="delta[^"]*">([^<]+)</div>', gen)
    assert deltas == ["+28,0", "&mdash;", "&minus;20,2"], (
        f"los deltas de la tarjeta son {deltas}")

    # Los mismos numeros tienen que estar sostenidos por el dato: la celda de
    # referencia del golden master del motor.
    import json
    cohortes = json.loads((RAIZ / "assets" / "data" / "cohortes.json").read_text(encoding="utf-8"))
    assert cohortes["celdas"]["mundial|desde_2018|M|24-34|Raw"]["n"] == 140561
