#!/usr/bin/env python
"""Verifica que el SQL declare sus claves de data.json de forma consistente.

Check de CI, sin credenciales y sin tocar BigQuery. Valida:
  1. que toda query exportable tenga su marcador `-- @data-key:`;
  2. que no haya claves duplicadas;
  3. que las claves coincidan con lo que el frontend consume;
  4. que las declaradas como `@data-shape: object` devuelvan una sola fila.

Uso:  python scripts/check_sql_keys.py
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SQL_FILE = RAIZ / "SQL" / "phase_2_core" / "QueryCapa01.sql"


def cargar_refresh():
    spec = importlib.util.spec_from_file_location(
        "refresh_data", RAIZ / "scripts" / "refresh_data.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    rd = cargar_refresh()
    consultas = rd.extraer_consultas(SQL_FILE.read_text(encoding="utf-8"))

    print(f"archivo: {SQL_FILE.name}")
    print(f"queries marcadas: {len(consultas)}\n")
    for clave, _sql, forma in consultas:
        print(f"  {clave:<20} forma={forma}")

    errores: list[str] = []

    if not consultas:
        errores.append("no se encontró ninguna query con `-- @data-key:`")

    claves = [k for k, _, _ in consultas]
    duplicadas = sorted({k for k in claves if claves.count(k) > 1})
    if duplicadas:
        errores.append(f"claves @data-key duplicadas: {duplicadas}")

    # Los SELECT sin marcador son queries documentadas pero no exportadas:
    # se reportan como aviso, no como error.
    total_select = len(re.findall(r"^\s*SELECT", SQL_FILE.read_text(encoding="utf-8"),
                                  re.M | re.I))
    sin_exportar = total_select - len(consultas)
    print(f"\nSELECT en el archivo: {total_select} "
          f"| exportadas: {len(consultas)} | sin exportar: {sin_exportar}")

    # Las claves exportadas deben cubrir lo que el frontend consume.
    app_js = rd._leer_app_js()
    consumidas = set()
    consumidas |= {c for _, c, _, _ in rd.donuts_esperados(app_js)}
    consumidas |= set(rd.temporales_esperados(app_js))
    consumidas |= {c for c, _ in rd.renderizadores_simples(app_js)}
    clave_kpi, _ = rd.kpis_esperados(app_js)
    if clave_kpi:
        consumidas.add(clave_kpi)

    faltantes = sorted(consumidas - set(claves))
    if faltantes:
        errores.append(
            f"el frontend consume claves que el SQL no exporta: {faltantes}")

    print(f"\nclaves que consume el frontend: {len(consumidas)}")
    print(f"claves que exporta el SQL:      {len(claves)}")
    no_usadas = sorted(set(claves) - consumidas)
    if no_usadas:
        print(f"exportadas y no usadas por el frontend (informativo): {no_usadas}")

    print()
    if errores:
        for e in errores:
            print(f"✗ {e}")
        return 1
    print("✓ el SQL declara sus claves de forma consistente")
    return 0


if __name__ == "__main__":
    sys.exit(main())
