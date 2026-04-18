/* ============================================================
   AWD PORTFOLIO — script.js
   ============================================================ */

// ── AUDIO ─────────────────────────────────────────────────────
const tracks = {
  godstained:       new Audio('audio/Godstained.mp3'),
  anythingonce:     new Audio('audio/Anything Once.mp3'),
  maybe:            new Audio('audio/Maybe.mp3'),
  ididntunderstand: new Audio('audio/I Didnt Understand.mp3'),
  nocare:           new Audio('audio/No Care.mp3'),
  readytogo:        new Audio('audio/Ready to Go.mp3'),
  imsotired:        new Audio("audio/I'm So Tired.mp3"),
  conquest:         new Audio('audio/Conquest.mp3'),
  hymnforadroid:    new Audio('audio/Hymn For a Droid.mp3'),
  lossoflife:       new Audio('audio/Loss of Life.mp3'),
};

for (const track of Object.values(tracks)) {
  track.loop   = true;
  track.volume = 0;
}

let currentTrack = null;

// Cancel-safe fade tracking — prevents concurrent rAF chains fighting over volume
const fadingTracks = new Map(); // track → rAF id

function cancelFade(track) {
  const id = fadingTracks.get(track);
  if (id) cancelAnimationFrame(id);
  fadingTracks.delete(track);
}

// Equal-power crossfade: cos out + sin in keeps perceived loudness constant (no dip)
const FADE_DURATION = 2000;

function fadeOut(track, duration = FADE_DURATION) {
  if (!track) return;
  cancelFade(track);
  const startVol  = track.volume;
  const startTime = performance.now();
  (function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    track.volume = startVol * Math.cos(t * Math.PI / 2);
    if (t < 1) {
      fadingTracks.set(track, requestAnimationFrame(step));
    } else {
      track.pause();
      fadingTracks.delete(track);
      ripple.onTrackStop();
    }
  })(performance.now());
}

function fadeIn(track, targetVol = 0.65, duration = FADE_DURATION) {
  if (!track) return;
  cancelFade(track);
  track.currentTime = 0;
  track.play().catch(() => {});
  ripple.onTrackStart(track);
  const startTime = performance.now();
  (function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    track.volume = targetVol * Math.sin(t * Math.PI / 2);
    if (t < 1) {
      fadingTracks.set(track, requestAnimationFrame(step));
    } else {
      fadingTracks.delete(track);
    }
  })(performance.now());
}

function switchTrack(key) {
  const next = (key && key !== 'none') ? (tracks[key] ?? null) : null;
  if (next === currentTrack) {
    // Re-entering the same section — always restart from the top
    if (next) {
      cancelFade(next);
      next.currentTime = 0;
      next.volume = 0.65;
      if (next.paused) next.play().catch(() => {});
    }
    return;
  }
  fadeOut(currentTrack);
  if (next) fadeIn(next);
  currentTrack = next;
}

// ── SPLASH ────────────────────────────────────────────────────
const splash   = document.getElementById('splash');
const enterBtn = document.getElementById('enter-btn');

function dismissSplash() {
  for (const t of Object.values(tracks)) t.load();
  splash.classList.add('fade-out');
  setTimeout(() => splash.remove(), 1600);
  currentTrack = null;
  switchTrack('godstained');
}

enterBtn.addEventListener('click', (e) => { e.stopPropagation(); dismissSplash(); });
splash.addEventListener('click', () => {
  if (!splash.classList.contains('fade-out')) dismissSplash();
});

// ── BACKGROUND LAYERS ─────────────────────────────────────────
const bgLayers = {
  'brick':         document.getElementById('bg-brick'),
  'ocean':         document.getElementById('bg-ocean'),
  'fire':          document.getElementById('bg-fire'),
  'ruined-city':   document.getElementById('bg-ruined-city'),
  'black':         document.getElementById('bg-black'),
  'hallucination': document.getElementById('bg-hallucination'),
  'rockwall':      document.getElementById('bg-rockwall'),
  'burningcity':   document.getElementById('bg-burningcity'),
  'pond':          document.getElementById('bg-pond'),
  'curtain':       document.getElementById('bg-curtain'),
};

bgLayers['ocean'].style.opacity = '1';
let currentBg = 'ocean';

