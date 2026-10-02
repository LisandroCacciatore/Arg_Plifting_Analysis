# Caso de estudio: cuando el dashboard mentía

## El resumen en una línea

Un dashboard sobre integridad de datos mostraba **datos de ejemplo como si fueran
reales**, y sobrevivió meses sin que nadie lo notara — porque la verificación miraba
el texto de la página, y los números falsos estaban dibujados en un `<canvas>`.

---

## 1. De dónde viene esto

El proyecto nació de una pregunta de gimnasio: *¿cómo sé que esto está funcionando?*

La versión honesta de esa pregunta, aplicada a datos, es: **¿cómo sé que el número
que estoy mirando salió de donde dice salir?** Ese es el problema que este
repositorio intenta resolver, y también el problema que este repositorio tenía.

La arquitectura estaba bien pensada y bien documentada: crudo en Google Cloud,
cargado en BigQuery sin transformar, consultado con SQL versionado, agregados en un
`data.json`, visualizados con Chart.js. Había un manifiesto de calidad, decisiones
numeradas, criterios de selección semántica. Todo escrito.

Lo que no había era **una sola forma de comprobar que algo de eso fuera cierto**:
ni un test, ni un script para regenerar los datos, ni CI.

## 2. La pregunta que destapó todo

Antes de tocar nada, hice lo obvio: comparar lo que el dashboard mostraba contra lo
que devolvía BigQuery.

```
✓ Cliente creado. Proyecto: burnished-rider-368414
✓ OpenDataRaw: participaciones = 11,514 | atletas_unicos = 2,521

data.json dice:  participaciones_totales: 11514  |  atletas_unicos: 2521
```

El archivo coincidía exactamente. Bien: los datos eran reales.

Pero la página mostraba otra cosa:

| Elemento | Lo que se veía | Lo que correspondía |
|---|---|---|
| Atletas únicos | **3.847** | 2.521 |
| Participaciones | **11.203** | 11.514 |
| Distribución por sexo | **63,4% / 36,6%** | 77,59% / 22,41% |
| Tipo de evento | **71,2% / 14,8%** | 64,92% / 21,92% |

Los tres KPIs y los siete gráficos estaban mostrando **valores inventados**, escritos
a mano en el HTML mucho antes de que existieran los datos reales.

## 3. Por qué nadie lo vio

Acá está la parte interesante, y es la razón por la que este caso vale la pena contar.

`index.html` tenía un `<script>` inline de 4.831 caracteres al final del documento que
dibujaba los siete gráficos con datos hardcodeados. Corría **antes** que el handler de
`app.js`. Y cuando `app.js` intentaba dibujar los suyos, Chart.js v4 lo rechazaba:

```
Canvas is already in use. Chart with ID '0' must be destroyed
before the canvas with ID 'chartSexo' can be reused.
```

Ese error mataba el handler completo. Y acá viene el detalle que lo hizo invisible:
**el orden del código**. Los KPIs, la lista de federaciones y la distribución etaria se
pintaban *antes* del primer `new Chart`. Los gráficos, *después*. Así que:

- el texto de la página se actualizaba correctamente ✅
- los gráficos quedaban con los datos de ejemplo ❌
- la consola del navegador decía `✅ data.json cargado correctamente`

Todo indicaba que funcionaba. El `fetch` andaba, el archivo era el correcto, el texto
era el real. Solo que los números que un humano mira son, en un dashboard, los de los
gráficos.

**La verificación estaba mirando el lugar equivocado.** Yo mismo caí en eso: en una
primera pasada verifiqué los KPIs y las listas leyendo el texto renderizado, y di el
trabajo por bueno. El canvas no lo miré. Cuando escribí el test que ejecuta la página
completa, apareció el error en la primera corrida.

## 4. Los otros cinco defectos

El bug de los gráficos no estaba solo. Aparecieron cinco más, todos del mismo tipo:
cosas que se rompen en silencio.

**Los KPIs no se podían actualizar.** Los `<div class="kpi-value">` no tenían atributo
`id`, pero el JS los buscaba con `getElementById('kpiAtletas')`. La búsqueda devolvía
`null`, la función no hacía nada, y el valor hardcodeado quedaba fijo para siempre.
Ningún error, ningún warning.

