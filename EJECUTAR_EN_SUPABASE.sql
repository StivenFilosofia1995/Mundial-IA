-- ============================================================
-- EJECUTAR ESTO EN SUPABASE SQL EDITOR
-- Copia TODO y pega en: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- 1️⃣ Borrar resultado de prueba (si existe)
DELETE FROM resultados WHERE partido_id = 1;

-- 2️⃣ Recrear vista de tabla de posiciones
DROP VIEW IF EXISTS v_tabla;

CREATE VIEW v_tabla AS
SELECT
  u.id,
  u.nombre,
  u.apellido,
  u.nombre || ' ' || u.apellido         AS nombre_completo,
  COALESCE(COUNT(r.id), 0)              AS evaluados,
  COALESCE(SUM(CASE
    WHEN a.goles_local = r.goles_local AND a.goles_vis = r.goles_vis THEN 3
    WHEN SIGN(a.goles_local - a.goles_vis) = SIGN(r.goles_local - r.goles_vis) THEN 1
    ELSE 0
  END), 0)                              AS puntos,
  COALESCE(SUM(
    CASE WHEN SIGN(a.goles_local - a.goles_vis) = SIGN(r.goles_local - r.goles_vis) THEN 1000 ELSE 0 END
    + CASE WHEN a.goles_local = r.goles_local THEN 500 ELSE 0 END
    + CASE WHEN a.goles_vis   = r.goles_vis   THEN 500 ELSE 0 END
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

-- 3️⃣ Dar permisos (CRÍTICO — debe ir después de CREATE VIEW)
GRANT SELECT ON v_tabla TO anon;
GRANT SELECT ON v_tabla TO authenticated;

-- ✅ LISTO — Ahora recarga la app y deberías ver todos los usuarios registrados en la tabla
