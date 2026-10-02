# Cómo contribuir

Este proyecto sigue la regla del repositorio: **nada se implementa si no está
documentado**. Antes de tocar código, revisá `docs/03_Arquitectura/01_Fase_01/`.

## Puesta a punto

Requiere Python 3.11+ y Node 20+.

```bash
# entorno de Python
uv venv .venv
uv pip install --python .venv/Scripts/python.exe google-cloud-bigquery pytest

# verificar que todo está OK
npm test
```

## Credenciales de Google Cloud

El pipeline lee el crudo desde BigQuery. Necesitás un **service account** con:

| Rol | Nivel | Para qué |
|---|---|---|
| `roles/bigquery.jobUser` | Proyecto | ejecutar query jobs |
| `roles/bigquery.dataViewer` | Dataset `Openpowerlifting` | leer la tabla cruda |

Descargá la clave JSON y guardala **fuera del repositorio**:

```
C:\Users\<usuario>\.gcp\arg-plifting-sa.json
```

y apuntá la variable de entorno:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/c/Users/<usuario>/.gcp/arg-plifting-sa.json
```

> Las credenciales están en `.gitignore`. **Nunca** commitees una clave, y nunca
> la pegues en un chat o un issue.

Configuración opcional por entorno: `BQ_PROJECT`, `BQ_DATASET`, `BQ_TABLE`, `BQ_LOCATION`.

## Tareas habituales

| Objetivo | Comando |
|---|---|
| Correr todos los tests | `npm test` |
| Solo tests de Python | `npm run test:py` |
| Solo tests de frontend | `npm run test:js` |
| Regenerar los datos | `python scripts/refresh_data.py` |
| Ver qué haría sin escribir | `python scripts/refresh_data.py --dry-run` |
| Validar `data.json` sin red | `python scripts/refresh_data.py --check` |
| Verificar que Pages sirve el último commit | `npm run verify:deploy` |
| Ver el dashboard | `python -m http.server 8899 --bind 127.0.0.1` |

## Cómo agregar una query

1. Escribila en `SQL/phase_2_core/QueryCapa01.sql` con un encabezado `-- Qn — ...`.
2. Agregá el marcador `-- @data-key: <clave>` debajo del encabezado.
3. Si devuelve una sola fila, agregá también `-- @data-shape: object`.
4. Correla con `python scripts/refresh_data.py --solo <clave>`.
5. Si el dashboard la consume, agregá la llamada en `assets/js/app.js` **antes**
   de correr los tests: el validador de contrato exige que `data.json` tenga la
   clave y los campos que el frontend lee.

## Los tests que no hay que romper

| Test | Qué protege |
|---|---|
| `tests/test_html_contract.py` | Que todo `id` que `app.js` busca exista en `index.html` |
| `tests/frontend/pagina.test.mjs` (+ `harness.mjs`) | Que la página cargue sin errores, que los 10 gráficos rendericen con datos **reales** y que el filtro temporal funcione |
| `tests/test_refresh_data.py` | Parseo del SQL, forma de los datos y contrato con el frontend |

Los tres nacieron de bugs reales:

1. **Datos de muestra mostrados como reales.** Un `<script>` inline en `index.html`
   dibujaba los gráficos antes que `app.js`, que moría con
   *"Canvas is already in use"*. Los gráficos quedaban con valores de ejemplo.
2. **Un gráfico con etiquetas `undefined`** porque el campo de `data.json` no
   coincidía con el que leía el JS.
3. **KPIs hardcodeados que nunca se actualizaban** porque los elementos no tenían
   `id` en el HTML.

Por eso `harness.mjs` usa un stub de Chart.js que **lanza error si se reusa un
canvas**, igual que la librería real: sin eso, el test 1 pasaría en falso.

## Antes de abrir un PR

- [ ] `npm test` en verde
- [ ] Si tocaste el SQL, corriste el refresh y commiteaste el `data.json` nuevo
- [ ] Si cambió el contrato de `data.json`, actualizaste la documentación de `docs/`
