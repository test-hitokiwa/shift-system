# Railway 用: Caddy で静的ファイル配信
FROM caddy:2-alpine

# サイトファイルを配置
COPY . /usr/share/caddy/

# Caddy 設定
COPY Caddyfile /etc/caddy/Caddyfile

# Railway は PORT 環境変数を渡してくる
EXPOSE 80
