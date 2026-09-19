/**
 * Shared solar-system rendering core.
 * Works in the browser (window.SolarSystemCore) and in Node.js
 * (require('./solar-system-core.js')) via the UMD wrapper below,
 * using the standard Canvas 2D API (which node-canvas implements too).
 *
 * This module never does its own image/network I/O — the caller (index.html
 * or stream.js) loads any planet textures and passes them in as `images`.
 * If a texture is missing, the corresponding planet just falls back to a
 * flat-shaded circle, so the renderer always works out of the box.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SolarSystemCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const WIDTH = 1280;
  const HEIGHT = 720;
  const FLATTEN = 0.62; // vertical squash so orbits look tilted/3D-ish (was 0.55 — too squashed)

  // Not to scale — tuned to fill the 1280x720 frame instead of sitting small
  // in the middle of it. ecc = orbital eccentricity (0 = circle).
  const PLANETS = [
    { name: 'Mercury', r: 65,  ecc: 0.18, size: 4,    color: '#b5a89f', speed: 0.55 },
    { name: 'Venus',   r: 100, ecc: 0.05, size: 7,    color: '#e8cda2', speed: 0.42 },
    { name: 'Earth',   r: 135, ecc: 0.08, size: 8.5,  color: '#4a90d9', speed: 0.33, moon: true },
    { name: 'Mars',    r: 170, ecc: 0.14, size: 6.5,  color: '#c1440e', speed: 0.27 },
    { name: 'Jupiter', r: 300, ecc: 0.06, size: 20,   color: '#d8ae70', speed: 0.15 },
    { name: 'Saturn',  r: 370, ecc: 0.07, size: 16,   color: '#e3c88f', speed: 0.11, ring: true },
    { name: 'Uranus',  r: 440, ecc: 0.05, size: 11,   color: '#a9dbe0', speed: 0.085 },
    { name: 'Neptune', r: 500, ecc: 0.04, size: 11,   color: '#4166f5', speed: 0.065 },
  ];

  // Relative paths where each texture is expected. Callers load these
  // themselves (Node: canvas's loadImage; browser: new Image()) and pass
  // the resulting drawable images into drawFrame as `images`.
  // Get real, freely-licensed textures from:
  //   - https://www.solarsystemscope.com/textures/ (CC BY 4.0, credit required)
  //   - https://images.nasa.gov (public domain)
  const TEXTURE_FILES = {
    sun: 'assets/sun.jpg',
    Mercury: 'assets/planets/mercury.jpg',
    Venus: 'assets/planets/venus.jpg',
    Earth: 'assets/planets/earth.jpg',
    Mars: 'assets/planets/mars.jpg',
    Jupiter: 'assets/planets/jupiter.jpg',
    Saturn: 'assets/planets/saturn.jpg',
    Uranus: 'assets/planets/uranus.jpg',
    Neptune: 'assets/planets/neptune.jpg',
  };

  function orbitRadii(p) {
    return { rx: p.r, ry: p.r * (1 - p.ecc) };
  }

  function createAsteroidBelt(count) {
    const belt = [];
    for (let i = 0; i < count; i++) {
      belt.push({
        angle0: Math.random() * Math.PI * 2,
        radius: 205 + Math.random() * 55,
        speed: 0.16 + Math.random() * 0.05,
        size: 0.8 + Math.random() * 1.8,
      });
    }
    return belt;
  }

  function createStarField(count, width, height) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.3 + 0.2,
        a: Math.random() * 0.6 + 0.3,
      });
    }
    return stars;
  }

  const NEBULA_PALETTE = [
    'rgba(120,60,190,ALPHA)',
    'rgba(40,90,170,ALPHA)',
    'rgba(190,60,130,ALPHA)',
  ];

  function createNebulaBlobs(count, width, height) {
    const blobs = [];
    for (let i = 0; i < count; i++) {
      blobs.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 180 + Math.random() * 220,
        color: NEBULA_PALETTE[i % NEBULA_PALETTE.length],
        alpha: 0.05 + Math.random() * 0.06,
        driftX: (Math.random() - 0.5) * 4,
        driftY: (Math.random() - 0.5) * 4,
      });
    }
    return blobs;
  }

  function drawNebula(ctx, width, height, t, blobs) {
    blobs.forEach((b) => {
      const x = b.x + Math.sin(t * 0.01) * b.driftX;
      const y = b.y + Math.cos(t * 0.01) * b.driftY;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, b.r);
      grad.addColorStop(0, b.color.replace('ALPHA', String(b.alpha)));
      grad.addColorStop(1, b.color.replace('ALPHA', '0'));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Draws a real photo texture clipped to a circle, with a directional
  // shading overlay so it reads as a lit sphere rather than a flat sticker.
  // lightAngle points FROM the body TOWARD the light source (the sun).
  function drawTexturedSphere(ctx, img, x, y, radius, lightAngle, lit) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);

    if (lit) {
      const lx = x + Math.cos(lightAngle) * radius * 0.4;
      const ly = y + Math.sin(lightAngle) * radius * 0.4;
      const shade = ctx.createRadialGradient(lx, ly, radius * 0.1, x, y, radius * 1.35);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const FACTS = [
    'Mercury has no atmosphere and swings between extreme heat and cold.',
    'A year on Venus is shorter than one of its days.',
    'Earth is the only planet not named after a mythological god.',
    "Mars' Olympus Mons is the tallest volcano in the solar system.",
    'The asteroid belt holds millions of rocky bodies between Mars and Jupiter.',
    'Jupiter has 95 known moons.',
    "Saturn's rings are made mostly of ice and rock.",
    'A year on Uranus lasts about 84 Earth years.',
    'Neptune has winds that can exceed 2,000 km/h.',
    'The Sun makes up over 99.8% of the mass in our solar system.',
  ];
  const FACT_INTERVAL = 8; // seconds each fact is shown
  const FACT_FADE = 1;     // seconds fading in/out

  const COMET_PERIOD = 95;    // seconds between solitary comets
  const COMET_DURATION = 3.5; // seconds a comet is visible

  const SHOWER_PERIOD = 600;   // seconds between meteor showers
  const SHOWER_DURATION = 12;  // seconds a shower lasts
  const SHOWER_COUNT = 6;      // comets per shower

  const MILESTONE_INTERVAL = 3600; // seconds (1 hour) between milestone banners
  const MILESTONE_DURATION = 6;    // seconds the banner is shown

  const INTRO_DURATION = 6; // seconds the intro title card is shown

  function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function drawSingleComet(ctx, width, height, progress, seed) {
    const sx = width * (0.05 + seededRandom(seed) * 0.25);
    const sy = height * (0.05 + seededRandom(seed + 1) * 0.25);
    const ex = width * (0.7 + seededRandom(seed + 2) * 0.25);
    const ey = height * (0.7 + seededRandom(seed + 3) * 0.25);
    const x = sx + (ex - sx) * progress;
    const y = sy + (ey - sy) * progress;
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    for (let i = 0; i < 12; i++) {
      const tx = x - ux * i * 4;
      const ty = y - uy * i * 4;
      const alpha = (1 - i / 12) * 0.5;
      ctx.beginPath();
      ctx.fillStyle = `rgba(200,230,255,${alpha})`;
      ctx.arc(tx, ty, Math.max(0.5, 2 - i * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawComets(ctx, width, height, t) {
    const showerCyclePos = t % SHOWER_PERIOD;
    if (showerCyclePos < SHOWER_DURATION) {
      const showerIdx = Math.floor(t / SHOWER_PERIOD);
      for (let i = 0; i < SHOWER_COUNT; i++) {
        const seed = showerIdx * 97 + i * 11 + 3;
        const stagger = seededRandom(seed) * SHOWER_DURATION * 0.6;
        const localT = showerCyclePos - stagger;
        if (localT < 0 || localT > 3) continue;
        drawSingleComet(ctx, width, height, localT / 3, seed);
      }
      return;
    }

    const idx = Math.floor(t / COMET_PERIOD);
    const cyclePos = t % COMET_PERIOD;
    if (cyclePos <= COMET_DURATION) {
      drawSingleComet(ctx, width, height, cyclePos / COMET_DURATION, idx * 13.37 + 1);
    }
  }

  function formatDuration(t) {
    const total = Math.max(0, Math.floor(t));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function drawLiveClock(ctx, width, height, t) {
    const text = `LIVE   ${formatDuration(t)}`;
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    let textWidth = 150;
    try { textWidth = ctx.measureText(text).width; } catch (e) { /* headless font fallback */ }
    const boxW = textWidth + 42;
    const boxH = 28;
    const x = width - boxW - 16;
    const y = 16;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, boxW, boxH, 6); } else { ctx.rect(x, y, boxW, boxH); }
    ctx.fill();

    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,60,60,${pulse})`;
    ctx.arc(x + 16, y + boxH / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    try { ctx.fillText(text, x + 28, y + boxH / 2 + 5); } catch (e) { /* skip */ }
    ctx.restore();
  }

  function drawFactTicker(ctx, width, height, t) {
    const idx = Math.floor(t / FACT_INTERVAL) % FACTS.length;
    const cyclePos = t % FACT_INTERVAL;
    let alpha = 1;
    if (cyclePos < FACT_FADE) alpha = cyclePos / FACT_FADE;
    else if (cyclePos > FACT_INTERVAL - FACT_FADE) alpha = (FACT_INTERVAL - cyclePos) / FACT_FADE;

    const barH = 42;
    const y = height - barH;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, y, width, barH);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    try { ctx.fillText(FACTS[idx], width / 2, y + barH / 2 + 5); } catch (e) { /* skip */ }
    ctx.restore();
  }

  function drawMilestoneBanner(ctx, width, height, t) {
    if (t < 30) return; // don't fire right at stream start
    const cyclePos = t % MILESTONE_INTERVAL;
    if (cyclePos > MILESTONE_DURATION) return;

    const hours = Math.round(t / MILESTONE_INTERVAL);
    let alpha = 1;
    if (cyclePos < 1) alpha = cyclePos;
    else if (cyclePos > MILESTONE_DURATION - 1) alpha = MILESTONE_DURATION - cyclePos;

    const text = `\u2728 Live for ${hours} hour${hours > 1 ? 's' : ''}!`;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    let textWidth = 240;
    try { textWidth = ctx.measureText(text).width; } catch (e) { /* skip */ }
    const boxW = textWidth + 48;
    const boxH = 46;
    const x = width / 2 - boxW / 2;
    const y = 60;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, boxW, boxH, 10); } else { ctx.rect(x, y, boxW, boxH); }
    ctx.fill();

    ctx.fillStyle = '#ffe38a';
    try { ctx.fillText(text, width / 2, y + boxH / 2 + 7); } catch (e) { /* skip */ }
    ctx.restore();
  }

  function drawIntroCard(ctx, width, height, t) {
    if (t > INTRO_DURATION) return;
    const fadeOut = Math.max(0, 1 - Math.max(0, t - (INTRO_DURATION - 1)));
    ctx.save();
    ctx.globalAlpha = fadeOut;
    ctx.fillStyle = 'rgba(3,4,12,0.65)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    try { ctx.fillText('Live Solar System Simulation', width / 2, height / 2 - 10); } catch (e) { /* skip */ }
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    try { ctx.fillText('Sun · Planets · Moon · Asteroid Belt · Comets', width / 2, height / 2 + 22); } catch (e) { /* skip */ }
    ctx.restore();
  }

  function drawFrame(ctx, width, height, t, asteroids, stars, nebula, images) {
    const cx = width / 2;
    const cy = height / 2;
    const imgs = images || {};

    ctx.fillStyle = '#03040c';
    ctx.fillRect(0, 0, width, height);

    // subtle camera drift/zoom so it never reads as a frozen frame
    const zoom = 1 + 0.035 * Math.sin(t * 0.05);
    const panX = 18 * Math.sin(t * 0.03);
    const panY = 12 * Math.cos(t * 0.025);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);

    // nebula background
    if (nebula) drawNebula(ctx, width, height, t, nebula);

    // starfield
    stars.forEach((s) => {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // orbit rings (elliptical)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    PLANETS.forEach((p) => {
      const { rx, ry } = orbitRadii(p);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry * FLATTEN, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.ellipse(cx, cy, 230, 230 * FLATTEN, 0, 0, Math.PI * 2);
    ctx.stroke();

    // asteroid belt
    ctx.fillStyle = '#9a9a9a';
    asteroids.forEach((a) => {
      const ang = a.angle0 + t * a.speed;
      const x = cx + Math.cos(ang) * a.radius;
      const y = cy + Math.sin(ang) * a.radius * FLATTEN;
      ctx.beginPath();
      ctx.arc(x, y, a.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // comets / meteor showers
    drawComets(ctx, width, height, t);

    // sun — textured if available, otherwise the glow+core fallback
    const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, 85);
    glow.addColorStop(0, 'rgba(255,235,160,0.9)');
    glow.addColorStop(0.3, 'rgba(255,180,60,0.5)');
    glow.addColorStop(1, 'rgba(255,140,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 85, 0, Math.PI * 2);
    ctx.fill();

    if (imgs.sun) {
      drawTexturedSphere(ctx, imgs.sun, cx, cy, 28, 0, false);
    } else {
      ctx.fillStyle = '#ffdd66';
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    // planets (elliptical orbits + atmosphere halo + optional real texture)
    PLANETS.forEach((p) => {
      const { rx, ry } = orbitRadii(p);
      const ang = t * p.speed;
      const x = cx + Math.cos(ang) * rx;
      const y = cy + Math.sin(ang) * ry * FLATTEN;

      // atmosphere halo
      const halo = ctx.createRadialGradient(x, y, p.size * 0.4, x, y, p.size * 2.2);
      halo.addColorStop(0, p.color);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, p.size * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (p.ring) {
        ctx.strokeStyle = 'rgba(230,210,160,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, p.size * 1.9, p.size * 0.7, 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (imgs[p.name]) {
        const lightAngle = Math.atan2(cy - y, cx - x); // toward the sun
        drawTexturedSphere(ctx, imgs[p.name], x, y, p.size, lightAngle, true);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p.moon) {
        const mang = ang * 6;
        const mx = x + Math.cos(mang) * (p.size + 9);
        const my = y + Math.sin(mang) * (p.size + 9) * FLATTEN;
        ctx.fillStyle = '#cccccc';
        ctx.beginPath();
        ctx.arc(mx, my, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      try {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '13px sans-serif';
        ctx.fillText(p.name, x + p.size + 6, y + 4);
      } catch (e) { /* font may be unavailable headless — safe to skip */ }
    });

    ctx.restore(); // end camera drift/zoom transform

    // fixed overlay — stays sharp and readable regardless of drift/zoom
    drawLiveClock(ctx, width, height, t);
    drawFactTicker(ctx, width, height, t);
    drawMilestoneBanner(ctx, width, height, t);
    drawIntroCard(ctx, width, height, t);
  }

  return {
    WIDTH, HEIGHT, PLANETS, TEXTURE_FILES,
    createAsteroidBelt, createStarField, createNebulaBlobs,
    drawFrame,
  };
}));
