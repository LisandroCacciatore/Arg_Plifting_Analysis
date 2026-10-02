"""Tests de la lógica pura de scripts/cohortes.py.

No tocan BigQuery: solo parseo del SQL, sustitución de placeholders, armado de
celdas, tabla de puntaje y validación del contrato con el comparador.

Los criterios están numerados como en docs/03_Arquitectura/02_Fase_02/
04_Testing_Capa02.md.
"""
import importlib.util
import json
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SQL_FILE = RAIZ / "SQL" / "phase_3_scala" / "QueryCapa02.sql"
COMPARADOR_JS = RAIZ / "assets" / "js" / "comparador.js"
COHORTES_JSON = RAIZ / "assets" / "data" / "cohortes.json"

_spec = importlib.util.spec_from_file_location(
    "cohortes", RAIZ / "scripts" / "cohortes.py")
co = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(co)


SQL_REAL = SQL_FILE.read_text(encoding="utf-8")
JS_REAL = COMPARADOR_JS.read_text(encoding="utf-8")

# CONTRATO mínimo y válido, para inyectar variantes rotas sin depender del real.
JS_BASE = """
const CONTRATO = {
  metricasFinas: ['dots'],
  metricasGruesas: ['total', 'ratio_banco', 'ratio_despegue',
                    'share_sentadilla', 'share_banco', 'share_despegue'],
  separador: '|',
  nMinimo: 10,
  puntajeSexos: ['M', 'F'],
};
"""


def js_con(**cambios):
    """CONTRATO con uno o más campos reemplazados, para probar que el validador falla."""
    campos = {
        "metricasFinas": "['dots']",
        "metricasGruesas": "['total', 'ratio_banco', 'ratio_despegue', "
                           "'share_sentadilla', 'share_banco', 'share_despegue']",
        "separador": "'|'",
        "nMinimo": "10",
        "puntajeSexos": "['M', 'F']",
    }
    campos.update(cambios)
    cuerpo = "\n".join(f"  {k}: {v}," for k, v in campos.items())
    return "const CONTRATO = {\n" + cuerpo + "\n};\n"


def _datos_minimos(celdas=None, puntaje=None, meta_extra=None):
    """Un JSON mínimo pero válido, para probar el validador de contrato."""
    n_fina = len(co._lista_de_csv(
        "0,1,2,3,4,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,96,97,98,99,100"))
    n_gruesa = len(co._lista_de_csv("0,10,20,30,40,50,60,70,80,90,95,100"))
    metricas = {nombre: [1.0] * (n_fina if tier == "fina" else n_gruesa)
                for nombre, _, tier in co.METRICAS}
    if celdas is None:
        celdas = {"mundial|desde_2018|M|24-34|Raw": {"n": 500, **metricas}}
    if puntaje is None:
        puntaje = {
            "formula": "Dots = TotalKg * 500 / g(peso, sexo)",
            "paso": 0.5,
            "M": {"peso_min": 20.0, "peso_max": 200.0, "peso": [20.0, 200.0], "g": [400.0, 900.0]},
            "F": {"peso_min": 20.0, "peso_max": 180.0, "peso": [20.0, 180.0], "g": [330.0, 640.0]},
        }
    meta = {
        "n_minimo": 10,
        "puntaje_paso": 0.5,
        "grid_fina": [0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70,
                      75, 80, 85, 90, 95, 96, 97, 98, 99, 100],
        "grid_gruesa": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100],
        "metricas_finas": ["dots"],
        "metricas_gruesas": ["total", "ratio_banco", "ratio_despegue",
                             "share_sentadilla", "share_banco", "share_despegue"],
    }
    meta.update(meta_extra or {})
    return {"_meta": meta, "celdas": celdas, "puntaje": puntaje}


# ── El archivo SQL real ──────────────────────────────────────────────────────
def test_el_sql_existe():
    assert SQL_FILE.exists()


