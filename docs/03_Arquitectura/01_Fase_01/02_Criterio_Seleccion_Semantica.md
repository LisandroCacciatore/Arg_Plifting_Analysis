# 02 — Criterio de selección semántica

Qué campos se usan, qué significan y qué hay que saber antes de tocarlos.

## Filtro base

Todo el análisis de este repositorio se restringe a:

```sql
WHERE Country = 'Argentina'
```

Es el recorte que define el objeto de estudio: el powerlifting argentino dentro de un
dataset global.

## Campos utilizados

| Campo | Qué aporta | Qué hay que saber |
|---|---|---|
| `Country` | Recorte geográfico | Filtro base de toda la capa |
| `Name` | Identifica atletas | Se usa para **contar únicos**, nunca para exponer o rankear personas |
| `Sex` | Composición por sexo | Categoría reportada por la fuente |
| `Federation` | Estructura institucional | Heterogénea entre federaciones |
| `Event` | Tipo de competencia | Condiciona qué levantamientos existen |
| `Equipment` | Categoría de equipamiento | No es comparable entre categorías |
| `Age` / `AgeClass` | Composición etaria | Calidad del dato variable según la federación |
| `BodyweightKg` | Peso corporal | Puede faltar |
| `WeightClassKg` | Categoría de peso | Incluye **categorías abiertas** (`90+`): requieren tratamiento especial, no `CAST` directo |
| `TotalKg` | Total levantado | **No se asume que todo registro tenga un total válido**: Q10 mide qué proporción lo reporta |
| `Place` | Posición / estado del resultado | Tiene valores no numéricos (ver abajo) |
| `Date` | Ubicación temporal | Hay registros sin fecha: se filtran con `IS NOT NULL` cuando el análisis es temporal |

## `Place`: valores especiales

`Place` **no es un número**: mezcla posiciones con estados administrativos. La capa los
separa explícitamente (Q9b) porque tratarlos como número invalidaría cualquier conteo:

| Valor | Significado |
|---|---|
| numérico | Posición válida |
| `DQ` | Descalificado |
| `NS` | No presentado |
| `G` | Invitado / guest |
| `DD` | Descalificado por doping |
| `NULL` | Sin registro |

Consecuencia analítica: **un registro puede existir y no ser un resultado**. Contar
participaciones no es contar resultados.

## Qué se excluye a propósito

- Datos personales más allá del nombre (no se usan ni se publican).
- Comparaciones atleta contra atleta.
- Métricas compuestas o normalizadas (corresponden a capas superiores).
- Valores corregidos "a mano": si un dato está mal, se documenta, no se arregla en silencio.
