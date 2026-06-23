# Railway 用: FrankenPHP (Caddy + PHP)
# Apache の MPM 問題を回避するため Caddy ベースに変更
FROM dunglas/frankenphp:php8.2

# PDO MySQL 拡張
RUN install-php-extensions pdo pdo_mysql

# Caddyfile (CORS / OPTIONS / クリーン URL 書き換え)
# FrankenPHP は /etc/frankenphp/Caddyfile を読みに行く
COPY Caddyfile /etc/frankenphp/Caddyfile

# API ファイル
COPY . /app/public/

# Railway は PORT 環境変数を渡してくる
# Caddyfile 側の :{$PORT:80} がそれを読むので SERVER_NAME は使わない
ENV SERVER_NAME=

EXPOSE 80
