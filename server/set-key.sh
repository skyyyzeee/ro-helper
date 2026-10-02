#!/usr/bin/env bash
# Asks for an AI key and keeps it only here, in /opt/ro-helper/.env — then starts the server.
#   bash set-key.sh           — the paid AI API key (ProxyAPI)
#   bash set-key.sh gigachat  — GigaChat's «Ключ авторизации» (developers.sber.ru → the project → «Получить ключ»)
#   bash set-key.sh admin     — makes a new admins' key for reading the players' marks in the app, and shows it once
# The key is not shown on the screen while you paste it.
set -euo pipefail
ENV=/opt/ro-helper/.env

if [ "${1:-}" = "admin" ]; then
  NAME=ADMIN_TOKEN
  KEY=$(tr -dc 'a-f0-9' </dev/urandom | head -c 40)
  echo "Ключ администратора (вставьте его в программе: Настройки → Администратор → Отзывы об ИИ):"
  echo "$KEY"
  echo "Он показан один раз. Новый — снова: bash set-key.sh admin (старый перестанет работать)."
elif [ "${1:-}" = "gigachat" ]; then
  NAME=GIGACHAT_AUTH_KEY
  PROMPT="Вставьте «Ключ авторизации» GigaChat (его не будет видно) и нажмите Enter: "
else
  NAME=AI_API_KEY
  PROMPT="Вставьте ключ ProxyAPI (его не будет видно) и нажмите Enter: "
fi

if [ -z "${KEY:-}" ]; then
  read -rsp "$PROMPT" KEY
  echo
fi
# What was copied around it — spaces, line breaks, a «Basic » before GigaChat's key — is dropped.
KEY=$(printf '%s' "$KEY" | sed -E 's/^[[:space:]]*[Bb]asic[[:space:]]+//' | tr -d '[:space:]')
if [ -z "$KEY" ]; then
  echo "Ключ пустой — ничего не изменено."
  exit 1
fi

# Replace the line, whatever was there before.
grep -v "^$NAME=" "$ENV" > "$ENV.part" || true
printf '%s=%s\n' "$NAME" "$KEY" >> "$ENV.part"
mv "$ENV.part" "$ENV"
chown rohelper:rohelper "$ENV"
chmod 600 "$ENV"

systemctl restart ro-helper-ai
sleep 2
if systemctl is-active --quiet ro-helper-ai; then
  echo "Ключ сохранён, сервер ИИ работает:"
  journalctl -u ro-helper-ai -n 1 --no-pager -o cat
else
  echo "Сервер не запустился. Покажите вывод этой команды в чате:  journalctl -u ro-helper-ai -n 30"
fi
