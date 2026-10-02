#!/usr/bin/env python
"""Regenera assets/data/data.json ejecutando las queries de Capa 01 en BigQuery.

Fuente de verdad: SQL/phase_2_core/QueryCapa01.sql
Cada query declara con `-- @data-key: <clave>` qué clave de data.json produce.

Antes de escribir, valida el CONTRATO del frontend: que data.json contenga
todas las claves y campos que assets/js/app.js lee. Si el contrato no se
cumple, no escribe nada y sale con código != 0.

Uso:
    python scripts/refresh_data.py                    # escribe data.json
    python scripts/refresh_data.py --dry-run          # no escribe, muestra resumen
    python scripts/refresh_data.py --check            # valida el data.json actual
    python scripts/refresh_data.py --out otro.json    # escribe en otro lado
    python scripts/refresh_data.py --solo q5_temporal q9b_place

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
SQL_FILE = RAIZ / "SQL" / "phase_2_core" / "QueryCapa01.sql"
DATA_JSON = RAIZ / "assets" / "data" / "data.json"
APP_JS = RAIZ / "assets" / "js" / "app.js"

# ── Configuración ────────────────────────────────────────────────────────────
PROJECT = os.environ.get("BQ_PROJECT", "burnished-rider-368414")
DATASET = os.environ.get("BQ_DATASET", "Openpowerlifting")
TABLE = os.environ.get("BQ_TABLE", "OpenDataRaw")
LOCATION = os.environ.get("BQ_LOCATION", "southamerica-east1")

TABLE_DEFAULT = "OpenDataRaw"
FQN_RE = re.compile(r"`([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]+)`")
MARKER_RE = re.compile(r"^--\s*@data-key:\s*([A-Za-z0-9_]+)\s*$")
SHAPE_RE = re.compile(r"^--\s*@data-shape:\s*(object|list)\s*$")
MAX_LINEAS_STATEMENT = 400

INTENTOS = 3
ESPERA_BASE = 2.0


# ── Parseo del SQL ───────────────────────────────────────────────────────────
def extraer_consultas(texto_sql: str) -> list[tuple[str, str, str]]:
    """Devuelve [(clave, sql, forma)] según los marcadores del archivo.

    `-- @data-key: <clave>`  declara qué clave de data.json produce la query.
    `-- @data-shape: object` (opcional) indica que la query devuelve UNA fila y
    debe serializarse como objeto, no como lista de un elemento.
    """
    lineas = texto_sql.replace("\r\n", "\n").split("\n")
    consultas: list[tuple[str, str, str]] = []
    clave: str | None = None
    forma = "list"
    buffer: list[str] = []

    for ln in lineas:
        limpio = ln.strip()

        m = MARKER_RE.match(limpio)
        if m:
            if clave is not None:
                raise ValueError(f"@data-key anidado: '{clave}' nunca cerró con ';'")
            clave = m.group(1)
            forma = "list"
            continue

        m = SHAPE_RE.match(limpio)
        if m:
            if clave is None:
                raise ValueError(f"@data-shape sin @data-key: {limpio!r}")
            forma = m.group(1)
            continue

        if clave is None:
            continue
        if not buffer and not limpio.upper().startswith("SELECT"):
            continue

        buffer.append(ln)
        if limpio.endswith(";"):
            if len(buffer) > MAX_LINEAS_STATEMENT:
                raise ValueError(f"statement sospechosamente largo en {clave}")
            consultas.append((clave, "\n".join(buffer).strip(), forma))
            buffer = []
            clave = None
            forma = "list"

    if clave is not None:
        raise ValueError(f"la query de '{clave}' no termina en ';'")
    return consultas


def sustituir_fqn(sql: str, project: str, dataset: str, table: str) -> str:
    """Permite apuntar a otro proyecto/dataset/tabla sin editar el SQL."""

    def repl(m: re.Match) -> str:
        if m.group(3) == TABLE_DEFAULT:
            return f"`{project}.{dataset}.{table}`"
        return m.group(0)

    return FQN_RE.sub(repl, sql)


# ── Contrato del frontend (app.js) ───────────────────────────────────────────
def _leer_app_js() -> str:
    return APP_JS.read_text(encoding="utf-8")


def donuts_esperados(app_js: str) -> list[tuple[str, str, str, str]]:
    return re.findall(
        r"renderDonut\(\s*'([^']+)'\s*,\s*data\.(\w+)\s*,\s*'([^']+)'\s*,\s*'([^']+)'",
        app_js,
        re.S,
    )


def temporales_esperados(app_js: str) -> list[str]:
    """La serie temporal entra por inicializarTemporal(data.<clave>)."""
    return re.findall(r"inicializarTemporal\(data\.(\w+)\)", app_js)


def metricas_temporales_esperadas(app_js: str) -> list[str]:
    """Columnas que los gráficos por métrica grafican de la serie temporal."""
    return sorted(set(re.findall(
        r"renderTemporalMetrica\(\s*'[^']+'\s*,\s*\w+\s*,\s*'(\w+)'", app_js)))


def kpis_esperados(app_js: str) -> tuple[str | None, list[str]]:
    """renderizarKPIs(data.<clave>) accede a los campos vía el parámetro `q1`."""
    m = re.search(r"renderizarKPIs\(data\.(\w+)\)", app_js)
    if not m:
        return None, []
    return m.group(1), sorted(set(re.findall(r"\bq1\.(\w+)", app_js)))


def validar_contrato(datos: dict, app_js: str) -> list[str]:
    problemas: list[str] = []

    # KPIs: la clave debe ser un OBJETO (no una lista de un elemento)
    clave_kpi, campos_kpi = kpis_esperados(app_js)
    if clave_kpi:
        if clave_kpi not in datos:
            problemas.append(f"kpis: falta data.{clave_kpi}")
        elif not isinstance(datos[clave_kpi], dict):
            problemas.append(
                f"kpis: data.{clave_kpi} debe ser un objeto, no "
                f"{type(datos[clave_kpi]).__name__}"
            )
        else:
            for campo in campos_kpi:
                if campo not in datos[clave_kpi]:
                    problemas.append(f"kpis: data.{clave_kpi} no tiene el campo '{campo}'")

    for canvas, clave, campo_label, campo_valor in donuts_esperados(app_js):
        if clave not in datos:
            problemas.append(f"#{canvas}: falta data.{clave}")
            continue
        filas = datos[clave]
        if not isinstance(filas, list):
            problemas.append(
                f"#{canvas}: data.{clave} debe ser una lista, no {type(filas).__name__}"
            )
            continue
        if not filas:
            problemas.append(f"#{canvas}: data.{clave} está vacío")
            continue
        for campo in (campo_label, campo_valor):
            if campo not in filas[0]:
                problemas.append(
                    f"#{canvas}: data.{clave} no tiene el campo '{campo}' "
                    f"(campos: {list(filas[0].keys())})"
                )

    for clave in temporales_esperados(app_js):
        if clave not in datos:
            problemas.append(f"chartTiempo: falta data.{clave}")
            continue
        if not isinstance(datos[clave], list) or not datos[clave]:
            problemas.append(f"chartTiempo: data.{clave} no es una lista con datos")
            continue
        # 'anio' para el eje X + una columna por cada gráfico de métrica
        for campo in ["anio", *metricas_temporales_esperadas(app_js)]:
            if campo not in datos[clave][0]:
                problemas.append(f"chartTiempo: falta el campo '{campo}' en data.{clave}")

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

    cred = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    if not cred:
        por_defecto = Path.home() / ".gcp" / "arg-plifting-sa.json"
        if por_defecto.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(por_defecto)
            print(f"· GOOGLE_APPLICATION_CREDENTIALS no estaba seteada; "
                  f"usando {por_defecto}")

    try:
        return bigquery.Client(project=PROJECT, location=LOCATION)
    except Exception as e:  # DefaultCredentialsError, etc.
        print(f"\n✗ No se pudo crear el cliente de BigQuery.\n  {type(e).__name__}: {e}")
        print("\n  Revisá GOOGLE_APPLICATION_CREDENTIALS y que la key exista.")
        sys.exit(2)


def correr_consulta(client, clave: str, sql: str) -> list[dict]:
    from google.api_core import exceptions as gexc

    ultimo_error: Exception | None = None
    for intento in range(1, INTENTOS + 1):
        try:
            job = client.query(sql, location=LOCATION)
            filas = [{k: _json_safe(v) for k, v in dict(r).items()} for r in job.result()]
            return filas
        except (gexc.TooManyRequests, gexc.InternalServerError,
                gexc.ServiceUnavailable, gexc.BadGateway) as e:
            ultimo_error = e
            if intento < INTENTOS:
                espera = ESPERA_BASE ** intento
                print(f"   ↻ {clave}: {type(e).__name__}, reintento {intento}/{INTENTOS-1} "
                      f"en {espera:.0f}s")
                time.sleep(espera)
        except gexc.Forbidden as e:
            print(f"   ✗ {clave}: 403 — falta un permiso en el service account\n      {e}")
            raise
        except gexc.NotFound as e:
            print(f"   ✗ {clave}: NotFound — ¿existe {PROJECT}.{DATASET}.{TABLE}?\n      {e}")
            raise
        except gexc.BadRequest as e:
            print(f"   ✗ {clave}: BadRequest — SQL inválido\n      {e}")
            raise
    raise ultimo_error  # type: ignore[misc]


# ── Armado del data.json ─────────────────────────────────────────────────────
def construir_meta(conteos: dict[str, int], proyecto: str, dataset: str, tabla: str) -> dict:
    return {
        "proyecto": "Powerlifting Argentina Data Analysis",
        "capa": "Capa 01 — Análisis Descriptivo Base",
        "dataset": f"{proyecto}.{dataset}.{tabla}",
        "ubicacion": LOCATION,
        "ultima_actualizacion": datetime.now(timezone.utc).date().isoformat(),
        "generado_por": "scripts/refresh_data.py",
        "fuente_sql": "SQL/phase_2_core/QueryCapa01.sql",
        "consultas": conteos,
        "total_filas": sum(conteos.values()),
    }


def escribir_atomico(destino: Path, datos: dict) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(destino.suffix + ".tmp")
    tmp.write_text(json.dumps(datos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(destino)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DATA_JSON)
    ap.add_argument("--dry-run", action="store_true", help="no escribe el archivo")
    ap.add_argument("--check", action="store_true",
                    help="valida el data.json actual contra el contrato, sin tocar BigQuery")
    ap.add_argument("--solo", nargs="*", default=None, help="subconjunto de claves")
    args = ap.parse_args()

    app_js = _leer_app_js()

    # --check: validación offline del archivo existente
    if args.check:
        if not args.out.exists():
            print(f"✗ No existe {args.out}")
            return 1
        datos = json.loads(args.out.read_text(encoding="utf-8"))
        problemas = validar_contrato(datos, app_js)
        if problemas:
            print(f"✗ {args.out} NO cumple el contrato del frontend:")
            for p in problemas:
                print(f"   · {p}")
            return 1
        print(f"✓ {args.out} cumple el contrato del frontend "
              f"({len(datos)} claves)")
        return 0

    # 1. Parsear el SQL
    if not SQL_FILE.exists():
        print(f"✗ No existe {SQL_FILE}")
        return 1
    consultas = extraer_consultas(SQL_FILE.read_text(encoding="utf-8"))
    if args.solo:
        pedidas = set(args.solo)
        consultas = [(k, s, f) for k, s, f in consultas if k in pedidas]
        faltan = pedidas - {k for k, _, _ in consultas}
        if faltan:
            print(f"✗ Claves sin query marcada en el SQL: {sorted(faltan)}")
            return 1
    if not consultas:
        print(f"✗ No se encontró ninguna query con `-- @data-key:` en {SQL_FILE.name}")
        return 1

    print(f"· {len(consultas)} queries marcadas en {SQL_FILE.name}")
    print(f"· destino: {PROJECT}.{DATASET}.{TABLE} ({LOCATION})\n")

    client = ejecutar_cliente()

    # 2. Ejecutar
    datos: dict = {}
    conteos: dict[str, int] = {}
    for clave, sql, forma in consultas:
        sql_final = sustituir_fqn(sql, PROJECT, DATASET, TABLE)
        try:
            filas = correr_consulta(client, clave, sql_final)
        except Exception:
            print(f"\n✗ Abortando: falló '{clave}'. No se escribió nada.")
            return 3

        if forma == "object":
            if len(filas) != 1:
                print(f"\n✗ '{clave}' está marcada @data-shape: object "
                      f"pero devolvió {len(filas)} filas. No se escribió nada.")
                return 3
            datos[clave] = filas[0]
            conteos[clave] = 1
            print(f"   ✓ {clave:<18} {'objeto':>6} (1 fila)")
        else:
            datos[clave] = filas
            conteos[clave] = len(filas)
            print(f"   ✓ {clave:<18} {len(filas):>4} filas")

    # 3. Validar ANTES de escribir
    problemas = validar_contrato(datos, app_js)
    if problemas:
        print(f"\n✗ El resultado NO cumple el contrato del frontend:")
        for p in problemas:
            print(f"   · {p}")
        print("\n  No se escribió nada.")
        return 4

    datos = {"_meta": construir_meta(conteos, PROJECT, DATASET, TABLE), **datos}

    # 4. Escribir
    if args.dry_run:
        print(f"\n· dry-run: no se escribió {args.out}")
    else:
        escribir_atomico(args.out, datos)
        kb = args.out.stat().st_size / 1024
        print(f"\n✓ {args.out} escrito ({kb:.1f} KB, {len(datos)-1} claves)")

    print(f"✓ Contrato del frontend verificado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
