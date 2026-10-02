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
