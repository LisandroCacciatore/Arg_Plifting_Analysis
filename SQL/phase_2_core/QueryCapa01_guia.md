Queries Capa 01 - Análisis Descriptivo Base

-- ================================================================================
-- QUERIES CAPA 01 - ANÁLISIS DESCRIPTIVO BASE
-- Proyecto: Powerlifting Argentina Data Analysis
-- Dataset: burnished-rider-368414.Openpowerlifting.OpenDataRaw
-- Fecha: Enero 2026
-- ================================================================================
-- 
-- Propósito: Implementación de queries descriptivas definidas en 
--            03_Query_Strategy_Capa01.md
-- 
-- Principios aplicados:
-- - Queries descriptivas, no evaluativas
-- - Sin métricas compuestas o normalizadas
-- - Sin comparaciones atleta vs atleta
-- - Bajo costo de ejecución
-- - Explicables a público no técnico
-- - Conservan valores NULL para análisis posteriores
-- ================================================================================


-- ================================================================================
-- Q1 — VOLUMEN DE PARTICIPACIÓN
-- ================================================================================
-- Pregunta: ¿Cuántos atletas y participaciones existen en el dataset para Argentina?
-- Valor analítico: Define el tamaño del ecosistema; punto de entrada para 
--                  cualquier análisis posterior
-- ================================================================================

SELECT 
  COUNT(DISTINCT Name) AS atletas_unicos,
  COUNT(*) AS participaciones_totales,
  ROUND(COUNT(*) / COUNT(DISTINCT Name), 2) AS participaciones_promedio_por_atleta
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina';


-- ================================================================================
-- Q2 — DISTRIBUCIÓN POR SEXO
-- ================================================================================
-- Pregunta: ¿Cómo se distribuye la participación por sexo?
-- Valor analítico: Describe diversidad y composición básica del sistema, 
--                  sin evaluar resultados deportivos
-- ================================================================================

SELECT 
  Sex,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  Sex
ORDER BY 
  participaciones DESC;


-- ================================================================================
-- Q3 — DISTRIBUCIÓN POR FEDERACIÓN
-- ================================================================================
-- Pregunta: ¿En qué federaciones compiten los atletas del país?
-- Valor analítico: Muestra estructura institucional del deporte y heterogeneidad 
--                  del origen de los datos
-- ================================================================================

SELECT 
  Federation,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje,
  COUNT(DISTINCT Name) AS atletas_unicos
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  Federation
ORDER BY 
  participaciones DESC;


-- ================================================================================
-- Q4 — TIPOS DE EVENTOS Y EQUIPAMIENTO
-- ================================================================================
-- Pregunta: ¿Qué tipos de eventos y categorías de equipamiento predominan?
-- Valor analítico: Aporta contexto competitivo y evita interpretar resultados 
--                  sin comprender reglas de competición
-- ================================================================================

-- Q4a: Distribución por tipo de evento
SELECT 
  Event,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  Event
ORDER BY 
  participaciones DESC;

-- Q4b: Distribución por equipamiento
SELECT 
  Equipment,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  Equipment
ORDER BY 
  participaciones DESC;


***Updated***
-- ================================================================================
-- Q5 — PARTICIPACIÓN A LO LARGO DEL TIEMPO
-- ================================================================================
-- Pregunta: ¿Cómo evoluciona la participación a lo largo del tiempo?
-- Valor analítico: Describe crecimiento, estabilidad o contracción del ecosistema, 
--                  sin inferencias causales
-- ================================================================================

SELECT 
  EXTRACT(YEAR FROM Date) AS anio,
  COUNT(*) AS participaciones,
  COUNT(DISTINCT Name) AS atletas_unicos,
  COUNT(DISTINCT Federation) AS federaciones_activas
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
  AND Date IS NOT NULL
GROUP BY 
  anio
ORDER BY 
  anio ASC;
Cambios realizados:

Eliminé todos los comentarios (que podrían contener caracteres problemáticos)
Cambié el alias año por anio (sin la letra ñ, ya que podría estar causando problemas de codificación)
Reescribí todo manualmente para asegurar caracteres ASCII estándar

