require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();

const PORT             = process.env.PORT              || 3000;
const SUPABASE_URL     = process.env.SUPABASE_URL      || '';
const SUPABASE_ANON    = process.env.SUPABASE_ANON_KEY || '';
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY  || '';

// ── Helpers de fecha (hora Colombia UTC-5) ───────────────────────
const colDate    = () => new Date(Date.now() - 5*60*60*1000).toISOString().slice(0,10);   // YYYY-MM-DD
const colDateNum = () => colDate().replace(/-/g,'');                                        // YYYYMMDD
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// ── Mapeo de nombres: inglés → español ───────────────────────────
const TEAM_ES = {
  'Mexico':'México','South Africa':'Sudáfrica','South Korea':'Corea del Sur',
  'Czech Republic':'República Checa','Czechia':'República Checa',
  'Bosnia and Herzegovina':'Bosnia y Herzegovina','Bosnia & Herzegovina':'Bosnia y Herzegovina',
  'United States':'Estados Unidos','United States of America':'Estados Unidos','USA':'Estados Unidos',
  'Haiti':'Haití','Haïti':'Haití',
  'Brazil':'Brasil','Morocco':'Marruecos','Switzerland':'Suiza',
  "Côte d'Ivoire":'Costa de Marfil','Ivory Coast':'Costa de Marfil',
  'Germany':'Alemania','Netherlands':'Países Bajos','Sweden':'Suecia',
  'Saudi Arabia':'Arabia Saudita','Spain':'España','Cape Verde':'Cabo Verde',
  'Iran':'Irán','New Zealand':'Nueva Zelanda','Belgium':'Bélgica',
  'Egypt':'Egipto','France':'Francia','Iraq':'Irak','Norway':'Noruega',
  'Ghana':'Ghana','Panama':'Panamá','England':'Inglaterra','Croatia':'Croacia',
  'DR Congo':'RD Congo','Democratic Republic of Congo':'RD Congo',
  'Uzbekistan':'Uzbekistán','Canada':'Canadá','Japan':'Japón',
  'Turkey':'Turquía','Türkiye':'Turquía','Portugal':'Portugal',
  'Argentina':'Argentina','Uruguay':'Uruguay','Ecuador':'Ecuador',
  'Paraguay':'Paraguay','Colombia':'Colombia','Australia':'Australia',
  'Scotland':'Escocia','Serbia':'Serbia','Austria':'Austria',
  'Jordan':'Jordania','Algeria':'Argelia','Tunisia':'Túnez',
  'Senegal':'Senegal','Nigeria':'Nigeria','Cameroon':'Camerún',
  'Qatar':'Catar','Curacao':'Curazao','Curaçao':'Curazao','Cabo Verde':'Cabo Verde',
  'Peru':'Perú','Chile':'Chile','Bolivia':'Bolivia','Venezuela':'Venezuela',
  'Honduras':'Honduras','Costa Rica':'Costa Rica','Guatemala':'Guatemala','Cuba':'Cuba',
  'South Sudan':'Sudán del Sur','Kenya':'Kenia','Tanzania':'Tanzania',
  'Netherlands':'Países Bajos','Wales':'Gales','Northern Ireland':'Irlanda del Norte',
  'Republic of Ireland':'Irlanda','Slovakia':'Eslovaquia','Slovenia':'Eslovenia',
  'Romania':'Rumanía','Hungary':'Hungría','Denmark':'Dinamarca','Sweden':'Suecia',
  'Finland':'Finlandia','Norway':'Noruega','Iceland':'Islandia',
  'Greece':'Grecia','Poland':'Polonia','Ukraine':'Ucrania',
  'Russia':'Rusia','Belarus':'Bielorrusia','Georgia':'Georgia',
  'Azerbaijan':'Azerbaiyán','Kazakhstan':'Kazajistán',
  'Oman':'Omán','Kuwait':'Kuwait','UAE':'Emiratos Árabes','United Arab Emirates':'Emiratos Árabes',
  'Bahrain':'Baréin','Lebanon':'Líbano','Palestine':'Palestina','Syria':'Siria',
  'China':'China','Thailand':'Tailandia','Vietnam':'Vietnam','Indonesia':'Indonesia',
  'Malaysia':'Malasia','Philippines':'Filipinas','India':'India',
  'Zambia':'Zambia','Zimbabwe':'Zimbabue','Angola':'Angola','Mozambique':'Mozambique',
  'Ethiopia':'Etiopía','Uganda':'Uganda',
  'Trinidad and Tobago':'Trinidad y Tobago','Jamaica':'Jamaica',
  'El Salvador':'El Salvador','Nicaragua':'Nicaragua',
  'Mexico':'México',  // alias por si acaso
};

