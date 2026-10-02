-- ================================================================================
-- Limpieza: eliminar las 18 vistas legacy del dataset
-- ================================================================================
--
-- CONTEXTO
--   El dataset burnished-rider-368414.Openpowerlifting tenía 18 vistas creadas a
--   mano que duplicaban las queries de SQL/phase_2_core/QueryCapa01.sql y que
--   nadie mantenía. Detalle completo en
--   docs/03_Arquitectura/01_Fase_01/07_Views_BigQuery.md
--
-- POR QUÉ SE ELIMINAN
--   1. Ninguna vista es usada por otra vista ni por el repositorio (verificado).
--   2. 17 de 18 son copias literales de queries que ya están versionadas en el
--      repositorio; la única restante (Argentinos_Sexo_AgeClass_NoNull) aplica
--      filtros de limpieza semántica, que el proyecto prohíbe en el crudo.
--   3. Su numeración contradice al SQL del repo: por ejemplo
--      capa01_q10a_total_completitud contiene la lógica de la Q9b. Un artefacto
--      que se llama distinto de lo que hace no es auditable.
--
-- CÓMO USARLO
--   Requiere permiso bigquery.tables.delete (el service account de solo lectura
--   del pipeline NO lo tiene, a propósito). Pegar este script completo en la
--   consola de BigQuery autenticado como dueño del proyecto.
--
-- IMPORTANTE
--   NO se toca la tabla cruda `OpenDataRaw`. Si algún día hace falta una de estas
--   vistas, se recrea copiando la query correspondiente del archivo .sql del
--   repositorio — que es la fuente de verdad.
-- ================================================================================

DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.Argentinos_Sexo_AgeClass_NoNull`;

DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q01_overview_kpis`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q02_sexo`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q03_federacion`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q04a_eventos`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q04b_equipment`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q05_tiempo`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q06a_weightclass`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q06b_weightclass_sexo`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q07a_ageclass`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q07b_age_completitud`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q08_ambito`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q09_ambito2`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q09_resultado_tipo`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q09_resultado_tipo2`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q10a_total_completitud`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q10b_total_rangos1`;
DROP VIEW IF EXISTS `burnished-rider-368414.Openpowerlifting.capa01_q10b_total_rangos2`;

-- Verificación: debe quedar solo la tabla cruda.
-- SELECT table_name, table_type
-- FROM `burnished-rider-368414.Openpowerlifting.INFORMATION_SCHEMA.TABLES`
-- ORDER BY table_type, table_name;
