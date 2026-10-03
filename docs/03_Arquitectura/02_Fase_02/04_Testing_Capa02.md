# Testing de la capa

Ninguna medición se muestra si no pasa estos criterios. La capa mide personas:
un percentil equivocado no es un bug visual, es una conclusión falsa sobre
alguien.

## La regla de la fase

> Todo test tiene que poder **fallar**. Un test que no se puede romper es
> decorativo.

Cada test de la lista de abajo se verifica **rompiendo a propósito** lo que
protege, y comprobando que efectivamente falla. Un test que pasa en rojo y en
verde no está midiendo nada. Este criterio ya se aplicó en la Capa 01 (donde un
test de CSS era decorativo porque su regex matcheaba como prefijo) y su costo
está documentado: se encontró rompiéndolo, no leyéndolo.

## Criterios de aceptación

### Sobre la cohorte

| # | Criterio | Cómo se rompe a propósito |
|---|---|---|
| 1 | **Determinismo.** Los mismos parámetros devuelven la misma cohorte y el mismo n | Cambiar un eje y verificar que el n cambia. Si no cambia, el eje no se está aplicando |
| 2 | **El eje se usa.** Cambiar `Sex` cambia el percentil de la misma marca | Pasar `M` y `F` con la misma marca: los percentiles tienen que diferir en ≥ 10 puntos. Es la prueba de que la cohorte es real y no un adorno |
| 3 | **El eje de edad se usa.** Cambiar `AgeClass` cambia el percentil | Igual, con `24-34` vs `45-49` |
| 4 | **Alcance honesto.** `nacional` y `mundial` dan n distinto y el alcance usado se informa | Forzar el alcance mundial y verificar que el resultado lo declara |
| 5 | **Ventana aplicada.** Cambiar `@desde` cambia el n | Comparar `2018-01-01` contra el histórico: el n nacional tiene que subir |

### Sobre el n mínimo

| # | Criterio | Cómo se rompe |
|---|---|---|
| 6 | **n < 10 → no se emite percentil** | Pedir una celda con n<10 (ej. `F`/`60-64`/nacional) y verificar que no hay número. Subir el umbral a 100 y verificar que celdas antes válidas ahora quedan sin percentil |
| 7 | **10 ≤ n < 30 → banda, no número exacto** | Verificar que la respuesta trae un rango y no un punto |
| 8 | **El n siempre está presente** | Romper el serializador omitiendo el n: el test tiene que fallar |

### Sobre los defensivos

| # | Criterio | Cómo se rompe |
|---|---|---|
| 9 | **Sin división por cero.** `Best3SquatKg = 0` no produce excepción ni infinito | Quitar el guard `> 0` y verificar que aparece un NULL o un error; restaurarlo y verificar que no |
| 10 | **Sin `Dots` no hay comparación.** Una fila con `Dots IS NULL` no entra a la cohorte | Quitar el guard y verificar que el n cambia |
| 11 | **`Share` suma 1 por fila.** `Best3SquatKg + Best3BenchKg + Best3DeadliftKg = TotalKg` | El invariante es **por fila**, no por cuantil. Ver la nota de abajo: la versión por cuantil de este test es falsa y fue un error real de este diseño |
| 12 | **Entradas inválidas rechazadas.** Edad 400, peso negativo, banco > total → error explícito, no un percentil | Cada caso tiene su test |

### Sobre el contrato con la data

| # | Criterio | Cómo se rompe |
|---|---|---|
| 13 | **La tabla de referencia coincide con BigQuery** dentro de la tolerancia | Cambiar un valor de la tabla y verificar que el test falla. Es el mismo patrón que ya usa `refresh_data.py` para `data.json` |
| 14 | **Trazabilidad.** La respuesta declara dataset, región, ventana y ejes | Verificar que los campos están y que la región dice `southamerica-east1` |

### Sobre la presentación

Lo que agrega el documento 05. El riesgo acá no es medir mal: es **presentar bien
una medición que dice otra cosa**.

| # | Criterio | Cómo se rompe |
|---|---|---|
| 15 | **El nivel no viaja solo.** El nombre se muestra siempre con el percentil y el n al lado | Ocultar el percentil en el bloque del nivel: el test tiene que fallar |
| 16 | **Los cortes de nivel son quintos iguales.** `Elite` empieza en el percentil 80 y hay un test que lo fija | Mover el corte de `Elite` a 60: fallan el test de particiones y el del corte |
| 17 | **Sin percentil exacto no hay nivel.** Una cohorte con banda no estrena etiqueta | Emitir el nivel desde el punto medio de la banda: falla el test de la cohorte fina |
| 18 | **El efecto del peso reproduce los medidos.** 78 kg → 427,0 · 88 kg → 399,0 · 98 kg → 378,8 a 610 kg de total | Hacer que el efecto no dependa del peso: falla |
| 19 | **El efecto del peso no inventa el punto que falta.** Con peso ≤ 10 kg devuelve `null` | Quitar el guard de `peso − 10`: devuelve un punto y falla |
| 20 | **La distancia va en kg de total**, derivada del delta de Dots y de `g`, no escrita a mano | Fijar `deltaKg: 0`: falla el test de consistencia |
| 21 | **La advertencia de rango se muestra, el número también.** Con un peso fuera del rango con datos, el medidor avisa y no esconde | Desactivar la detección: falla |
| 22 | **Ningún número sin su limitación.** El aviso del peso se va cuando el medidor se oculta, y no queda colgado | Dejar el aviso visible al ocultar el medidor: falla |