// ── Supabase REST helper ─────────────────────────────────────────
async function sbRest(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[sbRest] HTTP ${res.status} ${method} ${endpoint} — ${txt.slice(0, 250)}`);
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : [];
  } catch(e) { console.error('[sbRest]', e.message); return null; }
}

async function findPartidoId(localEs, visEs) {
  let data = await sbRest(`/partidos?local=eq.${encodeURIComponent(localEs)}&visitante=eq.${encodeURIComponent(visEs)}&select=id`);
  if (data?.length) return data[0].id;
  data = await sbRest(`/partidos?local=eq.${encodeURIComponent(visEs)}&visitante=eq.${encodeURIComponent(localEs)}&select=id`);
  return data?.[0]?.id ?? null;
}

async function upsertResultado(pid, gl, gv, goleadores, tarjetas = '') {
  if (gl == null || gv == null) return;
  const body = {
    partido_id: pid, goles_local: gl, goles_vis: gv,
    updated_at: new Date().toISOString()
  };
  if (goleadores) body.goleadores = goleadores;
  if (tarjetas)   body.tarjetas   = tarjetas;
  // on_conflict=partido_id: usa la restricción UNIQUE de partido_id (no el PK auto id)
  const r = await sbRest('/resultados?on_conflict=partido_id', 'POST', [body]);
  if (r === null) console.error(`[db] upsert falló: partido=${pid} gol="${goleadores}" tar="${tarjetas}"`);
  scheduleBracketUpdate(); // actualiza nombres de equipos en eliminatorias
  return r;
}

// ── SOURCE 1: ESPN (múltiples slugs + headers de navegador) ──────
const ESPN_SLUGS = ['fifa.world', 'fifa.world.cup'];

async function fetchESPN(dateNum) {
  for (const slug of ESPN_SLUGS) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateNum}&limit=50`;
      const r = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json', 'Referer': 'https://www.espn.com/' }
      });
      if (!r.ok) { console.log(`[espn:${slug}] HTTP ${r.status}`); continue; }
      const { events = [] } = await r.json();
      if (events.length > 0) { console.log(`[espn:${slug}] ${events.length} eventos`); return events; }
      console.log(`[espn:${slug}] 0 eventos`);
    } catch(e) { console.error(`[espn:${slug}]`, e.message); }
  }
  return [];
}

// Obtiene detalles completos (goles/tarjetas) del endpoint summary de ESPN
async function fetchESPNSummary(eventId) {
  for (const slug of ESPN_SLUGS) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${eventId}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json', 'Referer': 'https://www.espn.com/' }
      });
      if (r.ok) { console.log(`[espn-sum] ✓ event ${eventId}`); return r.json(); }
    } catch {}
  }
  return null;
}

// Extrae goles y tarjetas de un array ESPN details/keyEvents/scoringPlays
function parseESPNDetails(details, homeTeamId) {
  const goals = [], cards = [];
  const homeStr = String(homeTeamId || '');
  for (const d of details) {
    const txt = d.type?.text || '';
    const isGoal = d.scoringPlay === true || txt === 'Goal Scored' || d.type?.id === '70' || txt === 'Goal';
    const isCard = txt.includes('Card') || d.yellowCard || d.redCard;
    if (!isGoal && !isCard) continue;

    const n = d.athletesInvolved?.[0]?.displayName
           || d.participants?.[0]?.athlete?.displayName
           || d.participants?.[0]?.displayName
           || '?';
    const rawMin = d.clock?.value != null ? Math.round(d.clock.value / 60) : null;
    const m = rawMin != null ? `${rawMin}'` : (d.clock?.displayValue || '');

    // String comparison para evitar type mismatch (number vs string)
    const rawTeamId = d.team?.id ?? d.athletesInvolved?.[0]?.team?.id ?? '';
    const dTeamStr  = String(rawTeamId);
    const byHome    = (dTeamStr && homeStr) ? dTeamStr === homeStr : null;

    if (isGoal) {
      const isOwn = !!(d.ownGoal);
      const pen   = d.penaltyKick ? ' (pen)' : '';
      const og    = isOwn ? ' (pp)' : '';
      const prefix = byHome !== null ? ((byHome !== isOwn) ? 'L' : 'V') : '';
      goals.push(`${prefix ? prefix+':' : ''}${n}${m ? ' '+m : ''}${pen}${og}`);
    } else {
      const prefix = byHome !== null ? (byHome ? 'L' : 'V') : '';
      const emoji  = txt === 'Red Card' || d.redCard ? '🟥' : txt === 'Yellow-Red Card' ? '🟨🟥' : '🟨';
      cards.push(`${prefix ? prefix+':' : ''}${emoji} ${n}${m ? ' '+m : ''}`);
    }
  }
  return { goals, cards };
}

