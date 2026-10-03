# Gamificación de la capa

> El comparador mide bien y no motiva.

Esa fue la conclusión de la auditoría Octalysis, y este documento explica qué se
hizo con ella. No es un documento de framework: es el registro de tres
intervenciones concretas, del criterio con el que se eligieron, y de los errores
que aparecieron al construirlas.

## El diagnóstico

La auditoría corrió el motor real de `octalysis-core` sobre el comparador. El
resultado fue **30/80 con el gate en FAIL**, y el reparto importa más que el
total:

| Core Drive | Puntaje | Lectura |
|---|---|---|
| CD1 Meaning | 4 | El resultado explica de dónde sale, pero no conecta con nada mayor |
| CD2 Accomplishment | 5 | Hay percentil, no hay nivel ni progreso |
| **CD3 Empowerment** | **7** | **La única fortaleza firme**: se elige cohorte, ventana, alcance |
| **CD4 Ownership** | **2** | **Crítico**: el resultado muere al recargar la página |
| CD5 Social Influence | 3 | La comparación es contra la población, nunca contra alguien |
| **CD6 Scarcity** | **2** | **Crítico** — y en parte correcto, ver abajo |
| CD7 Curiosity | 5 | El número cierra la pregunta en vez de abrirla |
| **CD8 Loss Avoidance** | **2** | **Crítico**: no hay nada que perder por irse |

La contradicción central es **CD3 = 7 contra CD4 = 2**: la persona decide mucho
sobre el encuadre de la comparación, pero no puede conservar nada. Ese contraste
es la tesis del diagnóstico.

## La decisión de no intervenir sobre CD6 y CD8

Un framework de gamificación puntúa bajo la escasez y la aversión a la pérdida, y
la respuesta automática sería agregar una racha, un contador de días, un "quedan
3 comparaciones". **No se hizo, y es una decisión, no un olvido.**

La razón: el activo de este proyecto es la credibilidad, y la urgencia artificial
la gasta. Un público técnico castiga el teatro. Meta-análisis de gamificación
muestran que los elementos de presión funcionan a corto plazo y erosionan la
motivación intrínseca cuando no hay significado detrás — y acá el significado es
precisamente "esto mide de verdad".

**Consecuencia que hay que asumir:** con CD6 en 2, el gate HG-07 va a fallar
siempre, por un motivo conocido. Un gate que siempre falla por algo que ya se
decidió deja de mirarse, y ahí se pierde el gate entero. Vale la pena un
mecanismo de **excepción declarada** —un Core Drive fuera de alcance, justificado
en el propio JSON, que el gate cuente como cumplido en vez de fallado— antes que
acostumbrarse a un FAIL permanente. Queda pendiente.

## Las tres intervenciones

Se eligieron por momento de uso, no por Core Drive: un listado por framework es
ordenado para el analista, uno por momento es útil para decidir. Se implementaron
las tres que (a) más mueven el puntaje, (b) no necesitan BigQuery —todo se
resuelve con la tabla `g(peso)` que ya está en `cohortes.json`— y (c) dan material
publicable.

Proyección del motor con las tres puestas: **48/80**, críticos de
`['cd4','cd6','cd8']` a `['cd6']`, bloqueantes de `['score','sin_criticos']` a
`['sin_criticos']`.

### 1. El medidor vivo

Un panel que se repinta **a cada tecla**, sin red: corre el comparador completo
sobre `cohortes.json` y muestra nivel, puntaje, percentil, la banda resaltada en
una escala de cinco tramos y el efecto del peso.

Resuelve directamente el problema que estaba medido: **el peso corporal era el
único campo de la interfaz que no producía ninguna reacción visual.** Se escribía
y no pasaba nada, y es el campo que la gente mira primero. Ahora es el campo que
más mueve la pantalla.

Si la entrada todavía no alcanza (un campo vacío mientras se tipea) el medidor se
oculta en lugar de mostrar un número a medio calcular. "Se oculta" es una decisión
de diseño, no una ausencia.

### 2. El efecto del peso

El hallazgo del proyecto, puesto donde se ve. A un total fijo de 610 kg:

| Peso corporal | Puntaje | Δ contra 88 kg |
|---|---|---|
| 78,0 kg | 427,0 | **+28,0** |
| 88,0 kg | 399,0 | — |
| 98,0 kg | 378,8 | **−20,2** |

El puntaje divide por una función del peso, así que a igual total más peso corporal
da menos puntaje. Medido sobre el dataset completo: **+15 kg de peso corporal
cuestan −28,2 puntos** de Dots, y el inverso son +46,4 kg de barra para empatar.

Se muestra en el momento en que se mueve el peso, que es cuando la pregunta
existe. Si el motor no puede calcular alguno de los tres puntos —peso demasiado
bajo para restarle 10 kg, o tabla ausente— devuelve `null` y el bloque se oculta:
**no se dibuja el punto que falta.**

### 3. El nivel con nombre

Acá está la decisión técnica de la capa, y conviene que esté escrita porque es la
que más fácil se contamina.

**Los cortes son cinco particiones iguales de la escala de percentil** (0-20-40-60-80-100),
y no los cortes de otro sistema. El razonamiento: la escala de percentil es
uniforme por construcción, así que partirla en quintos es la **única** división
que no requiere elegir umbrales. Las bandas de strengthlevel.com son más densas
arriba, pero importarlas sería copiar umbrales sin poder verificar de dónde salen
— y este proyecto tiene una regla explícita contra eso.

