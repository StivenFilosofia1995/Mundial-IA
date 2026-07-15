-- ============================================================
-- SYNC_FASES_DESDE_RESULTADOS.sql  —  Mundial FIFA 2026
-- Corrige contradicciones en "resultados_fase" (ej: un equipo
-- marcado como clasificado a una ronda que ya perdió, como pasó
-- con Noruega apareciendo en semifinales estando eliminada en
-- cuartos ante Inglaterra).
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > Run
-- ============================================================
-- CÓMO FUNCIONA: en vez de escribir nombres de equipos a mano
-- (con riesgo de error humano, que es justo lo que causó el bug),
-- este script LEE los partidos ya resueltos automáticamente por
-- el sistema (tabla partidos, actualizada por el sync de ESPN +
-- computeAndUpdateBracket) y sobreescribe "resultados_fase" con
-- los equipos reales. Solo escribe una fase si encuentra
-- exactamente la cantidad esperada de equipos ya resueltos
-- (nada de placeholders tipo "1A", "Ganador P99", etc.), así que
-- es seguro correrlo varias veces mientras avanza el torneo.
-- ============================================================

-- ── (0) SEMIFINAL 1 — Francia 0-2 España (Dallas, 14 jul 2026) ──
-- Salvaguarda por si el sync automático de ESPN no la tomó bien:
-- España avanzó a la final con goles de Oyarzabal (pen) y Porro.
-- Si el resultado ya estaba cargado correctamente esto no cambia
-- nada (mismo marcador); si faltaba o estaba mal, lo corrige.
INSERT INTO resultados (partido_id, goles_local, goles_vis, goleadores) VALUES
(101, 0, 2, 'España: Oyarzabal (pen), Porro')
ON CONFLICT (partido_id) DO UPDATE
  SET goles_local = EXCLUDED.goles_local,
      goles_vis   = EXCLUDED.goles_vis,
      updated_at  = NOW();

-- ── CUARTOS DE FINAL (8 equipos: partidos 97-100) ──────────────
WITH equipos AS (
  SELECT local AS team FROM partidos WHERE id IN (97,98,99,100)
  UNION ALL
  SELECT visitante AS team FROM partidos WHERE id IN (97,98,99,100)
),
validos AS (
  SELECT DISTINCT team FROM equipos
  WHERE team !~ '^[12][A-L]$'
    AND team !~ '^Mejor 3°'
    AND team !~ '^Ganador P'
    AND team !~ '^Perdedor P'
)
INSERT INTO resultados_fase (fase, equipos, confirmado, updated_at)
SELECT 'cuartos', array_agg(team ORDER BY team), true, NOW()
FROM validos
HAVING COUNT(*) = 8
ON CONFLICT (fase) DO UPDATE SET
  equipos    = EXCLUDED.equipos,
  confirmado = true,
  updated_at = NOW();

-- ── SEMIFINALES (4 equipos: partidos 101-102) ──────────────────
WITH equipos AS (
  SELECT local AS team FROM partidos WHERE id IN (101,102)
  UNION ALL
  SELECT visitante AS team FROM partidos WHERE id IN (101,102)
),
validos AS (
  SELECT DISTINCT team FROM equipos
  WHERE team !~ '^[12][A-L]$'
    AND team !~ '^Mejor 3°'
    AND team !~ '^Ganador P'
    AND team !~ '^Perdedor P'
)
INSERT INTO resultados_fase (fase, equipos, confirmado, updated_at)
SELECT 'semis', array_agg(team ORDER BY team), true, NOW()
FROM validos
HAVING COUNT(*) = 4
ON CONFLICT (fase) DO UPDATE SET
  equipos    = EXCLUDED.equipos,
  confirmado = true,
  updated_at = NOW();

-- ── FINALISTAS (2 equipos: partido 104, local/visitante) ───────
-- Solo se llena una vez se jueguen ambas semifinales y el sistema
-- resuelva los nombres reales en el partido de la final.
WITH equipos AS (
  SELECT local AS team FROM partidos WHERE id = 104
  UNION ALL
  SELECT visitante AS team FROM partidos WHERE id = 104
),
validos AS (
  SELECT DISTINCT team FROM equipos
  WHERE team !~ '^[12][A-L]$'
    AND team !~ '^Mejor 3°'
    AND team !~ '^Ganador P'
    AND team !~ '^Perdedor P'
)
INSERT INTO resultados_fase (fase, equipos, confirmado, updated_at)
SELECT 'finalistas', array_agg(team ORDER BY team), true, NOW()
FROM validos
HAVING COUNT(*) = 2
ON CONFLICT (fase) DO UPDATE SET
  equipos    = EXCLUDED.equipos,
  confirmado = true,
  updated_at = NOW();

-- ── CAMPEÓN (1 equipo: ganador del partido 104) ─────────────────
-- Solo se llena una vez jugada la final (19 jul 2026) y cargado su resultado.
WITH final_res AS (
  SELECT p.local, p.visitante, r.goles_local, r.goles_vis, r.penales_local, r.penales_vis
  FROM partidos p JOIN resultados r ON r.partido_id = p.id
  WHERE p.id = 104
),
campeon AS (
  SELECT CASE
    WHEN goles_local <> goles_vis THEN
      CASE WHEN goles_local > goles_vis THEN local ELSE visitante END
    WHEN penales_local IS NOT NULL AND penales_vis IS NOT NULL AND penales_local <> penales_vis THEN
      CASE WHEN penales_local > penales_vis THEN local ELSE visitante END
    ELSE NULL
  END AS team
  FROM final_res
)
INSERT INTO resultados_fase (fase, equipos, confirmado, updated_at)
SELECT 'campeon', ARRAY[team], true, NOW()
FROM campeon
WHERE team IS NOT NULL
ON CONFLICT (fase) DO UPDATE SET
  equipos    = EXCLUDED.equipos,
  confirmado = true,
  updated_at = NOW();

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN — ejecutar por separado para confirmar
-- ────────────────────────────────────────────────────────────
-- SELECT fase, confirmado, array_length(equipos,1) AS n_equipos, equipos
--   FROM resultados_fase ORDER BY fase;
