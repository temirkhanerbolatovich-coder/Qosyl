#!/bin/sh
# Run as root. This backs up only Qosyl, using PostgreSQL's local socket.
set -eu
umask 077
directory=/var/backups/qosyl
container=student-marketplace-pilot-db-1
mkdir -p "$directory"
chmod 700 "$directory"
exec 9>"$directory/.lock"
flock -n 9 || exit 0
archive="$directory/database-$(date -u +%Y%m%dT%H%M%SZ).dump"
temporary="$archive.partial"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
docker exec "$container" pg_dump -U marketplace_owner -d student_marketplace \
  --format=custom --no-owner --no-acl --lock-wait-timeout=10000 > "$temporary"
test -s "$temporary"
docker exec -i "$container" pg_restore --list < "$temporary" > /dev/null
mv "$temporary" "$archive"
sha256sum "$archive" > "$archive.sha256"
# Retention is confined to this service's dated archives after a successful backup.
find "$directory" -maxdepth 1 -type f -name 'database-*.dump*' -mtime +14 -delete
printf 'Qosyl backup created: %s\n' "$archive"