async function processESPN(events) {
  let updated = 0, hasLive = false;
  for (const ev of events) {
    const comp   = ev.competitions?.[0];
    if (!comp) continue;
    const status = ev.status?.type?.name || '';
    if (status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME') hasLive = true;
    if (!['STATUS_IN_PROGRESS','STATUS_HALFTIME','STATUS_FINAL','STATUS_FULL_TIME'].includes(status)) continue;

    const home = comp.competitors?.find(c => c.homeAway === 'home');
    const away = comp.competitors?.find(c => c.homeAway === 'away');
    if (!home || !away) continue;

    const gl = parseInt(home.score ?? '0');
    const gv = parseInt(away.score ?? '0');
    const homeEs = TEAM_ES[home.team?.displayName] || TEAM_ES[home.team?.name] || home.team?.displayName || '';
    const awayEs = TEAM_ES[away.team?.displayName] || TEAM_ES[away.team?.name] || away.team?.displayName || '';
    if (!homeEs || !awayEs) {
      console.log('[espn] sin mapeo:', home.team?.displayName, 'vs', away.team?.displayName);
      continue;
    }
    const pid = await findPartidoId(homeEs, awayEs);
    if (!pid) { console.log('[espn] no en DB:', homeEs, 'vs', awayEs); continue; }

    const homeTeamId = home.team?.id;

    // Intentar extraer goles/tarjetas del scoreboard (comp.details)
    let { goals, cards } = parseESPNDetails(comp.details || [], homeTeamId);

    // Si hay goles en el marcador pero detalles vacíos → pedir summary (siempre más completo)
    if (goals.length === 0 && (gl + gv) > 0) {
      const sum = await fetchESPNSummary(ev.id);
      if (sum) {
        // ESPN summary: puede venir en competitions[0].details, scoringPlays, keyEvents o plays
        const sumComp    = sum.header?.competitions?.[0] || sum.competitions?.[0];
        const candidates = [
          ...(sumComp?.details || []),
          ...(sum.scoringPlays || []),
          ...(sum.keyEvents    || []),
          ...(sum.plays        || []),
        ];
        // Deduplicar por (nombre + minuto) para no doblar si aparece en varias arrays
        const seen = new Set();
        const uniq = candidates.filter(d => {
          const k = `${d.athletesInvolved?.[0]?.displayName||''}${d.clock?.value||''}${d.type?.id||''}`;
          if (seen.has(k)) return false; seen.add(k); return true;
        });
        const parsed = parseESPNDetails(uniq, homeTeamId);
        if (parsed.goals.length > 0) goals = parsed.goals;
        if (parsed.cards.length > 0) cards = parsed.cards;
      }
    }

    await upsertResultado(pid, gl, gv, goals.join(' · '), cards.join(' · '));
    console.log(`[espn] ${homeEs} ${gl}–${gv} ${awayEs} | goles:${goals.length} | ${goals.join(', ') || 'sin detalle'}`);
    updated++;
  }
  return { updated, hasLive };
}

// ── SOURCE 2: SofaScore (sin API key, muy confiable) ─────────────
// scoreCache evita re-pedir goleadores si el marcador no cambió
const scoreCache = new Map();

async function fetchSofaScore(date) {
  try {
    const url = `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${date}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/json',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com'
      }
    });
    if (!r.ok) { console.error('[sofa] HTTP', r.status); return []; }
    const { events = [] } = await r.json();
    // Filtra solo partidos del Mundial
    const wc = events.filter(ev => {
      const t = (ev.tournament?.uniqueTournament?.name || ev.tournament?.name || '').toLowerCase();
      return t.includes('world cup') || t.includes('mundial') || t.includes('copa del mundo');
    });
    console.log(`[sofa] ${events.length} eventos totales, ${wc.length} Mundial`);
    return wc;
  } catch(e) { console.error('[sofa]', e.message); return []; }
}

async function getSofaIncidents(eventId) {
  try {
    const url = `https://api.sofascore.com/api/v1/event/${eventId}/incidents`;
    const r = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, 'Referer': 'https://www.sofascore.com/' }
    });
    if (!r.ok) return { goals: '', cards: '' };
    const { incidents = [] } = await r.json();

    const goals = incidents
      .filter(i => i.incidentType === 'goal' || i.incidentType === 'penalty')
      .map(i => {
        const n   = i.player?.name || i.player?.shortName || '?';
        const t   = i.time ? `${i.time}'` : (i.addedTime ? `+${i.addedTime}'` : '');
        const pen = i.incidentType === 'penalty' ? ' (pen)' : '';
        const og  = i.isOwnGoal ? ' (pp)' : '';
        // isHome: true = equipo local hizo el incidente
        // gol en contra: el gol va al equipo contrario
        const isHome = i.isHome !== false;
        const prefix = i.isHome !== undefined
          ? ((isHome !== !!i.isOwnGoal) ? 'L' : 'V')
          : '';
        return `${prefix ? prefix+':' : ''}${n}${t?' '+t:''}${pen}${og}`;
      })
      .join(' · ');

    const cards = incidents
      .filter(i => i.incidentType === 'card')
      .map(i => {
        const n      = i.player?.name || i.player?.shortName || '?';
        const t      = i.time ? `${i.time}'` : '';
        const emoji  = i.incidentClass === 'red' ? '🟥'
                     : i.incidentClass === 'yellowRed' ? '🟨🟥'
                     : '🟨';
        const isHome = i.isHome !== false;
        const prefix = i.isHome !== undefined ? (isHome ? 'L' : 'V') : '';
        return `${prefix ? prefix+':' : ''}${emoji} ${n}${t?' '+t:''}`;
      })
      .join(' · ');

    return { goals, cards };
  } catch { return { goals: '', cards: '' }; }
}

