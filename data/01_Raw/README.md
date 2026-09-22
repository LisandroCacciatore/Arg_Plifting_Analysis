# 01_Raw — Estado del dato crudo

## Qué es

El nivel más bajo del proyecto: el dataset de OpenPowerlifting tal como se descarga y se
carga en BigQuery, **sin ninguna transformación**.

```
Proyecto:  burnished-rider-368414
Dataset:   Openpowerlifting
Tabla:     OpenDataRaw
```

## Qué NO se aplica en este nivel

- No hay reglas de negocio.
- No hay "limpiezas inteligentes".
- No se corrigen valores ni se completan nulos.
- No se filtra por país: ese recorte pertenece a la consulta.

## Por qué este nivel existe

Es la garantía de auditabilidad. Cualquier número que aparezca en un análisis de capas
superiores tiene que poder rastrearse hasta acá sin depender de una transformación
intermedia que nadie recuerda haber hecho.

## Controles antes de analizar

Ver [`docs/03_Arquitectura/01_Fase_01/04_Testing_Montaje.md`](../../docs/03_Arquitectura/01_Fase_01/04_Testing_Montaje.md):
esquema, tipos, rangos, nulos, valores especiales y coherencia entre cortes.

## Estado

El crudo no está versionado (decisión D-07). Pendiente declarado: registrar la **fecha y
versión del volcado** usado en cada carga, para poder reconstruir exactamente qué se
analizó.
