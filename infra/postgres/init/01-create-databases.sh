#!/usr/bin/env bash
set -euo pipefail

: "${TICKETS_DB_OWNER_PASSWORD:?}"
: "${TICKETS_DB_PASSWORD:?}"
: "${API_DB_PASSWORD:?}"

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv tickets_owner_password TICKETS_DB_OWNER_PASSWORD
\getenv tickets_password TICKETS_DB_PASSWORD
\getenv api_password API_DB_PASSWORD
CREATE ROLE nexo_tickets_owner LOGIN PASSWORD :'tickets_owner_password';
CREATE ROLE nexo_tickets_app LOGIN PASSWORD :'tickets_password';
CREATE ROLE nexo_api_app LOGIN PASSWORD :'api_password';
CREATE DATABASE nexo_tickets OWNER nexo_tickets_owner;
CREATE DATABASE nexo_api OWNER nexo_api_app;
REVOKE CONNECT, TEMPORARY ON DATABASE nexo_tickets FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE nexo_api FROM PUBLIC;
GRANT CONNECT ON DATABASE nexo_tickets TO nexo_tickets_app;
\connect nexo_tickets
GRANT USAGE ON SCHEMA public TO nexo_tickets_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nexo_tickets_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO nexo_tickets_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nexo_tickets_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexo_tickets_app;
SQL