async function processSofa(events) {
  let updated = 0, hasLive = false;
  for (const ev of events) {
    const status = ev.status?.type;
    if (['inprogress','halftime','pause'].includes(status)) hasLive = true;
    if (!['inprogress','halftime','pause','finished'].includes(status)) continue;

    const gl = ev.homeScore?.current ?? ev.homeScore?.display ?? 0;
    const gv = ev.awayScore?.current ?? ev.awayScore?.display ?? 0;

    const homeEs = TEAM_ES[ev.homeTeam?.name] || TEAM_ES[ev.homeTeam?.shortName] || ev.homeTeam?.name || '';
    const awayEs = TEAM_ES[ev.awayTeam?.name] || TEAM_ES[ev.awayTeam?.shortName] || ev.awayTeam?.name || '';
    if (!homeEs || !awayEs) {
      console.log('[sofa] sin mapeo:', ev.homeTeam?.name, 'vs', ev.awayTeam?.name);
      continue;
    }
    const pid = await findPartidoId(homeEs, awayEs);
    if (!pid) { console.log('[sofa] no en DB:', homeEs, 'vs', awayEs); continue; }

    // Cache del marcador para evitar re-pedir incidents en cada ciclo.
    // Se re-fetcha si: (a) el marcador cambió, o (b) los goleadores en DB están vacíos
    // (puede ocurrir si ESPN pisó los datos con string vacío antes del fix)
    const key = `${gl}-${gv}`;
    let gol = '', tar = '';
    const cached = scoreCache.get(pid);
    let dbRow = null;
    if (cached?.key === key && cached?.hasGoals) {
      // Marcador igual y ya tenemos goleadores en cache → leer de DB
      dbRow = await sbRest(`/resultados?partido_id=eq.${pid}&select=goleadores,tarjetas`);
      gol = dbRow?.[0]?.goleadores || '';
      tar = dbRow?.[0]?.tarjetas   || '';
      // Si DB está vacío (ESPN limpió los datos), re-fetch igualmente
      if (!gol && !tar) {
        const inc = await getSofaIncidents(ev.id);
        gol = inc.goals; tar = inc.cards;
      }
    } else {
      // Marcador nuevo o sin cache → siempre pedir incidents
      const inc = await getSofaIncidents(ev.id);
      gol = inc.goals; tar = inc.cards;
      scoreCache.set(pid, { key, hasGoals: !!(gol || tar) });
    }

    await upsertResultado(pid, gl, gv, gol, tar);
    console.log(`[sofa] ✓ ${homeEs} ${gl}–${gv} ${awayEs}`);
    updated++;
  }
  return { updated, hasLive };
}

// ── SOURCE 3: football-data.org (si hay FOOTBALL_API_KEY) ────────
async function pollFootballData() {
  try {
    const today = colDate();
    const res = await fetch(
      `https://api.football-data.org/v4/competitions/WC/matches?dateFrom=${today}&dateTo=${today}`,
      { headers: { 'X-Auth-Token': FOOTBALL_API_KEY } }
    );
    if (!res.ok) { console.error('[fd]', res.status); return; }
    const { matches = [] } = await res.json();
    for (const m of matches) {
      if (!['IN_PLAY','PAUSED','FINISHED'].includes(m.status)) continue;
      const gl = m.score.fullTime.home ?? m.score.regularTime?.home;
      const gv = m.score.fullTime.away ?? m.score.regularTime?.away;
      if (gl == null || gv == null) continue;
      const localEs = TEAM_ES[m.homeTeam.name] || m.homeTeam.name;
      const visEs   = TEAM_ES[m.awayTeam.name] || m.awayTeam.name;
      const pid     = await findPartidoId(localEs, visEs);
      if (!pid) continue;
      const goleadores = (m.goals || []).map(g => {
        const tipo = g.type === 'PENALTY' ? ' (pen)' : g.type === 'OWN_GOAL' ? ' (pp)' : '';
        return `${g.scorer?.name || '?'} ${g.minute}'${tipo}`;
      }).join(' · ');
      await upsertResultado(pid, gl, gv, goleadores);
      console.log(`[fd] ✓ ${localEs} ${gl}–${gv} ${visEs}`);
    }
  } catch(e) { console.error('[fd]', e.message); }
}

// ── MASTER POLL: ESPN + SofaScore en paralelo ─────────────────────
let liveActive = false;

async function pollAll() {
  const date = colDate(), dateNum = colDateNum();
  // Las dos fuentes se consultan en paralelo
  const [espnEvents, sofaEvents] = await Promise.all([
    fetchESPN(dateNum),
    fetchSofaScore(date)
  ]);
  const er = espnEvents.length ? await processESPN(espnEvents) : { updated:0, hasLive:false };
  const sr = sofaEvents.length ? await processSofa(sofaEvents)  : { updated:0, hasLive:false };
  liveActive = er.hasLive || sr.hasLive;
  const tot = er.updated + sr.updated;
  if (tot)  console.log(`[poll] ${tot} actualizado(s) — espn:${er.updated} sofa:${sr.updated}`);
  else      console.log(`[poll] sin cambios (${date})`);
}

// ── BRACKET ADVANCEMENT ──────────────────────────────────────────
// Detectar si un nombre es placeholder (aún sin equipo real asignado)
const isPlaceholder = n => !n || /^[12][A-L]$/.test(n) || /^Mejor 3°/.test(n) || /^Ganador P/.test(n) || /^Perdedor P/.test(n);

