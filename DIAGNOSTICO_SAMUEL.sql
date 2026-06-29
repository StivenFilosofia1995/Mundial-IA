-- ============================================================
-- DIAGNÓSTICO: ¿Por qué Samuel tiene 120 puntos?
-- Copia todo y pégalo en Supabase → SQL Editor → Run
-- ============================================================

-- ① Encontrar a Samuel (muestra todos los usuarios que coincidan)
SELECT id, nombre, apellido, nombre || ' ' || apellido AS nombre_completo
FROM usuarios
WHERE nombre ILIKE '%samuel%' OR apellido ILIKE '%samuel%';

-- ② Puntos de partidos (de v_tabla) para Samuel
--    (Reemplaza el UUID si el nombre anterior muestra otro id)
WITH samuel AS (
  SELECT id, nombre, apellido FROM usuarios
  WHERE nombre ILIKE '%samuel%' OR apellido ILIKE '%samuel%'
  LIMIT 1
)
SELECT
  s.nombre || ' ' || s.apellido                          AS usuario,
  vt.evaluados,
  vt.exactos,
  vt.aciertos,
  vt.puntos                                              AS pts_partidos,
  vt.pesos
FROM samuel s
JOIN v_tabla vt ON vt.id = s.id;

-- ③ Detalle partido por partido para Samuel
WITH samuel AS (
  SELECT id FROM usuarios
  WHERE nombre ILIKE '%samuel%' OR apellido ILIKE '%samuel%'
  LIMIT 1
)
SELECT
  p.id                                                  AS partido_id,
  p.etapa,
  p.fecha,
  p.local || ' vs ' || p.visitante                     AS partido,
  a.goles_local                                         AS apuesta_local,
  a.goles_vis                                           AS apuesta_vis,
  r.goles_local                                         AS resultado_local,
  r.goles_vis                                           AS resultado_vis,
  CASE
    WHEN a.goles_local = r.goles_local
     AND a.goles_vis   = r.goles_vis                   THEN 3
    WHEN SIGN(a.goles_local::int - a.goles_vis::int)
       = SIGN(r.goles_local::int - r.goles_vis::int)   THEN 1
    ELSE 0
  END                                                    AS pts
FROM samuel s
JOIN apuestas   a ON a.usuario_id = s.id
JOIN partidos   p ON p.id = a.partido_id
JOIN resultados r ON r.partido_id = p.id
WHERE a.goles_local IS NOT NULL
  AND a.goles_vis   IS NOT NULL
ORDER BY pts DESC, p.fecha, p.hora;

-- ④ Puntos de llaves (bracket) por fase para Samuel
WITH samuel AS (
  SELECT id FROM usuarios
  WHERE nombre ILIKE '%samuel%' OR apellido ILIKE '%samuel%'
  LIMIT 1
)
SELECT
  pf.fase,
  pf.equipos                                             AS equipos_predichos,
  rf.equipos                                             AS equipos_confirmados,
  rf.confirmado,
  -- cuántos aciertos en esta fase
  (SELECT COUNT(*)
   FROM unnest(pf.equipos) e
   WHERE e = ANY(rf.equipos))                            AS aciertos_fase,
  -- pts por fase (dieciseisavos=2, octavos=3, cuartos=5, semis=8, finalistas=12, campeon=20)
  CASE pf.fase
    WHEN 'dieciseisavos' THEN 2
    WHEN 'octavos'       THEN 3
    WHEN 'cuartos'       THEN 5
    WHEN 'semis'         THEN 8
    WHEN 'finalistas'    THEN 12
    WHEN 'campeon'       THEN 20
    ELSE 0
  END                                                    AS pts_por_acierto,
  (SELECT COUNT(*)
   FROM unnest(pf.equipos) e
   WHERE e = ANY(rf.equipos))
  * CASE pf.fase
      WHEN 'dieciseisavos' THEN 2
      WHEN 'octavos'       THEN 3
      WHEN 'cuartos'       THEN 5
      WHEN 'semis'         THEN 8
      WHEN 'finalistas'    THEN 12
      WHEN 'campeon'       THEN 20
      ELSE 0
    END                                                  AS pts_llaves_esta_fase
FROM samuel s
JOIN pronosticos_fase pf ON pf.usuario_id = s.id
LEFT JOIN resultados_fase rf ON rf.fase = pf.fase AND rf.confirmado = true
ORDER BY pf.fase;

-- ⑤ RESUMEN TOTAL de Samuel
WITH samuel AS (
  SELECT id FROM usuarios
  WHERE nombre ILIKE '%samuel%' OR apellido ILIKE '%samuel%'
  LIMIT 1
),
pts_partidos AS (
  SELECT vt.puntos FROM samuel s JOIN v_tabla vt ON vt.id = s.id
),
pts_llaves AS (
  SELECT COALESCE(SUM(
    (SELECT COUNT(*) FROM unnest(pf.equipos) e WHERE e = ANY(rf.equipos))
    * CASE pf.fase
        WHEN 'dieciseisavos' THEN 2
        WHEN 'octavos'       THEN 3
        WHEN 'cuartos'       THEN 5
        WHEN 'semis'         THEN 8
        WHEN 'finalistas'    THEN 12
        WHEN 'campeon'       THEN 20
        ELSE 0
      END
  ), 0) AS total
  FROM samuel s
  JOIN pronosticos_fase pf ON pf.usuario_id = s.id
  LEFT JOIN resultados_fase rf ON rf.fase = pf.fase AND rf.confirmado = true
)
SELECT
  pp.puntos                           AS pts_partidos,
  pl.total                            AS pts_llaves,
  pp.puntos + pl.total                AS pts_TOTAL
FROM pts_partidos pp, pts_llaves pl;

-- ⑥ Verificar si hay fases mal confirmadas (equipos de más o de menos)
SELECT
  fase,
  confirmado,
  array_length(equipos, 1)            AS num_equipos,
  CASE fase
    WHEN 'dieciseisavos' THEN 32
    WHEN 'octavos'       THEN 16
    WHEN 'cuartos'       THEN 8
    WHEN 'semis'         THEN 4
    WHEN 'finalistas'    THEN 2
    WHEN 'campeon'       THEN 1
  END                                 AS equipos_esperados,
  CASE
    WHEN array_length(equipos, 1) !=
         CASE fase
           WHEN 'dieciseisavos' THEN 32
           WHEN 'octavos'       THEN 16
           WHEN 'cuartos'       THEN 8
           WHEN 'semis'         THEN 4
           WHEN 'finalistas'    THEN 2
           WHEN 'campeon'       THEN 1
         END
    THEN '⚠️  CANTIDAD INCORRECTA'
    ELSE '✅ OK'
  END                                 AS estado,
  equipos
FROM resultados_fase
ORDER BY fase;
