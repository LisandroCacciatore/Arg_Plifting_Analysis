# Reporte de mejoras — Estabilización del dashboard Capa 01

**Fecha:** 2026-10-02
**Alcance:** auditoría y estabilización del pipeline de datos y del dashboard
**Resultado:** 6 bugs corregidos, pipeline reproducible desde BigQuery, 49 tests automatizados

---

## 1. Contexto

El repositorio documentaba una arquitectura correcta (crudo en GCS → BigQuery →
queries versionadas → `data.json` → dashboard), pero **el camino de la
documentación al código estaba roto**: no existía forma de regenerar `data.json`,
no había un solo test, y el dashboard mostraba valores que nadie podía verificar.

La auditoría se hizo con acceso real a BigQuery, no por lectura de código.

---

## 2. Qué estaba roto

### 2.1 El dashboard mostraba datos de muestra como si fueran reales ⚠️

**El bug más grave.** `index.html` tenía un `<script>` inline de 4.831 caracteres
que dibujaba los 7 gráficos con datos hardcodeados, y corría *antes* que `app.js`.

```
domready: Canvas is already in use. Chart with ID '0' must be destroyed
          before the canvas with ID 'chartSexo' can be reused.
```

Chart.js v4 lanza ese error si se crea un segundo gráfico sobre un canvas ya
usado. El bloque inline dibujaba primero; `app.js` moría en el primer `new Chart`
y **abortaba todo el resto del render**. Resultado: las tarjetas de texto se
actualizaban y los gráficos no.

| Elemento | Lo que se veía | Lo que correspondía |
|---|---|---|
| KPIs | 3.847 / 11.203 / 2.91 | 2.521 / 11.514 / 4.57 |
| Sexo | 63.4% / 36.6% | 77.59% / 22.41% |
| Eventos | 71.2% / 14.8% / 7.3% | 64.92% / 21.92% / 8.34% |
| Evolución temporal | 14 años (2012–2025) | no renderizaba |

En un proyecto cuyo manifiesto dice *"cero fabricación"*, mostrar datos de
ejemplo como reales es el peor defecto posible.

### 2.2 KPIs imposibles de actualizar

En `index.html`, los tres `<div class="kpi-value">` **no tenían atributo `id`**,
pero `app.js` los buscaba con `getElementById('kpiAtletas')`. La búsqueda devolvía
`null`, `setKPI()` no hacía nada, y los valores hardcodeados quedaban fijos.

### 2.3 Faltaba la serie temporal completa

`data.json` **no tenía la clave `q5_temporal`**, que `app.js` consume para el
gráfico de evolución. La función hacía `return` temprano ante la ausencia y el
gráfico quedaba en blanco **sin ningún error visible**. El origen del dato
(49 años, desde 1964) existía en BigQuery y nunca había llegado al archivo.

### 2.4 Gráfico de resultados con etiquetas `undefined`

`data.json` guardaba `q9b_place` con el campo `Place` (28 valores crudos), pero
`app.js` leía `tipo_resultado`. Todas las etiquetas del gráfico salían
`undefined`: se había copiado la salida de la Q9a donde iba la Q9b.

### 2.5 La fecha de actualización no existía en el DOM

`actualizarMeta()` buscaba `#dataFecha`, que no estaba en el HTML. La fecha nunca
se mostraba.

### 2.6 `_meta.nota` obsoleta

`data.json` decía `"Reemplazar los valores de ejemplo con los resultados reales de
BigQuery"`. Los valores **sí eran reales** (se comprobó contra BigQuery: coinciden
exactamente). La nota era basura de una plantilla y sembraba una duda falsa.

### 2.7 Detalle menor

El contador animado de los KPIs nunca corre. `formatNum(2521)` produce `"2.521"`
en `es-AR`, que contiene un punto, y `animarContador()` interpreta "tiene punto =
es decimal" y sale sin animar. El valor final es correcto; solo no hay animación.
**Pendiente, no corregido.**

---

## 3. Qué se construyó

### 3.1 `scripts/refresh_data.py` — el pipeline que faltaba

Reemplaza el proceso manual. Lee el SQL del repositorio, ejecuta cada query
marcada contra BigQuery y escribe `assets/data/data.json`.

**El SQL se auto-documenta** con marcadores, así el mapeo query → campo no vive
escondido en el script:

| Marcador | Significado |
|---|---|
| `-- @data-key: <clave>` | Qué clave de `data.json` produce esa query |
| `-- @data-shape: object` | La query devuelve una fila y se serializa como objeto |

**Valida el contrato antes de escribir.** Deriva del propio `app.js` qué claves y
campos necesita el frontend, y si el resultado no los trae **no escribe nada** y
sale con código ≠ 0. Un gráfico roto ya no puede llegar al dashboard sin que algo
lo detecte.

