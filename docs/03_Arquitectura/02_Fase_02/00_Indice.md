# Capa 02 — Comparación y diagnóstico

Índice de la fase. El orden no es casual: **criterio → cohorte → testing**.

| # | Documento | Responde |
|---|---|---|
| 01 | [Arquitectura de la capa](01_Arquitectura_Capa02.md) | ¿Qué agrega esta capa y dónde termina? |
| 02 | [Criterio de comparabilidad](02_Criterio_Comparabilidad.md) | ¿Qué hace que una comparación sea válida o basura? |
| 03 | [Reglas de cohorte](03_Reglas_Cohorte.md) | ¿Cómo se construye la cohorte y qué pasa si es fina? |
| 04 | [Testing de la capa](04_Testing_Capa02.md) | ¿Qué tiene que cumplir la medición antes de mostrarse? |

**Regla de la fase:** nada se implementa si no está documentado acá.

**Estado:** diseño. Sin implementación. La Capa 01 (descriptiva) ya está en
producción; esta capa es aditiva y no la modifica.

## Qué la separa de la Capa 01

La Capa 01 **describe una población**: cuántos atletas hay, cómo se reparten por
sexo, cómo evolucionó el volumen.

La Capa 02 **ubica a un individuo dentro de esa población**: dado un atleta con
sus marcas, ¿dónde está parado frente a sus pares?

Es la diferencia entre un censo y un percentil.
