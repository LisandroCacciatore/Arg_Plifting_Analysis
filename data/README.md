# Datos

Los datos crudos **no se versionan en el repositorio**. Viven en Google Cloud:

| Nivel | Dónde vive | Qué contiene |
|---|---|---|
| Respaldo del crudo | Cloud Storage — `gs://powerlifting-data-raw` (proyecto `burnished-rider-368414`) | El volcado original de OpenPowerlifting, tal como se descargó. Respaldo inmutable. |
| `01_Raw` | BigQuery — `burnished-rider-368414.Openpowerlifting.OpenDataRaw` | El crudo, tal como lo publica la fuente. Sin reglas de negocio, sin corrección semántica. |
| Agregados | `assets/data/data.json` (sí versionado) | Lo que la vista web muestra, **generado** por `scripts/refresh_data.py` a partir de las queries de `SQL/phase_2_core/`. |

Ver [`01_Raw/README.md`](01_Raw/README.md) para el detalle del nivel crudo.

**Por qué no se versionan:** un CSV de resultados completo no aporta trazabilidad —la
aporta el pipeline que lo produce— y versionarlo rompería la separación entre fuente y
análisis. Lo que sí queda versionado es **cómo se consulta**: ver
`docs/03_Arquitectura/01_Fase_01/`.

## Cómo se regenera `data.json`

```bash
python scripts/refresh_data.py            # ejecuta las queries y escribe data.json
python scripts/refresh_data.py --dry-run  # ejecuta pero no escribe
python scripts/refresh_data.py --check    # valida el data.json actual, sin BigQuery
```

El script:

1. lee `SQL/phase_2_core/QueryCapa01.sql`;
2. toma cada query marcada con `-- @data-key: <clave>` y la ejecuta en BigQuery;
3. **valida el contrato del frontend** (que `data.json` tenga todas las claves y
   campos que `assets/js/app.js` lee) **antes** de escribir;
4. si el contrato no se cumple, no escribe nada y sale con código ≠ 0.

## Marcadores en el SQL

El archivo SQL declara su propio contrato con comentarios:

| Marcador | Significado |
|---|---|
| `-- @data-key: <clave>` | Qué clave de `data.json` produce esa query |
| `-- @data-shape: object` | La query devuelve **una** fila y se serializa como objeto (no como lista de un elemento) |

Sin `-- @data-key`, una query no se exporta. Esto hace explícita la relación
query → campo y evita que el mapeo viva escondido en el script.

## Trazabilidad

`data.json` incluye un bloque `_meta` con: dataset y región consultados, fecha de
generación, script que lo produjo, archivo SQL de origen y cantidad de filas por
consulta. Cualquier número del dashboard se puede rastrear hasta su query.