// Configuración de dieciseisavos (id → local slot, vis slot o null para "Mejor 3°")
const BRACKET_D16 = [
  {id:73,l:'2A',  v:'2B'  },
  {id:74,l:'1E',  v:null  }, // vis = Mejor 3° (A/B/C/D/F)
  {id:75,l:'1F',  v:'2C'  },
  {id:76,l:'1C',  v:'2F'  },
  {id:77,l:'1I',  v:null  }, // vis = Mejor 3° (C/D/F/G/H)
  {id:78,l:'2E',  v:'2I'  },
  {id:79,l:'1A',  v:null  }, // vis = Mejor 3° (C/E/F/H/I)
  {id:80,l:'1L',  v:null  }, // vis = Mejor 3° (E/H/I/J/K)
  {id:81,l:'1D',  v:null  }, // vis = Mejor 3° (B/E/F/I/J)
  {id:82,l:'1G',  v:null  }, // vis = Mejor 3° (A/E/H/I/J)
  {id:83,l:'2K',  v:'2L'  },
  {id:84,l:'1H',  v:'2J'  },
  {id:85,l:'1B',  v:null  }, // vis = Mejor 3° (E/F/G/I/J)
  {id:86,l:'1J',  v:'2H'  },
  {id:87,l:'1K',  v:null  }, // vis = Mejor 3° (D/E/I/J/L)
  {id:88,l:'2D',  v:'2G'  },
];

// Grupos permitidos para cada slot de Mejor 3°
const SLOTS_3RD = [
  [74, ['D']],  // Paraguay (3° Grupo D) → Alemania vs Paraguay
  [77, ['F']],  // Suecia   (3° Grupo F) → Francia vs Suecia
  [79, ['E']],  // Ecuador  (3° Grupo E) → México vs Ecuador
  [80, ['K']],  // RD Congo (3° Grupo K) → Inglaterra vs RD Congo
  [81, ['B']],  // Bosnia   (3° Grupo B) → EE.UU. vs Bosnia y Herzegovina
  [82, ['I']],  // Senegal  (3° Grupo I) → Bélgica vs Senegal
  [85, ['J']],  // Argelia  (3° Grupo J) → Suiza vs Argelia
  [87, ['L']],  // Ghana    (3° Grupo L) → Colombia vs Ghana
];

// Mapa completo de rondas eliminatorias: [matchId, [localFromId, 'W'|'L'], [visFromId, 'W'|'L']]
const BRACKET_KNOCKOUT = [
  [89, [74,'W'],[77,'W']], [90, [73,'W'],[75,'W']],
  [91, [76,'W'],[78,'W']], [92, [79,'W'],[80,'W']],
  [93, [83,'W'],[84,'W']], [94, [81,'W'],[82,'W']],
  [95, [86,'W'],[88,'W']], [96, [85,'W'],[87,'W']],
  [97, [89,'W'],[90,'W']], [98, [93,'W'],[94,'W']],
  [99, [91,'W'],[92,'W']], [100,[95,'W'],[96,'W']],
  [101,[97,'W'],[98,'W']], [102,[99,'W'],[100,'W']],
  [103,[101,'L'],[102,'L']], // 3er puesto
  [104,[101,'W'],[102,'W']], // Final
];

let _bracketTimer = null;
function scheduleBracketUpdate() {
  if (_bracketTimer) clearTimeout(_bracketTimer);
  _bracketTimer = setTimeout(computeAndUpdateBracket, 4000);
}

