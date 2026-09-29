#!/usr/bin/env bash
# Asks for the AI API key (ProxyAPI) and keeps it only here, in /opt/ro-helper/.env — then starts the server.
# The key is not shown on the screen while you paste it.
set -euo pipefail
ENV=/opt/ro-helper/.env

read -rsp "Вставьте ключ ProxyAPI (его не будет видно) и нажмите Enter: " KEY
echo
KEY=$(printf '%s' "$KEY" | tr -d '[:space:]')
if [ -z "$KEY" ]; then
  echo "Ключ пустой — ничего не изменено."
  exit 1
fi

# Replace the line, whatever was there before.
grep -v '^AI_API_KEY=' "$ENV" > "$ENV.part" || true
printf 'AI_API_KEY=%s\n' "$KEY" >> "$ENV.part"
mv "$ENV.part" "$ENV"
chown rohelper:rohelper "$ENV"
chmod 600 "$ENV"

systemctl restart ro-helper-ai
sleep 2
if systemctl is-active --quiet ro-helper-ai; then
  echo "Ключ сохранён, сервер ИИ работает."
else
  echo "Сервер не запустился. Покажите вывод этой команды в чате:  journalctl -u ro-helper-ai -n 30"
fi
