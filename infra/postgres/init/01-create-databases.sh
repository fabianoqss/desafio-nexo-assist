#!/usr/bin/env bash
set -euo pipefail

: "${TICKETS_DB_PASSWORD:?}"
: "${API_DB_PASSWORD:?}"

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=tickets_password="$TICKETS_DB_PASSWORD" \
  --set=api_password="$API_DB_PASSWORD" <<'SQL'
CREATE ROLE nexo_tickets_app LOGIN PASSWORD :'tickets_password';
CREATE ROLE nexo_api_app LOGIN PASSWORD :'api_password';
CREATE DATABASE nexo_tickets OWNER nexo_tickets_app;
CREATE DATABASE nexo_api OWNER nexo_api_app;
REVOKE CONNECT, TEMPORARY ON DATABASE nexo_tickets FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE nexo_api FROM PUBLIC;
SQL
