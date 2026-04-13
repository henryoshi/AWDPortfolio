/* ============================================================
   AWD PORTFOLIO — script.js
   Scroll-triggered backgrounds, audio transitions, reveal
   ============================================================ */

// ── AUDIO ─────────────────────────────────────────────────────
//
// Add tracks here as you source MP3 files.
// Drop clips into /audio/ and uncomment the relevant lines.
//
// const tracks = {
//   conquest: new Audio('audio/conquest.mp3'),  // R4 / ruined city
// };
//
const tracks = {};

for (const track of Object.values(tracks)) {
  track.loop   = true;
  track.volume = 0;
}

let currentTrack = null;

function fadeOut(track, duration = 1400) {
  if (!track) return;
  const startVol  = track.volume;
  const startTime = performance.now();
  (function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    track.volume = startVol * (1 - t);
    if (t < 1) requestAnimationFrame(step);
    else { track.pause(); ripple.onTrackStop(); }
  })(performance.now());
}

function fadeIn(track, targetVol = 0.65, duration = 1400) {
  if (!track) return;
  track.currentTime = 0;
  track.play().catch(() => {});
  ripple.onTrackStart(track);    // wire amplitude analysis to ripple system
  const startTime = performance.now();
  (function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    track.volume = targetVol * t;
    if (t < 1) requestAnimationFrame(step);
  })(performance.now());
}

function switchTrack(key) {
  const next = (key && key !== 'none') ? (tracks[key] ?? null) : null;
  if (next === currentTrack) return;
  fadeOut(currentTrack);
  if (next) fadeIn(next);
  currentTrack = next;
}

// ── SPLASH SCREEN ─────────────────────────────────────────────
const splash   = document.getElementById('splash');
const enterBtn = document.getElementById('enter-btn');

function dismissSplash() {
  // Prime audio objects — must happen inside a user gesture for autoplay policy
  for (const t of Object.values(tracks)) {
    t.load();
  }
  splash.classList.add('fade-out');
  setTimeout(() => splash.remove(), 1600);
}

enterBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  dismissSplash();
});

// Clicking anywhere on splash (after the button fades in) also works
splash.addEventListener('click', () => {
  if (!splash.classList.contains('fade-out')) dismissSplash();
});

// ── BACKGROUND LAYERS ─────────────────────────────────────────
const bgLayers = {
  'brick':         document.getElementById('bg-brick'),
  'fire':          document.getElementById('bg-fire'),
  'ruined-city':   document.getElementById('bg-ruined-city'),
  'black':         document.getElementById('bg-black'),
  'hallucination': document.getElementById('bg-hallucination'),
  'rockwall':      document.getElementById('bg-rockwall'),
  'burningcity':   document.getElementById('bg-burningcity'),
  'pond':          document.getElementById('bg-pond'),
};

// Show first background immediately (before any scrolling)
bgLayers['brick'].style.opacity = '1';
let currentBg = 'brick';

function switchBackground(key) {
  if (!key || key === currentBg) return;
  if (currentBg && bgLayers[currentBg]) {
    bgLayers[currentBg].style.opacity = '0';
  }
  if (bgLayers[key]) {
    bgLayers[key].style.opacity = '1';
  }
  currentBg = key;
  ripple.updateTheme(key);   // keep ripple color in sync with background
}

// ── SECTION OBSERVER (backgrounds + audio) ────────────────────
//
// Picks the most-visible section among all currently-intersecting entries.
// threshold array gives the observer multiple trigger points so it
// re-evaluates as the user scrolls through tall sections.
//
const sectionObserver = new IntersectionObserver((entries) => {
  let best      = null;
  let bestRatio = 0;

  entries.forEach(entry => {
    if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
      bestRatio = entry.intersectionRatio;
      best = entry.target;
    }
  });

  if (best) {
    switchBackground(best.dataset.bg);
    switchTrack(best.dataset.audio);
  }
}, {
  threshold:  [0.1, 0.3, 0.5],
  rootMargin: '0px 0px -8% 0px',
});

document.querySelectorAll('section[data-bg]').forEach(s => sectionObserver.observe(s));

// ── FIRE FLECKS ───────────────────────────────────────────────
//
// Spawns animated ember sparks inside any .fire-flecks container.
// Each fleck is a small span that drifts upward and fades out,
// then is recycled.
//
const FLECK_COLORS  = ['#ff5500', '#ff7700', '#ffaa00', '#ff2200', '#ff8800'];
const FLECK_COUNT   = 28;

function spawnFlecks(container) {
  function createFleck() {
    const el  = document.createElement('span');
    el.className = 'fire-fleck';

    const x        = Math.random() * 100;          // % from left
    const size     = Math.random() * 5 + 2;        // 2–7 px
    const duration = Math.random() * 2.5 + 1.8;   // 1.8–4.3 s
    const delay    = Math.random() * 0.8;          // stagger up to 0.8 s
    const drift    = (Math.random() - 0.5) * 80;  // px left/right wander
    const color    = FLECK_COLORS[Math.floor(Math.random() * FLECK_COLORS.length)];

    el.style.cssText = `
      left: ${x}%;
      width: ${size}px;
      height: ${size * 1.35}px;
      background: ${color};
      box-shadow: 0 0 ${size + 2}px ${color};
      --drift: ${drift}px;
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
    `;

    container.appendChild(el);

    // remove and recycle after animation completes
    const lifetime = (duration + delay) * 1000 + 150;
    setTimeout(() => {
      el.remove();
      createFleck();
    }, lifetime);
  }

  // stagger the initial spawn so they don't all appear at once
  for (let i = 0; i < FLECK_COUNT; i++) {
    setTimeout(createFleck, Math.random() * 3000);
  }
}

