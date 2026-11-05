#!/usr/bin/env bash
# GuardianLink — reinicia o serviço de tempo real (porta 3003 + 3004)
# Uso: bash scripts/restart-realtime.sh
# O serviço de tempo real é responsável por broadcasts WebSocket para os dashboards dos pais.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_DIR="$ROOT/mini-services/realtime-service"

# Mata instâncias anteriores (silencioso)
pkill -f "realtime-service/index.ts" 2>/dev/null || true

# Aguarda porta liberar
sleep 1

# Inicia nova instância desacoplada do shell
cd "$SERVICE_DIR"
(nohup setsid bun index.ts </dev/null > /tmp/realtime-service.log 2>&1 &) &
disown

# Aguarda subir
sleep 2

# Verifica saúde
if curl -s --max-time 3 http://127.0.0.1:3004/health | grep -q '"ok":true'; then
  echo "[restart-realtime] OK — serviço ativo em 3003 (socket.io) + 3004 (webhook interno)"
  echo "[restart-realtime] log: /tmp/realtime-service.log"
else
  echo "[restart-realtime] ERRO — serviço não respondeu. Verifique /tmp/realtime-service.log"
  exit 1
fi
