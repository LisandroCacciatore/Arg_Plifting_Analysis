# Libreto — Sport Performance Data Architecture

**Estado:** aplicado al HTML.
**Fecha:** 2026-10-03
**Autor:** Lisandro Cacciatore
**Convención:** el copy va sin tildes (regla del `index.html`). Las notas van con tildes.

## Cómo leerlo

| Si ves | Es |
|---|---|
| Un bloque citado (`>`) | **El copy exacto que está en la página.** Se verifica contra `index.html` en cada push |
| Texto normal | Nota de trabajo. **No** va al sitio, y **no** se verifica |
| `(sin cambios)` | El bloque ya estaba así y se dejó igual |
| `Antes:` / `Ahora:` | El estado previo y el aplicado. El `Antes` **no** es un bloque citado, porque ese texto ya no está en la página |

**Sólo los bloques `>` son el contrato.** El check `scripts/check_libreto.py` extrae esas líneas y
falla si alguna no aparece en el texto visible de `index.html`. Si cambiás el copy de la página,
o actualizás el libreto o el check te avisa.

## Decisiones tomadas

| # | Decisión | Resultado | Fecha |
|---|---|---|---|
| 1 | Beat del arco (bloque 4) | Opción B — la versión más cruda | 2026-10-03 |
| 2 | Libreto post-aplicación | Se queda en el repo + check que lo compara contra `index.html` | 2026-10-03 |
| 3 | Diálogo del bloque 4 | Escena con Pavlov Sharoslav, sin forzar el paralelismo QA/datos | 2026-10-03 |

## Verificación previa (checklist del libreto)

| Ítem | Resultado |
|---|---|
| Queries versionadas con `@data-key` | **11** ✓ (el copy dice 11) |
| Tests | **61** ✓ (36 Python + 25 frontend) |
| Filas del dataset | 3.658.065 → **3,66 M** ✓ |
| Tamaño de la tabla | 809,7 MB → **810 MB** ✓ |
| Script de refresh | `scripts/refresh_data.py` ✓ existe |
| Caso de estudio | `docs/CASO-DE-ESTUDIO.md` ✓ existe |
| Fecha de última actualización | `2026-10-02` (la inyecta `_meta` en runtime) |
| Nodos de arquitectura | `Data Lake` y `Capa 01 Descriptiva` confirmados en el HTML |

### No verificable desde el repositorio

| Ítem | Estado |
|---|---|
| El nombre **Pavlov Sharoslav** | ⚠️ **NO VERIFICADO** — hay una duda declarada entre esta grafía y "Pavel Sharaslav". Sólo el autor puede confirmarlo |
| La línea de colectivo **112** | ⚠️ **NO VERIFICADO** — dato personal, no comprobable desde el repo |
| La escena del bondi | ⚠️ **NO VERIFICADO** — anécdota personal |

Los tres están en el copy publicado. Si alguno es incorrecto, se corrige en el libreto y en
`index.html`, y el check mantiene los dos alineados.

---

# 1. Barra de navegación

`(sin cambios)`

> L C. Data
> El Proyecto
> El Enfoque
> Arquitectura
> Ver Analisis

## Notas

- Los anclas corresponden a: `#proyecto`, `#enfoque`, `#arquitectura`, `#analisis`.
- Cuatro ítems es el máximo para no saturar en mobile. No agregar más.
- El logo "L C. Data" no es link. Es marca.

---

# 2. Hero

## Eyebrow

`(sin cambios)`

> Sport Performance Data Architecture

## Titular

**Antes:** Cuando el QA Shift-Left se aplica al dato deportivo

**Ahora:**

> Empezo en un salon de pilates. Termino en BigQuery.

## Bajada

**Antes:** Licenciado en Educacion Fisica. Tester de profesion. Analista de datos por conviccion. Este proyecto existe porque las tres cosas tienen mas en comun de lo que parece.

**Ahora:**

> Licenciado en Educacion Fisica. Tester de profesion. Analista de datos por conviccion.
>
> Cuatro amigos, dos kettlebells y una pregunta que no me dejaba en paz: como se que esto esta funcionando? No como sensacion. Como dato.

## Botones

`(sin cambios)`

> Ver el analisis
> Codigo fuente

## Notas

- Se promueve el `<h3>` que estaba enterrado en el medio de la página. Es la mejor línea del sitio
  y estaba subordinada a un titular peor.
