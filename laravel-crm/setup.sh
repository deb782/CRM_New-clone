#!/usr/bin/env bash
# Recovery script for the Laravel CRM runtime.
# This preview container periodically resets to the default (Node/Python/Mongo) image,
# which wipes system packages (PHP, MariaDB). Everything under /app persists (code + vendor).
# Run this after any reset to restore PHP + MariaDB + the app:  bash /app/laravel-crm/setup.sh
set -e

echo "[setup] ensuring PHP + MariaDB are installed..."
if ! command -v php >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y php-cli php-mysql php-mbstring php-xml php-curl php-bcmath php-zip php-gd php-intl php-sqlite3 mariadb-server unzip
fi

echo "[setup] ensuring MariaDB is running..."
mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld || true
if [ ! -d /var/lib/mysql/mysql ]; then
  mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null 2>&1 || true
fi
if ! mysqladmin ping >/dev/null 2>&1; then
  nohup /usr/sbin/mariadbd --user=mysql --datadir=/var/lib/mysql >/tmp/mariadbd.log 2>&1 &
  sleep 10
fi
mysql -u root -e "CREATE DATABASE IF NOT EXISTS crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING ''; FLUSH PRIVILEGES;" 2>/dev/null || true

echo "[setup] preparing Laravel app..."
cd /app/laravel-crm
php artisan config:clear >/dev/null 2>&1 || true
# Migrate; if the schema is empty (fresh DB after reset) seed demo data.
if ! php artisan migrate --force >/dev/null 2>&1; then
  php artisan migrate:fresh --seed --force
else
  # If no users exist (fresh DB), seed.
  COUNT=$(php artisan tinker --execute="echo \App\Models\User::count();" 2>/dev/null | tail -1)
  if [ "$COUNT" = "0" ]; then php artisan db:seed --force || true; fi
fi
php artisan storage:link >/dev/null 2>&1 || true

echo "[setup] done. Laravel is served by supervisor at http://0.0.0.0:8000"
