"""Tests de la lógica pura de scripts/refresh_data.py.

No tocan BigQuery: solo parseo del SQL, sustitución de nombres y validación
del contrato con el frontend.
"""
import importlib.util
import json
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SQL_FILE = RAIZ / "SQL" / "phase_2_core" / "QueryCapa01.sql"

# importar el script como módulo sin ejecutarlo
_spec = importlib.util.spec_from_file_location(
    "refresh_data", RAIZ / "scripts" / "refresh_data.py")
rd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rd)

CLAVES_ESPERADAS = {
    "q1_volumen", "q2_sexo", "q3_federaciones", "q4a_eventos", "q4b_equipamiento",
    "q5_temporal", "q6a_peso", "q7b_edad", "q8b_ambito", "q9b_place", "q10a_total",
}


def _consultas():
    return rd.extraer_consultas(SQL_FILE.read_text(encoding="utf-8"))


# ── Parseo ───────────────────────────────────────────────────────────────────
def test_sql_file_existe():
    assert SQL_FILE.exists()


def test_extrae_exactamente_las_claves_marcadas():
    claves = [k for k, _, _ in _consultas()]
    assert set(claves) == CLAVES_ESPERADAS
    assert len(claves) == len(set(claves)), "hay claves duplicadas"


def test_q1_es_objeto_y_el_resto_listas():
    """q1_volumen devuelve una sola fila y el frontend la lee como objeto."""
    formas = {k: f for k, _, f in _consultas()}
    assert formas["q1_volumen"] == "object"
    for clave, forma in formas.items():
        if clave != "q1_volumen":
            assert forma == "list", f"{clave} debería ser lista"
    assert rd.extraer_consultas(
        "-- @data-key: x\n-- @data-shape: object\nSELECT 1;\n")[0][2] == "object"


def test_no_se_cuela_prosa_del_sql():
    """El archivo tiene texto suelto entre queries; ninguna debe incluirlo."""
    for clave, sql, _ in _consultas():
        assert "Cambios realizados" not in sql, f"{clave} arrastró prosa"
        assert "Explicación de los cambios" not in sql, f"{clave} arrastró prosa"
        assert "***Updated***" not in sql, f"{clave} arrastró prosa"
        assert sql.rstrip().endswith(";"), f"{clave} no termina en ';'"
        assert sql.upper().lstrip().startswith("SELECT"), f"{clave} no es un SELECT"


def test_todas_las_queries_apuntan_a_la_tabla_cruda():
    for clave, sql, _ in _consultas():
        assert rd.TABLE_DEFAULT in sql, f"{clave} no referencia {rd.TABLE_DEFAULT}"


def test_parsea_statement_de_una_sola_linea():
    consultas = rd.extraer_consultas("-- @data-key: x\nSELECT 1 AS a;\n")
    assert consultas == [("x", "SELECT 1 AS a;", "list")]


def test_ignora_prosa_entre_marcador_y_select():
    consultas = rd.extraer_consultas(
        "-- @data-key: x\n-- nota suelta\n-- Pregunta: ¿y esto?\n\nSELECT 1;\n")
    assert consultas == [("x", "SELECT 1;", "list")]


def test_marcador_sin_sentencia_falla():
    with pytest.raises(ValueError):
        rd.extraer_consultas("-- @data-key: x\nSELECT 1\n")


def test_sentencia_sin_terminador_falla():
    # El parser acumula hasta encontrar ';' (necesario para SQL multilínea),
    # así que un ';' faltante en el medio NO es detectable. El invariante real
    # es que el archivo no puede terminar con un statement abierto.
    with pytest.raises(ValueError):
        rd.extraer_consultas("-- @data-key: x\nSELECT 1 FROM t\n")


def test_dos_marcadores_seguidos_falla():
    with pytest.raises(ValueError):
        rd.extraer_consultas("-- @data-key: a\n-- @data-key: b\nSELECT 1;\n")


def test_data_shape_sin_data_key_falla():
    with pytest.raises(ValueError):
        rd.extraer_consultas("-- @data-shape: object\nSELECT 1;\n")


# ── Sustitución de nombres ───────────────────────────────────────────────────
def test_sustituye_la_tabla_cruda():
    sql = f"SELECT * FROM `{rd.PROJECT}.{rd.DATASET}.{rd.TABLE_DEFAULT}`"
    out = rd.sustituir_fqn(sql, "otro-proyecto", "otro_dataset", "otra_tabla")
    assert "`otro-proyecto.otro_dataset.otra_tabla`" in out
    assert rd.TABLE_DEFAULT not in out


def test_no_toca_otros_nombres_calificados():
    sql = "SELECT * FROM `mi-proyecto.mi_dataset.mi_tabla`"
    assert rd.sustituir_fqn(sql, "a", "b", "c") == sql


