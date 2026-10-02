#!/usr/bin/env bash
# Verifica que GitHub Pages esté sirviendo el último commit de main.
#
# Para qué sirve: "el push salió" no significa "el sitio está actualizado".
# Pages construye de forma asíncrona; entre el push y el deploy hay una ventana
# en la que el sitio sigue sirviendo la versión anterior. Este script confirma
# que el contenido servido incluye los marcadores del commit actual.
#
# Uso:
#   bash scripts/verify_deploy.sh
#   bash scripts/verify_deploy.sh https://mi-dominio.com
#
# Sale con código != 0 si el sitio no refleja la versión esperada, así que sirve
# para CI o para un chequeo manual antes de decir "ya está publicado".

set -uo pipefail

REPO="LisandroCacciatore/Arg_Plifting_Analysis"
URL="${1:-https://lisandrocacciatore.github.io/Arg_Plifting_Analysis/}"
# En Windows/git-bash `mktemp -d` devuelve una ruta estilo MSYS (/tmp/...) que
# curl —binario nativo— no puede escribir (falla con CURLE_WRITE_ERROR). Se usa
# una ruta que el binario nativo entienda.
if [ -n "${LOCALAPPDATA:-}" ]; then
    TMP="$LOCALAPPDATA/Temp/arg-plifting-deploy-check"
else
    TMP="$(mktemp -d)"
fi
mkdir -p "$TMP"

# Marcadores del HTML: deben ESTAR presentes, y los obsoletos NO.
DEBE_ESTAR=("810 MB" "3,66 M de filas" "11 queries")
NO_DEBE_ESTAR=("~700 MB" "10 queries que" "function formatNum" "getDatosMuestra")

fallo=0

echo "=== Estado del deploy ==="
estado=$(gh api "repos/$REPO/pages" --jq '.status' 2>/dev/null || echo "desconocido")
echo "  status: $estado"
if [ "$estado" != "built" ]; then
    echo "  ⚠ el deploy todavia esta construyendo; esperá y volvé a correr"
fi
echo

echo "=== Descargando el sitio en vivo ==="
curl -fsS --max-time 30 "$URL"           -o "$TMP/index.html" || { echo "  ✗ no se pudo descargar $URL"; exit 2; }
curl -fsS --max-time 30 "$URL/assets/js/app.js" -o "$TMP/app.js" || { echo "  ✗ no se pudo descargar app.js"; exit 2; }
echo "  index.html: $(wc -c < "$TMP/index.html") bytes"
echo "  app.js:     $(wc -c < "$TMP/app.js") bytes"
echo

check() {  # archivo, frase, esperado(0|1)
    local n
    n=$(grep -c -- "$2" "$1" 2>/dev/null)
    n=${n:-0}
    if [ "$3" = "1" ] && [ "$n" -gt 0 ]; then
        printf "  ✓ %-30s presente (%s)\n" "$2" "$n"
    elif [ "$3" = "0" ] && [ "$n" -eq 0 ]; then
        printf "  ✓ %-30s ausente\n" "$2"
    else
        printf "  ✗ %-30s ESPERADO %s, encontrado %s\n" "$2" "$3" "$n"
        fallo=1
    fi
}

echo "=== HTML servido ==="
for f in "${DEBE_ESTAR[@]}"; do check "$TMP/index.html" "$f" 1; done
for f in "${NO_DEBE_ESTAR[@]}"; do check "$TMP/index.html" "$f" 0; done
echo

echo "=== app.js servido ==="
check "$TMP/app.js" "formatearNumero" 1
check "$TMP/app.js" "function formatNum" 0
check "$TMP/app.js" "destruirGrafico" 1
check "$TMP/app.js" "inicializarTemporal" 1
check "$TMP/app.js" "renderTemporalMetrica" 1
echo

if [ "$fallo" -eq 0 ]; then
    echo "✓ El sitio en vivo refleja la version esperada"
else
    echo "✗ El sitio NO refleja la version esperada (deploy viejo o sin construir)"
fi
exit "$fallo"
