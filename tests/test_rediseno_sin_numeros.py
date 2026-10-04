"""
El rediseno no escribe numeros a mano.

POR QUE EXISTE
--------------
La regla del proyecto es que ningun numero se afirma sin medirlo. En una pagina
que dibuja KPIs, "medirlo" quiere decir leerlo del JSON en tiempo de ejecucion,
no tipearlo en el codigo.

El caso que muestra el costo de la otra via es el "61 tests" de la pagina
vieja: el numero estaba escrito en el HTML, la suite crecio a 195, y el copy
siguio diciendo 61. Nadie se entero hasta que se fue a publicar. Una cifra
tipeada no puede fallar, y lo que no puede fallar no avisa.

QUE REVISA ESTE TEST
--------------------
No revisa que los numeros sean correctos: eso lo garantiza el dato, que es su
unica fuente. Revisa que NO ESTEN ESCRITOS. Es una regla mas debil y a la vez
mas fuerte: mas debil porque no valida el valor, mas fuerte porque hace
imposible el drift.

QUE NO CUBRE
------------
Los literales de texto del JS se revisan solo en su forma mas evidente: una
cadena que es un numero, o que empieza con un numero pegado a markup. Distinguir
"un numero que es una afirmacion" de "un nombre que contiene un numero" (por
ejemplo la etiqueta 'Desde 2018', que nombra una ventana temporal y no afirma
una cantidad) no es algo que un regex pueda resolver, asi que no se intenta. El
test prefiere quedarse corto antes que llenarse de falsos positivos: un test con
ruido se termina desactivando.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PAGINA = RAIZ / "rediseno.html"
JS = RAIZ / "assets" / "js" / "rediseno-pagina.js"

# Etiquetas legitimas: numeros que son NOMBRES de algo, no afirmaciones.
#   01..04         el numero del campo en el formulario
#   Q1, Q2_SEX...  el nombre de la query que produce el panel
#   *.sql|json|html  una ruta de archivo
#   Capa           "Capa 01" / "Capa 02", el nombre de la capa
ETIQUETAS = re.compile(
    r"^(0[1-9]|Q\d+[A-Z0-9_]*|[A-Za-z0-9_./-]+\.(sql|json|html)|Capa)$"
)


def _texto_visible() -> str:
    """El texto que ve el usuario: sin style, sin script, sin tags, sin entidades."""
    h = PAGINA.read_text(encoding="utf-8")
    h = re.sub(r"<style.*?</style>", " ", h, flags=re.S)
    h = re.sub(r"<script.*?</script>", " ", h, flags=re.S)
    h = re.sub(r"<[^>]+>", " ", h)
    h = re.sub(r"&[a-zA-Z0-9#]+;", " ", h)
    return h


def test_el_html_no_tiene_numeros_escritos_a_mano():
    """Ningun numero visible sale del HTML: todos tienen que venir del JSON."""
    sospechosos = []
    for token in re.findall(r"\S*\d\S*", _texto_visible()):
        limpio = token.strip(".,;:()[]")
        if not limpio or ETIQUETAS.match(limpio):
            continue
        sospechosos.append(token)

    assert not sospechosos, (
        "hay numeros tipeados en el HTML: " + repr(sospechosos) +
        ". Tienen que salir del JSON, no del markup. Ver assets/js/rediseno-pagina.js."
    )


def _sin_comentarios(js: str) -> str:
    """Los comentarios no se muestran, asi que no pueden afirmar un numero.
    El (?<!:) protege el // de una URL."""
    js = re.sub(r"/\*.*?\*/", " ", js, flags=re.S)
    return re.sub(r"(?<!:)//[^\n]*", " ", js)


def test_el_js_no_muestra_numeros_escritos_a_mano():
    """Forma evidente: una cadena que ES un numero, o que arranca con un numero
    pegado a markup (el caso real: '0<em>valores de respaldo</em>')."""
    js = _sin_comentarios(JS.read_text(encoding="utf-8"))
    literales = re.findall(r"'([^'\n]*)'|\"([^\"\n]*)\"", js)

    sospechosos = []
    for simple, doble in literales:
        s = (simple or doble).strip()
        if not s or s.startswith("<") or ETIQUETAS.match(s):
            continue
        # Un numero solo, o un numero seguido inmediatamente de markup.
        if re.match(r"^\d[\d.,]*$", s) or re.match(r"^\d[\d.,]*\s*<", s):
            sospechosos.append(s)

    assert not sospechosos, (
        "hay numeros tipeados en textos del JS: " + repr(sospechosos) +
        ". Un numero mostrado tiene que venir del JSON."
    )


def test_los_archivos_de_los_que_lee_existen():
    """El test de arriba no sirve si la pagina no es la que se sirve."""
    assert PAGINA.is_file(), f"no existe {PAGINA}"
    assert JS.is_file(), f"no existe {JS}"