# ── Validación del contrato ──────────────────────────────────────────────────
@pytest.fixture
def datos_validos():
    return {
        "q1_volumen": {
            "atletas_unicos": 2521,
            "participaciones_totales": 11514,
            "participaciones_promedio_por_atleta": 4.57,
        },
        "q2_sexo": [{"Sex": "M", "porcentaje": 77.6}],
        "q4a_eventos": [{"Event": "SBD", "porcentaje": 64.9}],
        "q4b_equipamiento": [{"Equipment": "Raw", "porcentaje": 48.3}],
        "q8b_ambito": [{"ambito_competencia": "Nacional", "porcentaje": 83.6}],
        "q9b_place": [{"tipo_resultado": "Posición válida", "porcentaje": 95.1}],
        "q10a_total": [{"estado_total": "Total reportado", "porcentaje": 95.1}],
        "q5_temporal": [{"anio": 2020, "participaciones": 10, "atletas_unicos": 8,
                         "federaciones_activas": 3}],
    }


def test_contrato_pasa_con_estructura_correcta(datos_validos):
    assert rd.validar_contrato(datos_validos, rd._leer_app_js()) == []


def test_contrato_detecta_clave_faltante():
    problemas = rd.validar_contrato({}, rd._leer_app_js())
    assert any("falta data.q5_temporal" in p for p in problemas)
    assert any("falta data.q9b_place" in p for p in problemas)
    assert any("falta data.q1_volumen" in p for p in problemas)


def test_contrato_detecta_campo_equivocado():
    """El bug real: q9b_place traía 'Place' en vez de 'tipo_resultado'."""
    datos = {"q9b_place": [{"Place": "1", "porcentaje": 62.8}]}
    problemas = rd.validar_contrato(datos, rd._leer_app_js())
    assert any("tipo_resultado" in p and "q9b_place" in p for p in problemas)


def test_contrato_detecta_kpi_como_lista(datos_validos):
    """El bug que introduje: q1_volumen salía como lista de 1 en vez de objeto."""
    datos_validos["q1_volumen"] = [datos_validos["q1_volumen"]]
    problemas = rd.validar_contrato(datos_validos, rd._leer_app_js())
    assert any("q1_volumen" in p and "objeto" in p for p in problemas)


def test_contrato_detecta_kpi_sin_campos():
    datos = {"q1_volumen": {"atletas_unicos": 1}}
    problemas = rd.validar_contrato(datos, rd._leer_app_js())
    assert any("participaciones_promedio_por_atleta" in p for p in problemas)


def test_contrato_detecta_donut_como_objeto(datos_validos):
    datos_validos["q2_sexo"] = {"Sex": "M"}
    problemas = rd.validar_contrato(datos_validos, rd._leer_app_js())
    assert any("q2_sexo" in p and "lista" in p for p in problemas)


def test_contrato_detecta_lista_vacia():
    problemas = rd.validar_contrato({"q5_temporal": []}, rd._leer_app_js())
    assert any("q5_temporal" in p for p in problemas)


def test_contrato_detecta_columna_de_metrica_faltante(datos_validos):
    """Los 3 gráficos por métrica necesitan su columna en la serie temporal."""
    del datos_validos["q5_temporal"][0]["federaciones_activas"]
    problemas = rd.validar_contrato(datos_validos, rd._leer_app_js())
    assert any("federaciones_activas" in p for p in problemas), (
        "el validador debería exigir las columnas que grafican los gráficos por métrica")


def test_metricas_temporales_se_derivan_de_app_js():
    metricas = rd.metricas_temporales_esperadas(rd._leer_app_js())
    assert metricas == ["atletas_unicos", "federaciones_activas", "participaciones"], (
        f"columnas detectadas: {metricas}")


# ── _meta ────────────────────────────────────────────────────────────────────
def test_meta_tiene_los_campos_que_el_frontend_usa():
    meta = rd.construir_meta({"q1_volumen": 1}, "p", "d", "t")
    assert "ultima_actualizacion" in meta      # app.js lo lee
    assert meta["dataset"] == "p.d.t"
    assert meta["consultas"] == {"q1_volumen": 1}
    assert meta["total_filas"] == 1
    assert "nota" not in meta                   # se eliminó la nota obsoleta


# ── Integración mínima con el archivo real ───────────────────────────────────
def test_data_json_actual_cumple_el_contrato():
    datos = json.loads((RAIZ / "assets" / "data" / "data.json").read_text(encoding="utf-8"))
    assert rd.validar_contrato(datos, rd._leer_app_js()) == []


def test_data_json_actual_tiene_la_forma_correcta():
    datos = json.loads((RAIZ / "assets" / "data" / "data.json").read_text(encoding="utf-8"))
    assert isinstance(datos["q1_volumen"], dict), "q1_volumen debe ser objeto"
    for clave in ("q2_sexo", "q3_federaciones", "q5_temporal", "q9b_place"):
        assert isinstance(datos[clave], list), f"{clave} debe ser lista"
        assert datos[clave], f"{clave} no puede estar vacío"