Opciones: `--dry-run`, `--check` (valida `data.json` sin red), `--solo <claves>`,
`--out <ruta>`. Config por entorno: `BQ_PROJECT`, `BQ_DATASET`, `BQ_TABLE`,
`BQ_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`.

### 3.2 Trazabilidad real en `data.json`

```json
"_meta": {
  "dataset": "burnished-rider-368414.Openpowerlifting.OpenDataRaw",
  "ubicacion": "southamerica-east1",
  "ultima_actualizacion": "2026-10-02",
  "generado_por": "scripts/refresh_data.py",
  "fuente_sql": "SQL/phase_2_core/QueryCapa01.sql",
  "consultas": { "q1_volumen": 1, "q5_temporal": 49, "...": 0 },
  "total_filas": 203
}
```

Cualquier número del dashboard se puede rastrear hasta su query.

### 3.3 Filtro y vistas separadas del temporal

- **Un gráfico unificado** (participaciones + atletas únicos) con el filtro.
- **Tres gráficos por métrica**: participaciones, atletas únicos y federaciones
  activas por año.
- **Filtro de rango**: *Desde 2012* (por defecto, donde está la señal) o *Todo el
  histórico (1964–2025)*. Una nota indica siempre cuántos años se ven y en qué
  rango, para que nada quede oculto en silencio.

Ejemplo de la nota: `mostrando 14 de 49 años (2012–2025)`.

### 3.4 Protección contra reuso de canvas

`destruirGrafico()` destruye el gráfico previo antes de crear uno nuevo. El render
pasó a ser idempotente: se puede volver a llamar sin romper la página. Este bug
—el que mostraba datos falsos— no puede repetirse por accidente.

### 3.5 49 tests, cada uno nacido de un bug real

| Archivo | Tests | Qué protege |
|---|---|---|
| `tests/frontend/pagina.test.mjs` + `harness.mjs` | 18 | Ejecuta `index.html` **como el navegador**, con un stub de Chart.js fiel a v4 (lanza error si se reusa un canvas). Verifica 10 gráficos, cero etiquetas `undefined`, datos reales vs. de muestra, KPIs, fecha y el filtro completo |
| `tests/test_refresh_data.py` | 26 | Parseo del SQL, formas de datos, contrato con el frontend, `_meta` |
| `tests/test_html_contract.py` | 7 | Que todo `id` que `app.js` busca exista en `index.html` |

El test de contrato HTML es el que **habría atrapado 3 de los 6 bugs**. El test de
página completa atrapó el más grave.

---

## 4. Verificación

```
npm test
  → node --test "tests/frontend/*.test.mjs"   : 20 pass, 0 fail
  → pytest tests/ -q                          : 31 pass
  → EXIT_CODE_REAL=0
```

Acceso a BigQuery comprobado con evidencia cruda:

```
✓ Cliente creado. Proyecto: burnished-rider-368414
✓ Query ejecutada OK (SELECT 1)
✓ OpenDataRaw: participaciones = 11,514 | atletas_unicos = 2,521
```

Los valores de `data.json` coinciden exactamente con BigQuery en las 7 claves
comparables (Q1, Q2, Q3, Q4a, Q4b, Q6a, Q7b).

### 4.1 Afirmaciones publicadas: qué se pudo verificar

Un caso de estudio sobre integridad de datos no puede tener afirmaciones falsas en
su propia página. Se auditaron una por una:

| Afirmación de la página | Estado |
|---|---|
| "EXPOSICIÓN → GitHub Pages · Portfolio público" | ✅ verificado: `lisandrocacciatore.github.io/Arg_Plifting_Analysis/` responde HTTP 200 |
| "El dataset es público" (OpenPowerlifting) | ✅ verificado |
| "Dataset RAW de ~700 MB" | ❌ **corregido a 810 MB** (3.658.065 filas, medido con `__TABLES__`) |
| "10 queries" | ❌ **corregido a 11 queries / 10 preguntas** (el archivo tiene 16 statements, 11 marcados con `@data-key`) |
| "decisión D-07" (referencia en `data/01_Raw/README.md`) | ✅ definida en `06_Diagramas_y_Decisiones.md` |
| "Cloud Storage como respaldo del crudo" · "GCS es la única fuente de verdad" | ✅ verificado: el bucket `powerlifting-data-raw` responde HTTP 401 sin credenciales — existe y es privado (un 404 habría indicado lo contrario) |

Las dos afirmaciones numéricas se corrigieron con el valor medido. La de GCS estuvo
marcada como no verificada mientras solo se intentó por vías autenticadas
(`storage.buckets.list` y `bigquery.jobs.listAll`, ambas 403). Se resolvió con una
consulta sin credenciales a la API de Storage: el 401 confirma que el bucket existe.