- El titular arranca con jerga ("QA Shift-Left") y ahora arranca con una escena concreta.
- La palabra del titular lleva el degradado de acento, como antes lo llevaba "dato deportivo".
- "Ver el analisis" hace scroll a `#dashboards`. No agregar un tercer botón.

---

# 3. Las tres tarjetas

## Tarjeta 1

**Antes:** QA Shift-Left aplicado al dato / Validar antes de analizar, siempre

**Ahora:**

> Cada numero tiene su query
>
> 11 queries versionadas en el repositorio. Ningun numero de la pagina esta escrito a mano.

## Tarjeta 2

**Antes:** Dominio deportivo real / El contexto que el dato no dice solo

**Ahora:**

> Un solo dataset, sin tocar
>
> 3,66 M de filas crudas. Sin limpiezas silenciosas, sin columnas derivadas, sin reglas de negocio.

## Tarjeta 3 — nueva

> Si el dato no carga, no se muestra nada
>
> Sin datos reales no hay dashboard. Este proyecto no usa valores de reemplazo.

## Notas

- Las tres tarjetas son nuevas o reescritas: antes eran etiquetas abstractas que afirmaban sin mostrar.
- La tercera es la tesis del proyecto en una línea y es literalmente cierta: si `data.json` no
  responde, el dashboard no dibuja un solo gráfico. Se comprueba desconectando la red.
- Se agregó una tercera clase de animación (`.abstract-stat.delayed-2`) y `.hero-visual` pasó de
  `height: 400px` a `min-height: 400px`, para que entren las tres.
- **Pendiente conocido:** `.hero-visual` tiene `display: none` por debajo de 992px, así que en
  mobile no se ve ninguna de las tres tarjetas — incluida la más fuerte. Si importa, hay que
  sacarlas del hero o duplicar la tercera en otro bloque.

---

# 4. Por qué este proyecto existe

## Título de sección

`(sin cambios)`

> Por que este proyecto existe

El `<h3>` de la sección desaparece: su texto ahora es el titular del hero. Sin esto quedaría repetido.

## Párrafo 1 — el principio

**Antes:** Anos de trabajo en QA me ensenaron algo que el deporte confirma todo el tiempo: un resultado sin contexto no vale nada. Un atleta que levanta 300 kg puede ser extraordinario o promedio, dependiendo de su categoria, federacion y modalidad. Exactamente igual que un bug count sin cobertura de testing: un numero que miente.

**Ahora:**

> Anos de trabajo en QA me ensenaron algo que el deporte confirma todo el tiempo: un
> resultado sin contexto no vale nada.

## Párrafo 2 — la escena

**Antes:** el ejemplo del atleta de 300 kg, explicado y encadenado con "exactamente igual que un bug count".

**Ahora:**

> Estaba esperando el 112 con Pavlov Sharoslav. Volviendo de entrenar.
>
> Le decia que un atleta que levanta 300 kilos puede ser extraordinario o promedio. Depende de la
> categoria, la federacion, si fue raw o equipado.
>
> "Y eso que tiene que ver con el software?" me pregunto.
>
> "Que es lo mismo. Un bug count sin cobertura es un numero que suena a algo pero no dice nada."
>
> El bondi no venia.

## Párrafo 3 — la conclusión

**Antes:** Entonces arme esto. No como ejercicio academico. Como demostracion de que la mentalidad Shift-Left, validar antes de analizar, documentar antes de concluir, funciona igual de bien en un pipeline de datos que en un sprint de software.

**Ahora:**

> Ese dia entendi que el problema no era el numero. Era la falta de contexto para leerlo.
>
> Unos meses despues arme este proyecto. La pregunta era como se que esto esta funcionando. No como
> sensacion. Como dato.

## Beat del arco — Opción B

> La respuesta no fue la que esperaba. Los siete graficos del dashboard mostraban datos de
> ejemplo, y nadie lo notaba porque el error estaba en los canvas, donde no se lee.
> El caso de estudio completo esta en el repositorio.

## Fin de la sección

El bloque termina con el beat del arco. **No hay párrafo de cierre** tipo "El dataset es público..." como
en la versión anterior: la confesión hace ese trabajo mejor. Agregar más sería explicar lo ya dicho.

## Notas

