-- Run on first Postgres init (via docker-entrypoint-initdb.d). Creates one schema per microservice.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS "order";
CREATE SCHEMA IF NOT EXISTS logistics;
CREATE SCHEMA IF NOT EXISTS payment;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS incident;
CREATE SCHEMA IF NOT EXISTS "users";
CREATE SCHEMA IF NOT EXISTS orchestrator;
CREATE SCHEMA IF NOT EXISTS "knowledge";

-- WebSocket connection tracking (replaces DynamoDB for local dev and production)
CREATE SCHEMA IF NOT EXISTS ws;

CREATE TABLE IF NOT EXISTS ws.connections (
  connection_id TEXT        PRIMARY KEY,
  user_id       TEXT        NOT NULL,
  session_id    TEXT        NOT NULL,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE TABLE IF NOT EXISTS ws.rate_limit (
  user_id      TEXT        NOT NULL,
  window_key   TEXT        NOT NULL,  -- Unix minute bucket (epoch / 60 as string)
  count        INTEGER     NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, window_key)
);

CREATE INDEX IF NOT EXISTS idx_ws_connections_expires ON ws.connections(expires_at);
CREATE INDEX IF NOT EXISTS idx_ws_rate_limit_expires  ON ws.rate_limit(expires_at);
CREATE INDEX IF NOT EXISTS idx_ws_rate_limit_window   ON ws.rate_limit(window_key);