// Wire up flecks to all fire sections
document.querySelectorAll('.fire-flecks').forEach(spawnFlecks);

// ── RIPPLE BORDER ─────────────────────────────────────────────
//
// Draws rectangular rings that emanate inward from the viewport
// edges. When audio is playing, rings are driven by amplitude
// from a Web Audio AnalyserNode. Without audio, an ambient timer
// pulses gently.
//
// Ring color follows the active background theme automatically
// via ripple.updateTheme(key).
//
const ripple = (() => {
  const canvas  = document.getElementById('ripple-canvas');
  const ctx     = canvas.getContext('2d');

  // Theme → [r, g, b] lookup
  const THEME_RGB = {
    'brick':         [200, 121,  65],
    'rockwall':      [109, 191, 103],
    'burningcity':   [255,  96,  48],
    'fire':          [200, 121,  65],
    'pond':          [122, 184, 212],
    'black':         [232, 224, 213],
    'hallucination': [ 60, 120, 200],
    'ruined-city':   [255,  80,  20],
  };

  let rgb = THEME_RGB['brick'];

  // Each active ring: { born: ms, duration: ms, amplitude: 0–1 }
  const rings = [];

  // ── Canvas sizing ──────────────────────────────────────────
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', () => { ctx.resetTransform(); resize(); });

  // ── Ring spawning ──────────────────────────────────────────
  const MAX_INSET    = 120;   // px the ring travels inward before vanishing
  const RING_DURATION = 1800; // ms per ring lifetime

  function spawnRing(amplitude = 0.5) {
    if (rings.length > 12) return;  // cap concurrent rings
    rings.push({ born: performance.now(), duration: RING_DURATION, amplitude });
  }

  // ── Draw loop ──────────────────────────────────────────────
  function draw(now) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);

    for (let i = rings.length - 1; i >= 0; i--) {
      const r       = rings[i];
      const elapsed = now - r.born;
      const t       = elapsed / r.duration;   // 0 → 1

      if (t >= 1) { rings.splice(i, 1); continue; }

      // ease-out: fast start, slow fade
      const eased  = 1 - Math.pow(1 - t, 2);
      const inset  = eased * MAX_INSET;
      const alpha  = r.amplitude * (1 - t) * 0.65;

      ctx.save();
      ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
      ctx.lineWidth   = 1.5 + r.amplitude * 2;
      ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
      ctx.restore();
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // ── Ambient timer (no audio) ───────────────────────────────
  let ambientTimer = null;

  function startAmbient() {
    if (ambientTimer) return;
    // pulse a gentle ring every 2.4 seconds
    spawnRing(0.28);
    ambientTimer = setInterval(() => spawnRing(0.28), 2400);
  }

  function stopAmbient() {
    clearInterval(ambientTimer);
    ambientTimer = null;
  }

  startAmbient();  // start ambient immediately; audio sync will override when tracks play

  // ── Web Audio analysis ─────────────────────────────────────
  let audioCtx     = null;
  let analyser     = null;
  let dataArray    = null;
  let connectedSrc = null;   // the currently connected MediaElementSource
  let lastSpawn    = 0;
  const SPAWN_COOLDOWN = 120;  // ms minimum between audio-triggered rings

  function ensureAudioCtx() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(audioCtx.destination);
  }

  // Call this whenever a new audio track starts playing
  function connectTrack(audioEl) {
    if (!audioEl || !(audioEl instanceof HTMLMediaElement)) return;
    ensureAudioCtx();

    // Resume context if it was suspended (autoplay policy)
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Disconnect previous source if different element
    if (connectedSrc && connectedSrc._el !== audioEl) {
      try { connectedSrc.disconnect(); } catch (_) {}
      connectedSrc = null;
    }

    if (!connectedSrc) {
      const src = audioCtx.createMediaElementSource(audioEl);
      src._el   = audioEl;
      src.connect(analyser);
      connectedSrc = src;
    }

    stopAmbient();
    pollAnalyser();
  }

  function disconnectTrack() {
    startAmbient();
  }

  let pollingActive = false;
  function pollAnalyser() {
    if (pollingActive) return;
    pollingActive = true;

    function tick(now) {
      if (!currentTrack) {
        pollingActive = false;
        disconnectTrack();
        return;
      }
      analyser.getByteTimeDomainData(dataArray);

      // RMS amplitude: sqrt(mean of squared deviations from 128)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);  // 0–1

      if (rms > 0.04 && now - lastSpawn > SPAWN_COOLDOWN) {
        spawnRing(Math.min(rms * 4, 1));
        lastSpawn = now;
      }

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    updateTheme(bgKey) {
      rgb = THEME_RGB[bgKey] || THEME_RGB['brick'];
    },
    onTrackStart(audioEl) { connectTrack(audioEl); },
    onTrackStop()         { disconnectTrack();      },
  };
})();

// ── REVEAL OBSERVER (text fade-in-up) ─────────────────────────
//
// Each .reveal element gets .visible when it enters the viewport.
// Fires once per element, then stops observing.
//
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold:  0.12,
  rootMargin: '0px 0px -4% 0px',
});

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
