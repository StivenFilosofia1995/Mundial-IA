-- ============================================================
-- FIX_BRACKET_2026.sql  —  Mundial FIFA 2026
-- Corrección de llaves eliminatorias y resultados
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > Run
-- ============================================================
-- PROBLEMA: Los partidos P74 (Alemania 1-1 Paraguay, pen→Paraguay),
--           P75 (Países Bajos 1-1 Marruecos, pen→Marruecos) y
--           P88 (Australia 1-1 Egipto, pen→Egipto) terminaron en
--           empate. El sistema no puede determinar automáticamente
--           al ganador en penales, por lo que los octavos P89, P90
--           y P95 quedaron con nombres incorrectos o en blanco,
--           y sus resultados no se guardaron.
-- SOLUCIÓN: Actualización manual con datos oficiales FIFA.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. DIECISEISAVOS (P73–P88): nombres reales de equipos
-- ────────────────────────────────────────────────────────────

UPDATE partidos SET local='Sudáfrica',          codigo_local='za',     visitante='Canadá',               codigo_vis='ca'     WHERE id=73;
UPDATE partidos SET local='Alemania',            codigo_local='de',     visitante='Paraguay',             codigo_vis='py'     WHERE id=74;
UPDATE partidos SET local='Países Bajos',        codigo_local='nl',     visitante='Marruecos',            codigo_vis='ma'     WHERE id=75;
UPDATE partidos SET local='Brasil',              codigo_local='br',     visitante='Japón',                codigo_vis='jp'     WHERE id=76;
UPDATE partidos SET local='Francia',             codigo_local='fr',     visitante='Suecia',               codigo_vis='se'     WHERE id=77;
UPDATE partidos SET local='Costa de Marfil',     codigo_local='ci',     visitante='Noruega',              codigo_vis='no'     WHERE id=78;
UPDATE partidos SET local='México',              codigo_local='mx',     visitante='Ecuador',              codigo_vis='ec'     WHERE id=79;
UPDATE partidos SET local='Inglaterra',          codigo_local='gb-eng', visitante='RD Congo',             codigo_vis='cd'     WHERE id=80;
UPDATE partidos SET local='Estados Unidos',      codigo_local='us',     visitante='Bosnia y Herzegovina', codigo_vis='ba'     WHERE id=81;
UPDATE partidos SET local='Bélgica',             codigo_local='be',     visitante='Senegal',              codigo_vis='sn'     WHERE id=82;
UPDATE partidos SET local='Portugal',            codigo_local='pt',     visitante='Croacia',              codigo_vis='hr'     WHERE id=83;
UPDATE partidos SET local='España',              codigo_local='es',     visitante='Austria',              codigo_vis='at'     WHERE id=84;
UPDATE partidos SET local='Suiza',               codigo_local='ch',     visitante='Argelia',              codigo_vis='dz'     WHERE id=85;
UPDATE partidos SET local='Argentina',           codigo_local='ar',     visitante='Cabo Verde',           codigo_vis='cv'     WHERE id=86;
UPDATE partidos SET local='Colombia',            codigo_local='co',     visitante='Ghana',                codigo_vis='gh'     WHERE id=87;
UPDATE partidos SET local='Australia',           codigo_local='au',     visitante='Egipto',               codigo_vis='eg'     WHERE id=88;

-- ────────────────────────────────────────────────────────────
-- 2. OCTAVOS (P89–P96): asignación manual de equipos
--    P89, P90 y P95 requieren asignación manual por penales.
-- ────────────────────────────────────────────────────────────

-- P89 (4 Jul, Filadelfia): Paraguay gana pens a Alemania → enfrenta al ganador de Francia(P77)
UPDATE partidos SET local='Paraguay',       codigo_local='py',     visitante='Francia',       codigo_vis='fr'     WHERE id=89;
-- P90 (4 Jul, Houston): Marruecos gana pens a Países Bajos → enfrenta al ganador de Canadá(P73)
UPDATE partidos SET local='Canadá',         codigo_local='ca',     visitante='Marruecos',     codigo_vis='ma'     WHERE id=90;
-- P91 (5 Jul, NY/NJ): Ganador P76(Brasil) vs Ganador P78(Noruega)
UPDATE partidos SET local='Brasil',         codigo_local='br',     visitante='Noruega',       codigo_vis='no'     WHERE id=91;
-- P92 (5 Jul, Cdad. de México): Ganador P79(México) vs Ganador P80(Inglaterra)
UPDATE partidos SET local='México',         codigo_local='mx',     visitante='Inglaterra',    codigo_vis='gb-eng' WHERE id=92;
-- P93 (6 Jul, Dallas): Ganador P83(Portugal) vs Ganador P84(España)
UPDATE partidos SET local='Portugal',       codigo_local='pt',     visitante='España',        codigo_vis='es'     WHERE id=93;
-- P94 (6 Jul, Seattle): Ganador P81(EE.UU.) vs Ganador P82(Bélgica)
UPDATE partidos SET local='Estados Unidos', codigo_local='us',     visitante='Bélgica',       codigo_vis='be'     WHERE id=94;
-- P95 (7 Jul, Atlanta): Ganador P86(Argentina) vs Ganador P88(Egipto — gana pens)
UPDATE partidos SET local='Argentina',      codigo_local='ar',     visitante='Egipto',        codigo_vis='eg'     WHERE id=95;
-- P96 (7 Jul, Vancouver): Ganador P85(Suiza) vs Ganador P87(Colombia)
UPDATE partidos SET local='Suiza',          codigo_local='ch',     visitante='Colombia',      codigo_vis='co'     WHERE id=96;

-- ────────────────────────────────────────────────────────────
-- 3. CUARTOS (P97, P99): ya determinados por resultados de octavos
-- ────────────────────────────────────────────────────────────

