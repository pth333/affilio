#!/usr/bin/env bash
# Sao lưu DB (pg_dump -Fc) + volume storage, giữ KEEP bản gần nhất mỗi loại.
# Cron trên VPS:  15 3 * * *  /opt/vm/scripts/backup.sh >> /opt/vm/backups/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
KEEP="${KEEP:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p backups

echo "[$(date -u +%FT%TZ)] backup $STAMP"
# user/db lấy từ env bên trong container postgres — không đưa mật khẩu lên dòng lệnh.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/db-$STAMP.dump.partial"
mv "backups/db-$STAMP.dump.partial" "backups/db-$STAMP.dump"

docker compose run --rm --no-deps -T -v "$PWD/backups:/backups" --entrypoint tar worker \
  -czf "/backups/storage-$STAMP.tar.gz" -C /data storage

# Xoá bản cũ trong thư mục backups, giữ KEEP bản mới nhất mỗi loại.
prune() {
  local pattern="$1"
  find backups -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\n' \
    | sort -rn | tail -n +"$((KEEP + 1))" | cut -d' ' -f2- \
    | while IFS= read -r old; do
        echo "xoá $old"
        rm -f -- "$old"
      done
}
prune 'db-*.dump'
prune 'storage-*.tar.gz'
echo "[$(date -u +%FT%TZ)] xong"