-- ================================================================================
-- Q6 — DISTRIBUCIÓN DE CATEGORÍAS DE PESO
-- ================================================================================
-- Pregunta: ¿Cómo se distribuyen los atletas por categorías de peso?
-- Valor analítico: Permite entender la composición corporal del sistema 
--                  sin evaluar desempeño
-- ================================================================================

-- Q6a: Distribución general
SELECT 
  WeightClassKg,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
  AND WeightClassKg IS NOT NULL
GROUP BY 
  WeightClassKg
ORDER BY 
  CASE 
    WHEN WeightClassKg LIKE '%+' THEN CAST(REPLACE(WeightClassKg, '+', '') AS FLOAT64) + 1000
    ELSE SAFE_CAST(WeightClassKg AS FLOAT64)
  END ASC;


--- Explicación de los cambios:

Agregué filtro: AND WeightClassKg IS NOT NULL para excluir valores nulos
Manejo de "90+": En el ORDER BY:

WHEN WeightClassKg LIKE '%+' detecta categorías abiertas (como "90+")
REPLACE(WeightClassKg, '+', '') elimina el símbolo "+"
+ 1000 asegura que estas categorías aparezcan al final del ordenamiento
SAFE_CAST previene errores si hay otros valores no numéricos ----

-- Q6b: Distribución segmentada por sexo
SELECT 
  Sex,
  WeightClassKg,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(PARTITION BY Sex), 2) AS porcentaje_por_sexo
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
  AND WeightClassKg IS NOT NULL
  AND Sex IS NOT NULL
GROUP BY 
  Sex, WeightClassKg
ORDER BY 
  Sex, 
  CASE 
    WHEN WeightClassKg LIKE '%+' THEN CAST(REPLACE(WeightClassKg, '+', '') AS FLOAT64) + 1000
    ELSE SAFE_CAST(WeightClassKg AS FLOAT64)
  END ASC;
Cambios realizados:

Filtros adicionales: Agregué AND WeightClassKg IS NOT NULL y AND Sex IS NOT NULL para evitar categorías vacías
ORDER BY mejorado: Reemplacé el CAST simple por la misma lógica de manejo de categorías abiertas (como "90+")


-- ================================================================================
-- Q7 — CLASES ETARIAS
-- ================================================================================
-- Pregunta: ¿Qué clases de edad participan y cómo se distribuyen?
-- Valor analítico: Describe diversidad etaria y calidad del dato reportado
-- ================================================================================

-- Q7a: Distribución por AgeClass
SELECT 
  AgeClass,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje,
  COUNT(DISTINCT Name) AS atletas_unicos
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  AgeClass
ORDER BY 
  participaciones DESC;

-- Q7b: Completitud del dato de edad
SELECT 
  CASE 
    WHEN Age IS NOT NULL THEN 'Edad conocida'
    WHEN AgeClass IS NOT NULL THEN 'Solo AgeClass disponible'
    ELSE 'Sin información etaria'
  END AS estado_edad,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  estado_edad
ORDER BY 
  participaciones DESC;


-- ================================================================================
-- Q8 — PAÍS DE COMPETENCIA
-- ================================================================================
-- Pregunta: ¿Los atletas compiten principalmente a nivel nacional o internacional?
-- Valor analítico: Agrega contexto competitivo sin comparar resultados deportivos
-- ================================================================================

-- Q8a: Distribución por país de competencia
SELECT 
  MeetCountry,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje,
  COUNT(DISTINCT Name) AS atletas_unicos
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  MeetCountry
ORDER BY 
  participaciones DESC;

-- Q8b: Clasificación local vs internacional
SELECT 
  CASE 
    WHEN MeetCountry = 'Argentina' THEN 'Nacional'
    WHEN MeetCountry IS NOT NULL THEN 'Internacional'
    ELSE 'No especificado'
  END AS ambito_competencia,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  ambito_competencia
ORDER BY 
  participaciones DESC;


