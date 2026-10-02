## Análisis de datos aplicado al deporte

[![CI](https://github.com/LisandroCacciatore/Arg_Plifting_Analysis/actions/workflows/ci.yml/badge.svg)](https://github.com/LisandroCacciatore/Arg_Plifting_Analysis/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

_De la práctica en el gimnasio a la toma de decisiones con datos_

> 📄 **[Caso de estudio: cuando el dashboard mentía](docs/CASO-DE-ESTUDIO.md)** — la
> auditoría completa del proyecto. El hallazgo central: durante meses el dashboard mostró
> datos de ejemplo como si fueran reales, y sobrevivió porque la verificación miraba el
> texto de la página mientras los números falsos estaban dibujados en un `<canvas>`.

Este proyecto nace de una historia real.

Empezó en un salón de pilates,
con cuatro amigos,
dos kettlebells
y muchas ganas de entrenar mejor.

No había métricas ni dashboards.
Había observación, prueba y error, y una pregunta que se repetía todo el tiempo:
## ¿Cómo sé que esto está funcionando?

Años después, tras cerrar mi propio gimnasio,
esa misma pregunta reaparece desde otro lugar.

Este repositorio existe para mostrar cómo la experiencia práctica,
el pensamiento analítico
y el aprendizaje en Cloud
pueden convivir dentro de un mismo proyecto.

## 🎯 Objetivo del proyecto

Demostrar, de forma simple, reproducible y auditable, cómo el análisis de datos deportivos puede:
- aportar contexto real al rendimiento, más allá de marcas aisladas,
- ayudar a comparar, interpretar y comunicar resultados con criterio,
- transformar experiencia práctica en conocimiento transferible y reutilizable

El foco no está en modelos complejos ni métricas opacas, sino en:
- criterio analítico,
- proceso explícito,
- storytelling basado en datos confiables.

Este proyecto prioriza cómo se llega a una conclusión, no solo la conclusión final.

# ☁️ Enfoque actual (Google Cloud)

El proyecto adopta un enfoque Cloud-first para trabajar con volúmenes reales de datos
y aplicar buenas prácticas desde el inicio, incluso en análisis exploratorios.

# Arquitectura base actual
CSV de gran tamaño → Google Cloud Storage → BigQuery (RAW)

Este enfoque permite:
- escalar sin rehacer el sistema,
- separar claramente datos crudos de análisis,
- explorar y validar información sin comprometer la integridad original

Se prioriza explícitamente:
- control de costos (queries simples, capas bien definidas),
- exploración segura (sin modificar datos originales),
- trazabilidad entre fuente, transformación y resultado analítico.

La arquitectura no es un detalle técnico: es parte del criterio analítico.

## 📊 Dataset

Se utiliza el dataset público de OpenPowerlifting.

## 🚫 Qué NO es este proyecto

Para evitar interpretaciones incorrectas, el alcance se delimita explícitamente.

Este proyecto NO es:
- un sistema de predicción de rendimiento deportivo,
- un ranking de atletas, federaciones o competencias, 
- una herramienta de evaluación individual o scouting,
- un dashboard “bonito” orientado a marketing,
- una demostración de modelos estadísticos avanzados o IA aplicada.

Tampoco busca:
- optimizar marcas,
- recomendar cargas de entrenamiento,
- reemplazar el criterio del entrenador,
- establecer juicios de valor sobre atletas o instituciones.

El objetivo no es decir quién es mejor, sino entender el contexto de los datos disponibles y sus límites.

## 🧪 Manifiesto de Calidad y Testing Analítico

Este proyecto adopta una mentalidad QA Shift-Left aplicada al dato deportivo.

## Principios fundamentales
Los datos no se asumen correctos: se validan
Las transformaciones no se ocultan: se documentan
Las decisiones no son implícitas: se explicitan
Los resultados deben ser reproducibles, no anecdóticos

_¿Qué significa “testing analítico” en este proyecto?_

Validar esquemas, tipos y rangos antes de analizar
Detectar nulos, inconsistencias y valores inesperados
Asegurar que las queries respondan exactamente a la pregunta definida
Verificar que totales, distribuciones y cortes sean coherentes entre sí

El testing no busca “limpiar” el dato, sino entenderlo y caracterizarlo.

## 🔍 Rol del Testing dentro de la arquitectura

El testing no es una etapa final ni un check decorativo.
En este proyecto:
- el testing gobierna el montaje de datos,
- el testing valida que la semántica se respete,
- el testing bloquea conclusiones incorrectas.

Cualquier análisis que no supere los checks definidos no avanza de capa.

## 🧭 Cómo leer este repositorio

Este repositorio no es una colección de dashboards ni queries sueltas.
Es un proyecto estructurado para mostrar cómo pensar, montar y validar análisis de datos deportivos reales.

La organización responde a criterio analítico, no a herramientas.

## 📚 Carpeta /docs — Donde se toman las decisiones

Todo el proyecto está gobernado por la documentación.

Aquí se define:
- qué datos se usan y por qué,
- qué métricas están permitidas,
- cómo se montan los datos,
- cómo se testean,
- qué preguntas analíticas se pueden responder

## 📌 Regla

Nada se implementa si no está documentado acá.

Dentro de /docs/03_Arquitectura/01_Fase_01 se encuentra la Capa 01, que incluye:
- arquitectura de la capa,
- criterio de selección semántica,
- plan de montaje de datos,
- testing del montaje,
- estrategia de queries,
- diagramas de flujo y decisiones.

Este orden no es casual:
👉 criterio → montaje → testing → consulta

## 🧪 Carpeta /data — Estado del dato

Contiene los datos según su nivel de procesamiento.

01_Raw: datos crudos, sin interpretación ni corrección semántica

En esta etapa:
- no se aplican reglas de negocio,
- no hay “limpiezas inteligentes”

🧮 Carpeta /SQL — Implementación controlada
Las queries están organizadas por fase analítica, no por tipo de gráfico.
- phase_1_cleaning: preparación mínima y controlada,
- phase_2_core: queries descriptivas base (Capa 01),
- phase_3_scala: preparación para capas futuras.

Cada query responde a una pregunta explícita definida en la documentación.

## 🛠 Instalaciones y Troubleshooting

- Instalación y setup
- Infraestructura
- Errores operativos

Todo el troubleshooting técnico está documentado por separado para evitar confusión con decisiones analíticas.

## 🔁 Reproducir el análisis

El dashboard no consume valores escritos a mano: `assets/data/data.json` se
genera ejecutando las queries de `SQL/phase_2_core/` contra BigQuery.

```bash
python scripts/refresh_data.py            # regenera data.json
python scripts/refresh_data.py --dry-run  # ejecuta sin escribir
python scripts/refresh_data.py --check    # valida data.json sin tocar BigQuery
npm test                                  # 49 tests (18 frontend + 31 Python)
```

El script **valida el contrato del frontend antes de escribir**: si el resultado
no trae las claves y campos que `assets/js/app.js` lee, no escribe nada y falla.
Así un gráfico roto no puede llegar al dashboard sin que un test lo detecte.

Requisitos y credenciales: ver [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 🎯 Qué demuestra este repo

- cómo aplicar mentalidad QA al análisis de datos
- cómo evitar conclusiones frágiles
- cómo documentar decisiones analíticas
- cómo construir análisis reproducibles y defendibles

El objetivo no es mostrar resultados llamativos,
sino criterio técnico aplicado a datos reales.

## 🚀 Estado del proyecto

MVP educativo y técnico en evolución.

El repositorio funciona como:
- material de formación
- portfolio profesional
- registro vivo del proceso de aprendizaje

## El énfasis está en cómo se piensa un problema, no solo en el resultado final.
