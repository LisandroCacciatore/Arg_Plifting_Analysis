# 01 — Arquitectura de la Capa 01

## Propósito

La Capa 01 produce **análisis descriptivo base**: cuántos, quiénes, dónde, cuándo.
No evalúa rendimiento, no compara atletas entre sí y no emite juicios de valor. Su
función es **caracterizar el ecosistema** antes de que cualquier capa superior intente
interpretarlo.

## Flujo del dato

```
OpenPowerlifting (CSV público)
        │ descarga
        ▼
Google Cloud Storage          almacenamiento del crudo, sin transformar
        │ carga
        ▼
BigQuery
  burnished-rider-368414.Openpowerlifting.OpenDataRaw
        │ queries descriptivas  (SQL/phase_2_core/)
        ▼
assets/data/data.json         agregados que alimentan la vista web
        │
        ▼
index.html                    lectura y visualización, sin lógica analítica
```

## Componentes y responsabilidad de cada uno

| Componente | Responsabilidad | Lo que NO hace |
|---|---|---|
| OpenPowerlifting | Fuente pública de resultados de powerlifting | — |
| Cloud Storage | Guardar el crudo tal como se descargó | No transforma, no corrige |
| BigQuery (`OpenDataRaw`) | Servir el dato para consulta SQL | No aplica reglas de negocio |
| Queries `phase_2_core` | Describir el ecosistema | No evalúan ni comparan atletas |
| `data.json` | Agregados para la vista | No contiene datos individuales sensibles |
| `index.html` | Visualizar | No calcula métricas |

## Decisiones de arquitectura

1. **El crudo no se modifica.** La tabla `OpenDataRaw` es la fuente; cualquier
   transformación ocurre en la consulta, no en el dato.
2. **El repositorio no versiona datos crudos.** El CSV y la tabla viven en la nube:
   versionarlos acá rompería la separación entre fuente y análisis.
3. **La arquitectura es parte del criterio analítico.** Separar raw de análisis no es
   una preferencia técnica: es lo que permite auditar de dónde salió cada número.
4. **Costo controlado por diseño.** Queries simples, capas bien definidas, sin
   materializaciones innecesarias.
