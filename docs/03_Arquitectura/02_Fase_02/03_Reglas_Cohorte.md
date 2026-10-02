# Reglas de cohorte

Define cómo se construye la cohorte, qué pasa cuando es fina, y cuál es la tabla
de referencia contra la que se comparan los tests.

## Los ejes

**Obligatorios** (definen la cohorte, sin ellos el percentil no significa nada):

| Eje | Valores | Por |
|---|---|---|
| `Sex` | `M` · `F` | Criterio, trampa 3. `Mx` (124 filas en todo el dataset) queda excluido por falta de densidad, no por criterio |
| `AgeClass` | 5-12 … 90-999 | Criterio, trampa 4 |
| `Equipment` | `Raw` · `Wraps` · `Single-ply` · `Multi-ply` · `Unlimited` | Criterio, trampa 2 |
| `Event` | fijo en `'SBD'` | Criterio, trampa 1 |

**Opcionales** (alcance y refinamiento):

| Eje | Valores | Default |
|---|---|---|
| Alcance | `mundial` · `nacional` | mundial |
| Ventana | desde qué fecha | 2018-01-01 |
| `Federation` | la federación exacta | ninguna (sin refinamiento) |

**Lo que NO es un eje:** el peso corporal. Su correlación con el ratio es
**−0,002**: no hay nada que corregir. Filtrar por peso solo achica la cohorte sin
mejorar la comparación. Y `WeightClassKg` no sirve como eje aunque uno quiera:
sus etiquetas varían por federación (`90`, `93`, `99.7`, `90+`, `93.8` — criterio,
trampa 8).

## Manejo de NULL

Verificado: **la cadena literal `'None'` no existe en ninguna columna de la
tabla.** Los valores ausentes son `NULL` reales.

| Columna | NULLs | Cómo se filtra |
|---|---|---|
| `Country` | 1.595.212 | `= 'Argentina'` excluye NULL automáticamente |
| `AgeClass` | 1.012.016 | `= @edad` excluye NULL automáticamente |
| `Tested` | 897.786 | `IS NOT NULL` si se quiere la subpoblación testeada |
| `WeightClassKg` | 53.627 | no se usa |
| `Division` | 3.327 | no se usa |

**Consecuencia:** un `WHERE AgeClass <> 'None'` es código muerto que parece
defensivo. La comparación `= @edad` ya descarta los NULL, porque en SQL
`NULL = 'cualquier cosa'` no es verdadero ni falso: es desconocido, y no pasa el
filtro. Escribir el `<>` de más no agrega seguridad, agrega la ilusión de
seguridad.

**Sobre "nacional":** `Country` es la nacionalidad del atleta;
`MeetCountry` es dónde se compitió. `Country='Argentina'` → **11.514**
participaciones y **2.521** atletas (coincide con la Capa 01).
`MeetCountry='Argentina'` → **17.695**, porque incluye a extranjeros que
compitieron en el país. Para comparar atletas argentinos va `Country`.

## La consulta

```sql
-- Parametros: @sexo, @edad, @equipamiento, @puntaje,
--             @alcance ('mundial'|'nacional'), @desde, @federacion (NULL = sin refinar)
WITH cohorte AS (
  SELECT
    Dots,
    SAFE_DIVIDE(Best3BenchKg,    Best3SquatKg) AS ratio_banco,
    SAFE_DIVIDE(Best3DeadliftKg, Best3SquatKg) AS ratio_despegue,
    SAFE_DIVIDE(Best3SquatKg,    TotalKg)      AS share_sentadilla,
    SAFE_DIVIDE(Best3BenchKg,    TotalKg)      AS share_banco,
    SAFE_DIVIDE(Best3DeadliftKg, TotalKg)      AS share_despegue
  FROM `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
  WHERE Sex         = @sexo                    -- eje
    AND AgeClass    = @edad                    -- eje (excluye NULL por si solo)
    AND Equipment   = @equipamiento            -- eje
    AND Event       = 'SBD'                    -- eje fijo
    AND Dots IS NOT NULL AND Dots > 0          -- sin puntaje no hay comparacion
    AND Best3SquatKg    > 0                    -- guard: es el denominador
    AND Best3BenchKg    > 0
    AND Best3DeadliftKg > 0
    AND TotalKg         > 0
    AND Date        >= @desde                  -- ventana
    AND (@alcance = 'mundial' OR Country = 'Argentina')
    AND (@federacion IS NULL OR Federation = @federacion)
)
SELECT
  COUNT(*)                                        AS n,
  APPROX_QUANTILES(Dots,            100)[OFFSET(50)] AS dots_p50,
  APPROX_QUANTILES(ratio_banco,     100)          AS q_ratio_banco,
  APPROX_QUANTILES(ratio_despegue,  100)          AS q_ratio_despegue,
  APPROX_QUANTILES(share_sentadilla,100)          AS q_share_sentadilla,
  APPROX_QUANTILES(share_banco,     100)          AS q_share_banco,
  APPROX_QUANTILES(share_despegue,  100)          AS q_share_despegue
