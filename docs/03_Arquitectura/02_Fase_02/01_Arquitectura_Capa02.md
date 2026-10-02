# Arquitectura de la Capa 02

## El principio que ordena todo el diseño

> **Medir no es recomendar.**

Esta capa **mide**. No prescribe. La razón no es prudencia: es que la fuente de
datos no alcanza para prescribir, y el proyecto tiene una regla explícita contra
concluir sin contexto.

El dataset de competencia sabe **dónde** está un atleta respecto de sus pares.
No sabe — y no puede saber — su historial de entrenamiento, sus lesiones, su
técnica, los días por semana que tiene disponibles, su equipamiento, su
recuperación ni su edad cronológica real.

Por eso la capa se corta antes del consejo. Ver *Alcance* al final.

## Flujo

```
            ENTRADA (manual, en el repo)
   sexo · edad · peso · equipamiento · los 3 levantamientos
                          │
                          ▼
                 ┌────────────────┐
                 │  VALIDACION    │  rangos físicos, unidades, completitud
                 └────────┬───────┘
                          ▼
                 ┌────────────────┐
                 │   COHORTE      │  Sexo x Edad x Equipamiento x Evento
                 │                │  + alcance (mundial/nacional)
                 │                │  + ventana temporal
                 │                │  + federación (refinamiento opcional)
                 └────────┬───────┘
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │  B. COMPARACION        sostenida 100% por la data    │
   │  · percentil de Dots           (posicion general)    │
   │  · percentil de cada ratio     (donde esta la brecha)│
   │  · brecha en kg al percentil siguiente               │
   │  · n de la cohorte, siempre visible                  │
   └──────────────────────┬───────────────────────────────┘
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │  C. DIAGNOSTICO        sostenida 100% por la data    │
   │  "banco p22 · despegue p78" → el banco esta atrasado │
   │  Es una MEDICION, no un consejo.                     │
   └──────────────────────┬───────────────────────────────┘
                          │
                          ╳  ← el borde. La capa termina aca.
                          │
   ┌──────────────────────────────────────────────────────┐
   │  D. RECOMENDACION      FUERA DE ALCANCE              │
   │  Requiere datos que esta fuente no tiene,            │
   │  conocimiento externo (skill de programacion)        │
   │  y gate humano por riesgo de lesion.                 │
   └──────────────────────────────────────────────────────┘
```

## Las tres capas en detalle

### A. Entrada y validación

Entrada **manual**. El usuario carga sus datos en una página del repositorio y
juega con eso. No hay integración con sistemas externos ni cuentas.

Campos mínimos: sexo, edad, peso corporal, equipamiento, y los tres
levantamientos (sentadilla, banco, despegue).

Antes de comparar hay que **rechazar entradas imposibles**: una edad de 400 años,
un peso negativo, un banco mayor que el total. Una comparación sobre un dato
inválido devuelve un percentil con la misma cara de certeza que uno válido, y eso
es peor que no responder.

### B. Comparación

Todo lo que sale de acá está sostenido por la data y es verificable contra
BigQuery. Las métricas y sus reglas están en
[Reglas de cohorte](03_Reglas_Cohorte.md).

El **n de la cohorte se muestra siempre y al lado del percentil**. Un percentil
sobre 626 personas y uno sobre 7 no valen lo mismo y no pueden verse igual.

### C. Diagnóstico

Es la lectura de la posición: qué levantamiento está atrasado respecto de los
otros. Es una **medición de forma**, no una prescripción.

El criterio y su validación empírica están en
[Criterio de comparabilidad](02_Criterio_Comparabilidad.md).

### El borde

La capa C dice *"tu banco está en el percentil 22 y tu despegue en el 78"*.
Eso es un hecho medido.

Lo que **no** dice es *"hacé press de banca dos veces por semana al 80%"*.
Eso ya no es un dato: es una intervención sobre una persona, con riesgo de
lesión, y necesita información que este dataset no tiene. Un feature que siempre
tiene algo que recomendar es un feature que no sirve.

## Alcance

**Dentro:** A, B y C. Por ahora solo se puede **medir**.

**Fuera:** D. Queda documentada como dirección futura, no como promesa. Para
encararla harían falta, como mínimo:

1. Un **skill de programación de powerlifting** (no existe ninguno en el
   entorno; verificado).
2. Datos de contexto pedidos al usuario de forma explícita.
3. Un **gate humano** antes de emitir cualquier plan.

## Contrato de salida

La capa devuelve un objeto con, como mínimo:

| Campo | Contenido | Por qué |
|---|---|---|
| `cohorte.definicion` | los ejes usados | sin esto el percentil es ininterpretable |
| `cohorte.n` | tamaño | un percentil sin n es una afirmación sin respaldo |
| `cohorte.fuente` | dataset, región, ventana | trazabilidad |
| `percentiles[]` | métrica, valor, percentil | la medición |
| `diagnostico` | levantamiento atrasado, o **ninguno** | puede no haber nada atrasado |
| `limitaciones[]` | advertencias activas | ej. cohorte fina |

`diagnostico = ninguno` es un resultado válido y esperado. Un atleta parejo no
tiene nada atrasado, y el sistema tiene que poder decirlo.

## Cómo se sirve: el comparador es estático

El sitio vive en **GitHub Pages**: estático, sin backend. **BigQuery no puede
correr en tiempo de pedido.** Esto no es un detalle de implementación, es una
restricción que define la forma de la capa.

**La solución es precalcular**, y el proyecto ya tiene el patrón: `refresh_data.py`
genera `data.json` offline y el dashboard lo consume. Igual acá: un generador
emite **`data/cohortes.json`** con las tablas de percentiles de cada combinación de
cohorte, y la página del comparador hace una **búsqueda local**. Cero backend, cero
costo de GCP en runtime.

Por qué encaja y no es un parche:

| Ventaja | Por qué |
|---|---|
| Misma garantía que `data.json` | Los números quedan **versionados en el repo** y auditables, no calculados en un servicio opaco |
| Cero costo en runtime | Coherente con la restricción de no usar servicios GCP costosos |
| Trazabilidad | El generador declara dataset, región, ventana y fecha, igual que `data.json` |
| Sin backend que mantener | No hay servidor, ni función, ni secreto en producción |

**El costo:** la tabla es tan fresca como el último refresh. Es exactamente el
modelo que el proyecto ya tiene, así que no agrega un problema nuevo.

**Tamaño:** los ejes son Sex (2) × AgeClass (~17) × Equipment (5) × alcance (2) ×
ventana (N). Con ~20 números por celda y descartando las celdas con n<10, el
archivo queda en el orden de **cientos de KB** — el mismo orden que el resto de
`/data`. Si creciera, se recorta por ventana.

**Consecuencia sobre los tests:** el generador corre la consulta de
[Reglas de cohorte](03_Reglas_Cohorte.md) y el test de contrato verifica que la
tabla emitida coincida con una consulta directa a BigQuery, dentro de la
tolerancia. Es el mismo mecanismo que ya protege `data.json`.

**Lo que esto NO cambia:** el diagnóstico sigue siendo puro cálculo sobre la tabla
precalculada. Un percentil no necesita BigQuery para calcularse: necesita los
cuantiles de la cohorte, y esos se congelan en el refresh.

## Relación con la arquitectura existente

Esta capa **no está anticipada con un nombre previo**. No existe una "Capa 02"
declarada en el README ni en el reporte de mejoras. Lo que el README sí declara es
la convención de carpetas SQL:

> - `phase_1_cleaning`: preparación mínima y controlada,
> - `phase_2_core`: queries descriptivas base (Capa 01),
> - `phase_3_scala`: preparación para capas futuras.

**Las fases de carpeta no coinciden con los números de capa.** Las queries de la
Capa 01 viven en `phase_2_core`. La capa que este documento define corresponde a
**`phase_3_scala`**, la carpeta declarada para capas futuras.

Estado real del disco: de las tres carpetas declaradas, solo existe
`phase_2_core/`. `phase_1_cleaning/` y `phase_3_scala/` están declaradas y todavía
no creadas. La Capa 02 sería el primer contenido de `phase_3_scala/`.

Esta capa no modifica la Capa 01 ni sus queries.

Las mediciones de densidad y comparabilidad que sostienen este diseño se
corrieron contra `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
(región `southamerica-east1`) y están citadas con su valor real en los
documentos 02 y 03.