async function computeAndUpdateBracket() {
  try {
    const [allPartidos, allResultados] = await Promise.all([
      sbRest('/partidos?select=id,etapa,local,visitante,codigo_local,codigo_vis&order=id'),
      sbRest('/resultados?select=partido_id,goles_local,goles_vis'),
    ]);
    if (!allPartidos || !allResultados) return;

    const resMap = {};
    for (const r of allResultados) resMap[r.partido_id] = r;

    // ── 1. Clasificaciones por grupo ──────────────────────────────
    const groups = {};
    for (const m of allPartidos.filter(m => m.id >= 1 && m.id <= 72)) {
      const letter = m.etapa.replace('Grupo ', '');
      if (!groups[letter]) groups[letter] = {};
      for (const [name, code] of [[m.local, m.codigo_local], [m.visitante, m.codigo_vis]]) {
        if (!groups[letter][name]) groups[letter][name] = { nombre: name, codigo: code || '', pts: 0, gf: 0, ga: 0, gd: 0, played: 0 };
      }
      const res = resMap[m.id];
      if (res) {
        const l = groups[letter][m.local], v = groups[letter][m.visitante];
        const gl = res.goles_local, gv = res.goles_vis;
        l.played++; v.played++;
        l.gf += gl; l.ga += gv; l.gd = l.gf - l.ga;
        v.gf += gv; v.ga += gl; v.gd = v.gf - v.ga;
        if (gl > gv) l.pts += 3; else if (gl < gv) v.pts += 3; else { l.pts++; v.pts++; }
      }
    }
    const sortedGroups = {};
    for (const [g, teams] of Object.entries(groups)) {
      sortedGroups[g] = Object.values(teams).sort((a, b) =>
        b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.nombre.localeCompare(b.nombre)
      );
    }

    // ── 2. Asignación de Mejores 3° ────────────────────────────────
    const all3rds = Object.entries(sortedGroups)
      .filter(([, t]) => t.length >= 3)
      .map(([g, t]) => ({ group: g, team: t[2] }))
      .sort((a, b) => b.team.pts - a.team.pts || b.team.gd - a.team.gd || b.team.gf - a.team.gf || a.group.localeCompare(b.group));

    const assigned3rd = {}, used3rd = new Set();
    for (const [mId, allowed] of SLOTS_3RD) {
      const c = all3rds.find(x => allowed.includes(x.group) && !used3rd.has(x.group));
      if (c) { assigned3rd[mId] = c.team; used3rd.add(c.group); }
    }

    // ── 3. Resolver dieciseisavos ─────────────────────────────────
    const byId = {};
    for (const p of allPartidos) byId[p.id] = p;

    const getGroup = slot => {
      const m = slot && slot.match(/^([12])([A-L])$/);
      return m ? (sortedGroups[m[2]]?.[parseInt(m[1]) - 1] || null) : null;
    };

    const updates = [];

    for (const entry of BRACKET_D16) {
      const p = byId[entry.id]; if (!p) continue;
      const localTeam = getGroup(entry.l);
      const visTeam   = entry.v ? getGroup(entry.v) : assigned3rd[entry.id];

      const nl  = localTeam ? localTeam.nombre : p.local;
      const nv  = visTeam   ? visTeam.nombre   : p.visitante;
      const ncl = localTeam ? (localTeam.codigo || null) : p.codigo_local;
      const ncv = visTeam   ? (visTeam.codigo   || null) : p.codigo_vis;

      if ((nl !== p.local || nv !== p.visitante) && !isPlaceholder(nl) || !isPlaceholder(nv)) {
        if (nl !== p.local || nv !== p.visitante || ncl !== p.codigo_local || ncv !== p.codigo_vis) {
          updates.push({ id: entry.id, local: nl, visitante: nv, codigo_local: ncl, codigo_vis: ncv });
          p.local = nl; p.visitante = nv; p.codigo_local = ncl; p.codigo_vis = ncv;
        }
      }
    }

    // ── 4. Resolver octavos → final desde resultados ──────────────
    const getWL = (fromId, wl) => {
      const partido = byId[fromId]; const res = resMap[fromId];
      if (!partido || !res) return null;
      if (res.goles_local === res.goles_vis) return null; // empate: no resolver (necesita penales)
      const localGana = res.goles_local > res.goles_vis;
      const takeLocal = wl === 'W' ? localGana : !localGana;
      return { nombre: takeLocal ? partido.local : partido.visitante, codigo: takeLocal ? partido.codigo_local : partido.codigo_vis };
    };

    for (const [matchId, [lFrom, lWL], [vFrom, vWL]] of BRACKET_KNOCKOUT) {
      const p = byId[matchId]; if (!p) continue;
      const localTeam = getWL(lFrom, lWL);
      const visTeam   = getWL(vFrom, vWL);
      if (!localTeam && !visTeam) continue;

      const nl  = localTeam ? localTeam.nombre  : p.local;
      const nv  = visTeam   ? visTeam.nombre    : p.visitante;
      const ncl = localTeam ? (localTeam.codigo || null) : p.codigo_local;
      const ncv = visTeam   ? (visTeam.codigo   || null) : p.codigo_vis;

      if (nl !== p.local || nv !== p.visitante || ncl !== p.codigo_local || ncv !== p.codigo_vis) {
        updates.push({ id: matchId, local: nl, visitante: nv, codigo_local: ncl, codigo_vis: ncv });
        p.local = nl; p.visitante = nv; p.codigo_local = ncl; p.codigo_vis = ncv;
      }
    }

    // ── 5. Aplicar updates a Supabase ─────────────────────────────
    if (updates.length === 0) { console.log('[bracket] Sin cambios en eliminatorias'); return; }

    for (const u of updates) {
      await sbRest(`/partidos?id=eq.${u.id}`, 'PATCH', {
        local: u.local, visitante: u.visitante,
        codigo_local: u.codigo_local, codigo_vis: u.codigo_vis,
      });
    }
    console.log(`[bracket] ${updates.length} partido(s) actualizados:`, updates.map(u => `#${u.id} ${u.local} vs ${u.visitante}`).join(' | '));
  } catch (e) {
    console.error('[bracket]', e.message);
  }
}

// ── API routes ────────────────────────────────────────────────────
app.get('/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.SUPABASE_URL="${SUPABASE_URL}";window.SUPABASE_ANON_KEY="${SUPABASE_ANON}";`);
});

// Fuerza sync manual (botón en admin)
app.get('/api/sync-espn', async (req, res) => {
  try {
    const [espnEvents, sofaEvents] = await Promise.all([fetchESPN(colDateNum()), fetchSofaScore(colDate())]);
    const er = espnEvents.length ? await processESPN(espnEvents) : { updated:0 };
    const sr = sofaEvents.length ? await processSofa(sofaEvents)  : { updated:0 };
    // También recomputa el bracket tras sync manual
    scheduleBracketUpdate();
    res.json({ updated: er.updated + sr.updated, espnEvents: espnEvents.length, sofaEvents: sofaEvents.length });
  } catch(e) { res.json({ error: e.message }); }
});

