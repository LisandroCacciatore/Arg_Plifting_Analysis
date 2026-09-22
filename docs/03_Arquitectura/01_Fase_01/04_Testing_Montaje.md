# 04 — Testing del montaje

El testing de este proyecto no busca "limpiar" el dato: busca **entenderlo y
caracterizarlo** antes de analizarlo. Un análisis que no supera estos controles no avanza
de capa.

## Controles que debe pasar el montaje

| # | Control | Qué verifica | Cómo se detecta una falla |
|---|---|---|---|
| C1 | Esquema | Que existan los campos esperados, con tipos coherentes | Consulta de esquema a la tabla antes de analizar |
| C2 | Tipos | Que `Place` y `WeightClassKg` no se fuercen a número cuando no lo son | `SAFE_CAST` en lugar de `CAST` |
| C3 | Rangos | Que peso, edad y total caigan en rangos físicamente posibles | Conteos fuera de rango |
| C4 | Nulos | Que la ausencia de dato sea visible y no un cero implícito | `IS NULL` explícito en cada campo crítico |
| C5 | Valores especiales | Que `DQ`/`NS`/`G`/`DD` se cuenten como estados, no como posiciones | Q9b |
| C6 | Coherencia entre cortes | Que los totales por sexo, federación y año sumen el total general | Comparación cruzada de conteos |
| C7 | Validez del total | Que la proporción de registros con total válido esté medida | Q10 |

## Rol del testing en la arquitectura

El testing no es una etapa final ni un check decorativo: **gobierna el montaje, valida la
semántica y bloquea conclusiones incorrectas.**

## Estado de implementación (honesto)

Hoy los controles están **declarados y aplicados dentro de las queries** (filtros
explícitos, `SAFE_CAST`, conteos de validez), pero **no existe todavía un script que los
ejecute como suite automática**. Automatizarlos es el pendiente principal de esta fase:
es la diferencia entre "respetamos estos criterios" y "podemos probar que se respetan".
