#!/usr/bin/env bash
# Orquestração do Firebase Test Lab para o Vigora (Android, robo crawl).
#
#   ./testlab/testlab.sh devices [marca...]   lista o catálogo da marca e sugere 5
#   ./testlab/testlab.sh run <caminho.apk>    roda o robo em cada device de devices.txt
#   ./testlab/testlab.sh pull                 baixa screenshots/vídeo/logcat da última rodada
#
# Cota gratuita: 5 execuções em device FÍSICO por dia. O script recusa passar
# disso; para forçar, exporte CONFIRM_OVER_QUOTA=1.
set -euo pipefail

PROJECT="vigora-saude-8e9db"          # google-services.json
PACKAGE="com.vigora.saude"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVICES_FILE="$HERE/devices.txt"
ROBO_SCRIPT="$HERE/robo-script.json"  # se existir, é usado no lugar do crawl cego
RESULTS="$HERE/results"
LAST_RUN="$HERE/.last-run"            # label<TAB>gs://bucket/dir por linha
QUOTA_MAX=5
TIMEOUT="${TIMEOUT:-300s}"            # robo precisa de fôlego; mínimo útil ~120s
LOCALE="pt_BR"

# O instalador do Cloud SDK só põe o gcloud no PATH de shells novos.
command -v gcloud >/dev/null || \
  PATH="$PATH:/c/Users/$USERNAME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin"

need() { command -v "$1" >/dev/null || { echo "faltando: $1" >&2; exit 1; }; }

# ---------------------------------------------------------------- devices ---
# Uso: devices [marca ...]   ex.: devices motorola realme TECNO
cmd_devices() {
  need gcloud
  # Catálogo cru — os campos do AndroidModel mudam com o tempo, e o --filter do
  # gcloud engasga com regex. Baixa o JSON e filtra em Python (já no PATH).
  gcloud firebase test android models list --project="$PROJECT" \
    --format=json > "$HERE/models-raw.json"
  echo "catálogo completo -> $HERE/models-raw.json"
  echo

  python "$HERE/pick-devices.py" "$HERE/models-raw.json" "$DEVICES_FILE" "$QUOTA_MAX" "$@"
  echo
  echo "edite $DEVICES_FILE se quiser trocar modelo/versão antes de rodar."
}

# -------------------------------------------------------------------- run ---
cmd_run() {
  need gcloud
  local apk="${1:-}"
  [ -f "$apk" ] || { echo "uso: $0 run <caminho.apk>" >&2; exit 1; }
  [ -f "$DEVICES_FILE" ] || { echo "rode '$0 devices' primeiro" >&2; exit 1; }

  # Timeout: o robo precisa de tempo pra sair do onboarding antes de qualquer
  # tela útil. Abaixo de 120s o crawl morre no login.
  local secs="${TIMEOUT%s}"
  [ "$secs" -ge 120 ] || { echo "TIMEOUT precisa ser >= 120s (está $TIMEOUT)" >&2; exit 1; }

  mapfile -t devices < <(grep -v '^\s*#' "$DEVICES_FILE" | grep -v '^\s*$' | cut -f1)
  local n=${#devices[@]}

  # Guarda de cota: conta o que já rodou hoje, não só o que vai rodar agora.
  local today; today=$(date +%F)
  local ledger="$HERE/.quota-$today"
  local already=0; [ -f "$ledger" ] && already=$(wc -l < "$ledger")
  if [ $((already + n)) -gt "$QUOTA_MAX" ] && [ "${CONFIRM_OVER_QUOTA:-0}" != "1" ]; then
    echo "cota: $already execuções hoje + $n pedidas > $QUOTA_MAX/dia (tier gratuito)." >&2
    echo "corte devices.txt ou exporte CONFIRM_OVER_QUOTA=1 para assumir a cobrança." >&2
    exit 1
  fi

  local robo_arg=()
  if [ -f "$ROBO_SCRIPT" ]; then
    robo_arg=(--robo-script "$ROBO_SCRIPT")
    echo ">> usando robo script gravado: $ROBO_SCRIPT"
  else
    echo ">> SEM robo script: crawl cego a partir da tela de login."
    echo "   O login é Google OAuth (sai do app) ou 'Continuar sem conta'. O robo"
    echo "   costuma achar o 'Continuar sem conta', mas NÃO é garantido, e alarme"
    echo "   e SOS quase certamente não serão alcançados — dependem de agendar"
    echo "   horário e esperar o disparo. Trate esta rodada como smoke test de"
    echo "   boot/render/crash, não como cobertura de funcionalidade."
  fi

  : > "$LAST_RUN"
  local stamp; stamp=$(date +%Y%m%d-%H%M%S)

  for dev in "${devices[@]}"; do
    local model="${dev%%,*}" version="${dev##*,}"
    local label="${model}-api${version}"
    local dir="vigora/$stamp/$label"
    local log="$HERE/.log-$label.txt"

    echo
    echo "=== $label ==="
    gcloud firebase test android run \
      --type robo \
      --project "$PROJECT" \
      --app "$apk" \
      --device "model=$model,version=$version,locale=$LOCALE,orientation=portrait" \
      --timeout "$TIMEOUT" \
      --results-dir "$dir" \
      --client-details "matrixLabel=$label" \
      "${robo_arg[@]}" 2>&1 | tee "$log" || echo "!! $label terminou com falha (segue para o próximo)"

    echo "$label" >> "$ledger"

    # A URL do bucket sai no cabeçalho do gcloud; é o único jeito de saber o
    # bucket default sem adivinhar o hash do projeto.
    local bucket
    bucket=$(grep -oE 'storage/browser/[^]/ ]+' "$log" | head -1 | cut -d/ -f3 || true)
    if [ -n "$bucket" ]; then
      printf '%s\tgs://%s/%s\n' "$label" "$bucket" "$dir" >> "$LAST_RUN"
    else
      echo "!! não achei o bucket no output de $label — veja $log"
    fi
  done

  echo
  echo "rodada registrada em $LAST_RUN — agora: $0 pull"
}

# ------------------------------------------------------------------- pull ---
cmd_pull() {
  need gcloud
  [ -s "$LAST_RUN" ] || { echo "nada em $LAST_RUN; rode '$0 run' antes" >&2; exit 1; }

  while IFS=$'\t' read -r label gs; do
    local dest="$RESULTS/$label"
    mkdir -p "$dest"
    echo ">> $label  <-  $gs"
    gcloud storage cp -r "$gs/*" "$dest/" --project "$PROJECT" || {
      echo "!! falhou baixar $label"; continue; }
  done < "$LAST_RUN"

  echo
  echo "artefatos locais:"
  # video.mp4, logcat, artifacts/screenshots/*.png, robo_result.json
  find "$RESULTS" -type f \( -name '*.mp4' -o -name '*logcat*' -o -name '*.png' -o -name '*.json' \) \
    | sed "s|^|  |" | sort
}

case "${1:-}" in
  devices) shift; cmd_devices "$@" ;;
  run)     shift; cmd_run "$@" ;;
  pull)    shift; cmd_pull "$@" ;;
  *) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 1 ;;
esac
