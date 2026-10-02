# 07 — Vistas en BigQuery: auditoría y baja

## Resumen

El dataset `burnished-rider-368414.Openpowerlifting` contenía, además de la tabla
cruda `OpenDataRaw`, **18 vistas creadas a mano** que no estaban documentadas en
ningún archivo del repositorio ni referenciadas por el pipeline.

Se auditaron una por una. **Ninguna aporta información que no esté ya en
`SQL/phase_2_core/QueryCapa01.sql`**, y su numeración contradice al SQL versionado.
Se dieron de baja con `scripts/drop_legacy_views.sql`.

Región del dataset: `southamerica-east1`.

## Inventario auditado

| Vista | Tipo de vista | Contenido real | Equivalente en el repo |
|---|---|---|---|
| `Argentinos_Sexo_AgeClass_NoNull` | subconjunto filtrado | `WHERE AgeClass IS NOT NULL AND TotalKg IS NOT NULL` | **ninguno** — limpieza semántica, prohibida en el crudo |
| `capa01_q01_overview_kpis` | copia | KPIs de volumen | Q1 ✓ |
| `capa01_q02_sexo` | copia | distribución por sexo | Q2 ✓ |
| `capa01_q03_federacion` | copia | distribución por federación | Q3 ✓ |
| `capa01_q04a_eventos` | copia | tipos de evento | Q4a ✓ |
| `capa01_q04b_equipment` | copia | equipamiento | Q4b ✓ |
| `capa01_q05_tiempo` | copia | evolución temporal | Q5 ✓ |
| `capa01_q06a_weightclass` | copia | categorías de peso | Q6a ✓ |
| `capa01_q06b_weightclass_sexo` | copia | peso por sexo | Q6b ✓ |
| `capa01_q07a_ageclass` | copia | clases etarias | Q7a ✓ |
| `capa01_q07b_age_completitud` | copia | completitud etaria | Q7b ✓ |
| `capa01_q08_ambito` | copia | país de competencia | Q8a ✓ |
| `capa01_q09_ambito2` | copia | nacional vs. internacional | Q8b ✓ |
| `capa01_q09_resultado_tipo` | copia | nacional vs. internacional | Q8b ✓ (duplicado) |
| `capa01_q09_resultado_tipo2` | copia | distribución cruda de `Place` | Q9a ✓ |
| `capa01_q10a_total_completitud` | copia | clasificación del resultado | Q9b ✓ |
| `capa01_q10b_total_rangos1` | copia | completitud de `TotalKg` | Q10a ✓ |
| `capa01_q10b_total_rangos2` | copia | completitud de `TotalKg` (subconsulta) | Q10a ✓ (variante) |

## Evidencia recogida

1. **Dependencias:** las 18 vistas leen `OpenDataRaw` directamente. **Ninguna
   vista es usada por otra vista, ni por el repositorio, ni por `data.json`.**
2. **Redundancia:** comparando definiciones normalizadas (sin comentarios ni
   espacios), 17 de las 18 coinciden exactamente con una query del archivo del
   repositorio.
3. **Numeración inconsistente:** los encabezados de las propias vistas se
   contradicen con su nombre. Ejemplos literales:
   - la vista llamada `capa01_q09_ambito2` tiene el encabezado `-- Q8 — PAÍS DE COMPETENCIA`
   - la vista llamada `capa01_q10a_total_completitud` tiene el encabezado `-- Q9 — CONDICIÓN ADMINISTRATIVA`
     y devuelve `tipo_resultado`, no `estado_total`
   - la vista llamada `capa01_q10b_total_rangos1` tiene el encabezado `-- Q10 — TOTALES REPORTADOS`

   Es decir: se crearon copiando bloques de una revisión anterior del archivo SQL,
   sin renumerar los nombres. Un artefacto que se llama distinto de lo que hace
   no es auditable.
4. **La vista "limpia" no la usa nadie** y aplica filtros de limpieza semántica
   sobre el crudo. `03_Plan_Montaje_Datos.md` lo prohíbe explícitamente: *"si el
   montaje transforma, deja de ser auditable"*.

## Decisión

**El archivo `SQL/phase_2_core/QueryCapa01.sql` es la única fuente de verdad.**

Motivos:

1. Está versionado y se revisa por pull request; las vistas no tenían dueño.
2. El flujo definido en `03_Plan_Montaje_Datos.md` consulta el crudo, no artefactos
   intermedios sin documentar.
3. `assets/data/data.json` se regenera ejecutando el SQL del repositorio. Las
   vistas nunca participaron de ese flujo.
4. Una segunda copia de las queries ya divergió del original una vez. Mantenerla
   es garantizar que vuelva a pasar.

Por eso `scripts/refresh_data.py` **no lee las vistas**.

## Baja de las vistas — COMPLETADA

**Estado: ejecutada el 2026-10-02.** Verificado contra la API:

```
CONTENIDO ACTUAL DEL DATASET
  TABLE  OpenDataRaw

tablas totales:  1
vistas:          0   ✓ ninguna (baja completa)
tabla cruda:     OpenDataRaw  ✓ intacta
filas Argentina: 11,514  ✓ el crudo sigue consultable
```

El script usado queda versionado en `scripts/drop_legacy_views.sql` por si hay que
repetirlo en otro entorno (por ejemplo, al recrear el proyecto).

**Verificación de que la baja no afectó al pipeline:** se volvió a correr
`scripts/refresh_data.py` después del DROP y `assets/data/data.json` quedó
byte-idéntico. El pipeline nunca leyó las vistas; siempre consultó la tabla cruda.

> **Por qué el script y no un automatismo:** el service account del pipeline tiene
> solo `bigquery.jobUser` + `bigquery.dataViewer`, y esas credenciales alcanzan para
> leer los datos pero **no** para borrarlos. La baja se hizo una sola vez, a mano,
> con credenciales de dueño del proyecto. Es la postura correcta: una credencial de
> solo lectura no necesita permiso de borrado, ni siquiera para una limpieza.

**No se tocó `OpenDataRaw`.** Es la única tabla del dataset y la fuente del crudo.

Si alguna vez hace falta una de estas vistas, se recrea copiando la query
correspondiente del archivo `.sql` del repositorio. No se perdió nada.

## Definición preservada

Única vista sin equivalente en el repositorio. Se conserva acá porque su baja
borra la información, y sirve como ejemplo de lo que **no** debe hacerse en la capa
cruda:

```sql
SELECT Name, Sex, AgeClass, WeightClassKg, TotalKg, Country
FROM `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE Country = "Argentina"
  AND AgeClass IS NOT NULL
  And TotalKg IS NOT NULL
ORDER BY AgeClass
```

Filtra por país (que es competencia de la consulta, no del montaje) y descarta
registros con nulos, mezclando dos niveles de responsabilidad en un solo artefacto.
