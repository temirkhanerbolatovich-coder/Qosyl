#!/bin/sh
(
set -eu
case "$APP_DB_PASSWORD" in *[!a-f0-9]*|'') echo 'APP_DB_PASSWORD must be generated hexadecimal data.' >&2; exit 1;; esac
# The generated password is passed through stdin, not process arguments or logging.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<SQL
CREATE ROLE marketplace_app LOGIN PASSWORD '$APP_DB_PASSWORD';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO marketplace_app;
ALTER DEFAULT PRIVILEGES FOR ROLE marketplace_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO marketplace_app;
ALTER DEFAULT PRIVILEGES FOR ROLE marketplace_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO marketplace_app;
SQL
)