**Faltaba una serie completa.** `data.json` no tenía la clave `q5_temporal`. El gráfico
de evolución temporal existía en el código, tenía su canvas en el HTML, y su función
hacía `return` temprano ante la ausencia de datos. Gráfico en blanco, cero errores. La
serie completa —49 años, desde 1964— estaba en BigQuery y nunca había llegado al archivo.

**Un gráfico con etiquetas `undefined`.** El archivo guardaba el campo `Place` (28
valores crudos) donde el JS leía `tipo_resultado`. Alguien había copiado la salida de
una consulta donde iba otra. El donut se dibujaba con 28 porciones sin nombre.

**Una fecha que nunca apareció.** `actualizarMeta()` buscaba `#dataFecha`, que no estaba
en el HTML.

**Una nota que sembraba dudas falsas.** El `_meta` de `data.json` decía *"Reemplazar los
valores de ejemplo con los resultados reales de BigQuery"*. Alguien leyendo eso concluiría
que el archivo era ficticio. Era falso: los valores eran reales y verificados. La nota era
basura de una plantilla.

## 5. El patrón

Los seis defectos comparten una propiedad: **son fallas silenciosas**.

Ninguno tira una excepción visible para el usuario. Ninguno rompe la página. Ninguno
aparece en un log. Todos producen *algo que se ve razonable* y que es falso. En un
dashboard, eso es peor que un error: un error te obliga a mirar; un número falso pasa
a formar parte de la conversación.

Y hay una ironía que no me quiero saltar: este es un proyecto cuyo manifiesto dice
**"cero fabricación"**, escrito por alguien que trabaja en QA. El proyecto tenía
exactamente el defecto que decía prevenir. No lo cuento como una anécdota simpática:
es el argumento central. Las buenas intenciones y la documentación cuidadosa no
detectan nada por sí solas. Solo lo hace un check que corre.

## 6. Qué se construyó

**Un pipeline que se niega a escribir datos malos.** `scripts/refresh_data.py` lee el
SQL del repositorio, lo ejecuta contra BigQuery y regenera `data.json`. Antes de
escribir, **deriva del propio `app.js`** qué claves y qué campos necesita el frontend
y los valida. Si falta algo, no escribe nada y falla con código ≠ 0.

La parte que me gusta es que el contrato no está declarado en dos lados: se lee de la
aplicación. Si mañana alguien agrega un gráfico que consume `data.q11_algo`, el pipeline
empieza a exigir esa clave sin que nadie edite la lista.

**Un SQL que se auto-documenta.** Cada consulta declara con un comentario qué produce:

```sql
-- Q5 — PARTICIPACIÓN A LO LARGO DEL TIEMPO
-- @data-key: q5_temporal
-- @data-shape: list
```

El mapeo entre consulta y campo dejó de vivir escondido en un script. Un check
(`scripts/check_sql_keys.py`) verifica que no haya claves duplicadas y que todo lo que
el frontend consume esté declarado.

**54 tests, cada uno nacido de un bug.** El más importante no prueba datos: prueba la
página. Ejecuta `index.html` *como el navegador* —primero `app.js`, después los scripts
inline, al final `DOMContentLoaded`— con un stub de Chart.js que **reproduce su
restricción real**: no se puede crear un segundo gráfico sobre el mismo canvas.

Ese detalle es la diferencia entre un test útil y uno decorativo. Si el stub hubiera
sido permisivo, el bug de los datos falsos habría pasado el test sin problema. Un stub
que no modela las restricciones de la librería no prueba nada.

**Trazabilidad real.** Cada `data.json` lleva en su `_meta` el dataset, la región, la
fecha, el script que lo generó, el archivo SQL de origen y la cantidad de filas por
consulta. Cualquier número de la página se puede rastrear hasta su consulta.

**CI que corre los checks en cada push.** La página del proyecto afirma que ningún
análisis avanza sin superar los checks. Ahora eso es verificable por cualquiera que
entre al repositorio.

