#!/usr/bin/env python
"""Verifica que los tests del comparador PUEDAN fallar.

Un test que pasa en verde y en rojo no protege nada. Este script rompe a
proposito, una por una, las cosas que los tests dicen proteger: corre la suite,
exige que falle, y restaura el archivo. Si alguna rotura deja la suite en verde,
el test correspondiente es decorativo y el script sale con codigo != 0.

Es la forma ejecutable de la regla de docs/03_Arquitectura/02_Fase_02/
04_Testing_Capa02.md: "todo test tiene que poder fallar".

Uso:
    python scripts/verificar_tests.py              verifica las 38 roturas
    python scripts/verificar_tests.py --listar     muestra las roturas sin correr
    python scripts/verificar_tests.py --solo 3     corre solo la rotura numero 3

Correr con el python del venv: los comandos de pytest salen de sys.executable.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PY = sys.executable

COMPARADOR = RAIZ / "assets" / "js" / "comparador.js"
PAGINA = RAIZ / "assets" / "js" / "comparador-pagina.js"
HTML = RAIZ / "comparador.html"
COHORTES = RAIZ / "assets" / "data" / "cohortes.json"
SQL = RAIZ / "SQL" / "phase_3_scala" / "QueryCapa02.sql"
GENERADOR_OG = RAIZ / "scripts" / "og_capa02.html"

NODE_COMPARADOR = ["node", "--test", "tests/frontend/comparador.test.mjs"]
NODE_PAGINA = ["node", "--test", "tests/frontend/pagina-comparador.test.mjs"]
PY_CONTRATO = [PY, "-m", "pytest", "tests/test_comparador_html_contract.py", "-q"]
PY_COHORTES = [PY, "-m", "pytest", "tests/test_cohortes.py", "-q"]

# (que se rompe, archivo, texto original, reemplazo, comando que debe fallar)
# El texto original tiene que matchear el archivo: si no matchea, el script lo
# reporta en vez de dar un falso OK (una rotura que no se aplico no prueba nada).
ROTURAS = [
    (
        "la banda por n chico se emite como percentil exacto",
        COMPARADOR,
        "const exacto = calidad === 'firme' || calidad === 'acotada';",
        "const exacto = true;",
        NODE_COMPARADOR,
    ),
    (
        "el eje sexo se ignora: siempre se busca la cohorte masculina",
        COMPARADOR,
        "                                perfil.sexo, edad, perfil.equipamiento);",
        "                                'M', edad, perfil.equipamiento);",
        NODE_COMPARADOR,
    ),
    (
        "la cohorte pedida se pisa con la del mayor n",
        COMPARADOR,
        "const usable = encontradas.find((c) => c.celda.n >= UMBRALES.banda);",
        "const usable = null;",
        NODE_COMPARADOR,
    ),
    (
        "el percentil deja de ser monotono",
        COMPARADOR,
        "      const t = (valor - a) / (b - a);\n      return grilla[i] + t * (grilla[i + 1] - grilla[i]);",
        "      return 50;",
        NODE_COMPARADOR,
    ),
    (
        "el puntaje deja de clampearse fuera del rango de peso",
        COMPARADOR,
        "  if (peso <= xs[0]) return { g: ys[0], clampeado: peso < xs[0] };",
        "  if (peso <= xs[0]) return { g: ys[0], clampeado: false };",
        NODE_COMPARADOR,
    ),
    (
        "la validacion de entradas deja pasar el peso cero",
        COMPARADOR,
        "  if (!esNumeroPositivo(perfil.peso)) {",
        "  if (false) {",
        NODE_COMPARADOR,
    ),
    (
        "una metrica desaparece del contrato del motor",
        COMPARADOR,
        "  metricasFinas: ['dots'],",
        "  metricasFinas: [],",
        PY_COHORTES,
    ),
    (
        "el n de la celda de referencia del golden master cambia",
        COHORTES,
        '"n": 140561,',
        '"n": 999999,',
        NODE_COMPARADOR,
    ),
    (
        "un valor de la tabla de referencia se corre",
        COHORTES,
        '"dots": [43.17, 235.47',
        '"dots": [999.0, 235.47',
        NODE_COMPARADOR,
    ),
    (
        "el SQL deja de sustituir el N_MINIMO",
        SQL,
        "  COUNT(*) >= {{N_MINIMO}}",
        "  COUNT(*) >= 10",
        PY_COHORTES,
    ),
    (
        "un texto visible del cableado lleva tilde",
        PAGINA,
        "      banda: 'cohorte chica: se muestra una banda',",
        "      banda: 'cohorte chica: se muestra una banda \u00f3ptima',",
        PY_CONTRATO,
    ),
    (
        "la pagina promete un plan de entrenamiento",
        PAGINA,
        "      ? 'Ese levantamiento esta en el percentil 25 o menos de la cohorte, mientras los otros no. '",
        "      ? 'Ese levantamiento esta en el percentil 25 o menos: plan de entrenamiento sugerido. '",
        PY_CONTRATO,
    ),
    (
        "un id del HTML desaparece",
        HTML,
        '<select id="cmp-sexo" required>',
        '<select required>',
        PY_CONTRATO,
    ),
    (
        "la prosa de la pagina lleva una tilde",
        HTML,
        "<h2>Donde esta parado un perfil, en numeros</h2>",
        "<h2>D\u00f3nde est\u00e1 parado un perfil, en numeros</h2>",
        PY_CONTRATO,
    ),
    (
        "sin datos la pagina igual muestra el bloque de resultados",
        PAGINA,
        "      form.hidden = true;",
        "      form.hidden = false;",
        NODE_PAGINA,
    ),
    (
        "un error HTTP produce un resultado igual",
        PAGINA,
        "    if (!resp.ok) throw new Error(`${RUTA_DATOS} respondio ${resp.status}`);",
        "    if (false) throw new Error('nunca');",
        NODE_PAGINA,
    ),
    (
        "el resultado deja de declarar la region",
        PAGINA,
        "        Fuente: <strong>${esc(t.dataset || '')}</strong> (region ${esc(t.ubicacion || '')})",
        "        Fuente: <strong>${esc(t.dataset || '')}</strong>",
        NODE_PAGINA,
    ),
    # ── Niveles con nombre (CD2) ──────────────────────────────────────────
    (
        "Elite deja de empezar en el percentil 80: los quintos se rompen",
        COMPARADOR,
        "  { nombre: 'Elite', desde: 80, hasta: 100 },",
        "  { nombre: 'Elite', desde: 60, hasta: 100 },",
        NODE_COMPARADOR,
    ),
    (
        "nivelDe corta por arriba del borde, y el 20 exacto cae en dos bandas",
        COMPARADOR,
        "    (n) => p >= n.desde && (p < n.hasta || n.hasta === 100));",
        "    (n) => p > n.desde && p <= n.hasta);",
        NODE_COMPARADOR,
    ),
    (
        "una cohorte con banda estrena un nivel igual, inventado del punto medio",
        COMPARADOR,
        "  const nivel = exacto ? nivelDe(celdaPuntaje.percentil) : null;",
        "  const nivel = nivelDe(exacto ? celdaPuntaje.percentil : 50);",
        NODE_COMPARADOR,
    ),
    # ── El efecto del peso: el hallazgo ───────────────────────────────────
    (
        "el efecto del peso deja de depender del peso",
        COMPARADOR,
        "    const r = gDePuntaje(tabla, sexo, p);",
        "    const r = gDePuntaje(tabla, sexo, peso);",
        NODE_COMPARADOR,
    ),
    (
        "el delta del peso mas pesado cambia de signo",
        COMPARADOR,
        "  mas.delta = redondear(mas.puntaje - actual.puntaje, 1);",
        "  mas.delta = redondear(actual.puntaje - mas.puntaje, 1);",
        NODE_COMPARADOR,
    ),
    (
        "la distancia al nivel siguiente pierde los kilos de total",
        COMPARADOR,
        "    deltaKg: deltaDots > 0 ? redondear((deltaDots * g) / 500, 1) : 0,",
        "    deltaKg: 0,",
        NODE_COMPARADOR,
    ),
    (
        "valorEnPercentil deja de recortar fuera del rango",
        COMPARADOR,
        "  if (p <= grilla[0]) return vector[0];",
        "  if (p <= grilla[0]) return null;",
        NODE_COMPARADOR,
    ),
    (
        "el efecto del peso inventa el punto que no puede calcular",
        COMPARADOR,
        "  if (bajos <= 0) return null;",
        "  if (false) return null;",
        NODE_COMPARADOR,
    ),
    (
        "un texto nuevo de la nota del peso lleva tilde",
        COMPARADOR,
        "  efectoPesoNota: 'El puntaje divide por una funcion del peso: a igual total, mas peso corporal da menos puntaje.',",
        "  efectoPesoNota: 'El puntaje divide por una función del peso: a igual total, más peso corporal da menos puntaje.',",
        NODE_COMPARADOR,
    ),
    # ── El medidor vivo ───────────────────────────────────────────────────
    (
        # El \n inicial NO es decorativo: 'cajaPeso.hidden = true;' aparece tambien
        # en pintarPeso con mas sangria, y sin el prefijo la rotura se aplicaba a la
        # ocurrencia equivocada — ninguna test la miraba y la suite quedaba verde.
        # Con el \n + la sangria exacta el ancla es unica (y \r\n contiene \n, asi que
        # funciona igual con finales de linea CRLF).
        "al ocultarse el medidor, el bloque del peso queda con numeros viejos",
        PAGINA,
        "\n    cajaPeso.hidden = true;",
        "\n    cajaPeso.hidden = false;",
        NODE_PAGINA,
    ),
    (
        "la marca de la escala deja de seguir al percentil",
        PAGINA,
        "    escalaMarca.style.left = `calc(${p}% - 1px)`;",
        "    escalaMarca.style.left = '0px';",
        NODE_PAGINA,
    ),
    (
        "ninguna banda de la escala queda resaltada",
        PAGINA,
        "class=\"${activo && i === activo.indice ? 'on' : ''}\"",
        "class=\"\"",
        NODE_PAGINA,
    ),
    (
        "el resultado deja de mostrar el nivel",
        PAGINA,
        "    const nivelLinea = r.nivel",
        "    const nivelLinea = null",
        NODE_PAGINA,
    ),
    (
        "el resultado deja de mostrar la distancia al nivel siguiente",
        PAGINA,
        "    } else if (r.distancia) {",
        "    } else if (false) {",
        NODE_PAGINA,
    ),
    (
        "el medidor inventa un nivel para una cohorte con banda",
        PAGINA,
        "      vivoNivel.textContent = 'sin nivel';",
        "      vivoNivel.textContent = 'Base';",
        NODE_PAGINA,
    ),
    (
        "el medidor calla que el peso quedo fuera del rango con datos",
        PAGINA,
        "    const fueraDeRango = (r.limitaciones || []).includes(C.TEXTOS.pesoFueraDeRango);",
        "    const fueraDeRango = false;",
        NODE_PAGINA,
    ),
    (
        "el aviso del peso queda colgado cuando el medidor se oculta",
        PAGINA,
        "    vivoAviso.hidden = true;",
        "    vivoAviso.hidden = false;",
        NODE_PAGINA,
    ),
    # ── La tarjeta social ─────────────────────────────────────────────────
    (
        "el og:image apunta a un archivo que no existe (tarjeta sin imagen)",
        HTML,
        # Ancla de dos lineas: la URL sola aparece DOS veces (og:image y
        # twitter:image) y el reemplazo caeria en cualquiera de las dos. Con la
        # propiedad incluida es unica. Funciona con CRLF porque el verificador
        # normaliza los finales de linea antes de comparar.
        '    <meta property="og:image"\n        content="https://lisandrocacciatore.github.io/Arg_Plifting_Analysis/assets/img/og-capa02.png">',
        '    <meta property="og:image"\n        content="https://lisandrocacciatore.github.io/Arg_Plifting_Analysis/assets/img/no-existe.png">',
        PY_CONTRATO,
    ),
    (
        "las dimensiones declaradas dejan de coincidir con el PNG real",
        HTML,
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:height" content="631">',
        PY_CONTRATO,
    ),
    (
        "el og:url apunta a otra pagina",
        HTML,
        'content="https://lisandrocacciatore.github.io/Arg_Plifting_Analysis/comparador.html">',
        'content="https://lisandrocacciatore.github.io/Arg_Plifting_Analysis/index.html">',
        PY_CONTRATO,
    ),
    (
        "la tarjeta publica un numero que el motor no devuelve",
        GENERADOR_OG,
        # El \n + la sangria son imprescindibles: '378,8' aparece tambien en el
        # comentario de cabecera del archivo, y sin el prefijo el reemplazo caia
        # ahi en vez de en el div — la suite quedaba verde con la tarjeta rota.
        # (Es la segunda vez que pasa en este script: ahora el ancla ambigua se
        # rechaza sola, ver el chequeo de `ocurrencias` mas abajo.)
        '\n            <div class="valor">378,8</div>',
        '\n            <div class="valor">999,9</div>',
        PY_CONTRATO,
    ),
]


def correr(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, timeout=900)


def primer_fallo(salida: str) -> str:
    for linea in salida.splitlines():
        s = linea.strip()
        if s.startswith("FAILED") or s.startswith("✖"):
            return s[:80]
    return "sale con codigo != 0"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--listar", action="store_true", help="muestra las roturas y sale")
    ap.add_argument("--solo", type=int, default=None, help="corre una sola rotura (1-based)")
    args = ap.parse_args()

    if args.listar:
        print(f"roturas declaradas: {len(ROTURAS)}\n")
        for i, (nombre, archivo, _, _, _) in enumerate(ROTURAS, 1):
            print(f"  {i:>2}. [{archivo.name}] {nombre}")
        return 0

    seleccion = ([(args.solo, ROTURAS[args.solo - 1])] if args.solo
                 else list(enumerate(ROTURAS, 1)))
    if args.solo and not 1 <= args.solo <= len(ROTURAS):
        print(f"✗ --solo fuera de rango (1..{len(ROTURAS)})")
        return 2

    print("=" * 74)
    print("VERIFICACION: cada test tiene que FALLAR cuando se rompe lo que protege")
    print("=" * 74)

    problemas: list[str] = []
    for numero, (nombre, archivo, viejo, nuevo, cmd) in seleccion:
        original = archivo.read_text(encoding="utf-8")

        # Los finales de linea se normalizan a LF para comparar y reemplazar.
        # Razon: un ancla multilinea escrita con \n NO matchea un archivo CRLF
        # ('...">' queda seguido de \r, no de \n), y quien escribe la rotura no
        # tiene por que saber con que final de linea quedo cada archivo del repo.
        # Se restaura el final de linea original al escribir, asi el archivo no
        # se reescribe entero en el respaldo/restauracion.
        crlf = "\r\n" in original
        texto = original.replace("\r\n", "\n")
        viejo_n = viejo.replace("\r\n", "\n")
        nuevo_n = nuevo.replace("\r\n", "\n")

        # El ancla tiene que ser UNICA. Si el texto aparece mas de una vez, el
        # replace(..., 1) cae en la primera ocurrencia, que puede ser una rama
        # que ningun test mira: la suite queda VERDE con el codigo roto.
        # Le paso dos veces a este script (los dos casos estan documentados en
        # docs/03_Arquitectura/02_Fase_02/04_Testing_Capa02.md). Se rechaza en
        # vez de advertir, porque un falso OK del verificador es peor que una
        # rotura de menos: da por buena toda la corrida.
        ocurrencias = texto.count(viejo_n)
        if ocurrencias != 1:
            print(f"  ??  [{numero}] {nombre}")
            if ocurrencias == 0:
                print(f"      la rotura NO matcheo en {archivo.name}: {viejo[:60]!r}")
                print(f"      (una rotura que no se aplico no prueba nada)")
            else:
                print(f"      el ancla aparece {ocurrencias} veces en {archivo.name}")
                print(f"      (el reemplazo caeria en la primera, que puede ser la equivocada:")
                print(f"       agregale contexto —un \\n inicial y la sangria exacta— "
                      f"para que sea unica)")
            problemas.append(nombre)
            continue

        respaldo = archivo.with_suffix(archivo.suffix + ".bak")
        shutil.copy2(archivo, respaldo)
        try:
            roto = texto.replace(viejo_n, nuevo_n, 1)
            archivo.write_text(roto.replace("\n", "\r\n") if crlf else roto, encoding="utf-8")
            r = correr(cmd)
            if r.returncode == 0:
                print(f"  XX  [{numero}] {nombre}")
                print(f"      la suite PASO con el codigo roto: el test es decorativo")
                problemas.append(nombre)
            else:
                print(f"  OK  [{numero}] {nombre}")
                print(f"      falla como debe · {primer_fallo(r.stdout + r.stderr)}")
        finally:
            archivo.write_text(original, encoding="utf-8")
            respaldo.unlink(missing_ok=True)

    print()
    print("=" * 74)
    if problemas:
        print(f"PROBLEMA: {len(problemas)} rotura(s) no hizo fallar nada:")
        for n in problemas:
            print(f"  - {n}")
        return 1
    print(f"OK: las {len(seleccion)} roturas hicieron fallar su test")
    return 0


if __name__ == "__main__":
    sys.exit(main())
