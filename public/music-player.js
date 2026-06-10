// ── MUSIC PLAYER — Polla NODO Mundial 2026 ──────────────────
(function () {
  const SONGS = [
    { file: 'waka-waka.mp3',               name: 'Waka Waka',                artist: 'Shakira' },
    { file: 'knaan-wavin-flag.mp3',         name: "Wavin' Flag",              artist: "K'NAAN" },
    { file: 'we-are-one.mp3',               name: 'We Are One (Ole Ola)',      artist: 'Pitbull ft. Jennifer Lopez' },
    { file: 'queen-champions.mp3',          name: 'We Are The Champions',      artist: 'Queen' },
    { file: 'queen-we-will-rock-you.mp3',   name: 'We Will Rock You',          artist: 'Queen' },
    { file: 'shakira-hips-dont-lie.mp3',    name: "Hips Don't Lie",            artist: 'Shakira ft. Wyclef Jean' },
    { file: 'shakira-dai-dai.mp3',          name: 'Dai Dai',                   artist: 'Shakira & Burna Boy' },
    { file: 'blur-song2.mp3',               name: 'Song 2',                    artist: 'Blur' },
    { file: 'ryan-castro-colombia.mp3',     name: 'El Ritmo Que Nos Une',      artist: 'Ryan Castro & Colombia' },
    { file: 'doctor-krapula-pibe.mp3',      name: 'Pibe de Mi Barrio',         artist: 'Doctor Krapula' },
  ];

  // Pick random song (different from last one stored)
  const lastIdx = parseInt(sessionStorage.getItem('last-song') || '-1');
  let idx;
  do { idx = Math.floor(Math.random() * SONGS.length); } while (idx === lastIdx && SONGS.length > 1);
  sessionStorage.setItem('last-song', idx);
  const song = SONGS[idx];

  // ── CREATE PLAYER DOM ──────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #mp-wrap{position:fixed;bottom:18px;right:18px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}
    #mp-toast{background:#001166;color:#fff;font-family:'Spline Sans Mono',monospace,monospace;font-size:10px;
      padding:8px 14px 8px 12px;border-left:4px solid #FCD116;box-shadow:4px 4px 0 rgba(0,0,0,.35);
      max-width:240px;pointer-events:auto;
      animation:mp-slide-in .5s cubic-bezier(.22,.68,0,1.2) both}
    #mp-toast .mp-song{font-weight:700;font-size:11px;color:#FCD116;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
    #mp-toast .mp-artist{color:rgba(255,255,255,.6);font-size:9px;letter-spacing:.06em;margin-top:1px}
    #mp-btn{width:44px;height:44px;border-radius:50%;background:#001166;border:3px solid #FCD116;
      color:#FCD116;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;
      box-shadow:3px 3px 0 rgba(0,0,0,.35);transition:all .15s;pointer-events:auto}
    #mp-btn:hover{transform:scale(1.1);background:#0022aa}
    #mp-btn.muted{background:#6b7280;border-color:rgba(255,255,255,.3);color:rgba(255,255,255,.5)}
    #mp-toast.hide{animation:mp-slide-out .4s ease forwards}
    @keyframes mp-slide-in{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:translateX(0)}}
    @keyframes mp-slide-out{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(60px)}}
    #mp-bar{height:2px;background:#FCD116;width:0%;margin-top:5px;transition:width .5s linear}
  `;
  document.head.appendChild(style);

  const wrap  = document.createElement('div'); wrap.id = 'mp-wrap';
  const toast = document.createElement('div'); toast.id = 'mp-toast';
  toast.innerHTML = `
    <div class="mp-song">🎵 ${song.name}</div>
    <div class="mp-artist">${song.artist}</div>
    <div id="mp-bar"></div>
  `;
  const btn = document.createElement('button'); btn.id = 'mp-btn'; btn.title = 'Silenciar / activar música';
  btn.textContent = '🔊';
  wrap.appendChild(toast);
  wrap.appendChild(btn);
  document.body.appendChild(wrap);

  // ── AUDIO ──────────────────────────────────────────────────
  const audio = new Audio('/music/' + song.file);
  audio.volume = 0.45;
  audio.loop   = true;

  let muted   = false;
  let started = false;

  function tryPlay() {
    if (started) return;
    audio.play().then(() => { started = true; }).catch(() => {});
  }

  // Start on first user interaction (browser autoplay policy)
  ['click','keydown','touchstart'].forEach(ev =>
    document.addEventListener(ev, tryPlay, { once: true })
  );

  // Progress bar
  audio.addEventListener('timeupdate', () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
    const bar = document.getElementById('mp-bar');
    if (bar) bar.style.width = pct + '%';
  });

  // Auto-hide toast after 6s, re-show on hover
  let toastTimer = setTimeout(() => toast.classList.add('hide'), 6000);
  btn.addEventListener('mouseenter', () => {
    clearTimeout(toastTimer);
    toast.classList.remove('hide');
  });
  btn.addEventListener('mouseleave', () => {
    toastTimer = setTimeout(() => toast.classList.add('hide'), 3000);
  });
  toast.addEventListener('mouseenter', () => {
    clearTimeout(toastTimer);
    toast.classList.remove('hide');
  });
  toast.addEventListener('mouseleave', () => {
    toastTimer = setTimeout(() => toast.classList.add('hide'), 3000);
  });

  // Mute toggle
  btn.addEventListener('click', () => {
    muted = !muted;
    audio.muted = muted;
    btn.textContent = muted ? '🔇' : '🔊';
    btn.classList.toggle('muted', muted);
    // Show toast briefly
    clearTimeout(toastTimer);
    toast.classList.remove('hide');
    toastTimer = setTimeout(() => toast.classList.add('hide'), 3000);
    // Try to start if not started
    if (!muted) tryPlay();
  });
})();