def test_parsea_el_sql_real():
    cfg = co.parsear_sql(SQL_REAL)
    assert cfg["n_minimo"] == 10
    assert cfg["puntaje_paso"] == 0.5
    assert len(cfg["grillas"]["fina"]) == 29
    assert len(cfg["grillas"]["gruesa"]) == 12
    assert cfg["metricas"]["fina"] == ["dots"]
    assert set(cfg["bloques"]) >= {"cohorte", "puntaje"}


def test_las_cohortes_declaradas_son_las_esperadas():
    cfg = co.parsear_sql(SQL_REAL)
    pares = {(c["alcance"], c["ventana"]) for c in cfg["cohortes"]}
    assert pares == {("mundial", "historico"), ("mundial", "desde_2018"),
                     ("nacional", "historico"), ("nacional", "desde_2018")}
    for c in cfg["cohortes"]:
        assert c["desde"], f"{c} sin fecha"
    nac = [c for c in cfg["cohortes"] if c["alcance"] == "nacional"]
    assert all("Argentina" in c["filtro"] for c in nac)


def test_la_grilla_fina_esta_ordenada_y_dentro_de_0_100():
    cfg = co.parsear_sql(SQL_REAL)
    for nombre in ("fina", "gruesa"):
        g = cfg["grillas"][nombre]
        assert g == sorted(g), f"{nombre} no está ordenada"
        assert g[0] == 0 and g[-1] == 100
        assert all(0 <= p <= 100 for p in g)


def test_las_metricas_declaradas_tienen_grilla_asignada():
    cfg = co.parsear_sql(SQL_REAL)
    declaradas = set(cfg["metricas"]["fina"]) | set(cfg["metricas"]["gruesa"])
    enlazadas = {n for n, _, _ in co.METRICAS}
    assert enlazadas == declaradas, "hay métricas declaradas sin columna o al revés"


# ── Parseo: casos que deben fallar ───────────────────────────────────────────
def test_falla_sin_cohortes():
    roto = SQL_REAL.replace("-- @cohorte:", "-- @cohorte-x:")
    with pytest.raises(co.SqlCapa02Error, match="cohorte"):
        co.parsear_sql(roto)


def test_falla_si_una_cohorte_no_tiene_4_campos():
    roto = SQL_REAL.replace(
        "-- @cohorte: mundial | historico  | 1900-01-01 |",
        "-- @cohorte: mundial | historico |")
    with pytest.raises(co.SqlCapa02Error, match="4 campos"):
        co.parsear_sql(roto)


def test_falla_si_falta_un_bloque():
    roto = SQL_REAL.replace("-- @bloque: puntaje", "-- @bloque-x: puntaje")
    with pytest.raises(co.SqlCapa02Error, match="puntaje"):
        co.parsear_sql(roto)


def test_falla_si_el_bloque_cohorte_no_usa_un_placeholder():
    roto = SQL_REAL.replace("{{N_MINIMO}}", "10")
    with pytest.raises(co.SqlCapa02Error, match="N_MINIMO"):
        co.parsear_sql(roto)


def test_falla_si_el_bloque_puntaje_no_usa_el_paso():
    roto = SQL_REAL.replace("{{PASO}}", "0.5")
    with pytest.raises(co.SqlCapa02Error, match="PASO"):
        co.parsear_sql(roto)


def test_falla_si_una_metrica_no_esta_declarada_en_su_grilla():
    roto = SQL_REAL.replace("-- @metricas-fina: dots", "-- @metricas-fina: otra_cosa")
    with pytest.raises(co.SqlCapa02Error, match="dots"):
        co.parsear_sql(roto)


def test_falla_si_falta_la_grilla():
    roto = SQL_REAL.replace("-- @grid-gruesa:", "-- @grid-x:")
    with pytest.raises(co.SqlCapa02Error, match="grid"):
        co.parsear_sql(roto)


def test_falla_si_falta_el_n_minimo():
    roto = SQL_REAL.replace("-- @n-minimo: 10", "")
    with pytest.raises(co.SqlCapa02Error, match="n-minimo"):
        co.parsear_sql(roto)


