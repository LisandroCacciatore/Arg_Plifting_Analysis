"""Contrato estático entre app.js y index.html.

Los tests de render corren con un DOM simulado (que crea cualquier elemento
que se le pida), así que NO pueden detectar que el HTML real no tenga el
elemento. Este test cierra ese hueco: verifica que todo id que app.js busca
exista como atributo id= en index.html.

Bug real que motivó este test: los KPI del dashboard estaban hardcodeados en
el HTML sin id, así que app.js nunca podía actualizarlos y la página mostraba
valores de muestra para siempre.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HTML = RAIZ / "index.html"
APP_JS = RAIZ / "assets" / "js" / "app.js"


def _app_js() -> str:
    return APP_JS.read_text(encoding="utf-8")


def _html() -> str:
    return HTML.read_text(encoding="utf-8")


def ids_del_html() -> set[str]:
    return set(re.findall(r'\bid="([^"]+)"', _html()))


def ids_que_app_js_necesita() -> set[str]:
    js = _app_js()
    ids: set[str] = set()
    ids |= set(re.findall(r"getElementById\(\s*'([^']+)'\s*\)", js))   # literales
    ids |= set(re.findall(r"setKPI\(\s*'([^']+)'", js))                # KPIs
    ids |= set(re.findall(r"renderDonut\(\s*'([^']+)'", js))           # canvas de donuts
    ids |= set(re.findall(r"renderTemporalMetrica\(\s*'([^']+)'", js))  # canvas por métrica
    ids |= set(re.findall(r"querySelectorAll\(\s*'[^']*#([\w-]+)", js))  # #id en selectores
    return ids


def test_detecta_al_menos_los_elementos_clave():
    """Si el extractor deja de encontrar nada, el test deja de proteger."""
    necesarios = ids_que_app_js_necesita()
    for esperado in ("kpiAtletas", "kpiParticipaciones", "kpiPromedio",
                     "dataFecha", "fedList", "edadStatus", "chartTiempo",
                     "filtroTemporal", "filtroNota"):
        assert esperado in necesarios, (
            f"el extractor no detectó '{esperado}'; el test estaría pasando en falso")


def test_todos_los_ids_que_app_js_busca_existen_en_el_html():
    faltantes = sorted(ids_que_app_js_necesita() - ids_del_html())
    assert not faltantes, (
        f"app.js busca estos ids y no existen en index.html: {faltantes}\n"
        f"→ esos elementos nunca se actualizan (falla silenciosa)"
    )


CANVAS_ESPERADOS = {
    "chartSexo", "chartEventos", "chartEquipo", "chartAmbito", "chartPlace",
    "chartTotal", "chartTiempo",
    "chartTiempoParticipaciones", "chartTiempoAtletas", "chartTiempoFederaciones",
}


def test_los_canvas_de_los_graficos_existen():
    html = _html()
    canvas = set(re.findall(r'<canvas[^>]*\bid="([^"]+)"', html))
    assert canvas == CANVAS_ESPERADOS, (
        f"canvas declarados: {sorted(canvas)}\n"
        f"esperados: {sorted(CANVAS_ESPERADOS)}"
    )
    assert canvas <= ids_del_html()


def test_el_filtro_temporal_tiene_sus_botones():
    html = _html()
    desde = re.findall(r'class="filtro-btn[^"]*"[^>]*data-desde="(\d+)"', html)
    assert sorted(desde) == ["1964", "2012"], (
        f"los botones del filtro temporal deben ofrecer 2012 y 1964; hay {desde}")
    activos = re.findall(r'class="filtro-btn is-active"', html)
    assert len(activos) == 1, "debe haber exactamente un botón activo por defecto"


def test_los_kpi_tienen_valor_numerico():
    """El HTML trae un valor de arranque; debe ser numérico, nunca un placeholder."""
    html = _html()
    for kpi in ("kpiAtletas", "kpiParticipaciones", "kpiPromedio"):
        m = re.search(rf'id="{kpi}"[^>]*>([^<]*)<', html)
        assert m, f"no se encontró el contenido de #{kpi}"
        valor = m.group(1).strip()
        assert re.fullmatch(r"[\d.,]+", valor), (
            f"#{kpi} tiene '{valor}' en el HTML; debe ser un número")


def test_no_quedan_referencias_a_datos_de_muestra():
    """El proyecto ya tiene datos reales: no debe quedar copy de 'datos de muestra'."""
    html = _html().lower()
    for frase in ("datos de muestra", "en proceso de conexion", "en proceso de actualizacion"):
        assert frase not in html, f"quedó copy obsoleto en index.html: '{frase}'"