**La consecuencia hay que asumirla:** con quintos iguales, `Elite` es el 20% de
arriba, que es una banda ancha. No es un error de cálculo, es el costo de no
inventar cortes. Lo que lo hace honesto es una regla de presentación:

> **El nombre del nivel nunca viaja solo.** Se muestra siempre con el percentil y
> el n al lado. Una etiqueta sin el número que la define es una afirmación de
> rareza que la medición no respalda.

Hay un test que fija que `Elite` empiece en el percentil 80, con el mensaje
diciendo que si se cambia el corte hay que **verificarlo contra una fuente, no
elegirlo**.

Y una regla que se sostiene sobre la anterior: **una cohorte con banda no estrena
nivel.** Si el n no alcanza para un percentil exacto, tampoco alcanza para una
etiqueta, porque "Avanzado" es más firme que "entre el percentil 40 y el 60" y el
sistema no puede ser más firme en la conclusión que en la medición. El nivel se
emite solo cuando el percentil es exacto.

La distancia al nivel siguiente se expresa en **kg de total**, nunca en kg de un
levantamiento puntual: decir "te faltan 9 kg de banco" sería una prescripción de
entrenamiento, y la capa no prescribe. El total es una medición.

## Los errores que aparecieron al construir esto

Documentados y no borrados, porque cada uno deja una regla. Los tres se
encontraron **ejecutando**, no leyendo.

### El id duplicado que rompía el bloque del peso

El contenedor del efecto del peso quedó con `id="cmp-peso"`, que ya era el id del
input de peso. En el HTML hay dos elementos con el mismo id; `getElementById`
devuelve el primero, así que el bloque **nunca se habría mostrado en el
navegador**. Los tests con DOM simulado tampoco lo veían, porque su
`getElementById` también está memoizado por id y devolvía siempre el mismo nodo:
el error era invisible para la suite y visible para el navegador.

Regla que deja: **un id duplicado no es un detalle cosmético, es un elemento que
deja de existir.** Y una suite que modela `getElementById` como un diccionario por
id no lo puede detectar. La verificación que sí lo encontró fue mirar el DOM
post-JS de un navegador real.

### La rotura que se aplicó al lugar equivocado

El verificador de roturas busca un texto y lo reemplaza. La rotura del bloque del
peso usaba `cajaPeso.hidden = true;`, que aparecía **dos veces** en el archivo (en
`pintarPeso` y en el camino de ocultado). El reemplazo cayó en la primera
ocurrencia, ninguna prueba miraba esa línea, y **la suite quedó verde con el
código roto**.

Es una variante más fina del problema que el propio verificador existe para
cazar: no es que la rotura no se haya aplicado, es que se aplicó donde no
correspondía. La corrección fue doble —unificar el ocultado en una sola función
`ocultarMedidor()`, para que no haya dos lugares que hagan lo mismo por caminos
distintos— y anclar la rotura con un `\n` inicial más la sangría exacta, que la
hace única.

Regla que deja: **el verificador de roturas también tiene que poder fallar.** Un
`XX` (rotura aplicada que no rompió nada) es tan grave como un `??` (rotura que no
matcheó), y más difícil de notar.

### El aviso leído del campo equivocado

Para avisar que el peso quedó fuera del rango con datos, la primera versión leía
`efectoPeso.actual.clampeado`. Con un peso de 5 kg ese campo **no existe**, porque
`efectoDelPeso` devuelve `null` cuando no puede calcular `peso − 10`: el aviso se
perdía justo en el caso extremo, que es cuando más hace falta. Lo encontró un test
en rojo, y el caso lo había mostrado antes el navegador real.

La corrección fue leerlo de donde el motor **ya lo declara**
(`limitaciones`, que incluye `pesoFueraDeRango`), en vez de derivar el mismo hecho
por segunda vez. Dos fuentes para un mismo hecho es una fuente de más.

Regla que deja: **si el motor ya declara una limitación, la interfaz la repite; no
la recalcula.**

## Lo que la interfaz no hace

- **No prescribe.** La distancia al nivel va en kg de total; no sugiere ejercicios,
  series ni frecuencia.
- **No oculta la limitación.** Si el peso está fuera del rango con datos, el
  medidor **igual muestra el número y agrega el aviso**. Advertir, no esconder:
  esconder el número dejaría a la persona sin la medición sin explicarle por qué.
- **No emite un nivel sobre una cohorte fina.** Ver arriba.
- **No inventa el punto que no puede calcular.** `efectoDelPeso` devuelve `null` y
  el bloque no se dibuja.

## Verificación

| Qué | Cómo se comprobó | Resultado |
|---|---|---|
| Los tests de Node | `node --test tests/frontend/*.test.mjs` | 98/98 |
| Los tests de Python | `pytest tests/ -q` | 97/97 |
| Que los tests puedan fallar | `python scripts/verificar_tests.py` | **34/34 roturas hacen fallar su test** |
| Que renderice de verdad | Chrome headless, DOM post-JS | nivel `Intermedio`, percentil `59,2`, n `140.561`, puntos `427,0 / 399,0 / 378,8` |
| Que reaccione de verdad | Chrome headless, eventos `input` sobre el DOM | 78 kg → nivel `Avanzado`, marca en `75.7%`; 5 kg → aviso de rango; vacío → medidor oculto |

Las tres intervenciones agregaron **27 tests** (14 al motor, 13 a la página) y
**17 roturas** al verificador, que pasó de 17 a 34.

El detalle de la verificación en navegador importa: los tests con DOM simulado
prueban la lógica y el navegador prueba el cableado. Los tres errores de arriba
vivieron exactamente en esa frontera.