def test_falla_si_falta_el_paso_del_puntaje():
    roto = SQL_REAL.replace("-- @puntaje-paso: 0.5", "")
    with pytest.raises(co.SqlCapa02Error, match="puntaje-paso"):
        co.parsear_sql(roto)


# ── Sustitución de placeholders ──────────────────────────────────────────────
def test_sustituye_los_placeholders():
    cfg = co.parsear_sql(SQL_REAL)
    sql = co.sustituir(cfg["bloques"]["cohorte"],
                       {"{{DESDE}}": "2018-01-01", "{{ALCANCE}}": "",
                        "{{N_MINIMO}}": "10"},
                       "P", "D", "OpenDataRaw")
    assert "{{" not in sql, "quedaron placeholders sin sustituir"
    assert "2018-01-01" in sql
    assert "COUNT(*) >= 10" in sql


def test_sustituye_el_nombre_de_la_tabla():
    sql = co.sustituir("SELECT * FROM `a.b.OpenDataRaw`",
                       {}, "otro", "ds", "tabla")
    assert "`otro.ds.tabla`" in sql


def test_no_toca_los_nombres_de_tablas_ajenas():
    sql = co.sustituir("SELECT * FROM `a.b.OtraTabla`", {}, "otro", "ds", "tabla")
    assert "`a.b.OtraTabla`" in sql


# ── Claves de celda ──────────────────────────────────────────────────────────
def test_construir_clave():
    assert co.construir_clave("mundial", "desde_2018", "M", "24-34", "Raw") == \
        "mundial|desde_2018|M|24-34|Raw"


def test_la_clave_rechaza_componentes_vacios_o_con_separador():
    for malo in ("", "a|b"):
        with pytest.raises(ValueError):
            co.construir_clave("mundial", "v", "M", "24-34", malo)


def test_la_clave_tiene_5_campos_siempre():
    clave = co.construir_clave("nacional", "historico", "F", "50-54", "Single-ply")
    assert len(clave.split(co.SEP)) == 5


# ── Recorte de la grilla ─────────────────────────────────────────────────────
def test_recortar_toma_los_indices_correctos():
    vector = list(range(101))
    assert co.recortar(vector, [0, 50, 100]) == [0, 50, 100]
    assert co.recortar(vector, [10, 25]) == [10, 25]


def test_recortar_falla_fuera_de_rango():
    with pytest.raises(ValueError, match="fuera del vector"):
        co.recortar(list(range(101)), [0, 150])


# ── Armado de celdas ─────────────────────────────────────────────────────────
def _fila(sexo="M", edad="24-34", equipo="Raw", n=500):
    fila = {"Sex": sexo, "AgeClass": edad, "Equipment": equipo, "n": n}
    for _, columna, _tier in co.METRICAS:
        fila[columna] = [float(i) for i in range(101)]
    return fila


def test_construir_celdas_arma_la_clave_y_recorta():
    cfg = co.parsear_sql(SQL_REAL)
    cohorte = {"alcance": "mundial", "ventana": "desde_2018"}
    celdas = co.construir_celdas([(cohorte, [_fila()])], cfg)
    assert list(celdas) == ["mundial|desde_2018|M|24-34|Raw"]
    celda = celdas["mundial|desde_2018|M|24-34|Raw"]
    assert celda["n"] == 500
    assert len(celda["dots"]) == 29
    assert len(celda["total"]) == 12


def test_construir_celdas_falla_con_celda_duplicada():
    cfg = co.parsear_sql(SQL_REAL)
    cohorte = {"alcance": "mundial", "ventana": "desde_2018"}
    with pytest.raises(ValueError, match="duplicada"):
        co.construir_celdas([(cohorte, [_fila(), _fila()])], cfg)


def test_construir_celdas_falla_si_falta_una_columna():
    cfg = co.parsear_sql(SQL_REAL)
    fila = _fila()
    del fila["q_dots"]
    with pytest.raises(ValueError, match="q_dots"):
        co.construir_celdas([({"alcance": "mundial", "ventana": "v"}, [fila])], cfg)