function switchBackground(key) {
  if (!key || key === currentBg) return;
  if (currentBg && bgLayers[currentBg]) bgLayers[currentBg].style.opacity = '0';
  if (bgLayers[key])                    bgLayers[key].style.opacity = '1';
  currentBg = key;
  ripple.updateTheme(key);
}

// ── SECTION OBSERVER ──────────────────────────────────────────
// Tracks ALL currently-intersecting sections; most-visible wins.
// switchTrack / switchBackground only fire when the dominant section
// actually changes — prevents rAF pile-ups from mid-scroll re-fires.
const visibleSections = new Map();
let currentSection = null;

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      visibleSections.set(entry.target, entry.intersectionRatio);
    } else {
      visibleSections.delete(entry.target);
    }
  });

  let best = null, bestRatio = 0;
  for (const [sec, ratio] of visibleSections) {
    if (ratio > bestRatio) { bestRatio = ratio; best = sec; }
  }

  if (best !== currentSection) {
    currentSection = best;
    if (best) {
      switchBackground(best.dataset.bg);
      switchTrack(best.dataset.audio);
    }
  }
}, {
  threshold:  [0.01, 0.05, 0.1, 0.3, 0.5, 0.7],
  rootMargin: '5% 0px 5% 0px',
});

document.querySelectorAll('section[data-bg]').forEach(s => sectionObserver.observe(s));

// ── FIRE FLECKS (DOM-based, scoped to .fire-flecks containers) ─
const FLECK_COLORS = ['#ff5500', '#ff7700', '#ffaa00', '#ff2200', '#ff8800'];
const FLECK_COUNT  = 28;

function spawnFlecks(container) {
  function createFleck() {
    const el       = document.createElement('span');
    el.className   = 'fire-fleck';
    const x        = Math.random() * 100;
    const size     = Math.random() * 5 + 2;
    const duration = Math.random() * 2.5 + 1.8;
    const delay    = Math.random() * 0.8;
    const drift    = (Math.random() - 0.5) * 80;
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
    setTimeout(() => { el.remove(); createFleck(); }, (duration + delay) * 1000 + 150);
  }
  for (let i = 0; i < FLECK_COUNT; i++) setTimeout(createFleck, Math.random() * 3000);
}

document.querySelectorAll('.fire-flecks').forEach(spawnFlecks);

// ── PARTICLE CANVAS ────────────────────────────────────────────
// z-index 0: sits between fixed backgrounds (-1) and scroll text (1).
const pCanvas = document.getElementById('particle-canvas');
const pCtx    = pCanvas.getContext('2d');

function resizeParticleCanvas() {
  const dpr      = window.devicePixelRatio || 1;
  pCanvas.width  = window.innerWidth  * dpr;
  pCanvas.height = window.innerHeight * dpr;
  pCtx.setTransform(1, 0, 0, 1, 0, 0);
  pCtx.scale(dpr, dpr);
}
resizeParticleCanvas();
window.addEventListener('resize', resizeParticleCanvas);

// ── PARTICLE HELPERS ───────────────────────────────────────────
function sectionInView(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > -120 && r.top < window.innerHeight + 120;
}

// 0 = section entering top of viewport, 1 = section leaving bottom
function sectionScrollProgress(el) {
  const r = el.getBoundingClientRect();
  return Math.max(0, Math.min(1,
    (window.innerHeight - r.top) / (window.innerHeight + r.height)
  ));
}

