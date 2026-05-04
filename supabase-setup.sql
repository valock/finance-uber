-- ============================================================
-- FinanceUber — Supabase Setup (versão segura com token RPC)
-- Execute no SQL Editor do Supabase: projeto → SQL Editor → New query
-- ============================================================

-- Extensão para hashing SHA-256 dos tokens
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABELA PRINCIPAL
-- ============================================================
CREATE TABLE IF NOT EXISTS room_data (
  room_code         TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL DEFAULT '',
  data              JSONB NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migração: adiciona coluna se a tabela já existia sem ela
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'room_data' AND column_name = 'access_token_hash'
  ) THEN
    ALTER TABLE room_data ADD COLUMN access_token_hash TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE room_data ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas antes de recriar
DROP POLICY IF EXISTS "Acesso público via código de sala" ON room_data;
DROP POLICY IF EXISTS "select_room"  ON room_data;
DROP POLICY IF EXISTS "insert_room"  ON room_data;
DROP POLICY IF EXISTS "update_room"  ON room_data;

-- Anon pode apenas LER (necessário para Realtime funcionar)
CREATE POLICY "select_room" ON room_data
  FOR SELECT TO anon USING (true);

-- INSERT e UPDATE bloqueados para anon
-- Toda escrita obrigatoriamente passa pelas funções RPC abaixo,
-- que validam o token server-side via SECURITY DEFINER.

-- ============================================================
-- FUNÇÕES RPC SEGURAS
-- ============================================================

-- Cria nova sala — chamado uma única vez pelo dono
CREATE OR REPLACE FUNCTION rpc_create_room(
  p_code  TEXT,
  p_token TEXT,
  p_data  JSONB
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM room_data WHERE room_code = p_code) THEN
    RAISE EXCEPTION 'Código de sala já existe. Tente criar novamente.';
  END IF;
  INSERT INTO room_data (room_code, access_token_hash, data, updated_at)
  VALUES (p_code, encode(digest(p_token, 'sha256'), 'hex'), p_data, NOW());
END;
$$;

-- Atualiza dados — retorna TRUE se token correto, FALSE se inválido
CREATE OR REPLACE FUNCTION rpc_update_room(
  p_code  TEXT,
  p_token TEXT,
  p_data  JSONB
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE room_data
  SET data = p_data, updated_at = NOW()
  WHERE room_code = p_code
    AND access_token_hash = encode(digest(p_token, 'sha256'), 'hex');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

-- Verifica token ao entrar numa sala existente
CREATE OR REPLACE FUNCTION rpc_verify_token(
  p_code  TEXT,
  p_token TEXT
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM room_data
    WHERE room_code = p_code
      AND access_token_hash = encode(digest(p_token, 'sha256'), 'hex')
  );
$$;

-- ============================================================
-- REALTIME (leituras em tempo real continuam funcionando)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE room_data;

-- ============================================================
-- RESUMO DA SEGURANÇA
--
-- ANTES: anon podia ler E escrever em qualquer sala (política aberta)
-- AGORA:
--   - Leitura: qualquer anon (necessário para o Realtime)
--   - Escrita: apenas via rpc_create_room / rpc_update_room,
--     que exigem o token SHA-256 correto validado no servidor
--
-- O token nunca é armazenado em texto claro — apenas seu hash.
-- Formato de compartilhamento: "CÓDIGO-TOKEN" (ex: ABC123-XXXXXXXXXXXX)
-- ============================================================