- La conexión entre los dos dominios ya no la afirma un párrafo explicativo: la hace Pavlov con una
  pregunta. El paralelismo forzado ("exactamente igual que...") desaparece.
- "Un numero que suena a algo pero no dice nada" reemplaza "un numero que miente": concreto en lugar
  de abstracto.
- "El bondi no venia" cierra el párrafo sin moraleja. Es el ritmo corto-largo-corto.
- "No como sensacion. Como dato." repite el cierre del hero y del párrafo 3. Es intencional: cierra el círculo.
- **"Los siete graficos" es correcto aunque hoy haya 10 canvas.** Los siete eran los gráficos
  originales, y los siete mostraban datos de ejemplo. Los otros tres se agregaron después. No
  corregir a "diez": cambiaría el hecho.
- ⚠️ El nombre y la línea del 112 están sin verificar (ver tabla de arriba).
- El caso de estudio se enlaza a `docs/CASO-DE-ESTUDIO.md`.

---

# 5. Skills

`(sin cambios)` — los cinco bloques quedan igual.

> QA / Testing · Playwright
> Mentalidad Shift-Left aplicada a datos
> Licenciatura en Educacion Fisica
> Dominio del dato deportivo desde adentro
> BigQuery · SQL
> Queries descriptivas por capas analiticas
> Google Cloud Platform
> GCS + BigQuery · enfoque Cloud-first
> Documentacion como practica
> Nada se implementa si no esta documentado

## Notas

- Esta es la única aparición que sobrevive de "nada se implementa". Las otras dos se eliminaron
  (venían del paso 01 del proceso y del párrafo de cierre).
- Los cinco bloques están ordenados por relevancia para el proyecto, no por cronología.
- No agregar un sexto.

---

# 6. El puente

## Título y bajada

`(sin cambios)`

> El puente que pocos ven
>
> QA y analisis de datos deportivos comparten el mismo problema de fondo: un resultado sin contexto
> de calidad es una conclusion fragil.

## El par — sólo se reordena

**Antes** (los dos mejores pares en las posiciones 3 y 4):

| Lo que aprendi en QA | Lo que aplico en datos deportivos |
|---|---|
| Validar esquemas antes de ejecutar | Validar tipos y rangos antes de analizar |
| Documentar cada decision de diseno | Documentar cada transformacion del dato |
| Un bug sin repro steps no existe | Un resultado sin query documentada no existe |
| El contexto cambia la severidad | El equipamiento cambia el significado del total |
| Shift-Left: la calidad entra al inicio | Testing analitico antes de la visualizacion |
| Reproducibilidad sobre anecdota | Queries reproducibles, no dashboards anecdoticos |

**Ahora:**

> Un bug sin repro steps no existe
> El contexto cambia la severidad
> Validar esquemas antes de ejecutar
> Shift-Left: la calidad entra al inicio
> Documentar cada decision de diseno
> Reproducibilidad sobre anecdota
> Un resultado sin query documentada no existe
> El equipamiento cambia el significado del total
> Validar tipos y rangos antes de analizar
> Testing analitico antes de la visualizacion
> Documentar cada transformacion del dato
> Queries reproducibles, no dashboards anecdoticos

## La nota metodológica — se promueve

**Antes** (al pie del sitio, en cuerpo chico, debajo de todos los gráficos):

Nota metodologica: este dashboard no busca mostrar quien es mejor. Busca mostrar como se hace una pregunta analitica bien formada sobre datos deportivos reales. Dataset RAW de 810 MB (3,66 M de filas) en BigQuery · procesado por capas · queries versionadas en el repositorio.

**Ahora** (en este bloque, sin la parte técnica):

> Nota metodologica: este dashboard no busca mostrar quien es mejor. Busca mostrar como se hace una
> pregunta analitica bien formada sobre datos deportivos reales.

## Notas

- Los dos mejores pares estaban donde un lector que escanea los pierde. Se movieron al principio.
- **No se escribió ninguna línea nueva**: son los mismos bullets en otro orden.
- Los pares 1 y 2 van en negrita porque son los más fuertes.
- La segunda mitad de la nota metodológica (el dato técnico) queda al pie del dashboard, en el bloque 9.
- Sin esta separación, el argumento del proyecto se pierde en letra chica.

---

# 7. Cómo funciona el proceso

## Título

`(sin cambios)`

> Como funciona el proceso