Nota: el service account **no** puede leer el bucket, y está bien — el pipeline lee de
BigQuery, no de GCS. El bucket es el respaldo del crudo original.

**Lección:** las afirmaciones cuantitativas envejecen en silencio. La página citaba
el tamaño del CSV en vez del de la tabla que realmente se consulta, y subestimaba la
cantidad de queries. Un número sin fuente se convierte en un número falso — que es
exactamente el problema que este proyecto dice denunciar.

---

## 5. Hallazgo adicional: 18 vistas legacy

El dataset tenía 18 vistas creadas a mano, sin documentar. Se auditaron:

- las 18 leen `OpenDataRaw` directamente y **ninguna es usada por otra vista**;
- **17 son copias literales** de queries ya versionadas en el repositorio;
- la restante aplica limpieza semántica sobre el crudo, que el proyecto prohíbe;
- su numeración contradice al SQL (`capa01_q10a_total_completitud` contiene la Q9b).

**Decisión:** el archivo `SQL/phase_2_core/QueryCapa01.sql` es la única fuente de
verdad. Detalle completo y evidencia en `docs/03_Arquitectura/01_Fase_01/07_Views_BigQuery.md`.

Su baja queda en `scripts/drop_legacy_views.sql` (18 `DROP VIEW`), para ejecutar una
vez en la consola con credenciales de dueño. El service account del pipeline es de
solo lectura y no tiene permiso de borrado, a propósito.

---

## 6. Pendientes

| # | Pendiente | Prioridad |
|---|---|---|
| 1 | ~~Ejecutar `scripts/drop_legacy_views.sql`~~ **hecho 2026-10-02** — el dataset quedó con `OpenDataRaw` únicamente | ✅ |
| 2 | ~~Arreglar la animación del contador de KPIs~~ **hecho 2026-10-02** — el contador recibía el string formateado y confundía el separador de miles con un decimal | ✅ |
| 3 | Registrar fecha y versión del volcado crudo usado en cada carga (ya figuraba como pendiente en `data/01_Raw/README.md`) | Media |
| 4 | Decidir si el pipeline corre programado (cronjob) o solo a demanda | Baja |
| 5 | Build step y linting del frontend (Vite + ESLint/Stylelint) | Baja |
| 6 | ~~CI en GitHub Actions~~ **hecho 2026-10-02** — `.github/workflows/ci.yml` corre los 54 tests, el contrato de `data.json` y los marcadores del SQL en cada push y PR, sin credenciales | ✅ |
| 7 | ~~LICENSE~~ **hecho** — MIT. La página declaraba "open-source" sin licencia | ✅ |
| 8 | ~~Escribir el caso de estudio~~ **hecho** — `docs/CASO-DE-ESTUDIO.md` | ✅ |
| 9 | ~~Confirmar si existe el bucket de Cloud Storage~~ **resuelto** — `powerlifting-data-raw` existe (HTTP 401 sin credenciales) | ✅ |
| 10 | Decidir qué hacer con `getDatosMuestra()` en `app.js`: es el último resto de datos de muestra en el código | Baja |

---

## 7. Archivos

**Nuevos**

```
scripts/refresh_data.py            pipeline de datos con validación de contrato
scripts/drop_legacy_views.sql      baja de las 18 vistas legacy
tests/frontend/harness.mjs         harness que ejecuta la página como el navegador
tests/frontend/pagina.test.mjs     18 tests del dashboard
tests/test_refresh_data.py         26 tests del pipeline
tests/test_html_contract.py        7 tests del contrato HTML ↔ JS
package.json                       npm test / npm run refresh
CONTRIBUTING.md                    puesta a punto, credenciales, cómo contribuir
.gitignore                         protección de credenciales
docs/.../07_Views_BigQuery.md      auditoría de las vistas
docs/REPORTE-MEJORAS.md            este documento
```

**Modificados**

```
index.html                         se quitó el bloque de datos de muestra,
                                   se agregaron ids a los KPIs, #dataFecha,
                                   filtro temporal y 3 gráficos por métrica
assets/js/app.js                   destruirGrafico(), filtro temporal,
                                   gráficos por métrica
assets/css/style.css               estilos del filtro
SQL/phase_2_core/QueryCapa01.sql   marcadores @data-key y @data-shape
assets/data/data.json              regenerado: q5_temporal agregada, q9b_place
                                   corregida, _meta con trazabilidad
data/README.md                     documenta el pipeline y los marcadores
docs/.../00_Indice.md              referencia el doc 07
README.md                          sección "Reproducir el análisis"
```
