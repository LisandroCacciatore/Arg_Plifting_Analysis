# 05 — Estrategia de queries — Capa 01

Implementación: [`SQL/phase_2_core/QueryCapa01.sql`](../../../SQL/phase_2_core/QueryCapa01.sql).

## Principios que gobiernan cada query

1. **Descriptivas, no evaluativas.** Describen qué hay, no qué es mejor.
2. **Sin métricas compuestas ni normalizadas.** Solo conteos, distribuciones y proporciones.
3. **Sin comparaciones atleta contra atleta.**
4. **Bajo costo de ejecución.** Queries simples y capas bien definidas.
5. **Explicables a público no técnico.** Si no se puede explicar, no va.
6. **Conservan `NULL`.** Un dato ausente es información; no se reemplaza por cero.

## Las 10 preguntas de la capa

| # | Query | Pregunta que responde | Valor analítico |
|---|---|---|---|
| Q1 | Volumen de participación | ¿Cuántos atletas y participaciones hay para Argentina? | Tamaño del ecosistema; punto de entrada de todo análisis |
| Q2 | Distribución por sexo | ¿Cómo se distribuye la participación por sexo? | Composición básica del sistema |
| Q3 | Distribución por federación | ¿En qué federaciones compiten los atletas? | Estructura institucional y heterogeneidad |
| Q4 | Eventos y equipamiento | ¿Qué tipos de evento y equipamiento predominan? | Contexto competitivo; evita interpretar resultados fuera de contexto |
| Q5 | Participación en el tiempo | ¿Cómo evoluciona la participación? | Crecimiento, estabilidad o contracción del ecosistema |
| Q6 | Categorías de peso | ¿Cómo se distribuyen los atletas por categoría? | Composición del sistema por peso |
| Q7 | Clases etarias | ¿Qué clases de edad participan? | Diversidad etaria y calidad del dato reportado |
| Q8 | Nivel competitivo | ¿Compiten a nivel nacional o internacional? | Contexto competitivo sin comparar resultados deportivos |
| Q9 | Condición administrativa | ¿Cómo se distribuyen los estados del resultado? | Cuántos registros no llegan a resultado válido |
| Q10 | Validez del total | ¿Qué proporción de participaciones reporta un total válido? | Completitud del dato; prepara la capa siguiente |

## Límites explícitos de la capa

- **No** predice rendimiento.
- **No** establece rankings de atletas, federaciones ni competencias.
- **No** recomienda cargas de entrenamiento.
- **No** reemplaza el criterio del entrenador.

El objetivo no es decir quién es mejor, sino entender el contexto de los datos
disponibles y sus límites.
