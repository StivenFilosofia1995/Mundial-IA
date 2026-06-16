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
      'Prefer': 'resolution=merge-duplicates'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, opts);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function findPartidoId(localEs, visEs) {
  let data = await sbRest(`/partidos?local=eq.${encodeURIComponent(localEs)}&visitante=eq.${encodeURIComponent(visEs)}&select=id`);
  if (data?.length) return data[0].id;
  data = await sbRest(`/partidos?local=eq.${encodeURIComponent(visEs)}&visitante=eq.${encodeURIComponent(localEs)}&select=id`);
  return data?.[0]?.id ?? null;
}

async function upsertResultado(pid, gl, gv, goleadores, tarjetas = '') {
  if (gl == null || gv == null) return;
  // Solo incluir goleadores/tarjetas si tienen datos — evita sobrescribir
  // con string vacío cuando ESPN actualiza el marcador sin detalle de goles
  const body = {
    partido_id: pid, goles_local: gl, goles_vis: gv,
    updated_at: new Date().toISOString()
  };
  if (goleadores) body.goleadores = goleadores;
  if (tarjetas)   body.tarjetas   = tarjetas;
  await sbRest('/resultados', 'POST', [body]);
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

    const goals = (comp.details || [])
      .filter(d => d.type?.text === 'Goal Scored' || d.type?.id === '70' || d.scoringPlay)
      .map(d => {
        const n = d.athletesInvolved?.[0]?.displayName || d.participants?.[0]?.displayName || '?';
        const m = d.clock?.value != null ? Math.round(d.clock.value/60)+"'" : '';
        const isOwn = !!(d.ownGoal);
        const pen   = d.penaltyKick ? ' (pen)' : '';
        const og    = isOwn ? ' (pp)' : '';
        // Determinar equipo: comparar team.id con el equipo local
        const dTeamId = d.team?.id || d.athletesInvolved?.[0]?.team?.id;
        const byHome  = dTeamId ? dTeamId === homeTeamId : null;
        // Si gol en contra, el gol va al equipo contrario
        const prefix  = byHome !== null ? ((byHome !== isOwn) ? 'L' : 'V') : '';
        return `${prefix ? prefix+':' : ''}${n}${m?' '+m:''}${pen}${og}`;
      });

    const cards = (comp.details || [])
      .filter(d => { const t = d.type?.text||''; return t.includes('Card') || d.yellowCard || d.redCard; })
      .map(d => {
        const n = d.athletesInvolved?.[0]?.displayName || '?';
        const m = d.clock?.value != null ? Math.round(d.clock.value/60)+"'" : '';
        const dTeamId = d.team?.id || d.athletesInvolved?.[0]?.team?.id;
        const isHome  = dTeamId ? dTeamId === homeTeamId : null;
        const prefix  = isHome !== null ? (isHome ? 'L' : 'V') : '';
        const txt     = d.type?.text || '';
        const emoji   = txt === 'Red Card' || d.redCard ? '🟥' : txt === 'Yellow-Red Card' ? '🟨🟥' : '🟨';
        return `${prefix ? prefix+':' : ''}${emoji} ${n}${m?' '+m:''}`;
      });

    await upsertResultado(pid, gl, gv, goals.join(' · '), cards.join(' · '));
    console.log(`[espn] ✓ ${homeEs} ${gl}–${gv} ${awayEs}${goals.length?' | '+goals.join(', '):''}`);
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
    res.json({ updated: er.updated + sr.updated, espnEvents: espnEvents.length, sofaEvents: sofaEvents.length });
  } catch(e) { res.json({ error: e.message }); }
});

// Marcadores actuales (polling de clientes cada 30s)
app.get('/api/live', async (req, res) => {
  const data = await sbRest('/resultados?select=partido_id,goles_local,goles_vis,goleadores,tarjetas,updated_at');
  res.json({ ok: true, ts: Date.now(), resultados: data || [] });
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
} else {
  console.log('[live] sin Supabase — modo offline');
}
