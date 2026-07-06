-- ============================================================
-- PENALES_SCHEMA.sql  —  Mundial FIFA 2026
-- Sistema de predicción de penales para apostadores
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > Run
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. NUEVAS COLUMNAS
-- ────────────────────────────────────────────────────────────

-- En apuestas: el apostador predice quién gana si empatan y van a penales
-- 'L' = equipo local, 'V' = equipo visitante, NULL = no predijo
ALTER TABLE apuestas ADD COLUMN IF NOT EXISTS penal_ganador VARCHAR(1) DEFAULT NULL
  CHECK (penal_ganador IN ('L', 'V'));

-- En resultados: el admin registra el marcador real de penales
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS penales_local SMALLINT DEFAULT NULL;
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS penales_vis   SMALLINT DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. VISTA v_tabla ACTUALIZADA
--    +1 punto y +500 pesos por acertar ganador en penales
--    Solo aplica cuando: resultado fue empate Y hubo penales
-- ────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS v_tabla;

CREATE VIEW v_tabla AS
SELECT
  u.id,
  u.nombre,
  u.apellido,
  u.nombre || ' ' || u.apellido         AS nombre_completo,
  COALESCE(COUNT(r.id), 0)              AS evaluados,

  -- PUNTOS: resultado(1) + exacto(3) + penal correcto(+1)
  COALESCE(SUM(
    CASE
      WHEN a.goles_local = r.goles_local AND a.goles_vis = r.goles_vis THEN 3
      WHEN SIGN(a.goles_local - a.goles_vis) = SIGN(r.goles_local - r.goles_vis) THEN 1
      ELSE 0
    END
    +
    -- Bonus penal: +1 si predijo correctamente el ganador en penales
    CASE
      WHEN r.goles_local = r.goles_vis           -- empate en tiempo reglamentario
       AND r.penales_local IS NOT NULL            -- hubo tanda de penales
       AND a.penal_ganador IS NOT NULL            -- apostador predijo ganador
       AND (
         (a.penal_ganador = 'L' AND r.penales_local > r.penales_vis) OR
         (a.penal_ganador = 'V' AND r.penales_vis  > r.penales_local)
       )
      THEN 1
      ELSE 0
    END
  ), 0)                                 AS puntos,

  -- PESOS COP: +1000 resultado, +500 gol local, +500 gol visitante, +500 penal
  COALESCE(SUM(
    CASE WHEN SIGN(a.goles_local - a.goles_vis) = SIGN(r.goles_local - r.goles_vis) THEN 1000 ELSE 0 END
    + CASE WHEN a.goles_local = r.goles_local THEN 500 ELSE 0 END
    + CASE WHEN a.goles_vis   = r.goles_vis   THEN 500 ELSE 0 END
    +
    CASE
      WHEN r.goles_local = r.goles_vis
       AND r.penales_local IS NOT NULL
       AND a.penal_ganador IS NOT NULL
       AND (
         (a.penal_ganador = 'L' AND r.penales_local > r.penales_vis) OR
         (a.penal_ganador = 'V' AND r.penales_vis  > r.penales_local)
       )
      THEN 500
      ELSE 0
    END
  ), 0)                                 AS pesos,

  COALESCE(SUM(CASE
    WHEN a.goles_local = r.goles_local AND a.goles_vis = r.goles_vis THEN 1 ELSE 0
  END), 0)                              AS exactos,

  COALESCE(SUM(CASE
    WHEN a.goles_local IS NOT NULL AND a.goles_vis IS NOT NULL
      AND (a.goles_local != r.goles_local OR a.goles_vis != r.goles_vis)
      AND SIGN(a.goles_local - a.goles_vis) = SIGN(r.goles_local - r.goles_vis) THEN 1 ELSE 0
  END), 0)                              AS aciertos

FROM usuarios u
LEFT JOIN apuestas   a ON a.usuario_id = u.id
LEFT JOIN partidos   p ON p.id = a.partido_id
LEFT JOIN resultados r ON r.partido_id = a.partido_id
  AND a.goles_local IS NOT NULL AND a.goles_vis IS NOT NULL
  AND (p.fecha::timestamp + p.hora::interval + INTERVAL '5 hours') < NOW()
GROUP BY u.id, u.nombre, u.apellido
ORDER BY puntos DESC NULLS LAST, exactos DESC NULLS LAST;

GRANT SELECT ON v_tabla TO anon;
GRANT SELECT ON v_tabla TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. PERMISOS
-- ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON apuestas   TO anon;
GRANT SELECT, INSERT, UPDATE ON resultados TO anon;