FROM cohorte
```

`SAFE_DIVIDE` devuelve NULL en vez de fallar; sumado a los guards `> 0`, la
división por cero no puede ocurrir. Los guards **no** son redundantes con
`Event='SBD'`: son la razón por la que el ratio nunca se calcula sobre un
denominador ausente, y siguen valiendo si mañana se habilita otro evento.

## Ventana temporal

El dataset va de **1964-09-05 a 2025-08-25** (62 años distintos). Pero la
densidad real arranca antes de 2018, así que 2018 no es un límite de datos: es un
**default de comparabilidad**.

El motivo es medible, aunque **conviene no exagerarlo**. Misma cohorte
(M/Raw/SBD/24-34), cambiando solo la fecha de corte:

| Ventana | n | bench/squat | Dots p50 | Total p50 |
|---|---|---|---|---|
| Histórico | 188.942 | 0,6694 | 382,4 | 585,0 |
| desde 2015 | 173.018 | 0,6667 | 383,1 | 587,5 |
| desde 2018 | 140.561 | 0,6615 | 385,0 | 590,0 |
| desde 2020 | 104.972 | 0,6560 | 387,4 | 595,0 |
| desde 2022 | 82.592 | **0,6509** | **388,9** | **597,5** |

**Magnitud honesta:** el ratio se corre **0,0185** entre el histórico y 2022, y la
mediana de Dots sube **6,5 puntos**. Es un corrimiento real —la población es cada
vez más fuerte y relativamente más dominante en sentadilla y despegue que en
banco— pero es **menor que el efecto de los ejes obligatorios** (la brecha entre
sexos sola es 0,116, seis veces más). Un Dots fijo de 385 cae en la mediana del
histórico y un poco por debajo de la mediana de 2022: unos pocos puntos de
percentil, no un cambio de diagnóstico.

**Entonces por qué la ventana se elige igual:** no por la magnitud del corrimiento
numérico, sino por **comparabilidad del deporte**. Compararse contra 1964 es
compararse contra otra disciplina: cambian los estándares de equipamiento y el
criterio de validación de un levantamiento. El valor del filtro es que el usuario
pueda decir "contra quién me estoy midiendo", no que el número cambie mucho.

**El costo de la ventana:** densidad. Pasar de histórico a 2022 recorta la
cohorte de 188.942 a 82.592 filas (**−56%**). Hay un intercambio real entre
recencia y tamaño de cohorte, y por eso la ventana la elige el usuario y se
muestra junto al resultado. Un percentil sin su ventana es un número sin fecha.

Densidad por año (últimos 12, todo el dataset): 2025 → 175.823 · 2024 → 279.864 ·
2023 → 277.295 · 2022 → 240.108 · 2021 → 181.666 · **2020 → 140.207** ·
2019 → 264.425 · 2018 → 252.069 · 2017 → 236.923 · 2016 → 219.109.

La caída de 2020 es la pandemia, no un problema de datos. Vale mencionarlo al
usuario que elija esa ventana: una cohorte que se solapa con 2020 no es
representativa de un año normal.

## Densidad y política de n mínimo

Medido con `SBD` + `Raw` + `Dots` + `Date>=2018-01-01`:

| Alcance | celdas con n≥30 | celdas con n≥100 | celdas totales |
|---|---|---|---|
| **Mundial** | 33 / 36 | 31 / 36 | 36 |
| **Nacional** | **16 / 27** | **6 / 27** | 27 |

Celdas nacionales que **no** aguantan un percentil:

| Celda | n | |
|---|---|---|
| F-60-64 | 1 | |
| F-65-69 | 1 | |
| M-65-69 | 1 | |
| M-75-79 | 1 | |
| M-5-12 | 2 | |
| F-70-74 | 4 | |
| F-55-59 | 7 | |
| F-50-54 | 14 | |
| F-13-15 | 16 | |
| M-60-64 | 18 | |
| M-50-54 | 24 | |
| F-45-49 | 30 | ← borde |

**Hallazgo que ordena el diseño:** la cohorte nacional no sostiene las puntas.
Una mujer argentina de 60 años tiene **n=1**. Un percentil sobre 1 persona no es
un percentil, es esa persona.

### Escalones de n

| n | Qué se muestra |
|---|---|
| **≥ 100** | Percentil exacto. Cohorte firme |
| **30 – 99** | Percentil exacto, con aviso de cohorte acotada |
| **10 – 29** | Solo la banda (ej. "entre el percentil 20 y el 40"). No un número exacto |
| **< 10** | **No se emite percentil.** Se muestra la medición cruda y el n |

El n se muestra **siempre**, en los cuatro casos. Un percentil acompañado de
n=7 no es un percentil con una advertencia: es una advertencia con un número
pegado.

### Escalera de degradación

Cuando la celda es fina, en este orden:

1. **Nacional + la ventana elegida** → si `n ≥ 30`, listo.
2. **Ampliar la ventana** al histórico completo. Se intenta porque es gratis,
   pero **nacionalmente casi no ayuda**: la cohorte nacional pasa de **2.204**
   (2018+) a **2.343** (histórico), un **+6%**. Para una celda de n=1 no cambia
   nada. Este escalón está por completitud, no porque resuelva.
3. **Ofrecer el alcance mundial** → **acá está la solución real**. La misma celda
   que nacionalmente tiene n=1 pasa a tener cientos o miles en el mundial
   (M/24-34 = 140.561). Se ofrece **explícitamente**, mostrando qué cohorte se
   usó. Nunca cambiar el alcance en silencio.
4. **Si el usuario prefiere seguir nacional** → medición sin percentil, con el n
   visible y la razón dicha.

El paso 3 es el que puede tentar a hacerlo callado. El default importa más que
la lógica: cambiar de "atletas argentinos" a "atletas del mundo" sin decirlo le
devuelve al usuario un percentil halagador o cruel del que no va a saber de dónde
salió.

## El diagnóstico

Con las tres *shares* (cada levantamiento como fracción del total, que suman 1) se
calcula el percentil de cada una dentro de la cohorte.

| Situación | Resultado |
|---|---|
| La share de menor percentil está **≤ p25** | Ese levantamiento es el **atrasado** |
| Todas las shares **> p25** | **Sin desbalances** |

`sin desbalances` es un resultado esperado, no un error. Un atleta parejo no
tiene nada atrasado y el sistema tiene que poder decirlo. Un diagnóstico que
siempre encuentra un culpable es un diagnóstico que va a inventar uno.

Se usa la *share* del total y no el ratio contra un levantamiento puntual porque
los ratios comparten denominador: `bench/squat` y `dead/squat` no son
independientes, y leerlos como tres señales separadas sobreinterpreta la
estructura. Las shares son una composición explícita.

## Tabla de referencia (golden master para los tests)

Cohorte **M / Raw / SBD / 24-34 / mundial / desde 2018-01-01**, n = 140.600.
Medición real:

| Métrica | p10 | p25 | p50 | p75 | p90 |
|---|---|---|---|---|---|
| **Dots** | 310,0 | 345,7 | 385,0 | 425,6 | 463,1 |
| **TotalKg** | 457,5 | 520,0 | 590,0 | 667,5 | 740,0 |
| **Bench/Squat** | 0,567 | 0,610 | 0,661 | 0,718 | 0,778 |
| **Dead/Squat** | 1,000 | 1,065 | 1,143 | 1,225 | 1,310 |
| **Squat % total** | 0,329 | 0,343 | 0,356 | 0,370 | 0,382 |
| **Bench % total** | 0,209 | 0,222 | 0,236 | 0,250 | 0,265 |
| **Dead % total** | 0,376 | 0,391 | 0,407 | 0,424 | 0,439 |

Estos valores son de `APPROX_QUANTILES`, que es determinista para el mismo
conjunto de datos pero **aproximado**: los tests comparan con tolerancia, no con
igualdad exacta. La tolerancia y su justificación están en
[Testing de la capa](04_Testing_Capa02.md).

### Comprobación de consistencia — y un error que esta sección tuvo

El invariante correcto de las shares es **por fila**, no por cuantil:

```
squat + bench + deadlift = TotalKg          → 96,7% de las filas exacto
                                              (2.338.283 de 2.417.606)