# ── Tabla de puntaje ─────────────────────────────────────────────────────────
def test_construir_puntaje_arma_por_sexo():
    filas = [{"Sex": "M", "peso": 20.0, "g": 393.36},
             {"Sex": "M", "peso": 20.5, "g": 393.9},
             {"Sex": "F", "peso": 22.0, "g": 336.73},
             {"Sex": "F", "peso": 22.5, "g": 337.1}]
    p = co.construir_puntaje(filas, 0.5)
    assert p["paso"] == 0.5
    assert set(p) >= {"M", "F"}
    assert p["M"]["peso"] == [20.0, 20.5]
    assert p["M"]["peso_min"] == 20.0 and p["M"]["peso_max"] == 20.5
    assert p["F"]["g"] == [336.73, 337.1]


def test_construir_puntaje_falla_si_los_pesos_no_crecen():
    filas = [{"Sex": "M", "peso": 50.0, "g": 500.0},
             {"Sex": "M", "peso": 50.0, "g": 501.0}]
    with pytest.raises(ValueError, match="crecientes"):
        co.construir_puntaje(filas, 0.5)


def test_construir_puntaje_falla_con_g_no_positivo():
    filas = [{"Sex": "M", "peso": 50.0, "g": 500.0},
             {"Sex": "M", "peso": 51.0, "g": 0.0}]
    with pytest.raises(ValueError, match="g <= 0"):
        co.construir_puntaje(filas, 0.5)


def test_construir_puntaje_falla_con_un_solo_punto():
    with pytest.raises(ValueError, match="al menos 2"):
        co.construir_puntaje([{"Sex": "M", "peso": 50.0, "g": 500.0}], 0.5)


def test_construir_puntaje_falla_si_viene_vacio():
    with pytest.raises(ValueError, match="vacía"):
        co.construir_puntaje([], 0.5)


# ── Validación del contrato ──────────────────────────────────────────────────
def test_el_contrato_real_pasa():
    cfg = co.parsear_sql(SQL_REAL)
    cohorte = {"alcance": "mundial", "ventana": "desde_2018"}
    celdas = co.construir_celdas([(cohorte, [_fila()])], cfg)
    puntaje = co.construir_puntaje(
        [{"Sex": "M", "peso": 20.0, "g": 393.36}, {"Sex": "M", "peso": 20.5, "g": 394.0},
         {"Sex": "F", "peso": 22.0, "g": 336.73}, {"Sex": "F", "peso": 22.5, "g": 337.1}], 0.5)
    datos = _datos_minimos(celdas=celdas, puntaje=puntaje)
    datos["_meta"].update({"n_minimo": cfg["n_minimo"], "puntaje_paso": cfg["puntaje_paso"]})
    assert co.validar_contrato(datos, JS_REAL) == []


def test_contrato_falla_si_el_js_no_declara_un_contrato():
    problemas = co.validar_contrato(_datos_minimos(), "// nada\n")
    assert problemas and "CONTRATO" in problemas[0]


def test_contrato_falla_si_el_js_espera_otra_metrica():
    problemas = co.validar_contrato(_datos_minimos(), js_con(metricasFinas="['otra']"))
    assert any("metricasFinas" in p for p in problemas)


def test_contrato_falla_si_el_separador_no_coincide():
    problemas = co.validar_contrato(_datos_minimos(), js_con(separador="':'"))
    assert any("separador" in p for p in problemas)


def test_contrato_falla_si_el_n_minimo_no_coincide():
    problemas = co.validar_contrato(_datos_minimos(), js_con(nMinimo="5"))
    assert any("nMinimo" in p for p in problemas)


def test_contrato_falla_si_una_celda_tiene_n_bajo_el_minimo():
    datos = _datos_minimos()
    datos["celdas"]["mundial|desde_2018|M|24-34|Raw"]["n"] = 3
    problemas = co.validar_contrato(datos, JS_BASE)
    assert any("por debajo del mínimo" in p for p in problemas)


def test_contrato_falla_si_una_celda_no_tiene_todas_las_metricas():
    datos = _datos_minimos()
    datos["celdas"]["mundial|desde_2018|M|24-34|Raw"]["dots"] = [1.0, 2.0]
    problemas = co.validar_contrato(datos, JS_BASE)
    assert any("dots" in p for p in problemas)


