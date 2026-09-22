# 03 — Plan de montaje de datos

## Fuente

Dataset público de **OpenPowerlifting**, el registro abierto de competencias de
powerlifting. Se descarga el volcado CSV y se carga sin transformar.

## Destino

```
Proyecto:  burnished-rider-368414
Dataset:   Openpowerlifting
Tabla:     OpenDataRaw
```

`OpenDataRaw` es deliberadamente **cruda**: sin reglas de negocio, sin correcciones
semánticas, sin columnas derivadas.

## Secuencia de montaje

1. **Descarga** del CSV de OpenPowerlifting.
2. **Subida a Cloud Storage** como respaldo del crudo original.
3. **Carga a BigQuery** en `Openpowerlifting.OpenDataRaw` (tabla externa o carga, según volumen).
4. **Verificación** contra los controles de [04_Testing_Montaje.md](04_Testing_Montaje.md).
5. Recién entonces, la capa queda habilitada para consultarse.

## Qué NO hace el montaje

- No filtra por país (el filtro `Country = 'Argentina'` es de la **consulta**, no del montaje).
- No limpia nulos ni normaliza categorías de peso.
- No agrega, corrige ni interpola valores.
- No borra registros incómodos.

El principio es simple: **si el montaje transforma, deja de ser auditable**. Toda
transformación vive en la capa que la declara.

## Reproducibilidad

El montaje debe poder repetirse desde cero y producir el mismo conjunto. Por eso:

- La fuente es pública y versionada por su autor.
- No hay pasos manuales sobre el dato.
- Los cortes analíticos (fechas, categorías) se declaran en cada query, no en la tabla.