-- ================================================================================
-- Q9 — CONDICIÓN ADMINISTRATIVA DEL RESULTADO (Place)
-- ================================================================================
-- Pregunta: ¿Cómo se distribuyen los estados administrativos de competencia?
-- Valor analítico: Permite entender cuántos registros no finalizan en resultados 
--                  válidos y la calidad operativa del dataset
-- ================================================================================

-- Q9a: Distribución de todos los valores de Place
SELECT 
  Place,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  Place
ORDER BY 
  participaciones DESC;

-- Q9b: Clasificación por tipo de resultado
SELECT 
  CASE 
    WHEN SAFE_CAST(Place AS INT64) IS NOT NULL THEN 'Posición válida'
    WHEN Place = 'DQ' THEN 'Descalificado'
    WHEN Place = 'NS' THEN 'No presentado'
    WHEN Place = 'G' THEN 'Invitado/Guest'
    WHEN Place = 'DD' THEN 'Doping descalificado'
    WHEN Place IS NULL THEN 'Sin registro'
    ELSE 'Otro'
  END AS tipo_resultado,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  tipo_resultado
ORDER BY 
  participaciones DESC;


-- ================================================================================
-- Q10 — TOTALES REPORTADOS (TotalKg)
-- ================================================================================
-- Pregunta: ¿Qué proporción de participaciones reporta un total válido?
-- Valor analítico: Evalúa completitud del dato y prepara terreno para capas 
--                  analíticas posteriores
-- ================================================================================

-- Q10a: Completitud del dato TotalKg
SELECT 
  CASE 
    WHEN TotalKg IS NOT NULL AND TotalKg > 0 THEN 'Total reportado'
    WHEN TotalKg IS NULL THEN 'Total no reportado'
    ELSE 'Total = 0 o inválido'
  END AS estado_total,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  estado_total
ORDER BY 
  participaciones DESC;

-- Q10b: Distribución general de totales (sin ranking)
-- Nota: Se agrupa en rangos para análisis descriptivo
SELECT 
  CASE 
    WHEN TotalKg IS NULL THEN 'Sin dato'
    WHEN TotalKg = 0 THEN '0 kg'
    WHEN TotalKg > 0 AND TotalKg <= 200 THEN '1-200 kg'
    WHEN TotalKg > 200 AND TotalKg <= 400 THEN '201-400 kg'
    WHEN TotalKg > 400 AND TotalKg <= 600 THEN '401-600 kg'
    WHEN TotalKg > 600 AND TotalKg <= 800 THEN '601-800 kg'
    WHEN TotalKg > 800 THEN '> 800 kg'
  END AS rango_total,
  COUNT(*) AS participaciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS porcentaje
FROM 
  `burnished-rider-368414.Openpowerlifting.OpenDataRaw`
WHERE 
  Country = 'Argentina'
GROUP BY 
  rango_total
ORDER BY 
  CASE 
    WHEN TotalKg IS NULL THEN 0
    WHEN TotalKg = 0 THEN 1
    WHEN TotalKg > 0 AND TotalKg <= 200 THEN 2
    WHEN TotalKg > 200 AND TotalKg <= 400 THEN 3
    WHEN TotalKg > 400 AND TotalKg <= 600 THEN 4
    WHEN TotalKg > 600 AND TotalKg <= 800 THEN 5
    WHEN TotalKg > 800 THEN 6
  END;


-- ================================================================================
-- FIN DE QUERIES CAPA 01
-- ================================================================================
-- 
-- Notas de implementación:
-- 
-- 1. Todas las queries filtran por Country = 'Argentina' según alcance definido
-- 2. Los valores NULL se preservan para análisis posteriores
-- 3. Los porcentajes se calculan con ROUND(..., 2) para dos decimales
-- 4. Se usa SUM(COUNT(*)) OVER() para totales en cálculos porcentuales
-- 5. Algunas queries tienen variantes (a/b) para diferentes perspectivas
-- 6. No se aplican filtros de calidad de dato en esta capa
-- 
-- Próximos pasos:
-- - Validar resultados contra tests definidos en Data_Mounting_Tests.md
-- - Documentar anomalías o patrones inesperados
-- - Preparar vistas materializadas si el volumen lo justifica
-- - Conectar con Looker Studio para visualización
-- 
-- ================================================================================