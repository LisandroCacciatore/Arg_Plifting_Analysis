#!/usr/bin/env python
"""Verifica que el libreto y index.html digan lo mismo.

`docs/LIBRETO-PAGINA.md` documenta el copy del sitio. Sin control, eso son dos
fuentes de verdad del mismo texto: alguien edita la pagina y el libreto queda
mintiendo, o al reves. Este check los mantiene alineados.

Como funciona
-------------
Cada linea que empieza con `> ` en el libreto es un bloque de copy. El check
extrae el texto visible de index.html (sin scripts, estilos ni etiquetas) y
verifica dos cosas:

  1. que cada bloque aparezca en la pagina;
  2. que aparezca en el mismo ORDEN relativo que en el libreto.

El orden importa: sin eso, mover un parrafo de lugar pasaria desapercibido.

Los bloques `(sin cambios)` y las notas no se verifican: no son copy.

Uso:
    python scripts/check_libreto.py             verifica y sale != 0 si falla
    python scripts/check_libreto.py --listar    muestra los bloques verificados
"""
from __future__ import annotations

import argparse
import html as html_mod
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LIBRETO = RAIZ / "docs" / "LIBRETO-PAGINA.md"
PAGINA = RAIZ / "index.html"

# Entidades que html.unescape no cubre con el nombre que usa la pagina
EXTRA = {
    "&mdash;": "—", "&ndash;": "–", "&middot;": "·", "&nbsp;": " ",
    "&laquo;": "«", "&raquo;": "»", "&rarr;": "→", "&hellip;": "…",
}


def texto_visible(html: str) -> str:
    """Texto que ve el lector: sin scripts, sin estilos, sin etiquetas."""
    t = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    t = re.sub(r"<style[\s\S]*?</style>", " ", t, flags=re.I)
    t = re.sub(r"<br\s*/?>", " ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    for ent, ch in EXTRA.items():
        t = t.replace(ent, ch)
    return html_mod.unescape(t)


def normalizar(t: str) -> str:
    """Colapsa espacios y saca el espacio que las etiquetas dejan antes de la
    puntuacion. Sin esto, `</strong>,` produce "ejemplo ," y no matchea nunca.
    """
    t = t.replace("\u00a0", " ")
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\s+([,.;:!?·)»])", r"\1", t)
    t = re.sub(r"([«(])\s+", r"\1", t)
    return t.strip()


def bloques(libreto: str) -> list[tuple[int, str]]:
    """[(numero_de_linea, texto)] de cada bloque `> ` con contenido."""
    salida: list[tuple[int, str]] = []
    for n, ln in enumerate(libreto.split("\n"), 1):
        s = ln.strip()
        if not s.startswith(">"):
            continue
        contenido = s[1:].strip()
        if not contenido or contenido.startswith("(sin cambios)"):
            continue
        salida.append((n, contenido))
    return salida


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--listar", action="store_true",
                    help="mostrar los bloques verificados y salir")
    args = ap.parse_args()

    if not LIBRETO.is_file() or not PAGINA.is_file():
        print(f"falta {LIBRETO} o {PAGINA}", file=sys.stderr)
        return 2

    lista = bloques(LIBRETO.read_text(encoding="utf-8"))
    pagina = normalizar(texto_visible(PAGINA.read_text(encoding="utf-8")))

    if args.listar:
        print(f"bloques de copy en el libreto: {len(lista)}\n")
        for n, b in lista:
            print(f"  L{n:<5} {b[:78]}")
        return 0

    fallos: list[tuple[int, str, str]] = []
    cursor = 0
    for n, bloque in lista:
        objetivo = normalizar(bloque)
        idx = pagina.find(objetivo, cursor)
        if idx == -1:
            # ¿esta, pero antes del cursor? Entonces el orden cambio.
            motivo = "fuera de orden" if pagina.find(objetivo) != -1 else "no esta en la pagina"
            fallos.append((n, bloque, motivo))
        else:
            cursor = idx + len(objetivo)

    print(f"libreto:  {LIBRETO.name}")
    print(f"pagina:   {PAGINA.name}")
    print(f"bloques:  {len(lista)} verificados\n")

    if fallos:
        print(f"✗ {len(fallos)} bloque(s) no coinciden:\n")
        for n, bloque, motivo in fallos:
            print(f"  L{n} del libreto — {motivo}")
            print(f"     \"{bloque[:90]}\"")
        print()
        print("Hay dos causas posibles y las dos son validas:")
        print("  - cambiaste el copy de la pagina y no actualizaste el libreto")
        print("  - cambiaste el libreto y no aplicaste el cambio al HTML")
        return 1

    print("✓ el libreto y la pagina dicen lo mismo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