// Barrido histórico: rellena goleadores vacíos usando ESPN summary
async function resyncMissingGoals() {
  const allRes = await sbRest('/resultados?goles_local=not.is.null&select=partido_id,goles_local,goles_vis,goleadores,tarjetas');
  // Solo re-syncar partidos con goles (>0) y que no tengan goleadores todavía
  const empty = (allRes || []).filter(r => !r.goleadores && (r.goles_local + r.goles_vis) > 0);
  if (!empty.length) { console.log('[resync] Sin vacíos — todo OK.'); return { fixed: 0, total: 0 }; }

  const ids = empty.map(r => `"${r.partido_id}"`).join(',');
  const partidos = await sbRest(`/partidos?id=in.(${ids})&select=id,local,visitante,fecha`);
  if (!partidos?.length) return { fixed: 0, total: empty.length };

  // Caché de eventos ESPN por fecha para no repetir llamadas
  const espnByDate = {};
  async function getESPNForDate(fecha) {
    if (espnByDate[fecha]) return espnByDate[fecha];
    const evs = await fetchESPN(fecha.replace(/-/g, ''));
    espnByDate[fecha] = evs;
    return evs;
  }

  // Busca el evento ESPN en fecha exacta y ±1 día (partidos que cruzan medianoche UTC)
  async function findESPNEvent(p) {
    const base = new Date(p.fecha + 'T12:00:00Z');
    const dates = [
      p.fecha,
      new Date(base.getTime() - 86400000).toISOString().slice(0,10),
      new Date(base.getTime() + 86400000).toISOString().slice(0,10),
    ];
    for (const d of dates) {
      const evs = await getESPNForDate(d);
      const ev = evs.find(e => {
        const comp = e.competitions?.[0];
        const h = comp?.competitors?.find(c => c.homeAway === 'home');
        const a = comp?.competitors?.find(c => c.homeAway === 'away');
        if (!h || !a) return false;
        const hEs = TEAM_ES[h.team?.displayName] || TEAM_ES[h.team?.name] || h.team?.displayName || '';
        const aEs = TEAM_ES[a.team?.displayName] || TEAM_ES[a.team?.name] || a.team?.displayName || '';
        return (hEs === p.local && aEs === p.visitante) || (hEs === p.visitante && aEs === p.local);
      });
      if (ev) return ev;
    }
    return null;
  }

  let fixed = 0, skipped = 0;
  for (const p of partidos) {
    const ev = await findESPNEvent(p);
    if (!ev) { skipped++; console.log(`[resync] no encontrado en ESPN: ${p.local} vs ${p.visitante}`); continue; }

    const comp = ev.competitions?.[0];
    const homeComp = comp?.competitors?.find(c => c.homeAway === 'home');
    const homeTeamId = homeComp?.team?.id;
    const row = empty.find(r => r.partido_id === p.id);

    // 1. comp.details del scoreboard
    let { goals, cards } = parseESPNDetails(comp?.details || [], homeTeamId);

    // 2. Siempre pedir summary para partidos terminados (más completo que scoreboard)
    const sum = await fetchESPNSummary(ev.id);
    if (sum) {
      const sumComp = sum.header?.competitions?.[0] || sum.competitions?.[0];
      const candidates = [
        ...(sumComp?.details || []),
        ...(sum.scoringPlays || []),
        ...(sum.keyEvents    || []),
        ...(sum.plays        || []),
      ];
      const seen = new Set();
      const uniq = candidates.filter(d => {
        const k = `${d.athletesInvolved?.[0]?.displayName||''}${d.clock?.value||''}${d.type?.id||''}`;
        if (seen.has(k)) return false; seen.add(k); return true;
      });
      const parsed = parseESPNDetails(uniq, homeTeamId);
      if (parsed.goals.length > goals.length) goals = parsed.goals;
      if (parsed.cards.length > cards.length) cards = parsed.cards;
    }
    await new Promise(r => setTimeout(r, 300));

    if (goals.length > 0) {
      await upsertResultado(p.id, row.goles_local, row.goles_vis, goals.join(' · '), cards.join(' · '));
      scoreCache.delete(p.id);
      fixed++;
      console.log(`[resync] ✓ ${p.local} vs ${p.visitante}: ${goals.join(', ')}`);
    } else {
      skipped++;
      console.log(`[resync] ESPN sin detalles: ${p.local} vs ${p.visitante} (${p.fecha})`);
    }
  }
  console.log(`[resync] ${fixed} rellenos · ${skipped} sin datos · ${empty.length} total`);
  return { fixed, skipped, total: empty.length };
}

