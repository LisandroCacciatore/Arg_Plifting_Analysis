# Datos

Los datos de este proyecto **no se versionan en el repositorio**. Viven en Google Cloud,
separados por nivel de procesamiento:

| Nivel | Dónde vive | Qué contiene |
|---|---|---|
| `01_Raw` | BigQuery — `burnished-rider-368414.Openpowerlifting.OpenDataRaw` | El crudo, tal como lo publica la fuente. Sin reglas de negocio, sin corrección semántica. |
| Agregados | `assets/data/data.json` (sí versionado) | Lo que la vista web necesita mostrar, producido por las queries de `SQL/phase_2_core/`. |

Ver [`01_Raw/README.md`](01_Raw/README.md) para el detalle del nivel crudo.

**Por qué no se versionan:** un CSV de resultados completo no aporta trazabilidad —la
aporta el pipeline que lo produce— y versionarlo rompería la separación entre fuente y
análisis. Lo que sí queda versionado es **cómo se consulta**: ver
`docs/03_Arquitectura/01_Fase_01/`.