## 7. La afirmación que no pude verificar (y después sí)

Un caso de estudio sobre verificación que esconda sus propios huecos no sirve.

La arquitectura documentada describe el flujo `CSV → Cloud Storage → BigQuery`. Pude
confirmar todo el trayecto salvo un eslabón: **no podía comprobar que existiera el bucket
de Cloud Storage**. Lo intenté por dos vías y las dos estaban bloqueadas:

```
storage.buckets.list       → 403 Permission denied
bigquery.jobs.listAll      → 403 Permission denied
```

El service account del pipeline es de solo lectura sobre los datos y no incluye permisos
de administración — la postura correcta para una credencial que vive en un archivo en
disco. Pero eso significaba que esa afirmación quedaba **NO VERIFICADA**. Ni verdadera ni
falsa: no verificada, con el motivo escrito al lado. Así quedó en el reporte.

Después el dueño del proyecto me pasó la URL del bucket en la consola. Y ahí apareció la
verificación que no necesitaba ningún permiso: preguntarle a la API si el bucket existe.

```
GET storage.googleapis.com/storage/v1/b/powerlifting-data-raw
→ HTTP 401      (un 404 habría significado "no existe")
```

**401 = existe pero es privado.** El bucket `powerlifting-data-raw` existe, el flujo
documentado describe algo que pasó de verdad, y la afirmación quedó confirmada sin un
solo permiso extra.

Lo incómodo es que **ese truco ya lo había usado** al principio del trabajo, para
confirmar que el proyecto de BigQuery existía (mismo 401). Lo tenía a mano y no se me
ocurrió aplicarlo al bucket: me quedé en el 403 y anoté "no verificable", que era
correcto pero incompleto.

La lección no es "verificá todo". Es que **ante un 403 la respuesta no es rendirse: es
encontrar una vía que no necesite el permiso que falta.** Y que una afirmación sin
verificar se escribe como no verificada —nunca como verdadera por conveniencia—
pero tampoco como definitivamente incierta si todavía hay caminos por probar.

## 8. Lo que me llevo

**El texto renderizado no prueba que la interfaz sea correcta.** Si el contenido vive
en un canvas, verificá los datos que recibe la librería, no el DOM. Es la lección más
cara de todo esto.

**Un error de librería puede matar más de lo que parece.** El fallo de Chart.js no rompió
un gráfico: abortó todo el render que venía después. Cuando algo falla a mitad de un
handler, todo lo que sigue también falla, en silencio.

**La documentación no es un control.** Podés escribir veinte páginas impecables sobre
calidad y no detectar un número falso. Solo lo detecta algo que corre y se niega a pasar.
La distancia entre lo que el manifiesto promete y lo que el código hace no se cierra
escribiendo: se cierra con un check.

**Los datos de ejemplo son un pasivo, no una comodidad.** Existen para que la página no
se vea vacía durante el desarrollo. Si sobreviven al desarrollo, se convierten en el
defecto más peligroso del sistema: parecen datos.

Por eso los eliminé del proyecto, no los dejé "por las dudas". Hoy, si `data.json` no
carga, el dashboard no dibuja **nada**: no instancia un solo gráfico, no escribe un solo
KPI, oculta los bloques de datos y muestra un banner con el motivo. Una falla visible es
preferible a un dato falso, siempre. Hay cinco pruebas que fijan ese contrato, incluida
una que simula un fallo de red y verifica que no quede ningún gráfico dibujado.

## 9. Cómo comprobarlo

Todo lo que afirma este documento es reproducible:

```bash
git clone https://github.com/LisandroCacciatore/Arg_Plifting_Analysis
cd Arg_Plifting_Analysis
npm test            # 54 tests: dashboard, pipeline y contrato
```

Sin credenciales, sin Google Cloud. Los tests validan lógica, contrato y estructura.
El refresh real contra BigQuery requiere un service account (ver `CONTRIBUTING.md`).

El detalle técnico completo de cada hallazgo, con la salida cruda de cada comando,
está en [`REPORTE-MEJORAS.md`](REPORTE-MEJORAS.md).
