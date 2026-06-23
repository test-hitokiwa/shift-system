#!/bin/sh
set -e

# Railway は PORT 環境変数を動的に注入する。未設定なら 80。
PORT="${PORT:-80}"

# Apache の待ち受けポートを書き換え
sed -i "s/^Listen.*$/Listen ${PORT}/" /etc/apache2/ports.conf
sed -i "s|<VirtualHost \*:[0-9]*>|<VirtualHost *:${PORT}>|" /etc/apache2/sites-available/000-default.conf

exec apache2-foreground