El criterio 21 merece un comentario: la opción fácil era **esconder** el medidor
cuando el peso está fuera del rango. Se eligió lo contrario —mostrar el número y
advertir— porque esconderlo deja a la persona sin la medición y sin explicación.
La regla de la capa es advertir, no esconder.

## Nota sobre el criterio 21: el aviso leído del campo equivocado

La primera versión del aviso leía `efectoPeso.actual.clampeado`. Con un peso de
5 kg ese campo **no existe**: `efectoDelPeso` devuelve `null` cuando no puede
calcular `peso − 10`, así que la condición era falsa y el aviso se perdía justo en
el caso extremo, que es cuando más hace falta. Lo mostró el navegador real y lo
confirmó un test en rojo.

La corrección no fue parchear la condición sino cambiar la fuente: el motor **ya
declara** esa limitación en `limitaciones`, y la interfaz ahora la repite en vez
de recalcularla. Dos fuentes para un mismo hecho es una fuente de más: tarde o
temprano una se actualiza y la otra no.

## Nota sobre el verificador: la rotura aplicada al lugar equivocado

`scripts/verificar_tests.py` busca un texto en el archivo y lo reemplaza. La
rotura del bloque del peso usaba `cajaPeso.hidden = true;`, que aparecía **dos
veces** (`pintarPeso` y el camino de ocultado). El reemplazo cayó en la primera
ocurrencia, ninguna prueba miraba esa línea, y **la suite quedó verde con el
código roto**: un falso OK del propio verificador.

Es una variante más fina del problema que el verificador existe para cazar. No es
que la rotura no se haya aplicado —eso el script lo reporta como `??`—, es que se
aplicó **donde no correspondía**. Las dos correcciones:

1. **Unificar el ocultado** en una sola función `ocultarMedidor()`, para que no
   haya dos lugares haciendo lo mismo por caminos distintos. Dos caminos para un
   mismo hecho es lo que permite que una rotura caiga en el camino que nadie mira.
2. **Anclar con el texto completo**: un `\n` inicial más la sangría exacta hace el
   ancla única. El `\n` funciona con finales de línea CRLF porque `\r\n` contiene
   `\n`.

Regla general que deja: **el verificador de roturas también tiene que poder
fallar.** Un `XX` es tan grave como un `??` y más difícil de notar, porque el
script termina en verde y el resumen solo cuenta las roturas que sí rompieron
algo.

## Estado de la verificación

**34 roturas declaradas, 34 hacen fallar su test.** El listado se consulta con
`python scripts/verificar_tests.py --listar`; una sola, con `--solo N`.

## Tolerancia

`APPROX_QUANTILES` es determinista para el mismo input pero **aproximado**. Los
tests de contrato (criterio 13) comparan con tolerancia relativa del **1%**.

Justificación de por qué 1% y no exacto: exigir igualdad exacta contra
`APPROX_QUANTILES` acopla los tests al algoritmo interno de BigQuery. Una
actualización del motor cambiaría el último decimal y romperían tests que no
detectan ningún error real. Un test que falla por un motivo que no es un error es
un test que se termina desactivando — y ahí se pierde la red completa.

El 1% sigue siendo estricto para lo que importa: si la cohorte cambia por un eje
mal aplicado, el percentil se mueve mucho más que 1%.

## Nota sobre el criterio 11: un test que era una trampa

El criterio 11 pide el invariante **por fila**. La primera versión pedía el
invariante **por cuantil** ("las tres shares de cada percentil suman 1"), y era
falso: se verificó y da 0,914 en p10 y 1,087 en p90.

Por qué importa como lección de testing: **ese test habría fallado siempre**, y
un test que falla siempre por un motivo que no es un bug se desactiva. Ahí se
pierde la red completa. La versión por fila, en cambio, se puede romper de
verdad (basta con corromper un `TotalKg`) y por eso protege algo.

La regla general que deja: antes de escribir un test, preguntarse si el invariante
que afirma es **cierto**. Un test verde confirma que el código hace lo que dice el
test; no confirma que el test diga algo verdadero.

## Lo que los tests NO pueden cubrir

Ninguno de estos tests valida que **la cohorte elegida sea la correcta**. Un test
puede probar que el sexo se aplica; no puede probar que el sexo *debería* ser un
eje. Eso es criterio y está en
[Criterio de comparabilidad](02_Criterio_Comparabilidad.md), sostenido por
mediciones.

Es una distinción que conviene tener escrita: los tests protegen la
implementación del criterio, no reemplazan al criterio. Una suite verde sobre un
criterio equivocado da exactamente la misma sensación de seguridad que una suite
verde sobre el criterio correcto.

## Verificación manual obligatoria

Antes de dar por buena la capa, correr un caso a mano contra BigQuery y comparar
con el resultado que devuelve el código. Un caso, el más simple posible, con el
número anotado. Si el código y la consulta directa no coinciden, el problema está
en el código; si coinciden y el número no tiene sentido, el problema está en el
criterio.
