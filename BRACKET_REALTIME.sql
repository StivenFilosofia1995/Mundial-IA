-- ============================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- Habilita Realtime en la tabla partidos para que el bracket
-- se actualice en tiempo real cuando los equipos avanzan
-- ============================================================

-- 1. Necesario para que Supabase envíe los cambios completos (no solo el id)
ALTER TABLE partidos REPLICA IDENTITY FULL;

-- 2. Agregar partidos a la publicación de Realtime
-- (ignorar si ya estaba en la publicación)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE partidos;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
