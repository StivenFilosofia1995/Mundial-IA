-- ============================================================
-- LA POLLA NODO — MUNDIAL 2026
-- Schema completo para Supabase SQL Editor
-- ============================================================

-- 1. TABLAS PRINCIPALES
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    VARCHAR(60)  NOT NULL,
  apellido  VARCHAR(60)  NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nombre, apellido)
);

CREATE TABLE IF NOT EXISTS partidos (
  id           INTEGER PRIMARY KEY,
  etapa        VARCHAR(60)  NOT NULL,
  fecha        DATE         NOT NULL,
  hora         TIME         NOT NULL,
  local        VARCHAR(100) NOT NULL,
  visitante    VARCHAR(100) NOT NULL,
  codigo_local VARCHAR(10),
  codigo_vis   VARCHAR(10),
  ciudad       VARCHAR(100) NOT NULL,
  estadio      VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS apuestas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  partido_id    INTEGER NOT NULL REFERENCES partidos(id),
  goles_local   SMALLINT,
  goles_vis     SMALLINT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, partido_id)
);

CREATE TABLE IF NOT EXISTS resultados (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id   INTEGER NOT NULL REFERENCES partidos(id) UNIQUE,
  goles_local  SMALLINT NOT NULL,
  goles_vis    SMALLINT NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asistencias (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  partido_id INTEGER NOT NULL REFERENCES partidos(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, partido_id)
);

-- 2. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_apuestas_usuario  ON apuestas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_apuestas_partido  ON apuestas(partido_id);
CREATE INDEX IF NOT EXISTS idx_resultados_partido ON resultados(partido_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_partido ON asistencias(partido_id);
CREATE INDEX IF NOT EXISTS idx_partidos_fecha     ON partidos(fecha);

-- 3. FUNCIÓN AUTO-UPDATE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_apuestas_updated_at
  BEFORE UPDATE ON apuestas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_resultados_updated_at
  BEFORE UPDATE ON resultados
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. ROW LEVEL SECURITY (permisivo para uso interno de oficina)
-- ============================================================
ALTER TABLE usuarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE partidos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE apuestas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados  ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias ENABLE ROW LEVEL SECURITY;

-- Acceso anon completo (clave anon es segura para uso interno)
CREATE POLICY "anon_all_usuarios"    ON usuarios    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_partidos"    ON partidos    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_apuestas"    ON apuestas    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_resultados"  ON resultados  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_asistencias" ON asistencias FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. VISTA: TABLA DE POSICIONES
-- ============================================================
CREATE OR REPLACE VIEW v_tabla AS
SELECT
  u.id,
  u.nombre,
  u.apellido,
  u.nombre || ' ' || u.apellido AS nombre_completo,
  COUNT(r.id)                    AS evaluados,
  SUM(CASE
    WHEN a.goles_local = r.goles_local AND a.goles_vis = r.goles_vis THEN 3
    WHEN SIGN(a.goles_local - a.goles_vis) = SIGN(r.goles_local - r.goles_vis) THEN 1
    ELSE 0
  END)                           AS puntos,
  SUM(CASE
    WHEN a.goles_local = r.goles_local AND a.goles_vis = r.goles_vis THEN 1
    ELSE 0
  END)                           AS exactos,
  SUM(CASE
    WHEN a.goles_local IS NOT NULL AND a.goles_vis IS NOT NULL
      AND (a.goles_local != r.goles_local OR a.goles_vis != r.goles_vis)
      AND SIGN(a.goles_local - a.goles_vis) = SIGN(r.goles_local - r.goles_vis) THEN 1
    ELSE 0
  END)                           AS aciertos
FROM usuarios u
LEFT JOIN apuestas   a ON a.usuario_id = u.id
LEFT JOIN resultados r ON r.partido_id = a.partido_id
  AND a.goles_local IS NOT NULL
  AND a.goles_vis   IS NOT NULL
GROUP BY u.id, u.nombre, u.apellido
ORDER BY puntos DESC NULLS LAST, exactos DESC NULLS LAST;

-- 6. INSERTAR LOS 104 PARTIDOS
-- ============================================================
INSERT INTO partidos (id, etapa, fecha, hora, local, visitante, codigo_local, codigo_vis, ciudad, estadio) VALUES
(1,'Grupo A','2026-06-11','14:00','México','Sudáfrica','mx','za','Ciudad de México','Estadio Azteca'),
(2,'Grupo A','2026-06-11','21:00','Corea del Sur','República Checa','kr','cz','Guadalajara','Estadio Akron'),
(3,'Grupo B','2026-06-12','14:00','Canadá','Bosnia y Herzegovina','ca','ba','Toronto','BMO Field'),
(4,'Grupo D','2026-06-12','20:00','Estados Unidos','Paraguay','us','py','Los Ángeles','SoFi Stadium'),
(5,'Grupo C','2026-06-13','20:00','Haití','Escocia','ht','gb-sct','Boston','Gillette Stadium'),
(6,'Grupo D','2026-06-13','23:00','Australia','Turquía','au','tr','Vancouver','BC Place'),
(7,'Grupo C','2026-06-13','17:00','Brasil','Marruecos','br','ma','Nueva York/Nueva Jersey','MetLife Stadium'),
(8,'Grupo B','2026-06-13','14:00','Catar','Suiza','qa','ch','San Francisco','Levi''s Stadium'),
(9,'Grupo E','2026-06-14','18:00','Costa de Marfil','Ecuador','ci','ec','Filadelfia','Lincoln Financial Field'),
(10,'Grupo E','2026-06-14','12:00','Alemania','Curazao','de','cw','Houston','NRG Stadium'),
(11,'Grupo F','2026-06-14','15:00','Países Bajos','Japón','nl','jp','Dallas','AT&T Stadium'),
(12,'Grupo F','2026-06-14','21:00','Suecia','Túnez','se','tn','Monterrey','Estadio BBVA'),
(13,'Grupo H','2026-06-15','17:00','Arabia Saudita','Uruguay','sa','uy','Miami','Hard Rock Stadium'),
(14,'Grupo H','2026-06-15','11:00','España','Cabo Verde','es','cv','Atlanta','Mercedes-Benz Stadium'),
(15,'Grupo G','2026-06-15','20:00','Irán','Nueva Zelanda','ir','nz','Los Ángeles','SoFi Stadium'),
(16,'Grupo G','2026-06-15','14:00','Bélgica','Egipto','be','eg','Seattle','Lumen Field'),
(17,'Grupo I','2026-06-16','14:00','Francia','Senegal','fr','sn','Nueva York/Nueva Jersey','MetLife Stadium'),
(18,'Grupo I','2026-06-16','17:00','Irak','Noruega','iq','no','Boston','Gillette Stadium'),
(19,'Grupo J','2026-06-16','20:00','Argentina','Argelia','ar','dz','Kansas City','Arrowhead Stadium'),
(20,'Grupo J','2026-06-16','23:00','Austria','Jordania','at','jo','San Francisco','Levi''s Stadium'),
(21,'Grupo L','2026-06-17','18:00','Ghana','Panamá','gh','pa','Toronto','Toronto Stadium'),
(22,'Grupo L','2026-06-17','15:00','Inglaterra','Croacia','gb-eng','hr','Dallas','AT&T Stadium'),
(23,'Grupo K','2026-06-17','12:00','Portugal','RD Congo','pt','cd','Houston','NRG Stadium'),
(24,'Grupo K','2026-06-17','21:00','Uzbekistán','Colombia','uz','co','Ciudad de México','Estadio Azteca'),
(25,'Grupo A','2026-06-18','11:00','República Checa','Sudáfrica','cz','za','Atlanta','Mercedes-Benz Stadium'),
(26,'Grupo B','2026-06-18','14:00','Suiza','Bosnia y Herzegovina','ch','ba','Los Ángeles','SoFi Stadium'),
(27,'Grupo B','2026-06-18','17:00','Canadá','Catar','ca','qa','Vancouver','BC Place'),
(28,'Grupo A','2026-06-18','20:00','México','Corea del Sur','mx','kr','Guadalajara','Estadio Akron'),
(29,'Grupo C','2026-06-19','19:30','Brasil','Haití','br','ht','Filadelfia','Lincoln Financial Field'),
(30,'Grupo C','2026-06-19','17:00','Escocia','Marruecos','gb-sct','ma','Boston','Gillette Stadium'),
(31,'Grupo D','2026-06-19','22:00','Turquía','Paraguay','tr','py','San Francisco','Levi''s Stadium'),
(32,'Grupo D','2026-06-19','14:00','Estados Unidos','Australia','us','au','Seattle','Lumen Field'),
(33,'Grupo E','2026-06-20','15:00','Alemania','Costa de Marfil','de','ci','Toronto','BMO Field'),
(34,'Grupo E','2026-06-20','19:00','Ecuador','Curazao','ec','cw','Kansas City','Arrowhead Stadium'),
(35,'Grupo F','2026-06-20','12:00','Países Bajos','Suecia','nl','se','Houston','NRG Stadium'),
(36,'Grupo F','2026-06-20','23:00','Túnez','Japón','tn','jp','Monterrey','Estadio BBVA'),
(37,'Grupo H','2026-06-21','17:00','Uruguay','Cabo Verde','uy','cv','Miami','Hard Rock Stadium'),
(38,'Grupo H','2026-06-21','11:00','España','Arabia Saudita','es','sa','Atlanta','Mercedes-Benz Stadium'),
(39,'Grupo G','2026-06-21','14:00','Bélgica','Irán','be','ir','Los Ángeles','SoFi Stadium'),
(40,'Grupo G','2026-06-21','20:00','Nueva Zelanda','Egipto','nz','eg','Vancouver','BC Place'),
(41,'Grupo I','2026-06-22','19:00','Noruega','Senegal','no','sn','Nueva York/Nueva Jersey','MetLife Stadium'),
(42,'Grupo I','2026-06-22','16:00','Francia','Irak','fr','iq','Filadelfia','Lincoln Financial Field'),
(43,'Grupo J','2026-06-22','12:00','Argentina','Austria','ar','at','Dallas','AT&T Stadium'),
(44,'Grupo J','2026-06-22','22:00','Jordania','Argelia','jo','dz','San Francisco','Levi''s Stadium'),
(45,'Grupo L','2026-06-23','15:00','Inglaterra','Ghana','gb-eng','gh','Boston','Gillette Stadium'),
(46,'Grupo L','2026-06-23','18:00','Panamá','Croacia','pa','hr','Toronto','Toronto Stadium'),
(47,'Grupo K','2026-06-23','12:00','Portugal','Uzbekistán','pt','uz','Houston','NRG Stadium'),
(48,'Grupo K','2026-06-23','21:00','Colombia','RD Congo','co','cd','Guadalajara','Estadio Akron'),
(49,'Grupo C','2026-06-24','17:00','Escocia','Brasil','gb-sct','br','Miami','Hard Rock Stadium'),
(50,'Grupo C','2026-06-24','17:00','Marruecos','Haití','ma','ht','Atlanta','Mercedes-Benz Stadium'),
(51,'Grupo B','2026-06-24','14:00','Suiza','Canadá','ch','ca','Vancouver','BC Place'),
(52,'Grupo B','2026-06-24','14:00','Bosnia y Herzegovina','Catar','ba','qa','Seattle','Lumen Field'),
(53,'Grupo A','2026-06-24','20:00','República Checa','México','cz','mx','Ciudad de México','Estadio Azteca'),
(54,'Grupo A','2026-06-24','20:00','Sudáfrica','Corea del Sur','za','kr','Monterrey','Estadio BBVA'),
(55,'Grupo E','2026-06-25','15:00','Curazao','Costa de Marfil','cw','ci','Filadelfia','Lincoln Financial Field'),
(56,'Grupo E','2026-06-25','15:00','Ecuador','Alemania','ec','de','Nueva York/Nueva Jersey','MetLife Stadium'),
(57,'Grupo F','2026-06-25','18:00','Japón','Suecia','jp','se','Dallas','AT&T Stadium'),
(58,'Grupo F','2026-06-25','18:00','Túnez','Países Bajos','tn','nl','Kansas City','Arrowhead Stadium'),
(59,'Grupo D','2026-06-25','21:00','Turquía','Estados Unidos','tr','us','Los Ángeles','SoFi Stadium'),
(60,'Grupo D','2026-06-25','21:00','Paraguay','Australia','py','au','San Francisco','Levi''s Stadium'),
(61,'Grupo I','2026-06-26','14:00','Noruega','Francia','no','fr','Boston','Gillette Stadium'),
(62,'Grupo I','2026-06-26','14:00','Senegal','Irak','sn','iq','Toronto','BMO Field'),
(63,'Grupo G','2026-06-26','22:00','Egipto','Irán','eg','ir','Seattle','Lumen Field'),
(64,'Grupo G','2026-06-26','22:00','Nueva Zelanda','Bélgica','nz','be','Vancouver','BC Place'),
(65,'Grupo H','2026-06-26','19:00','Cabo Verde','Arabia Saudita','cv','sa','Houston','NRG Stadium'),
(66,'Grupo H','2026-06-26','19:00','Uruguay','España','uy','es','Guadalajara','Estadio Akron'),
(67,'Grupo L','2026-06-27','16:00','Panamá','Inglaterra','pa','gb-eng','Nueva York/Nueva Jersey','MetLife Stadium'),
(68,'Grupo L','2026-06-27','16:00','Croacia','Ghana','hr','gh','Filadelfia','Lincoln Financial Field'),
(69,'Grupo J','2026-06-27','21:00','Argelia','Austria','dz','at','Kansas City','Arrowhead Stadium'),
(70,'Grupo J','2026-06-27','21:00','Jordania','Argentina','jo','ar','Dallas','AT&T Stadium'),
(71,'Grupo K','2026-06-27','18:30','Colombia','Portugal','co','pt','Miami','Hard Rock Stadium'),
(72,'Grupo K','2026-06-27','18:30','RD Congo','Uzbekistán','cd','uz','Atlanta','Mercedes-Benz Stadium'),
(73,'Dieciseisavos','2026-06-28','14:00','2A','2B',NULL,NULL,'Los Ángeles','SoFi Stadium'),
(74,'Dieciseisavos','2026-06-29','15:30','1E','Mejor 3° (A/B/C/D/F)',NULL,NULL,'Boston','Gillette Stadium'),
(75,'Dieciseisavos','2026-06-29','20:00','1F','2C',NULL,NULL,'Monterrey','Estadio BBVA'),
(76,'Dieciseisavos','2026-06-29','12:00','1C','2F',NULL,NULL,'Houston','NRG Stadium'),
(77,'Dieciseisavos','2026-06-30','16:00','1I','Mejor 3° (C/D/F/G/H)',NULL,NULL,'Nueva York/Nueva Jersey','MetLife Stadium'),
(78,'Dieciseisavos','2026-06-30','12:00','2E','2I',NULL,NULL,'Dallas','AT&T Stadium'),
(79,'Dieciseisavos','2026-06-30','20:00','1A','Mejor 3° (C/E/F/H/I)',NULL,NULL,'Ciudad de México','Estadio Azteca'),
(80,'Dieciseisavos','2026-07-01','11:00','1L','Mejor 3° (E/H/I/J/K)',NULL,NULL,'Atlanta','Mercedes-Benz Stadium'),
(81,'Dieciseisavos','2026-07-01','19:00','1D','Mejor 3° (B/E/F/I/J)',NULL,NULL,'San Francisco','Levi''s Stadium'),
(82,'Dieciseisavos','2026-07-01','15:00','1G','Mejor 3° (A/E/H/I/J)',NULL,NULL,'Seattle','Lumen Field'),
(83,'Dieciseisavos','2026-07-02','18:00','2K','2L',NULL,NULL,'Toronto','BMO Field'),
(84,'Dieciseisavos','2026-07-02','14:00','1H','2J',NULL,NULL,'Los Ángeles','SoFi Stadium'),
(85,'Dieciseisavos','2026-07-02','22:00','1B','Mejor 3° (E/F/G/I/J)',NULL,NULL,'Vancouver','BC Place'),
(86,'Dieciseisavos','2026-07-03','17:00','1J','2H',NULL,NULL,'Miami','Hard Rock Stadium'),
(87,'Dieciseisavos','2026-07-03','20:30','1K','Mejor 3° (D/E/I/J/L)',NULL,NULL,'Kansas City','Arrowhead Stadium'),
(88,'Dieciseisavos','2026-07-03','13:00','2D','2G',NULL,NULL,'Dallas','AT&T Stadium'),
(89,'Octavos','2026-07-04','16:00','Ganador P74','Ganador P77',NULL,NULL,'Filadelfia','Lincoln Financial Field'),
(90,'Octavos','2026-07-04','12:00','Ganador P73','Ganador P75',NULL,NULL,'Houston','NRG Stadium'),
(91,'Octavos','2026-07-05','15:00','Ganador P76','Ganador P78',NULL,NULL,'Nueva York/Nueva Jersey','MetLife Stadium'),
(92,'Octavos','2026-07-05','19:00','Ganador P79','Ganador P80',NULL,NULL,'Ciudad de México','Estadio Azteca'),
(93,'Octavos','2026-07-06','14:00','Ganador P83','Ganador P84',NULL,NULL,'Dallas','AT&T Stadium'),
(94,'Octavos','2026-07-06','19:00','Ganador P81','Ganador P82',NULL,NULL,'Seattle','Lumen Field'),
(95,'Octavos','2026-07-07','11:00','Ganador P86','Ganador P88',NULL,NULL,'Atlanta','Mercedes-Benz Stadium'),
(96,'Octavos','2026-07-07','15:00','Ganador P85','Ganador P87',NULL,NULL,'Vancouver','BC Place'),
(97,'Cuartos','2026-07-09','15:00','Ganador P89','Ganador P90',NULL,NULL,'Boston','Gillette Stadium'),
(98,'Cuartos','2026-07-10','14:00','Ganador P93','Ganador P94',NULL,NULL,'Los Ángeles','SoFi Stadium'),
(99,'Cuartos','2026-07-11','16:00','Ganador P91','Ganador P92',NULL,NULL,'Miami','Hard Rock Stadium'),
(100,'Cuartos','2026-07-11','20:00','Ganador P95','Ganador P96',NULL,NULL,'Kansas City','Arrowhead Stadium'),
(101,'Semifinal','2026-07-14','14:00','Ganador P97','Ganador P98',NULL,NULL,'Dallas','AT&T Stadium'),
(102,'Semifinal','2026-07-15','14:00','Ganador P99','Ganador P100',NULL,NULL,'Atlanta','Mercedes-Benz Stadium'),
(103,'Tercer puesto','2026-07-18','16:00','Perdedor P101','Perdedor P102',NULL,NULL,'Miami','Hard Rock Stadium'),
(104,'Final','2026-07-19','14:00','Ganador P101','Ganador P102',NULL,NULL,'Nueva York/Nueva Jersey','MetLife Stadium')
ON CONFLICT (id) DO NOTHING;
