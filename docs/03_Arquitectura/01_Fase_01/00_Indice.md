# Capa 01 — Análisis descriptivo base

Índice de la fase. El orden no es casual: **criterio → montaje → testing → consulta**.

| # | Documento | Responde |
|---|---|---|
| 01 | [Arquitectura de la capa](01_Arquitectura_Capa01.md) | ¿Cómo fluye el dato desde la fuente hasta la vista? |
| 02 | [Criterio de selección semántica](02_Criterio_Seleccion_Semantica.md) | ¿Qué campos se usan, qué significan y qué valores especiales existen? |
| 03 | [Plan de montaje de datos](03_Plan_Montaje_Datos.md) | ¿Qué tabla se consulta y con qué filtro base? |
| 04 | [Testing del montaje](04_Testing_Montaje.md) | ¿Qué tiene que cumplir el dato antes de analizarse? |
| 05 | [Estrategia de queries](05_Query_Strategy_Capa01.md) | ¿Qué preguntas responde la capa y con qué límites? |
| 06 | [Diagramas y decisiones](06_Diagramas_y_Decisiones.md) | ¿Qué se decidió y qué quedó abierto? |
| 07 | [Vistas en BigQuery](07_Views_BigQuery.md) | ¿Qué artefactos existen en el dataset además del crudo y por qué no se usan? |

**Regla de la fase:** nada se implementa si no está documentado acá. Las queries de
`SQL/phase_2_core/` implementan lo que definen los documentos 02 a 05.