function lerpRGB(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const LEAF_GREENS = [[61,122,64],[74,158,78],[45,107,48],[90,181,94],[132,199,133]];
const LEAF_AUTUMN = [[200,98,26],[212,131,43],[179,74,14],[224,148,56],[139,61,10]];

// ── DUST SYSTEM ───────────────────────────────────────────────
function createDustSystem(el) {
  const motes = Array.from({ length: 22 }, () => ({
    x:     Math.random() * window.innerWidth,
    y:     Math.random() * window.innerHeight,
    r:     Math.random() * 1.4 + 0.4,
    vx:    (Math.random() * 0.22 + 0.07) * (Math.random() < 0.5 ? 1 : -1),
    vy:    Math.random() * 0.1 - 0.05,
    alpha: Math.random() * 0.09 + 0.03,
  }));
  return {
    update() {
      if (!sectionInView(el)) return;
      const W = window.innerWidth, H = window.innerHeight;
      for (const m of motes) {
        m.x += m.vx; m.y += m.vy;
        if (m.x >  W + 5) m.x = -5;
        if (m.x < -5)     m.x =  W + 5;
        if (m.y >  H + 5) m.y = -5;
        if (m.y < -5)     m.y =  H + 5;
      }
    },
    draw(ctx) {
      if (!sectionInView(el)) return;
      for (const m of motes) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,200,175,${m.alpha})`;
        ctx.fill();
      }
    },
  };
}

// ── LEAF SYSTEM ───────────────────────────────────────────────
// mode 'green': all green. mode 'transition': lerps green→autumn as section scrolls by.
function createLeafSystem(el, mode) {
  const MAX = mode === 'transition' ? 10 : 16;

  function makeLeaf() {
    const ci = Math.floor(Math.random() * 5);
    return {
      x:  Math.random() * window.innerWidth,
      y: -(Math.random() * window.innerHeight * 0.8),
      vy: Math.random() * 1.1 + 0.5,
      vx: (Math.random() - 0.5) * 0.5,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 0.018 + 0.008,
      rotation:  Math.random() * Math.PI * 2,
      rotVel:   (Math.random() - 0.5) * 0.034,
      rx: Math.random() * 9 + 6,
      ry: Math.random() * 4 + 2.5,
      alpha: Math.random() * 0.5 + 0.35,
      ci,
      _t: 0,
    };
  }

  const leaves = Array.from({ length: MAX }, () => {
    const l = makeLeaf();
    l.y = Math.random() * window.innerHeight;
    return l;
  });

  return {
    update() {
      if (!sectionInView(el)) return;
      const H = window.innerHeight;
      const progress = mode === 'transition' ? sectionScrollProgress(el) : 0;
      for (const l of leaves) {
        l.swayPhase += l.swaySpeed;
        l.x += l.vx + Math.sin(l.swayPhase) * 0.42;
        l.y += l.vy;
        l.rotation += l.rotVel;
        l._t = progress;
        if (l.y > H + 20) { const f = makeLeaf(); Object.assign(l, f); l.y = -20; }
      }
    },
    draw(ctx) {
      if (!sectionInView(el)) return;
      for (const l of leaves) {
        const color = mode === 'green'
          ? LEAF_GREENS[l.ci]
          : lerpRGB(LEAF_GREENS[l.ci], LEAF_AUTUMN[l.ci], l._t);
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rotation);
        ctx.beginPath();
        ctx.ellipse(0, 0, l.rx, l.ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${l.alpha})`;
        ctx.fill();
        ctx.restore();
      }
    },
  };
}

// ── ASH SYSTEM ────────────────────────────────────────────────
function createAshSystem(el) {
  function makeAsh() {
    return {
      x:          Math.random() * window.innerWidth,
      y:         -(Math.random() * 80),
      vy:          Math.random() * 0.7 + 0.3,
      vx:         (Math.random() - 0.5) * 0.32,
      r:           Math.random() * 5 + 2.5,
      alpha:       Math.random() * 0.07 + 0.03,
      driftPhase:  Math.random() * Math.PI * 2,
    };
  }
  const ash = Array.from({ length: 28 }, () => {
    const a = makeAsh(); a.y = Math.random() * window.innerHeight; return a;
  });
  return {
    update() {
      if (!sectionInView(el)) return;
      const H = window.innerHeight;
      for (const a of ash) {
        a.driftPhase += 0.007;
        a.x += a.vx + Math.sin(a.driftPhase) * 0.26;
        a.y += a.vy;
        if (a.y > H + 10) Object.assign(a, makeAsh());
      }
    },
    draw(ctx) {
      if (!sectionInView(el)) return;
      for (const a of ash) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(155,145,135,${a.alpha})`;
        ctx.fill();
      }
    },
  };
}

// ── SMOKE SYSTEM ──────────────────────────────────────────────
function createSmokeSystem(el) {
  const H = () => window.innerHeight;
  function makeSmoke() {
    return {
      x:           Math.random() * window.innerWidth,
      y:           H() + 30,
      vy:         -(Math.random() * 0.42 + 0.16),
      r:           Math.random() * 28 + 36,
      alpha:       0,
      targetAlpha: Math.random() * 0.062 + 0.022,
      growing:     true,
    };
  }
  const wisps = Array.from({ length: 6 }, () => {
    const s = makeSmoke(); s.y = Math.random() * H(); s.alpha = Math.random() * 0.045; return s;
  });
  return {
    update() {
      if (!sectionInView(el)) return;
      for (const s of wisps) {
        s.y += s.vy; s.r += 0.07;
        if (s.growing) {
          s.alpha = Math.min(s.alpha + 0.00022, s.targetAlpha);
          if (s.alpha >= s.targetAlpha) s.growing = false;
        } else {
          s.alpha -= 0.00007;
          if (s.alpha <= 0 || s.y < -s.r) Object.assign(s, makeSmoke());
        }
      }
    },
    draw(ctx) {
      if (!sectionInView(el)) return;
      for (const s of wisps) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(175,158,148,${s.alpha})`);
        g.addColorStop(1, `rgba(175,158,148,0)`);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    },
  };
}

