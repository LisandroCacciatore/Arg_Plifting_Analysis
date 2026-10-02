# Criterio de comparabilidad

Una comparación entre personas es válida o es basura. No hay término medio. Este
documento define **qué condiciones tiene que cumplir** una cohorte para que un
percentil signifique algo, y deja la evidencia medida de cada una.

Cada número de este documento se midió contra
`burnished-rider-368414.Openpowerlifting.OpenDataRaw` y corresponde a una fila de
la tabla de abajo. No hay estimaciones.

## Las 8 trampas

| # | Trampa | Evidencia medida | Regla |
|---|---|---|---|
| 1 | **Evento** | Con `TotalKg>0`: SBD n=2.429.121 promedio **466,4** · B n=696.441 promedio **141,4** · D n=196.324 promedio **200,2** · BD n=67.132 promedio **303,9** | La cohorte es **`Event='SBD'`**, sin excepción |
| 2 | **Equipamiento** | Con `SBD`: Raw n=959.547 promedio **464,4** · Wraps n=212.737 promedio **520,7** · Multi-ply n=50.326 promedio **660,4** · Unlimited n=214.870 promedio **369,6** | Nunca mezclar. Es un eje de la cohorte |
| 3 | **Sexo** | Mediana bench/squat: F-24-34 = **0,5532** vs M-24-34 = **0,6695** → brecha **0,116** | Eje de la cohorte |
| 4 | **Edad** | Mediana bench/squat en M: 18-19 = **0,635** → 45-49 = **0,704** → 80-84 = **0,783**. Rango **0,148** | Eje de la cohorte |
| 5 | **Peso corporal** | Correlación peso ↔ ratio bench/squat = **−0,002** (n=626, ventana 2018+) | **No se filtra.** Lo absorbe el puntaje |
| 6 | **Tested** | Con `SBD`+Raw: marcado n=786.765 promedio **459,5** · sin marcar n=172.782 promedio **486,6** | Dimensión separada, no mezclar a ciegas |
| 7 | **División** | `Open` / `O` / `Both` / `Amateur Open` / `Pro Open`; `Jun` / `Juniors` / `Juniors 20-23` / `J20-23` | Usar **`AgeClass`**, que es la codificación consistente de OpenPowerlifting. `Division` es vocabulario de cada federación |
| 8 | **Categoría de peso** | Hombres ~90 kg: `90` (238.692) · `93` (128.680) · `99.7` (54.724) · `95` · `94` · `90+` · `97` · `93+` · `90.7` · `93.8` | **No filtrar por `WeightClassKg`.** No hay un sistema de categorías: hay varios |

### Las trampas 3 y 4, con la precisión que corresponde

Conviene no simplificar de más. En la cohorte 24-34 **manda el sexo**: la brecha
entre sexos (0,116) es mayor que el gradiente dentro de la misma década. Pero
sobre el rango completo de edad, el gradiente **0,148 es tan grande como la
brecha entre sexos**. En atletas masters la edad no es un ajuste menor: es la
variable dominante.

Corolario: comparar el banco de una mujer contra una cohorte masculina la
diagnostica como "catastróficamente débil de banco" cuando está en la mediana de
sus pares. **Un error de cohorte produce una falsa alarma con la forma de un dato
duro.** Es exactamente el tipo de error que este proyecto existe para no cometer.

### La trampa 1 fue la que salvó el diseño

La primera medición de ratios dio p25=140 y p50=310 en la misma cohorte:
imposible. El problema era que la población de `Event='B'` (banco solo, promedio
**141,4**) estaba contaminando la de `Event='SBD'` (**466,4**). Sin aislar el
evento, el resultado hubiera sido un percentil sin sentido presentado con toda
la autoridad de un número exacto.

## Decisión: qué puntaje normaliza

`TotalKg` crudo **no es comparable entre categorías de peso**: correlación con el
peso corporal = **+0,5185**. Es la razón de existir de los puntajes normalizados.

Medido sobre la cohorte M/Raw/SBD/24-34 desde 2018 (n=140.600):

| Puntaje | r vs peso corporal | \|r\| |
|---|---|---|
| **Glossbrenner** | +0,0289 | **0,0289** |
| Goodlift | +0,0353 | 0,0353 |
| **Dots** | +0,0387 | 0,0387 |
| Wilks | +0,0650 | 0,0650 |
| *TotalKg (control)* | *+0,5185* | *0,5185* |

**Lo que esto dice:** los cuatro son equivalentes para este propósito (todos
`|r| < 0,07`, contra 0,52 del total crudo). **Dots no es el más independiente del
peso: Glossbrenner lo es, marginalmente.**

**Decisión:** el puntaje es **configurable**, con **Dots por defecto** por
reconocimiento de uso, y los cuatro disponibles. La elección no cambia la
conclusión de un diagnóstico: presentarla como si cambiara sería un falso
dramatismo. Queda documentada porque "usamos Dots porque sí" no es un criterio.

El control del `TotalKg` es lo que valida el método: si el puntaje elegido
también correlacionara fuerte con el peso, el problema no sería el puntaje sino
la medición.

## Cobertura: la degradación no hace falta donde se la espera

Dentro de `Event='SBD'`, la cobertura de los tres levantamientos es
**~100%** (140.561 de 140.600 en la cohorte de referencia). Tiene sentido: quien
compitió SBD hizo los tres levantamientos, y un puntaje exige un total.

Consecuencia de diseño: el filtro `Event='SBD'` **es** la garantía de
completitud. No hay que construir una degradación elegante para levantamientos
faltantes — el problema se resuelve antes, eligiendo bien la cohorte.

Los defensivos igual se mantienen (`Best3SquatKg > 0` como denominador del
ratio), porque un porcentaje de cobertura del 100% es una medición de hoy, no
una garantía del esquema.
