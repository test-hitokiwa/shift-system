# Railway 用: PHP 8.2 + Apache + mod_rewrite
FROM php:8.2-apache

# PDO MySQL ドライバ
RUN docker-php-ext-install pdo pdo_mysql

# .htaccess を効かせるための Apache モジュール
RUN a2enmod rewrite headers

# DocumentRoot 配下で .htaccess overrides を有効化
RUN sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

# ServerName 警告抑制
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# === MPM 競合を確実に解消 (最後にやる) ===
# 1. mods-enabled/ から全 MPM シンボリックリンクを完全削除
# 2. prefork のみ張り直し
# 3. PHP モジュールが要求するのは prefork なので apache2.conf 末尾にも明示
RUN rm -f /etc/apache2/mods-enabled/mpm_*.load \
          /etc/apache2/mods-enabled/mpm_*.conf && \
    ln -sf /etc/apache2/mods-available/mpm_prefork.load /etc/apache2/mods-enabled/mpm_prefork.load && \
    ln -sf /etc/apache2/mods-available/mpm_prefork.conf /etc/apache2/mods-enabled/mpm_prefork.conf

# === 診断: ビルドログで MPM 状態を確認できるように ===
RUN echo "=== mods-enabled ===" && ls -la /etc/apache2/mods-enabled/ | grep -i mpm || true
RUN echo "=== grep LoadModule mpm ===" && grep -rn "^LoadModule mpm" /etc/apache2/ || echo "(none found outside mods-enabled)"

# API ファイル一式
COPY . /var/www/html/

# Railway は PORT 環境変数を渡してくる
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80
CMD ["/usr/local/bin/docker-entrypoint.sh"]