la media de las tres shares = 1,0000        → verificado
```

**Lo que esta sección decía antes, y estaba mal:** afirmaba que "las tres shares
de cada percentil suman 1". Se verificó y **es falso**:

| Percentil | sentadilla | banco | despegue | suma | |
|---|---|---|---|---|---|
| p10 | 0,329 | 0,209 | 0,376 | **0,914** | falla |
| p25 | 0,343 | 0,222 | 0,391 | **0,955** | falla |
| p50 | 0,356 | 0,236 | 0,407 | 0,999 | ok |
| p75 | 0,370 | 0,250 | 0,424 | **1,044** | falla |
| p90 | 0,382 | 0,265 | 0,439 | **1,087** | falla |

La razón es que **la suma de cuantiles no es el cuantil de la suma.** El p10 de la
sentadilla y el p10 del banco vienen de **personas distintas**. Solo en la mediana
coinciden, y coinciden por casualidad de simetría, no por construcción.

El error importa más allá de esta tabla: el criterio de test que se había escrito
a partir de él habría fallado siempre. Está corregido en
[Testing de la capa](04_Testing_Capa02.md), criterio 11.

**Consecuencia de diseño:** la tabla de cuantiles **no es internamente
consistente entre columnas** y no debe presentarse como si lo fuera — ni usarse
para derivar una share a partir de otras dos. El percentil de cada share se
calcula sobre la distribución de *esa* share, no se deduce de las demás.

## Nota sobre la propagación del `n`

Los percentiles de la tabla salen de la cohorte completa (n=140.600). Cuando el
usuario consulta **su** percentil, el n que se muestra es el de esa cohorte, no
el de una submuestra. Es la misma población para todas las métricas, por lo que
todas las métricas de una misma respuesta comparten un único n y una única
definición de cohorte. Si dos métricas de la misma respuesta tuvieran n distintos,
sería señal de que se filtró distinto en algún lado.
