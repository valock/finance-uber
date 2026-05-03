-- ============================================================
-- Execute este SQL no Supabase Dashboard
-- Acesse: seu projeto → SQL Editor → New query → cole e execute
-- ============================================================

-- Tabela principal (uma linha por sala familiar)
CREATE TABLE IF NOT EXISTS room_data (
  room_code  TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security: ativa mas permissão pública
-- O "código da sala" é a senha — quem tem o código acessa
ALTER TABLE room_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso público via código de sala"
  ON room_data
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Habilitar Realtime para sincronização em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE room_data;

-- ============================================================
-- Pronto! Volte para o app e configure sua sala familiar.
-- ============================================================
