#!/usr/bin/env python
"""Genera assets/data/cohortes.json ejecutando las queries de Capa 02 en BigQuery.

Fuente de verdad: SQL/phase_3_scala/QueryCapa02.sql
El SQL declara:
  -- @cohorte: <alcance> | <ventana> | <desde> | <filtro>   qué combinaciones calcular
  -- @bloque: <nombre>                                      cada statement con nombre
  -- @grid-* / @metricas-* / @n-minimo / @puntaje-paso      la forma de la salida

Antes de escribir, valida el CONTRATO del frontend: que las métricas, los ejes y
la tabla de puntaje que emite coincidan con lo que assets/js/comparador.js lee.
Si el contrato no se cumple, no escribe nada y sale con código != 0.

El comparador es ESTÁTICO: no hay backend ni BigQuery en runtime. Este script
congela las tablas en un JSON versionado, igual que refresh_data.py congela
data.json. Ver docs/03_Arquitectura/02_Fase_02/01_Arquitectura_Capa02.md.

Uso:
    python scripts/cohortes.py                # escribe cohortes.json
    python scripts/cohortes.py --dry-run      # no escribe, muestra resumen
    python scripts/cohortes.py --check        # valida el cohortes.json actual
    python scripts/cohortes.py --out otro.json
    python scripts/cohortes.py --solo mundial|desde_2018

Variables de entorno:
    GOOGLE_APPLICATION_CREDENTIALS  ruta al JSON del service account
    BQ_PROJECT                      (default burnished-rider-368414)
    BQ_DATASET                      (default Openpowerlifting)
    BQ_TABLE                        (default OpenDataRaw)
    BQ_LOCATION                     (default southamerica-east1)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SQL_FILE = RAIZ / "SQL" / "phase_3_scala" / "QueryCapa02.sql"
COHORTES_JSON = RAIZ / "assets" / "data" / "cohortes.json"
COMPARADOR_JS = RAIZ / "assets" / "js" / "comparador.js"

PROJECT = os.environ.get("BQ_PROJECT", "burnished-rider-368414")
DATASET = os.environ.get("BQ_DATASET", "Openpowerlifting")
TABLE = os.environ.get("BQ_TABLE", "OpenDataRaw")
LOCATION = os.environ.get("BQ_LOCATION", "southamerica-east1")

TABLE_DEFAULT = "OpenDataRaw"
FQN_RE = re.compile(r"`([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]+)`")

COHORTE_RE = re.compile(r"^--\s*@cohorte:\s*(.+?)\s*$")
BLOQUE_RE = re.compile(r"^--\s*@bloque:\s*([a-z0-9_]+)\s*$")
GRID_RE = re.compile(r"^--\s*@grid-(\w+):\s*(.+?)\s*$")
METRICAS_RE = re.compile(r"^--\s*@metricas-(\w+):\s*(.+?)\s*$")
NMIN_RE = re.compile(r"^--\s*@n-minimo:\s*(\d+)\s*$")
PASO_RE = re.compile(r"^--\s*@puntaje-paso:\s*([\d.]+)\s*$")

SEP = "|"
INTENTOS = 3
ESPERA_BASE = 2.0

# Métricas del archivo: (nombre en el JSON, columna del SELECT, grilla)
METRICAS = [
    ("dots", "q_dots", "fina"),
    ("total", "q_total", "gruesa"),
    ("ratio_banco", "q_ratio_banco", "gruesa"),
    ("ratio_despegue", "q_ratio_despegue", "gruesa"),
    ("share_sentadilla", "q_share_sentadilla", "gruesa"),
    ("share_banco", "q_share_banco", "gruesa"),
    ("share_despegue", "q_share_despegue", "gruesa"),
]

DECIMALES = 4
BLOQUES_REQUERIDOS = ("cohorte", "puntaje")


# ── Parseo del SQL ───────────────────────────────────────────────────────────
class SqlCapa02Error(ValueError):
    pass


def _lista_de_csv(valor: str, convertir=int) -> list:
    partes = [p.strip() for p in valor.split(",") if p.strip()]
    if not partes:
        raise SqlCapa02Error(f"lista vacía: {valor!r}")
    return [convertir(p) for p in partes]


def parsear_sql(texto: str) -> dict:
    """Extrae la configuración declarada y los statement por bloque.

    No es un parser de SQL: lee los marcadores `-- @...` y agrupa cada statement
    bajo su `-- @bloque: <nombre>`. Un bloque termina en el primer ';'.
    """
    lineas = texto.replace("\r\n", "\n").split("\n")

    grillas: dict[str, list[int]] = {}
    metricas: dict[str, list[str]] = {}
    n_minimo: int | None = None
    puntaje_paso: float | None = None
    cohortes: list[dict] = []

    bloques: dict[str, list[str]] = {}
    actual: str | None = None
    cerrado = False

    for ln in lineas:
        limpio = ln.strip()

        m = BLOQUE_RE.match(limpio)
        if m:
            nombre = m.group(1)
            if nombre in bloques:
                raise SqlCapa02Error(f"@bloque repetido: {nombre}")
            bloques[nombre] = []
            actual = nombre
            cerrado = False
            continue

        m = GRID_RE.match(limpio)
        if m:
            grillas[m.group(1)] = _lista_de_csv(m.group(2))
            continue

        m = METRICAS_RE.match(limpio)
        if m:
            metricas[m.group(1)] = [x.strip() for x in m.group(2).split(",") if x.strip()]
            continue

        m = NMIN_RE.match(limpio)
        if m:
            n_minimo = int(m.group(1))
            continue

        m = PASO_RE.match(limpio)
        if m:
            puntaje_paso = float(m.group(1))
            continue

        m = COHORTE_RE.match(limpio)
        if m:
            partes = [p.strip() for p in m.group(1).split(SEP)]
            if len(partes) != 4:
                raise SqlCapa02Error(
                    f"@cohorte necesita 4 campos (alcance | ventana | desde | filtro): {limpio!r}")
            alcance, ventana, desde, filtro = partes
            if not alcance or not ventana or not desde:
                raise SqlCapa02Error(f"@cohorte con campos vacíos: {limpio!r}")
            cohortes.append({"alcance": alcance, "ventana": ventana,
                             "desde": desde, "filtro": filtro})
            continue

        if actual is not None and not cerrado:
            bloques[actual].append(ln)
            if limpio.endswith(";"):
                cerrado = True

    if not cohortes:
        raise SqlCapa02Error("no se encontró ningún `-- @cohorte:`")
    if "fina" not in grillas or "gruesa" not in grillas:
        raise SqlCapa02Error("faltan @grid-fina y/o @grid-gruesa")
    if n_minimo is None:
        raise SqlCapa02Error("falta @n-minimo")
    if puntaje_paso is None or puntaje_paso <= 0:
        raise SqlCapa02Error("falta @puntaje-paso (o es <= 0)")

    for nombre in BLOQUES_REQUERIDOS:
        if nombre not in bloques:
            raise SqlCapa02Error(f"falta el bloque `-- @bloque: {nombre}`")
        if not "\n".join(bloques[nombre]).strip():
            raise SqlCapa02Error(f"el bloque '{nombre}' está vacío")

    sql_cohorte = "\n".join(bloques["cohorte"]).strip()
    for ph in ("{{DESDE}}", "{{ALCANCE}}", "{{N_MINIMO}}"):
        if ph not in sql_cohorte:
            raise SqlCapa02Error(f"el bloque 'cohorte' no usa el placeholder {ph}")
    if "{{PASO}}" not in "\n".join(bloques["puntaje"]):
        raise SqlCapa02Error("el bloque 'puntaje' no usa el placeholder {{PASO}}")

    for nombre, _, tier in METRICAS:
        if nombre not in metricas.get(tier, []):
            raise SqlCapa02Error(f"la métrica '{nombre}' no está declarada en @metricas-{tier}")

    return {
        "grillas": grillas,
        "metricas": metricas,
        "n_minimo": n_minimo,
        "puntaje_paso": puntaje_paso,
        "cohortes": cohortes,
        "bloques": {k: "\n".join(v).strip() for k, v in bloques.items()},
    }


def sustituir(sql: str, reemplazos: dict[str, str],
              project: str, dataset: str, table: str) -> str:
    fuera = sql
    for ph, valor in reemplazos.items():
        fuera = fuera.replace(ph, valor)

    def repl(m: re.Match) -> str:
        if m.group(3) == TABLE_DEFAULT:
            return f"`{project}.{dataset}.{table}`"
        return m.group(0)

    return FQN_RE.sub(repl, fuera)


# ── Armado de celdas y puntaje ───────────────────────────────────────────────
def construir_clave(alcance: str, ventana: str, sexo: str, edad: str, equipo: str) -> str:
    """Clave plana de celda: alcance|ventana|sexo|edad|equipo.

    Plana y no anidada para que el lookup en el navegador sea una concatenación
    y no un descenso por tres niveles.
    """
    for parte in (alcance, ventana, sexo, edad, equipo):
        if not parte or SEP in parte:
            raise ValueError(f"componente inválido para la clave de celda: {parte!r}")
    return SEP.join((alcance, ventana, sexo, edad, equipo))


def recortar(vector: list, grilla: list[int]) -> list:
    """Toma los índices de la grilla de un vector de 101 cuantiles."""
    faltan = [p for p in grilla if p < 0 or p > len(vector) - 1]
    if faltan:
        raise ValueError(f"percentiles fuera del vector de 101: {faltan}")
    return [vector[p] for p in grilla]


def construir_celdas(filas_por_cohorte: list[tuple[dict, list[dict]]], cfg: dict) -> dict:
    celdas: dict[str, dict] = {}
    grillas = cfg["grillas"]

    for cohorte, filas in filas_por_cohorte:
        alcance, ventana = cohorte["alcance"], cohorte["ventana"]
        for fila in filas:
            clave = construir_clave(alcance, ventana, fila["Sex"],
                                    fila["AgeClass"], fila["Equipment"])
            if clave in celdas:
                raise ValueError(f"celda duplicada: {clave}")
            celda: dict = {"n": fila["n"]}
            for nombre, columna, tier in METRICAS:
                vector = fila.get(columna)
                if not vector:
                    raise ValueError(f"celda {clave}: falta la columna {columna}")
                celda[nombre] = [round(v, DECIMALES) for v in recortar(vector, grillas[tier])]
            celdas[clave] = celda

    return celdas


def construir_puntaje(filas: list[dict], paso: float) -> dict:
    """Tabla g(peso) por sexo, para reconstruir el Dots desde el peso corporal.

    `Dots = TotalKg * 500 / g(peso, sexo)`. Los pesos se emiten como array
    explícito (no como grilla derivada) para que la interpolación del navegador
    no dependa de que no haya huecos.
    """
    por_sexo: dict[str, dict[str, list]] = {}
    for fila in filas:
        sexo = fila["Sex"]
        d = por_sexo.setdefault(sexo, {"peso": [], "g": []})
        d["peso"].append(round(float(fila["peso"]), 2))
        d["g"].append(round(float(fila["g"]), DECIMALES))

    if not por_sexo:
        raise ValueError("la tabla de puntaje vino vacía")

    salida: dict = {
        "formula": "Dots = TotalKg * 500 / g(peso, sexo)",
        "paso": paso,
    }
    for sexo, d in sorted(por_sexo.items()):
        if len(d["peso"]) < 2:
            raise ValueError(f"puntaje {sexo}: hacen falta al menos 2 puntos")
        if any(b <= a for a, b in zip(d["peso"], d["peso"][1:])):
            raise ValueError(f"puntaje {sexo}: los pesos no son estrictamente crecientes")
        if any(g <= 0 for g in d["g"]):
            raise ValueError(f"puntaje {sexo}: hay g <= 0")
        salida[sexo] = {
            "peso_min": d["peso"][0],
            "peso_max": d["peso"][-1],
            "peso": d["peso"],
            "g": d["g"],
        }
    return salida


# ── Contrato del frontend (comparador.js) ────────────────────────────────────
def _leer_comparador_js() -> str:
    if not COMPARADOR_JS.exists():
        return ""
    return COMPARADOR_JS.read_text(encoding="utf-8")


def contrato_declarado_en_js(js: str) -> dict | None:
    """Lee el objeto CONTRATO de comparador.js: qué espera el motor del JSON."""
    m = re.search(r"const\s+CONTRATO\s*=\s*\{(.*?)\n\};", js, re.S)
    if not m:
        return None
    cuerpo = m.group(1)

    def lista(campo: str) -> list[str]:
        mm = re.search(rf"{campo}\s*:\s*\[(.*?)\]", cuerpo, re.S)
        if not mm:
            return []
        return [x.strip().strip("'\"") for x in mm.group(1).split(",") if x.strip()]

    def texto(campo: str) -> str | None:
        mm = re.search(rf"{campo}\s*:\s*'([^']*)'", cuerpo)
        return mm.group(1) if mm else None

    mm = re.search(r"nMinimo\s*:\s*(\d+)", cuerpo)
    return {
        "fina": lista("metricasFinas"),
        "gruesa": lista("metricasGruesas"),
        "separador": texto("separador"),
        "nMinimo": int(mm.group(1)) if mm else None,
        "puntajeSexos": lista("puntajeSexos"),
    }


def validar_contrato(datos: dict, js: str) -> list[str]:
    problemas: list[str] = []
    contrato = contrato_declarado_en_js(js)

    if contrato is None:
        return [f"no se pudo leer CONTRATO de {COMPARADOR_JS.name}"]

    meta = datos.get("_meta", {})
    celdas = datos.get("celdas", {})
    puntaje = datos.get("puntaje", {})

    if not celdas:
        problemas.append("no hay ninguna celda")

    if contrato["separador"] and contrato["separador"] != SEP:
        problemas.append(
            f"separador: el JS usa {contrato['separador']!r} y el generador {SEP!r}")

    for tier, campo in (("fina", "metricasFinas"), ("gruesa", "metricasGruesas")):
        declaradas = {n for n, _, t in METRICAS if t == tier}
        esperadas = set(contrato[tier])
        if declaradas != esperadas:
            problemas.append(
                f"{campo}: el JS espera {sorted(esperadas)} y se emiten {sorted(declaradas)}")

    if contrato["nMinimo"] is not None and contrato["nMinimo"] != meta.get("n_minimo"):
        problemas.append(
            f"nMinimo: el JS usa {contrato['nMinimo']} y el JSON trae {meta.get('n_minimo')}")

    largos = {"fina": len(meta.get("grid_fina", [])),
              "gruesa": len(meta.get("grid_gruesa", []))}
    if not largos["fina"] or not largos["gruesa"]:
        problemas.append("falta grid_fina o grid_gruesa en _meta")
    else:
        firma = sorted({"n", *(n for n, _, _ in METRICAS)})
        for clave, celda in celdas.items():
            if len(clave.split(SEP)) != 5:
                problemas.append(f"clave con formato inválido: {clave!r}")
                break
            if not isinstance(celda.get("n"), int):
                problemas.append(f"{clave}: 'n' no es entero ({celda.get('n')!r})")
                break
            if celda["n"] < meta.get("n_minimo", 0):
                problemas.append(
                    f"{clave}: n={celda['n']} por debajo del mínimo {meta.get('n_minimo')}")
                break
            if sorted(celda.keys()) != firma:
                problemas.append(
                    f"{clave}: campos {sorted(celda.keys())} != esperados {firma}")
                break
            malo = next((n for n, _, tier in METRICAS
                         if not isinstance(celda.get(n), list)
                         or len(celda[n]) != largos[tier]), None)
            if malo:
                problemas.append(
                    f"{clave}.{malo}: se esperaban {largos['fina' if malo == 'dots' else 'gruesa']} "
                    f"valores")
                break

    esperados_sexos = set(contrato["puntajeSexos"])
    if esperados_sexos:
        faltan = esperados_sexos - set(k for k in puntaje if k in ("M", "F"))
        if faltan:
            problemas.append(f"puntaje: faltan los sexos {sorted(faltan)}")
        if puntaje.get("paso") != meta.get("puntaje_paso"):
            problemas.append(
                f"puntaje.paso ({puntaje.get('paso')}) != _meta.puntaje_paso "
                f"({meta.get('puntaje_paso')})")
        for sexo in sorted(esperados_sexos & set(puntaje)):
            d = puntaje[sexo]
            if len(d.get("peso", [])) != len(d.get("g", [])):
                problemas.append(f"puntaje.{sexo}: peso y g tienen distinto largo")
            elif len(d["peso"]) < 2:
                problemas.append(f"puntaje.{sexo}: menos de 2 puntos")

    return problemas


# ── BigQuery ─────────────────────────────────────────────────────────────────
def _json_safe(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    return valor


def ejecutar_cliente():
    from google.cloud import bigquery

    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", ""):
        por_defecto = Path.home() / ".gcp" / "arg-plifting-sa.json"
        if por_defecto.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(por_defecto)
            print(f"· GOOGLE_APPLICATION_CREDENTIALS no estaba seteada; usando {por_defecto}")

    try:
        return bigquery.Client(project=PROJECT, location=LOCATION)
    except Exception as e:
        print(f"\n✗ No se pudo crear el cliente de BigQuery.\n  {type(e).__name__}: {e}")
        sys.exit(2)


def correr_consulta(client, etiqueta: str, sql: str) -> list[dict]:
    from google.api_core import exceptions as gexc

    ultimo: Exception | None = None
    for intento in range(1, INTENTOS + 1):
        try:
            job = client.query(sql, location=LOCATION)
            return [{k: _json_safe(v) for k, v in dict(r).items()} for r in job.result()]
        except (gexc.TooManyRequests, gexc.InternalServerError,
                gexc.ServiceUnavailable, gexc.BadGateway) as e:
            ultimo = e
            if intento < INTENTOS:
                espera = ESPERA_BASE ** intento
                print(f"   ↻ {etiqueta}: {type(e).__name__}, reintento "
                      f"{intento}/{INTENTOS - 1} en {espera:.0f}s")
                time.sleep(espera)
        except gexc.Forbidden as e:
            print(f"   ✗ {etiqueta}: 403 — falta un permiso en el service account\n      {e}")
            raise
        except gexc.BadRequest as e:
            print(f"   ✗ {etiqueta}: BadRequest — SQL inválido\n      {e}")
            raise
    raise ultimo  # type: ignore[misc]


# ── Salida ───────────────────────────────────────────────────────────────────
def construir_meta(conteos: dict[str, int], cfg: dict, n_celdas: int,
                   puntaje: dict, cohortes: list[dict]) -> dict:
    puntos = {s: len(puntaje[s]["peso"]) for s in ("M", "F") if s in puntaje}
    return {
        "proyecto": "Powerlifting Argentina Data Analysis",
        "capa": "Capa 02 — Comparación y diagnóstico",
        "dataset": f"{PROJECT}.{DATASET}.{TABLE}",
        "ubicacion": LOCATION,
        "ultima_actualizacion": datetime.now(timezone.utc).date().isoformat(),
        "generado_por": "scripts/cohortes.py",
        "fuente_sql": "SQL/phase_3_scala/QueryCapa02.sql",
        "diseno": "docs/03_Arquitectura/02_Fase_02/",
        "n_minimo": cfg["n_minimo"],
        "puntaje_paso": cfg["puntaje_paso"],
        "grid_fina": cfg["grillas"]["fina"],
        "grid_gruesa": cfg["grillas"]["gruesa"],
        "metricas_finas": cfg["metricas"]["fina"],
        "metricas_gruesas": cfg["metricas"]["gruesa"],
        # Los ejes declarados, para que el motor no tenga que adivinarlos
        # recorriendo las claves de las celdas.
        "alcances": sorted({c["alcance"] for c in cohortes}),
        "ventanas": {c["ventana"]: c["desde"] for c in cohortes},
        "celdas": n_celdas,
        "filas_por_cohorte": conteos,
        "puntos_de_puntaje": puntos,
    }


def compactar_arrays(texto: str) -> str:
    """Colapsa los arrays numéricos a una línea, para que el archivo no tenga
    decenas de miles de renglones de un número cada uno."""
    return re.sub(
        r"\[\s*([\d\.\-\+eE,\s]+?)\s*\]",
        lambda m: "[" + ", ".join(x.strip() for x in m.group(1).split(",")) + "]",
        texto,
    )


def escribir_atomico(destino: Path, datos: dict) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    crudo = json.dumps(datos, indent=2, ensure_ascii=False)
    tmp = destino.with_suffix(destino.suffix + ".tmp")
    tmp.write_text(compactar_arrays(crudo) + "\n", encoding="utf-8")
    tmp.replace(destino)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=COHORTES_JSON)
    ap.add_argument("--dry-run", action="store_true", help="no escribe el archivo")
    ap.add_argument("--check", action="store_true",
                    help="valida el cohortes.json actual contra el contrato, sin BigQuery")
    ap.add_argument("--solo", nargs="*", default=None,
                    help="subconjunto de cohortes, por 'alcance|ventana'")
    args = ap.parse_args()

    js = _leer_comparador_js()

    if args.check:
        if not args.out.exists():
            print(f"✗ No existe {args.out}")
            return 1
        datos = json.loads(args.out.read_text(encoding="utf-8"))
        problemas = validar_contrato(datos, js)
        if problemas:
            print(f"✗ {args.out} NO cumple el contrato del comparador:")
            for p in problemas:
                print(f"   · {p}")
            return 1
        print(f"✓ {args.out} cumple el contrato del comparador "
              f"({len(datos.get('celdas', {}))} celdas)")
        return 0

    if not SQL_FILE.exists():
        print(f"✗ No existe {SQL_FILE}")
        return 1

    try:
        cfg = parsear_sql(SQL_FILE.read_text(encoding="utf-8"))
    except SqlCapa02Error as e:
        print(f"✗ {SQL_FILE.name}: {e}")
        return 1

    cohortes = cfg["cohortes"]
    if args.solo:
        pedidas = set(args.solo)
        cohortes = [c for c in cohortes if f"{c['alcance']}{SEP}{c['ventana']}" in pedidas]
        encontradas = {f"{c['alcance']}{SEP}{c['ventana']}" for c in cohortes}
        if pedidas - encontradas:
            print(f"✗ Cohortes no declaradas en el SQL: {sorted(pedidas - encontradas)}")
            return 1

    print(f"· {len(cohortes)} cohortes declaradas en {SQL_FILE.name}")
    print(f"· grilla fina: {len(cfg['grillas']['fina'])} puntos · "
          f"gruesa: {len(cfg['grillas']['gruesa'])} puntos · "
          f"n mínimo: {cfg['n_minimo']} · paso de peso: {cfg['puntaje_paso']}")
    print(f"· destino: {PROJECT}.{DATASET}.{TABLE} ({LOCATION})\n")

    client = ejecutar_cliente()

    filas_por_cohorte: list[tuple[dict, list[dict]]] = []
    conteos: dict[str, int] = {}
    for cohorte in cohortes:
        etiqueta = f"{cohorte['alcance']}{SEP}{cohorte['ventana']}"
        sql = sustituir(
            cfg["bloques"]["cohorte"],
            {"{{DESDE}}": cohorte["desde"], "{{ALCANCE}}": cohorte["filtro"],
             "{{N_MINIMO}}": str(cfg["n_minimo"])},
            PROJECT, DATASET, TABLE)
        try:
            filas = correr_consulta(client, etiqueta, sql)
        except Exception:
            print(f"\n✗ Abortando: falló '{etiqueta}'. No se escribió nada.")
            return 3
        filas_por_cohorte.append((cohorte, filas))
        conteos[etiqueta] = len(filas)
        print(f"   ✓ {etiqueta:<24} {len(filas):>4} celdas")

    sql_puntaje = sustituir(cfg["bloques"]["puntaje"],
                            {"{{PASO}}": repr(cfg["puntaje_paso"])},
                            PROJECT, DATASET, TABLE)
    try:
        filas_puntaje = correr_consulta(client, "puntaje", sql_puntaje)
    except Exception:
        print("\n✗ Abortando: falló la tabla de puntaje. No se escribió nada.")
        return 3
    print(f"   ✓ {'puntaje':<24} {len(filas_puntaje):>4} puntos de peso")

    try:
        celdas = construir_celdas(filas_por_cohorte, cfg)
        puntaje = construir_puntaje(filas_puntaje, cfg["puntaje_paso"])
    except ValueError as e:
        print(f"\n✗ {e}\n  No se escribió nada.")
        return 3

    resumen_puntaje = ", ".join(
        f"{s} {len(puntaje[s]['peso'])} pts" for s in ("M", "F") if s in puntaje)
    print(f"\n· {len(celdas)} celdas · puntaje: {resumen_puntaje}")

    datos = {
        "_meta": construir_meta(conteos, cfg, len(celdas), puntaje, cohortes),
        "celdas": celdas,
        "puntaje": puntaje,
    }

    problemas = validar_contrato(datos, js)
    if problemas:
        print("\n✗ El resultado NO cumple el contrato del comparador:")
        for p in problemas:
            print(f"   · {p}")
        print("\n  No se escribió nada.")
        return 4

    if args.dry_run:
        print(f"\n· dry-run: no se escribió {args.out}")
    else:
        escribir_atomico(args.out, datos)
        kb = args.out.stat().st_size / 1024
        print(f"\n✓ {args.out} escrito ({kb:.1f} KB, {len(celdas)} celdas)")

    print("✓ Contrato del comparador verificado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
