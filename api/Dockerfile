# Railway 用: PHP 8.2 + Apache + mod_rewrite
FROM php:8.2-apache

# PDO MySQL ドライバ
RUN docker-php-ext-install pdo pdo_mysql

# mod_php (prefork のみ対応) との競合を避けるため、MPM は prefork のみに統一
RUN a2dismod mpm_event mpm_worker 2>/dev/null || true && a2enmod mpm_prefork

# .htaccess を効かせるための Apache モジュール
RUN a2enmod rewrite headers

# DocumentRoot 配下で .htaccess overrides を有効化
RUN sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

# ServerName 警告抑制
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# API ファイル一式
COPY . /var/www/html/

# Railway は PORT 環境変数を渡してくる
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80
CMD ["/usr/local/bin/docker-entrypoint.sh"]
