#!/usr/bin/env bash
# Sets up the AI server of Кремлёвский Ассистент on a fresh Ubuntu 24.04, as root:
#   curl -fsSL https://raw.githubusercontent.com/skyyyzeee/ro-helper/main/server/install.sh | bash
# Then give it the AI keys:  bash /opt/ro-helper/set-key.sh gigachat  (free, asked first)
#                        and bash /opt/ro-helper/set-key.sh           (paid, for what GigaChat does not answer)
# Running it again updates the server and keeps the settings and the key.
set -euo pipefail

REPO=https://raw.githubusercontent.com/skyyyzeee/ro-helper/main/server
DIR=/opt/ro-helper

. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID%%.*}" -lt 24 ]; then
  echo "Нужна Ubuntu 24.04 (у вас: ${PRETTY_NAME:-неизвестно}). Переустановите сервер с Ubuntu 24.04 в панели хостинга и запустите снова."
  exit 1
fi

echo "== Программы: Node.js и Caddy (HTTPS)"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs caddy curl ufw unzip >/dev/null
node --version

echo "== Сервер ИИ Кремлёвского Ассистента в $DIR"
id rohelper >/dev/null 2>&1 || useradd --system --home "$DIR" --shell /usr/sbin/nologin rohelper
mkdir -p "$DIR"
# Fresh copies every time: GitHub keeps its answers a few minutes, a missing file's too.
fetch() {
  curl -fsSL "$REPO/$1?t=$(date +%s)" -o "$DIR/$1" || { echo "Не скачался файл $1 — подождите пару минут и запустите установку снова."; exit 1; }
}
fetch server.mjs
fetch set-key.sh
fetch env.example
[ -f "$DIR/.env" ] || cp "$DIR/env.example" "$DIR/.env"
# Speech is recognised on the players' computers: this server takes text only.

# GigaChat's servers are signed by the Russian root certificate (Минцифры): Node trusts it through
# NODE_EXTRA_CA_CERTS, for this service only — the system's own certificates are not touched.
curl -fsSL https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt -o "$DIR/russian_trusted_root_ca.crt" \
  || echo "Не скачался сертификат Минцифры: без него не заработает GigaChat, платный ИИ — да. Запустите установку снова позже."

echo "== Модель распознавания речи (Vosk, русская, ~45 МБ) для программ"
mkdir -p "$DIR/models"
if [ ! -s "$DIR/models/vosk-model-small-ru.tar.gz" ]; then
  TMP=$(mktemp -d)
  curl -fsSL https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip -o "$TMP/model.zip"
  unzip -q "$TMP/model.zip" -d "$TMP"
  # With its folders: the browser's unpacker needs them.
  tar -czf "$DIR/models/vosk-model-small-ru.tar.gz" -C "$TMP" vosk-model-small-ru-0.22
  rm -rf "$TMP"
fi
chmod 755 "$DIR" "$DIR/models"
chmod 644 "$DIR/models/vosk-model-small-ru.tar.gz"
chown -R rohelper:rohelper "$DIR"
chmod 600 "$DIR/.env"

cat > /etc/systemd/system/ro-helper-ai.service <<EOF
[Unit]
Description=Kremlin Assistant AI server
After=network-online.target

[Service]
User=rohelper
WorkingDirectory=$DIR
EnvironmentFile=$DIR/.env
Environment=NODE_EXTRA_CA_CERTS=$DIR/russian_trusted_root_ca.crt
ExecStart=/usr/bin/node $DIR/server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "== Адрес и HTTPS"
IP=$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')
DOMAIN="${IP//./-}.sslip.io"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  # The speech model, for the app to download once.
  handle /models/* {
    header Access-Control-Allow-Origin *
    header Cache-Control "public, max-age=604800"
    root * $DIR
    file_server
  }
  handle {
    encode gzip
    reverse_proxy 127.0.0.1:8787 {
      header_up X-Forwarded-For {remote_host}
    }
  }
}
EOF

ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

systemctl daemon-reload
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy
systemctl enable ro-helper-ai >/dev/null 2>&1
if grep -Eq '^(AI_API_KEY|GIGACHAT_AUTH_KEY)=.+' "$DIR/.env"; then
  systemctl restart ro-helper-ai
  echo "== Готово: сервер работает."
else
  echo "== Почти готово. Теперь вставьте ключи ИИ:  bash $DIR/set-key.sh gigachat  (бесплатный GigaChat)  и  bash $DIR/set-key.sh  (платный ProxyAPI, запасной)"
fi
echo
echo "Адрес сервера ИИ:  https://$DOMAIN"
echo "Пришлите этот адрес в чат — он пойдёт в программу."
