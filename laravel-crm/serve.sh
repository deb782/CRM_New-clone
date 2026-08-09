#!/usr/bin/env bash
# Self-healing launcher for supervisor. The preview base image periodically wipes
# system packages (PHP, MariaDB); on every (re)start this reinstalls + serves.
bash /app/laravel-crm/setup.sh >> /tmp/laravel_setup.log 2>&1 || true
cd /app/laravel-crm
exec /usr/bin/php artisan serve --host=0.0.0.0 --port=8000