-- P97 (9 Jul, Boston): Ganador P89(Francia) vs Ganador P90(Marruecos)
UPDATE partidos SET local='Francia',  codigo_local='fr',  visitante='Marruecos', codigo_vis='ma'     WHERE id=97;
-- P99 (11 Jul, Miami): Ganador P91(Noruega) vs Ganador P92(Inglaterra)
UPDATE partidos SET local='Noruega',  codigo_local='no',  visitante='Inglaterra',codigo_vis='gb-eng' WHERE id=99;

-- ────────────────────────────────────────────────────────────
-- 4. RESULTADOS de Dieciseisavos (P73–P88)
--    Scores de 90 min + tiempo extra.
--    Nota: empates aquí = fue a penales (ganador arriba).
-- ────────────────────────────────────────────────────────────

INSERT INTO resultados (partido_id, goles_local, goles_vis, goleadores) VALUES
(73, 0, 1, ''),   -- Sudáfrica 0-1 Canadá
(74, 1, 1, ''),   -- Alemania 1-1 Paraguay  [pen 3-4 → Paraguay avanza]
(75, 1, 1, ''),   -- Países Bajos 1-1 Marruecos [pen 2-3 → Marruecos avanza]
(76, 2, 1, ''),   -- Brasil 2-1 Japón
(77, 3, 0, ''),   -- Francia 3-0 Suecia
(78, 1, 2, ''),   -- Costa de Marfil 1-2 Noruega
(79, 2, 0, ''),   -- México 2-0 Ecuador
(80, 2, 1, ''),   -- Inglaterra 2-1 RD Congo
(81, 2, 0, ''),   -- Estados Unidos 2-0 Bosnia y Herzegovina
(82, 3, 2, ''),   -- Bélgica 3-2 Senegal
(83, 2, 1, ''),   -- Portugal 2-1 Croacia
(84, 3, 0, ''),   -- España 3-0 Austria
(85, 2, 0, ''),   -- Suiza 2-0 Argelia
(86, 3, 2, ''),   -- Argentina 3-2 Cabo Verde
(87, 1, 0, ''),   -- Colombia 1-0 Ghana
(88, 1, 1, '')    -- Australia 1-1 Egipto  [pen 2-4 → Egipto avanza]
ON CONFLICT (partido_id) DO UPDATE
  SET goles_local = EXCLUDED.goles_local,
      goles_vis   = EXCLUDED.goles_vis,
      updated_at  = NOW();
-- Nota: goleadores se preserva si ya estaba cargado por el sistema.

-- ────────────────────────────────────────────────────────────
-- 5. RESULTADOS de Octavos ya jugados (P89–P92)
-- ────────────────────────────────────────────────────────────

INSERT INTO resultados (partido_id, goles_local, goles_vis, goleadores) VALUES
(89, 0, 1, ''),   -- Paraguay 0-1 Francia
(90, 0, 3, ''),   -- Canadá 0-3 Marruecos
(91, 1, 2, ''),   -- Brasil 1-2 Noruega
(92, 2, 3, '')    -- México 2-3 Inglaterra
ON CONFLICT (partido_id) DO UPDATE
  SET goles_local = EXCLUDED.goles_local,
      goles_vis   = EXCLUDED.goles_vis,
      updated_at  = NOW();

-- ────────────────────────────────────────────────────────────
-- 6. CONFIRMAR FASES en resultados_fase
--    (Necesario para que el sistema de llaves puntúe apuestas)
-- ────────────────────────────────────────────────────────────

-- Fase Dieciseisavos: los 32 equipos que jugaron la ronda de 32
INSERT INTO resultados_fase (fase, equipos, confirmado) VALUES (
  'dieciseisavos',
  ARRAY[
    'Sudáfrica','Canadá',
    'Alemania','Paraguay',
    'Países Bajos','Marruecos',
    'Brasil','Japón',
    'Francia','Suecia',
    'Costa de Marfil','Noruega',
    'México','Ecuador',
    'Inglaterra','RD Congo',
    'Estados Unidos','Bosnia y Herzegovina',
    'Bélgica','Senegal',
    'Portugal','Croacia',
    'España','Austria',
    'Suiza','Argelia',
    'Argentina','Cabo Verde',
    'Colombia','Ghana',
    'Australia','Egipto'
  ],
  true
)
ON CONFLICT (fase) DO UPDATE SET
  equipos    = EXCLUDED.equipos,
  confirmado = true,
  updated_at = NOW();

-- Fase Octavos: los 16 equipos clasificados a octavos de final
INSERT INTO resultados_fase (fase, equipos, confirmado) VALUES (
  'octavos',
  ARRAY[
    'Paraguay','Francia',
    'Canadá','Marruecos',
    'Brasil','Noruega',
    'México','Inglaterra',
    'Portugal','España',
    'Estados Unidos','Bélgica',
    'Argentina','Egipto',
    'Suiza','Colombia'
  ],
  true
)
ON CONFLICT (fase) DO UPDATE SET
  equipos    = EXCLUDED.equipos,
  confirmado = true,
  updated_at = NOW();

-- ────────────────────────────────────────────────────────────
-- 7. VERIFICACIÓN — ejecutar por separado para confirmar
-- ────────────────────────────────────────────────────────────
-- SELECT id, etapa, local, visitante FROM partidos WHERE id BETWEEN 73 AND 104 ORDER BY id;
-- SELECT p.id, p.local, p.visitante, r.goles_local, r.goles_vis
--   FROM partidos p LEFT JOIN resultados r ON r.partido_id = p.id
--  WHERE p.id BETWEEN 73 AND 96 ORDER BY p.id;
-- SELECT fase, confirmado, array_length(equipos,1) AS n_equipos FROM resultados_fase ORDER BY fase;