app.get('/api/resync-all', async (req, res) => {
  try { res.json({ ok: true, ...(await resyncMissingGoals()) }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

// Diagnóstico rápido: qué tiene ESPN right now para goles y tarjetas
app.get('/api/debug-goals', async (req, res) => {
  try {
    const events = await fetchESPN(colDateNum());
    const out = [];
    for (const ev of events) {
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find(c => c.homeAway === 'home');
      const away = comp?.competitors?.find(c => c.homeAway === 'away');
      const homeTeamId = home?.team?.id;
      const { goals: goalsBoard, cards: cardsBoard } = parseESPNDetails(comp?.details || [], homeTeamId);
      const sum = await fetchESPNSummary(ev.id);
      const sumDetails = sum ? (sum.keyEvents || sum.scoringPlays || sum.plays || []) : [];
      const { goals: goalsSum, cards: cardsSum } = parseESPNDetails(sumDetails, homeTeamId);
      out.push({
        match: `${home?.team?.displayName} ${home?.score ?? '?'}-${away?.score ?? '?'} ${away?.team?.displayName}`,
        status: ev.status?.type?.name,
        detailsCount: (comp?.details || []).length,
        goalsFromBoard: goalsBoard,
        cardsFromBoard: cardsBoard,
        goalsFromSummary: goalsSum,
        cardsFromSummary: cardsSum,
      });
    }
    res.json({ date: colDate(), matches: out });
  } catch(e) { res.json({ error: e.message }); }
});

// Marcadores actuales (polling de clientes cada 30s)
app.get('/api/live', async (req, res) => {
  const [resultados, knockoutPartidos] = await Promise.all([
    sbRest('/resultados?select=partido_id,goles_local,goles_vis,goleadores,tarjetas,updated_at'),
    sbRest('/partidos?id=gte.73&select=id,local,visitante,codigo_local,codigo_vis&order=id'),
  ]);
  res.json({ ok: true, ts: Date.now(), resultados: resultados || [], partidos: knockoutPartidos || [] });
});

// Bracket: fuerza recomputo y retorna partidos de eliminatorias con equipos resueltos
app.get('/api/bracket', async (req, res) => {
  try {
    await computeAndUpdateBracket();
    const [partidos, resultados] = await Promise.all([
      sbRest('/partidos?id=gte.73&select=id,etapa,fecha,hora,local,visitante,codigo_local,codigo_vis,ciudad&order=id'),
      sbRest('/resultados?select=partido_id,goles_local,goles_vis,goleadores,tarjetas'),
    ]);
    res.json({ ok: true, partidos: partidos || [], resultados: resultados || [] });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Debug: qué retornan las fuentes sin guardar nada — abre en el navegador para diagnosticar
app.get('/api/debug-live', async (req, res) => {
  const date = colDate(), dateNum = colDateNum();
  const out = { date };

  for (const slug of ESPN_SLUGS) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateNum}&limit=50`;
      const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' } });
      const body = r.ok ? await r.json() : null;
      out[`espn_${slug.replace('.','_')}`] = {
        httpStatus: r.status,
        events: body?.events?.length ?? 0,
        live: (body?.events || [])
          .filter(e => ['STATUS_IN_PROGRESS','STATUS_HALFTIME'].includes(e.status?.type?.name))
          .map(e => ({
            name: e.name,
            status: e.status?.type?.name,
            score: e.competitions?.[0]?.competitors?.map(c => `${c.team?.displayName} ${c.score}`).join(' vs ')
          })),
        allMatches: (body?.events || []).map(e => ({
          name: e.name,
          status: e.status?.type?.name,
          home: e.competitions?.[0]?.competitors?.find(c=>c.homeAway==='home')?.team?.displayName,
          away: e.competitions?.[0]?.competitors?.find(c=>c.homeAway==='away')?.team?.displayName,
        }))
      };
    } catch(e) { out[`espn_${slug}`] = { error: e.message }; }
  }

  try {
    const url = `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${date}`;
    const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, 'Referer': 'https://www.sofascore.com/' } });
    if (r.ok) {
      const { events = [] } = await r.json();
      const wc = events.filter(ev => (ev.tournament?.uniqueTournament?.name||'').toLowerCase().includes('world'));
      out.sofascore = {
        httpStatus: r.status,
        totalEvents: events.length,
        worldCupEvents: wc.length,
        matches: wc.map(e => ({
          home: e.homeTeam?.name,
          away: e.awayTeam?.name,
          score: `${e.homeScore?.current??'?'}-${e.awayScore?.current??'?'}`,
          status: e.status?.type,
          tournament: e.tournament?.uniqueTournament?.name,
          eventId: e.id
        }))
      };
    } else out.sofascore = { httpStatus: r.status };
  } catch(e) { out.sofascore = { error: e.message }; }

  res.json(out);
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`🏆 Polla NODO en :${PORT}`));

// ── Iniciar polling adaptivo ──────────────────────────────────────
// En vivo: cada 20s · Idle: cada 60s
if (SUPABASE_URL && SUPABASE_ANON) {
  if (FOOTBALL_API_KEY) {
    console.log('[live] football-data.org activo (clave configurada)');
    pollFootballData();
    setInterval(pollFootballData, 45_000);
  } else {
    console.log('[live] ESPN + SofaScore — polling adaptivo (20s en vivo · 60s idle)');
    let t;
    async function go() { await pollAll(); t = setTimeout(go, liveActive ? 20_000 : 60_000); }
    go();
  }
  // Rellenar goleadores históricos vacíos al arrancar y cada 3h
  setTimeout(resyncMissingGoals, 12_000);
  setInterval(resyncMissingGoals, 3 * 60 * 60 * 1000);
  // Bracket: calcular avance de equipos al arrancar y cada hora
  setTimeout(computeAndUpdateBracket, 8_000);
  setInterval(computeAndUpdateBracket, 60 * 60 * 1000);
} else {
  console.log('[live] sin Supabase — modo offline');
}