def test_contrato_falla_si_una_clave_no_tiene_5_campos():
    datos = _datos_minimos()
    celda = datos["celdas"].pop("mundial|desde_2018|M|24-34|Raw")
    datos["celdas"]["mundial|M|24-34|Raw"] = celda
    problemas = co.validar_contrato(datos, JS_BASE)
    assert any("formato inválido" in p for p in problemas)


def test_contrato_falla_si_falta_un_sexo_en_el_puntaje():
    datos = _datos_minimos()
    del datos["puntaje"]["F"]
    problemas = co.validar_contrato(datos, JS_BASE)
    assert any("puntaje" in p and "F" in p for p in problemas)


def test_contrato_falla_si_el_paso_del_puntaje_no_coincide():
    datos = _datos_minimos()
    datos["puntaje"]["paso"] = 1.0
    problemas = co.validar_contrato(datos, JS_BASE)
    assert any("paso" in p for p in problemas)


def test_contrato_falla_si_peso_y_g_tienen_distinto_largo():
    datos = _datos_minimos()
    datos["puntaje"]["M"]["g"] = [400.0]
    problemas = co.validar_contrato(datos, JS_BASE)
    assert any("distinto largo" in p for p in problemas)


def test_contrato_falla_si_no_hay_celdas():
    datos = _datos_minimos(celdas={})
    problemas = co.validar_contrato(datos, JS_BASE)
    assert any("celda" in p for p in problemas)


def test_contrato_falla_con_menos_de_dos_puntos_de_puntaje():
    datos = _datos_minimos()
    datos["puntaje"]["M"]["peso"] = [20.0]
    datos["puntaje"]["M"]["g"] = [400.0]
    problemas = co.validar_contrato(datos, JS_BASE)
    assert any("2 puntos" in p for p in problemas)


# ── Serialización ────────────────────────────────────────────────────────────
def test_compactar_arrays_deja_los_arrays_en_una_linea():
    texto = '{\n  "v": [\n    1,\n    2,\n    3\n  ]\n}'
    salida = co.compactar_arrays(texto)
    # Los saltos de línea internos del array desaparecen; quedan los del objeto.
    assert salida == '{\n  "v": [1, 2, 3]\n}'


def test_compactar_arrays_no_toca_lo_que_no_es_un_array():
    texto = '{\n  "a": 1,\n  "b": "hola"\n}'
    assert co.compactar_arrays(texto) == texto


def test_el_artefacto_real_cumple_el_contrato():
    """El cohortes.json versionado tiene que pasar su propio validador."""
    if not COHORTES_JSON.exists():
        pytest.skip("cohortes.json no generado todavía")
    datos = json.loads(COHORTES_JSON.read_text(encoding="utf-8"))
    assert co.validar_contrato(datos, JS_REAL) == []


def test_el_artefacto_real_declara_de_donde_sale():
    if not COHORTES_JSON.exists():
        pytest.skip("cohortes.json no generado todavía")
    meta = json.loads(COHORTES_JSON.read_text(encoding="utf-8"))["_meta"]
    assert meta["dataset"].endswith("OpenDataRaw")
    assert meta["ubicacion"] == "southamerica-east1"
    assert meta["fuente_sql"] == "SQL/phase_3_scala/QueryCapa02.sql"
    assert meta["n_minimo"] == 10
    assert set(meta["alcances"]) == {"mundial", "nacional"}
    assert set(meta["ventanas"]) == {"historico", "desde_2018"}


def test_el_artefacto_real_tiene_las_cuatro_cohortes():
    if not COHORTES_JSON.exists():
        pytest.skip("cohortes.json no generado todavía")
    datos = json.loads(COHORTES_JSON.read_text(encoding="utf-8"))
    pares = {"|".join(k.split("|")[:2]) for k in datos["celdas"]}
    assert pares == {"mundial|historico", "mundial|desde_2018",
                     "nacional|historico", "nacional|desde_2018"}
