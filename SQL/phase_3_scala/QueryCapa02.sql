Queries Capa 02 - Cohortes de comparacion


-- ================================================================================
-- QUERIES CAPA 02 - COHORTES DE COMPARACION
-- Proyecto: Powerlifting Argentina Data Analysis
-- Dataset: burnished-rider-368414.Openpowerlifting.OpenDataRaw
-- ================================================================================
--
-- Proposito: construir (a) las tablas de percentiles de cada cohorte, para ubicar
--            a un atleta dentro de su poblacion de pares, y (b) la tabla que
--            permite reconstruir el puntaje normalizado desde el peso corporal.
--
-- Diseno:    docs/03_Arquitectura/02_Fase_02/
--            - 01_Arquitectura_Capa02.md     flujo, alcance y como se sirve
--            - 02_Criterio_Comparabilidad.md las 8 trampas, con la evidencia
--            - 03_Reglas_Cohorte.md          los ejes y la politica de n
--            - 04_Testing_Capa02.md          criterios de aceptacion
--
-- Ejes de la cohorte (obligatorios): Sex, AgeClass, Equipment. Event fijo en SBD.
-- El peso corporal NO es un eje: su correlacion con el ratio bench/squat es
-- -0.002, no hay nada que corregir (ver doc 02, trampa 5).
--
-- Lo que este archivo NO hace: recomendar nada. Mide. Ver doc 01, "el borde".
-- ================================================================================

-- @n-minimo: 10
-- @grid-fina: 0,1,2,3,4,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,96,97,98,99,100
-- @grid-gruesa: 0,10,20,30,40,50,60,70,80,90,95,100
-- @metricas-fina: dots
-- @metricas-gruesa: total,ratio_banco,ratio_despegue,share_sentadilla,share_banco,share_despegue
-- @puntaje-paso: 0.5

-- La grilla fina se usa para el puntaje (donde interesa un percentil suave) y la
-- gruesa para el resto (donde solo interesa ubicar el cruce de p25 para el
-- diagnostico). Mantener dos grillas recorta el archivo a un tercio sin perder
-- precision util.

-- @cohorte: mundial | historico  | 1900-01-01 |
-- @cohorte: mundial | desde_2018 | 2018-01-01 |
-- @cohorte: nacional | historico  | 1900-01-01 | AND Country = 'Argentina'
-- @cohorte: nacional | desde_2018 | 2018-01-01 | AND Country = 'Argentina'

-- Placeholders que reemplaza scripts/cohortes.py:
--   {{DESDE}}      fecha de corte
--   {{ALCANCE}}    vacio (mundial) o el filtro SQL del alcance
--   {{N_MINIMO}}   tamano minimo de celda para emitirla
--   {{PASO}}       resolucion de peso de la tabla de puntaje


-- ================================================================================
-- BLOQUE: cohorte — TABLA DE PERCENTILES POR CELDA
-- ================================================================================
-- Pregunta: para cada combinacion de sexo, edad y equipamiento, como se
--           distribuye el puntaje normalizado y como se reparte el total entre
--           los tres levantamientos?
--
-- Por que APPROX_QUANTILES(x, 100) y no los percentiles sueltos: devuelve el
-- vector completo de 101 cuantiles, y el recorte a la grilla se hace despues.
-- Asi este archivo no cambia si manana se quiere una grilla mas densa.
--
-- Por que SAFE_DIVIDE: devuelve NULL en vez de fallar. Junto con los guards
-- Best3*Kg > 0 la division por cero no puede ocurrir.
--
-- Por que AgeClass IS NOT NULL y no "<> 'None'": los ausentes son NULL reales,
-- no la cadena 'None' (verificado sobre las 3,66 M de filas). Y como el
-- agrupamiento es por AgeClass, los NULL se descartan solos.
-- ================================================================================

-- @bloque: cohorte
SELECT
  Sex,
  AgeClass,
  Equipment,
  COUNT(*) AS n,

  APPROX_QUANTILES(Dots, 100)    AS q_dots,
  APPROX_QUANTILES(TotalKg, 100) AS q_total,

  APPROX_QUANTILES(SAFE_DIVIDE(Best3BenchKg,    Best3SquatKg), 100) AS q_ratio_banco,
  APPROX_QUANTILES(SAFE_DIVIDE(Best3DeadliftKg, Best3SquatKg), 100) AS q_ratio_despegue,

  APPROX_QUANTILES(SAFE_DIVIDE(Best3SquatKg,    TotalKg), 100) AS q_share_sentadilla,
  APPROX_QUANTILES(SAFE_DIVIDE(Best3BenchKg,    TotalKg), 100) AS q_share_banco,
  APPROX_QUANTILES(SAFE_DIVIDE(Best3DeadliftKg, TotalKg), 100) AS q_share_despegue

FROM
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE
  -- Ejes obligatorios
  Sex IN ('M', 'F')
  AND AgeClass IS NOT NULL
  AND Equipment IN ('Raw', 'Wraps', 'Single-ply', 'Multi-ply', 'Unlimited')
  AND Event = 'SBD'

  -- Sin puntaje no hay comparacion
  AND Dots IS NOT NULL
  AND Dots > 0

  -- Guards del denominador
  AND Best3SquatKg > 0
  AND Best3BenchKg > 0
  AND Best3DeadliftKg > 0
  AND TotalKg > 0

  -- Ventana temporal
  AND Date >= DATE '{{DESDE}}'

  -- Alcance: vacio (mundial) o el filtro del alcance declarado
  {{ALCANCE}}

GROUP BY
  Sex, AgeClass, Equipment
HAVING
  COUNT(*) >= {{N_MINIMO}}
ORDER BY
  Sex, AgeClass, Equipment;


-- ================================================================================
-- BLOQUE: puntaje — TABLA PARA RECONSTRUIR EL PUNTAJE DESDE EL PESO
-- ================================================================================
-- Pregunta: cuanto vale g en  Dots = TotalKg * 500 / g(peso, sexo)  para cada peso?
--
-- Por que existe: el usuario sabe su peso y sus tres levantamientos, pero NO su
-- Dots. Para ubicarlo hay que reconstruir el puntaje, y para eso hace falta la
-- funcion g. En vez de copiar los coeficientes de una fuente externa (que
-- podrian no ser los que uso este dataset), g se DERIVA de las propias filas:
--
--     g = TotalKg * 500 / Dots
--
-- Verificado: dentro de un mismo peso, g varia menos del 0,02% tipico (peor caso
-- 0,77% sobre 2.578 pesos distintos). O sea que g es funcion del peso y el sexo.
-- Y reconstruyendo el Dots desde TotalKg + peso + esta tabla, el error maximo
-- medido es 0,10% sobre 8.000 filas al azar.
--
-- La mediana por bin (no el promedio) para que un outlier no corra el valor.
-- ================================================================================

-- @bloque: puntaje
SELECT
  Sex,
  ROUND(BodyweightKg / {{PASO}}) * {{PASO}} AS peso,
  APPROX_QUANTILES(TotalKg * 500 / Dots, 100)[OFFSET(50)] AS g
FROM
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE
  Sex IN ('M', 'F')
  AND Dots IS NOT NULL
  AND Dots > 0
  AND TotalKg > 0
  AND BodyweightKg > 0
GROUP BY
  Sex, peso
HAVING
  COUNT(*) >= 10
ORDER BY
  Sex, peso;