## Paso 01

**Antes:** Criterio semantico — Definir que pregunta se responde y por que. Nada se implementa sin esto.

**Ahora:**

> Criterio semantico
>
> Que pregunta se responde y por que. Se define antes de tocar el dato.

## Paso 02

**Antes:** Montaje del dato — Ingestion a GCS. Carga a BigQuery RAW. Sin modificacion, sin asunciones.

**Ahora:**

> Montaje del dato
>
> Descarga de OpenPowerlifting a Cloud Storage, carga a BigQuery sin transformar. El crudo se
> respalda antes de tocarlo.

## Paso 03

**Antes:** Testing analitico — Validacion de esquemas, nulos, rangos e inconsistencias antes de consultar.

**Ahora:**

> Testing analitico
>
> Esquemas, nulos, rangos e inconsistencias: 61 tests que corren en cada push. Un validador
> impide escribir un data.json incompleto.

## Paso 04

**Antes:** Consulta y resultado — Queries documentadas que responden exactamente la pregunta definida en el paso 01.

**Ahora:**

> Consulta y resultado
>
> 11 queries versionadas que responden la pregunta del paso 01. El dashboard lee el resultado;
> no lo escribe nadie a mano.

## Notas

- Los números (61 tests, 11 queries) no aparecían en ninguna parte del copy. Los cuatro pasos decían
  lo mismo que cualquier proyecto de datos diría.
- "GCS" → "Cloud Storage", más claro para quien no es técnico.
- "Un validador impide escribir un data.json incompleto" es la parte más fuerte: una regla técnica
  que se ejecuta sola, no una intención.
- "11 queries" ya apareció en la tarjeta 1. La repetición es intencional: refuerza el número.

---

# 8. Arquitectura del sistema

## Título y bajada

**Antes:** Cloud-first desde el dia uno. Cada capa tiene un proposito, un costo controlado y trazabilidad completa.

**Ahora:**

> Cloud-first desde el dia uno. Cada capa tiene un proposito y su costo es controlado.

## Los cinco nodos

> OpenPowerlifting
> Dataset publico
> 3,66 M de filas
> Cloud Storage
> Data Lake. El crudo, sin modificar
> BigQuery
> Capa 01 Descriptiva
> Capa 02 Analitica (pendiente)
> Chart.js
> Dashboard nativo en el sitio
> GitHub Pages
> Portfolio publico open-source

## Las tres tarjetas

**Antes / Ahora:**

| Tarjeta | Antes | Ahora |
|---|---|---|
| Desacoplamiento | El almacenamiento es independiente del computo. GCS es la unica fuente de verdad. | El almacenamiento es independiente del computo: el bucket guarda el crudo, BigQuery lo consulta. |
| Trazabilidad completa | Cada transformacion esta respaldada por un .sql versionado en el repositorio. | 11 queries versionadas: cada numero de la pagina se rastrea hasta la suya. |
| QA Shift-Left | La validacion ocurre antes de la visualizacion. Ningun analisis avanza sin superar los checks. | La validacion ocurre antes de la visualizacion. Los checks corren en cada push. |

## Notas

- Se saca la regla de tres de la bajada ("un propósito, un costo, una trazabilidad"). "Trazabilidad
  completa" no decía en qué.
- **Nodo ANALISIS:** se agrega "(pendiente)" porque la Capa 02 todavía no está construida. Es
  honestidad: el diagrama listaba una capa como si existiera.
- **Tarjeta Desacoplamiento:** "GCS es la única fuente de verdad" contradecía al nodo de al lado y al
  propio pipeline, que lee de BigQuery. Se reescribe para reflejar el flujo real.
- **Tarjeta QA Shift-Left:** decía lo mismo que el paso 03 del proceso. Ahora toma otro ángulo: la
  automatización (los checks corren solos en cada push).

---

# 9. Capa 01 — el dashboard

## Encabezado de sección

`(sin cambios)`

> 11 queries que responden 10 preguntas sobre volumen, participacion y demografia del Powerlifting
> argentino. El foco esta en como se construye la pregunta, no solo en el numero que devuelve.

## Banner de origen

`(sin cambios)` — la fecha la inyecta `_meta` en runtime.

> Dashboard generado desde BigQuery — Capa 01 descriptiva sobre el dataset RAW (810 MB · 3,66 M de
> filas · fuente: OpenPowerlifting). Los valores se regeneran con scripts/refresh_data.py. Ultima
> actualizacion: — 

