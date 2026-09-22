# 06 — Diagramas y decisiones

## Flujo completo, de la fuente a la vista

```
  [ OpenPowerlifting: CSV público ]
                 │
                 ▼
  [ Cloud Storage: crudo sin transformar ]
                 │
                 ▼
  [ BigQuery: Openpowerlifting.OpenDataRaw ]   ← SIN reglas de negocio
                 │
                 │  Q1..Q10  (filtro: Country = 'Argentina')
                 ▼
  [ assets/data/data.json ]                    ← agregados
                 │
                 ▼
  [ index.html ]                               ← visualización
```

## Frontera entre capas

```
  CRUDO            →   no se toca, no se corrige, no se filtra
  CONSULTA         →   declara su propio filtro y su propio corte
  AGREGADO         →   solo lo que la vista necesita mostrar
  VISTA            →   no calcula nada
```

## Registro de decisiones

| ID | Decisión | Motivo |
|---|---|---|
| D-01 | Filtro por `Country = 'Argentina'` en la consulta, no en el montaje | El recorte es analítico, no una propiedad del dato |
| D-02 | `OpenDataRaw` se mantiene cruda | Permite auditar el origen de cualquier número |
| D-03 | `SAFE_CAST` en lugar de `CAST` para `Place` | Hay valores no numéricos (`DQ`, `NS`, `G`, `DD`) que romperían el casteo |
| D-04 | Categorías de peso abiertas (`90+`) tratadas aparte | Un `CAST` directo las invalida |
| D-05 | `NULL` conservado en todos los cortes | Un dato ausente no es un cero |
| D-06 | Sin métricas compuestas en esta capa | Pertenecen a una capa superior que las declare |
| D-07 | El repositorio no versiona el crudo | Separa fuente de análisis |

## Abiertos

| ID | Abierto | Impacto |
|---|---|---|
| A-01 | Suite automática de los controles de testing | Hoy los criterios se aplican dentro de las queries, sin verificación automática |
| A-02 | Estructura `phase_1_cleaning` y `phase_3_scala` | Declaradas como plan; solo `phase_2_core` tiene implementación |
| A-03 | Origen exacto del volcado descargado | Conviene registrar fecha y versión del CSV usado en cada carga |