// ── RAIN SYSTEM ───────────────────────────────────────────────
// bounds: null = full viewport | { x, y, w, h } = clipped window area
// Set SPACKLE2_RAIN_BOUNDS once the curtain image is ready and measured.
const SPACKLE2_RAIN_BOUNDS = null; // TODO: { x, y, w, h }

function createRainSystem(el, bounds) {
  const COUNT   = bounds ? 45 : 110;
  const ripples = [];

  function area() {
    return bounds || { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  }

  function makeDrop() {
    const a = area();
    return {
      x:     a.x + Math.random() * a.w,
      y:     a.y - Math.random() * a.h * 0.5,
      vy:    Math.random() * 9 + 8,
      vx:   -1.8,
      len:   Math.random() * 13 + 9,
      alpha: Math.random() * 0.3 + 0.18,
    };
  }

  const drops = Array.from({ length: COUNT }, () => {
    const d = makeDrop(); const a = area();
    d.y = a.y + Math.random() * a.h; return d;
  });

  return {
    update() {
      if (!sectionInView(el)) return;
      const a = area(), bottomY = a.y + a.h;
      for (const d of drops) {
        d.x += d.vx; d.y += d.vy;
        if (d.y > bottomY) {
          ripples.push({ x: d.x, y: bottomY - 4, r: 0, maxR: Math.random() * 14 + 6, alpha: 0.42 });
          Object.assign(d, makeDrop());
        }
        if (d.x < a.x - 20)       d.x = a.x + a.w;
        if (d.x > a.x + a.w + 20) d.x = a.x;
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].r += 0.55; ripples[i].alpha -= 0.018;
        if (ripples[i].alpha <= 0) ripples.splice(i, 1);
      }
    },
    draw(ctx) {
      if (!sectionInView(el)) return;
      const a = area();
      if (bounds) { ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip(); }

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(185,215,245,0.42)';
      ctx.lineWidth = 0.75;
      for (const d of drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.vx * (d.len / d.vy), d.y - d.len);
      }
      ctx.stroke();

      ctx.lineWidth = 0.7;
      for (const rp of ripples) {
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.28, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(185,215,245,${rp.alpha})`;
        ctx.stroke();
      }

      if (bounds) ctx.restore();
    },
  };
}

// ── STAR SYSTEM ───────────────────────────────────────────────
function createStarSystem(el, count = 55) {
  const stars = Array.from({ length: count }, () => ({
    x:         Math.random() * window.innerWidth,
    y:         Math.random() * window.innerHeight,
    r:         Math.random() * 0.9 + 0.3,
    phase:     Math.random() * Math.PI * 2,
    speed:     Math.random() * 0.007 + 0.003,
    baseAlpha: Math.random() * 0.45 + 0.18,
  }));
  return {
    update() {
      if (!sectionInView(el)) return;
      for (const s of stars) s.phase += s.speed;
    },
    draw(ctx) {
      if (!sectionInView(el)) return;
      for (const s of stars) {
        const alpha = s.baseAlpha * (0.5 + 0.5 * Math.sin(s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }
    },
  };
}

// ── PARTICLE REGISTRY ─────────────────────────────────────────
function $id(id) { return document.getElementById(id); }

const particleSystems = [
  createDustSystem($id('opening')),
  createLeafSystem($id('english'),          'green'),
  createLeafSystem($id('transition-first'), 'transition'),
  createRainSystem($id('unlearnt'),         null),
  createRainSystem($id('intraspect'),       null),
  createRainSystem($id('intraspect-b'),     null),
  createStarSystem($id('transition-third')),
  createAshSystem($id('sj')),
  createSmokeSystem($id('sj')),
  createAshSystem($id('sj-action')),
  createSmokeSystem($id('sj-action')),
  createStarSystem($id('transition-conclusion'), 200),
];

// ── PARTICLE LOOP ─────────────────────────────────────────────
(function particleLoop(now) {
  pCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (const sys of particleSystems) { sys.update(now); sys.draw(pCtx); }
  requestAnimationFrame(particleLoop);
})(performance.now());

// ── RIPPLE BORDER ─────────────────────────────────────────────
const ripple = (() => {
  const canvas = document.getElementById('ripple-canvas');
  const ctx    = canvas.getContext('2d');

  const THEME_RGB = {
    'brick':         [200, 121,  65],
    'rockwall':      [109, 191, 103],
    'burningcity':   [255,  96,  48],
    'curtain':       [200, 160, 120],
    'fire':          [200, 121,  65],
    'pond':          [122, 184, 212],
    'black':         [232, 224, 213],
    'hallucination': [ 60, 120, 200],
    'ruined-city':   [255,  80,  20],
  };

  let rgb = THEME_RGB['brick'];
  const rings = [];

  function resize() {
    const dpr     = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', () => { ctx.resetTransform(); resize(); });

  const MAX_INSET     = 120;
  const RING_DURATION = 1800;

  function spawnRing(amplitude = 0.5) {
    if (rings.length > 12) return;
    rings.push({ born: performance.now(), duration: RING_DURATION, amplitude });
  }

  function draw(now) {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const t = Math.min((now - r.born) / r.duration, 1);
      if (t >= 1) { rings.splice(i, 1); continue; }
      const eased = 1 - Math.pow(1 - t, 2);
      const inset = eased * MAX_INSET;
      const alpha = r.amplitude * (1 - t) * 0.78;
      ctx.save();
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      ctx.lineWidth   = 1.5 + r.amplitude * 2.5;
      ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
      ctx.restore();
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  let ambientTimer = null;
  function startAmbient() {
    if (ambientTimer) return;
    spawnRing(0.225);
    ambientTimer = setInterval(() => spawnRing(0.225), 1800);
  }
  function stopAmbient() { clearInterval(ambientTimer); ambientTimer = null; }
  startAmbient();

  let audioCtx = null, analyser = null, dataArray = null, lastSpawn = 0;
  const SPAWN_COOLDOWN = 350;

  function ensureAudioCtx() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(audioCtx.destination);
    // Wire every track through the analyser once, upfront.
    // createMediaElementSource() can only be called once per element —
    // calling it again on re-entry throws a DOMException and silently
    // kills the fadeIn volume ramp, leaving the track playing at vol 0.
    for (const audioEl of Object.values(tracks)) {
      audioCtx.createMediaElementSource(audioEl).connect(analyser);
    }
  }

  function connectTrack(audioEl) {
    if (!audioEl || !(audioEl instanceof HTMLMediaElement)) return;
    ensureAudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    stopAmbient();
    pollAnalyser();
  }

  function disconnectTrack() { startAmbient(); }

  let pollingActive = false;
  function pollAnalyser() {
    if (pollingActive) return;
    pollingActive = true;
    function tick(now) {
      if (!currentTrack) { pollingActive = false; disconnectTrack(); return; }
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128; sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      if (rms > 0.15 && now - lastSpawn > SPAWN_COOLDOWN) {
        spawnRing(Math.min(rms * 2, 0.5)); lastSpawn = now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  return {
    updateTheme(bgKey) { rgb = THEME_RGB[bgKey] || THEME_RGB['brick']; },
    onTrackStart(audioEl) { connectTrack(audioEl); },
    onTrackStop()         { disconnectTrack();      },
  };
})();

// ── REVEAL OBSERVER ───────────────────────────────────────────
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ── TEXT CONTENT LOADER ────────────────────────────────────────
// Fetches each .txt file and injects parsed HTML into [data-src] containers.
// Runs after DOMContentLoaded; newly created .reveal elements are observed
// by revealObserver once injected.

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Default: double-newline-separated paragraphs → reveal divs
function parseDefault(text) {
  return text.split(/\n\n+/)
    .map(c => c.trim()).filter(Boolean)
    .map(chunk =>
      `<div class="reveal"><p>${escHtml(chunk).replace(/\n/g, '<br>')}</p></div>`
    ).join('');
}

// writing/english.txt: "Heading:\n\nbody" era-blocks + closing Kerouac quote
function parseEra(text) {
  const chunks = text.split(/\n\n+/).map(c => c.trim()).filter(Boolean);
  const html = [];
  let i = 0;
  while (i < chunks.length) {
    const chunk = chunks[i];
    const hm = chunk.match(/^([A-Z][A-Za-z\s]+):\s*$/);
    if (hm && i + 1 < chunks.length) {
      const body = chunks[i + 1];
      html.push(
        `<div class="reveal era-block">` +
          `<h3 class="era-heading">${escHtml(hm[1])}</h3>` +
          `<p>${escHtml(body).replace(/\n/g, '<br>')}</p>` +
        `</div>`
      );
      i += 2;
    } else {
      // Kerouac closing quote: starts with " and attribution on next line
      if (chunk.startsWith('"') && chunk.toLowerCase().includes('kerouac')) {
        const lines = chunk.split('\n');
        const q    = escHtml(lines[0].replace(/^"|"$/g, ''));
        const cite = lines[1] ? escHtml(lines[1].replace(/^[―—\-]\s*/, '')) : 'Jack Kerouac';
        html.push(
          `<div class="reveal">` +
            `<blockquote class="closing-quote"><p>${q}</p><cite>— ${cite}</cite></blockquote>` +
          `</div>`
        );
      } else if (!chunk.startsWith('―') && !chunk.startsWith('—')) {
        html.push(`<div class="reveal"><p>${escHtml(chunk).replace(/\n/g, '<br>')}</p></div>`);
      }
      i++;
    }
  }
  return html.join('');
}

// emotions/unlearnt.txt: first chunk is the Robert Jordan epigraph.
// Detect by citation line (starts with — or ―) rather than by quote char,
// since the file may use curly/Unicode quotes that differ from ASCII ".
function parseUnlearnt(text) {
  const chunks = text.split(/\n\n+/).map(c => c.trim()).filter(Boolean);
  return chunks.map((chunk, i) => {
    const nlIdx = chunk.indexOf('\n');
    const hasCitation = nlIdx > -1 && /^[—―\-]/.test(chunk.slice(nlIdx + 1).trimStart());
    if (i === 0 && hasCitation) {
      const q    = escHtml(chunk.slice(0, nlIdx).replace(/^[\u201c"]+|[\u201d"]+$/g, '').trim());
      const cite = escHtml(chunk.slice(nlIdx + 1).trim());
      return (
        `<div class="reveal">` +
          `<blockquote class="epigraph"><p>${q}</p><cite>${cite}</cite></blockquote>` +
        `</div>`
      );
    }
    return `<div class="reveal"><p>${escHtml(chunk).replace(/\n/g, '<br>')}</p></div>`;
  }).join('');
}

// military_industry/sj_action.txt: detect *SOUND EFFECTS* as their own style
function parseAction(text) {
  const SFX = /^(\*[A-Z\s*]+\*\s*)+$/;
  return text.split(/\n\n+/)
    .map(c => c.trim()).filter(Boolean)
    .map(chunk => {
      if (SFX.test(chunk)) {
        return `<div class="reveal"><p class="sound-effect">${escHtml(chunk)}</p></div>`;
      }
      return `<div class="reveal"><p>${escHtml(chunk).replace(/\n/g, '<br>')}</p></div>`;
    }).join('');
}

function renderTxtContent(src, text) {
  if (!text.trim()) return '';
  if (src.includes('english.txt'))   return parseEra(text);
  if (src.includes('unlearnt.txt'))  return parseDefault(text);
  if (src.includes('sj_action.txt')) return parseAction(text);
  return parseDefault(text);
}

async function loadAllTxtContent() {
  const containers = document.querySelectorAll('.txt-content[data-src]');
  await Promise.all([...containers].map(async el => {
    const src = el.dataset.src;
    try {
      const res  = await fetch(src);
      const text = await res.text();
      el.innerHTML = renderTxtContent(src, text);
    } catch (_) {
      // On file:// or fetch failure, show a placeholder so layout doesn't break
      el.innerHTML = `<div class="reveal"><p class="spackle-placeholder">[${escHtml(src)}]</p></div>`;
    }
    // Observe any newly created .reveal elements
    el.querySelectorAll('.reveal').forEach(r => revealObserver.observe(r));
  }));
}

loadAllTxtContent();