## Nota al pie

**Antes:** la nota metodológica completa, con el dato técnico pegado.

**Ahora:**

> Dataset RAW de 810 MB (3,66 M de filas) en BigQuery · procesado por capas · queries versionadas en
> el repositorio.

## Notas

- La asimetría "11 queries que responden 10 preguntas" es intencional: una query puede responder más
  de una pregunta. Verificado: 11 claves `@data-key` sobre 10 preguntas numeradas.
- La primera mitad de la nota metodológica se promovió al bloque 6. Acá queda el dato técnico, que es
  lo que corresponde a un pie de sección.
- No volver a poner la nota metodológica acá: ya está en el bloque 6.

---

# 10. Footer

## Copyright

**Antes:** © 2026 Lisandro Cacciatore · Sport Performance Data Architecture · Open Powerlifting Dataset

**Ahora:**

> © 2026 Lisandro Cacciatore · Sport Performance Data Architecture · OpenPowerlifting Dataset

## Notas

- "Open Powerlifting" → "OpenPowerlifting": la fuente se escribe en una sola palabra.
- No cambiar el año ni el resto.

---

# Resumen de cambios

## Copy reciclado (ya existía, cambió de lugar)

| Línea | De | A |
|---|---|---|
| "Empezo en un salon de pilates. Termino en BigQuery." | `<h3>` del medio | Titular del hero |
| "Cuatro amigos, dos kettlebells..." | 3er párrafo del bloque 4 | Bajada del hero |
| Los 2 mejores pares de QA/datos | posiciones 3-4 | posiciones 1-2 |
| La nota metodológica | pie del sitio, letra chica | cierre del bloque 6 |

## Copy reescrito (misma idea, con evidencia)

| Bloque | Cambio |
|---|---|
| Tarjetas 1 y 2 del hero | etiquetas abstractas → afirmaciones con números |
| Bloque 4 párrafos 1-3 | párrafo explicativo → escena con Pavlov |
| Bloque 7 (los 4 pasos) | abstracto → con números concretos (61 tests, 11 queries) |
| Bloque 8 bajada | regla de tres → una sola idea |
| Bloque 8 nodos RAW y ANALISIS | más claro + "pendiente" en la Capa 02 |
| Bloque 8 las 3 tarjetas | "GCS es la única fuente de verdad" → flujo real |
| Bloque 9 nota al pie | se separa la parte metodológica (sube al bloque 6) |

## Copy nuevo (nace del trabajo, verificable en el repo)

| Línea | Respaldo |
|---|---|
| Tarjeta 3: "Si el dato no carga, no se muestra nada" | El commit que eliminó los datos de reemplazo. Comprobable desconectando la red |
| Beat del arco (opción B) | `docs/CASO-DE-ESTUDIO.md` |
| Los números 61 tests y 11 queries | Corren en CI en cada push |

## Repetición

| Idea | Antes | Después |
|---|---|---|
| "shift-left" | 6x | 2x |
| "documentad*" | 5x | 4x |
| "nada se implementa" | 3x | 1x |

---

# Post-aplicación

Este archivo y `index.html` dicen lo mismo en dos lugares. Sin control, eso es duplicación de fuente
de verdad — justo lo que el proyecto evita.

**Decisión tomada:** el libreto se queda en el repo y se agrega un check que lo compara contra el copy
extraído de `index.html`. Deja de ser duplicación y pasa a ser un contrato que se verifica solo.

## Implementación

| Archivo | Rol |
|---|---|
| `docs/LIBRETO-PAGINA.md` | este archivo: la fuente del contrato (los bloques `>`) |
| `scripts/check_libreto.py` | extrae los bloques `>` y verifica que estén en el texto visible de `index.html` |
| `index.html` | el sitio |
| `.github/workflows/ci.yml` | donde corre el check |

## Cómo se usa

```bash
python scripts/check_libreto.py           # verifica
python scripts/check_libreto.py --listar  # muestra los bloques que verifica
```

Si el check falla, hay dos causas posibles y las dos son válidas: cambiaste el copy de la página y no
actualizaste el libreto, o cambiaste el libreto y no aplicaste el cambio. El mensaje de error dice
cuál de los dos bloques no coincide.
