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
 *
 * Engagement content (facts, quiz questions, planet stat cards, chat
 * prompts) lives in show-content.js, not here — see that file to edit
 * words without touching drawing code. In the browser, load
 * show-content.js with a <script> tag before this file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./show-content.js'));
  } else {
    root.SolarSystemCore = factory(root.SolarShowContent);
  }
}(typeof self !== 'undefined' ? self : this, function (CONTENT) {

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

  // Cycling order for the planet-spotlight card. Starts with the Sun.
  const SPOTLIGHT_ORDER = ['Sun', ...PLANETS.map((p) => p.name)];

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

  const FACT_INTERVAL = 8; // seconds each ticker item is shown
  const FACT_FADE = 1;     // seconds fading in/out

  const COMET_PERIOD = 95;    // seconds between solitary comets
  const COMET_DURATION = 3.5; // seconds a comet is visible

  const SHOWER_PERIOD = 600;   // seconds between meteor showers
  const SHOWER_DURATION = 12;  // seconds a shower lasts
  const SHOWER_COUNT = 6;      // comets per shower

  const MILESTONE_INTERVAL = 3600; // seconds (1 hour) between milestone banners
  const MILESTONE_DURATION = 6;    // seconds the banner is shown

  const INTRO_DURATION = 6; // seconds the intro title card is shown

  const QUIZ_INTERVAL = 150;   // seconds between quiz rounds
  const QUIZ_QUESTION_DURATION = 40; // seconds the question is shown
  const QUIZ_REVEAL_DURATION = 8;    // seconds the answer is shown after

  const SPOTLIGHT_INTERVAL = 40; // seconds each body's info card is shown

  const TRIGGERED_COMET_DURATION_MS = 3200;
  const TRIGGERED_SHOWER_DURATION_MS = 6500;
  const HIGHLIGHT_DURATION_MS = 6000;
  const FORCED_FACT_DURATION_MS = 7000;

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

  // A single bright, gold-tinted comet used for viewer-triggered !comet
  // events, so it reads as distinct from the ambient background comets.
  function drawTriggeredComet(ctx, width, height, progress, seed) {
    const sx = width * (0.1 + seededRandom(seed) * 0.2);
    const sy = height * (0.75 + seededRandom(seed + 1) * 0.15);
    const ex = width * (0.75 + seededRandom(seed + 2) * 0.2);
    const ey = height * (0.05 + seededRandom(seed + 3) * 0.15);
    const x = sx + (ex - sx) * progress;
    const y = sy + (ey - sy) * progress;
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    for (let i = 0; i < 18; i++) {
      const tx = x - ux * i * 5;
      const ty = y - uy * i * 5;
      const alpha = (1 - i / 18) * 0.65;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,215,140,${alpha})`;
      ctx.arc(tx, ty, Math.max(0.6, 3 - i * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = '#fff6dd';
    ctx.arc(x, y, 3, 0, Math.PI * 2);
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

  // Viewer-triggered extras. `engagement` timestamps are wall-clock ms
  // (Date.now()), independent of the animation clock `t`, so a command
  // lands within a second or two of being typed in chat regardless of how
  // long the stream has been running.
  function drawTriggeredEvents(ctx, width, height, engagement) {
    if (!engagement) return;
    const now = Date.now();

    if (engagement.comet && now - engagement.comet.ts < TRIGGERED_COMET_DURATION_MS) {
      const age = now - engagement.comet.ts;
      drawTriggeredComet(ctx, width, height, Math.min(1, age / (TRIGGERED_COMET_DURATION_MS - 400)),
        Math.floor(engagement.comet.ts / 37));
    }

    if (engagement.shower && now - engagement.shower.ts < TRIGGERED_SHOWER_DURATION_MS) {
      const age = now - engagement.shower.ts;
      const seedBase = Math.floor(engagement.shower.ts / 41);
      for (let i = 0; i < 8; i++) {
        const stagger = seededRandom(seedBase + i * 7) * (TRIGGERED_SHOWER_DURATION_MS - 2500);
        const localAge = age - stagger;
        if (localAge < 0 || localAge > 2200) continue;
        drawTriggeredComet(ctx, width, height, localAge / 2000, seedBase + i * 7);
      }
    }
  }

  function drawLiveChatBadge(ctx, width, height, engagement) {
    // Small dot near the fact ticker so viewers know commands are live —
    // only shown when a chat bridge is actually connected, never a fake claim.
    if (!engagement || !engagement.chatConnected) return;
    ctx.save();
    ctx.font = '12px "Barlow", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(120,255,170,0.9)';
    try { ctx.fillText('● chat commands live', 14, height - 50); } catch (e) { /* skip */ }
    ctx.restore();
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
    ctx.font = 'bold 14px "Barlow", sans-serif';
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

  // Builds the sequence of ticker items once: astronomy facts with a
  // generic engagement prompt woven in every few items. If a chat bridge is
  // connected, chat-specific prompts (!comet, !planet, ...) are woven in
  // too — those never appear for viewers who have no way to act on them.
  let tickerItemsCache = null;
  let tickerItemsCacheChat = null;
  function getTickerItems(chatEnabled) {
    if (tickerItemsCache && tickerItemsCacheChat === chatEnabled) return tickerItemsCache;
    const facts = CONTENT.FACTS;
    const generic = CONTENT.PROMPTS_GENERIC;
    const chatPrompts = chatEnabled ? CONTENT.PROMPTS_CHAT : [];
    const prompts = generic.concat(chatPrompts);
    const items = [];
    let pi = 0;
    facts.forEach((f, i) => {
      items.push({ text: f, kind: 'fact' });
      if ((i + 1) % 3 === 0 && prompts.length) {
        items.push({ text: prompts[pi % prompts.length], kind: 'prompt' });
        pi++;
      }
    });
    tickerItemsCache = items;
    tickerItemsCacheChat = chatEnabled;
    return items;
  }

  function drawFactTicker(ctx, width, height, t, engagement) {
    const barH = 42;
    const y = height - barH;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, y, width, barH);

    // A viewer-triggered !fact command briefly overrides the normal cycle.
    const forced = engagement && engagement.fact && (Date.now() - engagement.fact.ts < FORCED_FACT_DURATION_MS);
    let label = null;
    let alpha = 1;

    if (forced) {
      label = `\u{1F320} ${engagement.fact.text}`;
      const age = Date.now() - engagement.fact.ts;
      const remaining = FORCED_FACT_DURATION_MS - age;
      if (remaining < 800) alpha = remaining / 800;
    } else {
      const items = getTickerItems(!!(engagement && engagement.chatConnected));
      const idx = Math.floor(t / FACT_INTERVAL) % items.length;
      const cyclePos = t % FACT_INTERVAL;
      const item = items[idx];
      label = item.kind === 'prompt' ? `\u{1F4AC} ${item.text}` : item.text;
      if (cyclePos < FACT_FADE) alpha = cyclePos / FACT_FADE;
      else if (cyclePos > FACT_INTERVAL - FACT_FADE) alpha = (FACT_INTERVAL - cyclePos) / FACT_FADE;
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = forced ? '#ffe38a' : '#e5e7eb';
    ctx.font = '14px "Barlow", sans-serif';
    ctx.textAlign = 'center';
    try { ctx.fillText(label, width / 2, y + barH / 2 + 5); } catch (e) { /* skip */ }
    ctx.restore();

    drawLiveChatBadge(ctx, width, height, engagement);
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
    ctx.font = 'bold 22px "Barlow", sans-serif';
    ctx.textAlign = 'center';
    let textWidth = 240;
    try { textWidth = ctx.measureText(text).width; } catch (e) { /* skip */ }
    const boxW = textWidth + 48;
    const boxH = 46;
    const x = width / 2 - boxW / 2;
    const y = 56;

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
    ctx.font = 'bold 34px "Barlow", sans-serif';
    try { ctx.fillText('Live Solar System Simulation', width / 2, height / 2 - 18); } catch (e) { /* skip */ }
    ctx.font = '16px "Barlow", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    try { ctx.fillText('Sun \u00B7 Planets \u00B7 Moon \u00B7 Asteroid Belt \u00B7 Comets', width / 2, height / 2 + 14); } catch (e) { /* skip */ }
    ctx.font = '14px "Barlow", sans-serif';
    ctx.fillStyle = '#9fb2c8';
    try { ctx.fillText('Say hello in the chat \u2014 a quiz round starts every few minutes', width / 2, height / 2 + 40); } catch (e) { /* skip */ }
    ctx.restore();
  }

  // --- Quiz overlay -----------------------------------------------------
  // Cycles through CONTENT.QUIZ on a fixed clock (QUIZ_INTERVAL), shown to
  // everyone so it works in the plain browser preview too, with no chat
  // dependency. If a chat bridge is connected, "Answer in the chat" is a
  // real instruction; if not, it reads as a beat-the-clock prompt instead.
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawQuiz(ctx, width, height, t, chatConnected) {
    const quiz = CONTENT.QUIZ;
    if (!quiz || !quiz.length) return;
    const cyclePos = t % QUIZ_INTERVAL;
    const roundIdx = Math.floor(t / QUIZ_INTERVAL) % quiz.length;
    const q = quiz[roundIdx];
    const letters = ['A', 'B', 'C', 'D'];

    const inQuestion = cyclePos < QUIZ_QUESTION_DURATION;
    const inReveal = !inQuestion && cyclePos < QUIZ_QUESTION_DURATION + QUIZ_REVEAL_DURATION;
    if (!inQuestion && !inReveal) return;

    let alpha = 1;
    const FADE = 0.6;
    if (inQuestion) {
      if (cyclePos < FADE) alpha = cyclePos / FADE;
      else if (cyclePos > QUIZ_QUESTION_DURATION - FADE) alpha = (QUIZ_QUESTION_DURATION - cyclePos) / FADE;
    } else {
      const revealPos = cyclePos - QUIZ_QUESTION_DURATION;
      if (revealPos < FADE) alpha = revealPos / FADE;
      else if (revealPos > QUIZ_REVEAL_DURATION - FADE) alpha = (QUIZ_REVEAL_DURATION - revealPos) / FADE;
    }

    const panelW = 460;
    const x = width / 2 - panelW / 2;
    const y = 108;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'left';

    if (inQuestion) {
      ctx.font = 'bold 13px "Barlow", sans-serif';
      const eyebrow = chatConnected ? 'QUIZ \u2014 ANSWER IN THE CHAT' : 'QUIZ \u2014 GUESS BEFORE THE CLOCK RUNS OUT';
      let eyebrowW = 200;
      try { eyebrowW = ctx.measureText(eyebrow).width; } catch (e) { /* skip */ }

      ctx.font = '15px "Barlow", sans-serif';
      const qLines = wrapText(ctx, q.q, panelW - 32);
      const optLineH = 22;
      const panelH = 34 + qLines.length * 22 + q.options.length * optLineH + 16;

      ctx.fillStyle = 'rgba(8,10,22,0.72)';
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x, y, panelW, panelH, 10); } else { ctx.rect(x, y, panelW, panelH); }
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,170,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#8cb8ff';
      ctx.font = 'bold 12px "Barlow", sans-serif';
      try { ctx.fillText(eyebrow, x + 16, y + 22); } catch (e) { /* skip */ }

      ctx.fillStyle = '#ffffff';
      ctx.font = '15px "Barlow", sans-serif';
      let ly = y + 44;
      qLines.forEach((line) => {
        try { ctx.fillText(line, x + 16, ly); } catch (e) { /* skip */ }
        ly += 22;
      });

      ly += 6;
      q.options.forEach((opt, i) => {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(x + 16, ly - 15, 22, 22, 5); } else { ctx.rect(x + 16, ly - 15, 22, 22); }
        ctx.fill();
        ctx.fillStyle = '#cfe0ff';
        ctx.font = 'bold 13px "Barlow", sans-serif';
        try { ctx.fillText(letters[i], x + 22, ly + 1); } catch (e) { /* skip */ }
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '14px "Barlow", sans-serif';
        try { ctx.fillText(opt, x + 46, ly + 1); } catch (e) { /* skip */ }
        ly += optLineH;
      });
    } else {
      const answerLetter = letters[q.answer];
      const answerText = q.options[q.answer];
      ctx.font = '14px "Barlow", sans-serif';
      const whyLines = wrapText(ctx, q.why, panelW - 32);
      const panelH = 62 + whyLines.length * 20;

      ctx.fillStyle = 'rgba(8,10,22,0.72)';
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x, y, panelW, panelH, 10); } else { ctx.rect(x, y, panelW, panelH); }
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,255,170,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#8effb0';
      ctx.font = 'bold 16px "Barlow", sans-serif';
      try { ctx.fillText(`\u2705 ${answerLetter}. ${answerText}`, x + 16, y + 26); } catch (e) { /* skip */ }

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px "Barlow", sans-serif';
      let ly = y + 48;
      whyLines.forEach((line) => {
        try { ctx.fillText(line, x + 16, ly); } catch (e) { /* skip */ }
        ly += 20;
      });
    }

    ctx.restore();
  }

  // --- Planet spotlight card ---------------------------------------------
  function drawSpotlight(ctx, width, height, t) {
    const order = SPOTLIGHT_ORDER;
    const info = CONTENT.BODY_INFO;
    if (!order.length) return;
    const idx = Math.floor(t / SPOTLIGHT_INTERVAL) % order.length;
    const name = order[idx];
    const body = info[name];
    if (!body) return;
    const cyclePos = t % SPOTLIGHT_INTERVAL;

    let alpha = 1;
    const FADE = 0.6;
    if (cyclePos < FADE) alpha = cyclePos / FADE;
    else if (cyclePos > SPOTLIGHT_INTERVAL - FADE) alpha = (SPOTLIGHT_INTERVAL - cyclePos) / FADE;

    const panelW = 246;
    const rows = body.rows;
    const rowH = 17;
    const panelH = 78 + rows.length * rowH;
    const x = 16;
    const y = height - 42 - 16 - panelH;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(8,10,22,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, panelW, panelH, 10); } else { ctx.rect(x, y, panelW, panelH); }
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,140,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe38a';
    ctx.font = 'bold 12px "Barlow", sans-serif';
    try { ctx.fillText('NOW FEATURING', x + 14, y + 20); } catch (e) { /* skip */ }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Barlow", sans-serif';
    try { ctx.fillText(name, x + 14, y + 42); } catch (e) { /* skip */ }

    ctx.fillStyle = '#9fb2c8';
    ctx.font = '12px "Barlow", sans-serif';
    try { ctx.fillText(body.kind, x + 14, y + 58); } catch (e) { /* skip */ }

    ctx.font = '12px "Barlow", sans-serif';
    let ry = y + 78;
    rows.forEach(([label, value]) => {
      ctx.fillStyle = '#8a9bb0';
      try { ctx.fillText(label, x + 14, ry); } catch (e) { /* skip */ }
      ctx.fillStyle = '#e5e7eb';
      ctx.textAlign = 'right';
      try { ctx.fillText(value, x + panelW - 14, ry); } catch (e) { /* skip */ }
      ctx.textAlign = 'left';
      ry += rowH;
    });

    ctx.restore();
  }

  function drawFrame(ctx, width, height, t, asteroids, stars, nebula, images, engagement) {
    const cx = width / 2;
    const cy = height / 2;
    const imgs = images || {};
    const eng = engagement || {};

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

    // comets / meteor showers (ambient + viewer-triggered)
    drawComets(ctx, width, height, t);
    drawTriggeredEvents(ctx, width, height, eng);

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
    const highlight = eng.highlight && (Date.now() - eng.highlight.ts < HIGHLIGHT_DURATION_MS) ? eng.highlight.name : null;

    PLANETS.forEach((p) => {
      const { rx, ry } = orbitRadii(p);
      const ang = t * p.speed;
      const x = cx + Math.cos(ang) * rx;
      const y = cy + Math.sin(ang) * ry * FLATTEN;
      const isHighlighted = highlight === p.name;

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

      // pulsing ring for a viewer-requested !planet highlight
      if (isHighlighted) {
        const age = Date.now() - eng.highlight.ts;
        const pulse = 0.5 + 0.5 * Math.sin(age * 0.008);
        ctx.strokeStyle = `rgba(255,225,140,${0.5 + 0.4 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 2.6 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
      }

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
        ctx.fillStyle = isHighlighted ? '#ffe38a' : 'rgba(255,255,255,0.8)';
        ctx.font = `${isHighlighted ? 'bold ' : ''}13px "Barlow", sans-serif`;
        ctx.fillText(isHighlighted ? `\u2605 ${p.name}` : p.name, x + p.size + 6, y + 4);
      } catch (e) { /* font may be unavailable headless — safe to skip */ }
    });

    ctx.restore(); // end camera drift/zoom transform

    // fixed overlay — stays sharp and readable regardless of drift/zoom
    drawLiveClock(ctx, width, height, t);
    // Quiz panel and spotlight card wait until the intro card has cleared,
    // so a viewer's first few seconds aren't three overlapping text blocks.
    if (t > INTRO_DURATION) {
      drawSpotlight(ctx, width, height, t);
      drawQuiz(ctx, width, height, t, !!eng.chatConnected);
    }
    drawFactTicker(ctx, width, height, t, eng);
    drawMilestoneBanner(ctx, width, height, t);
    drawIntroCard(ctx, width, height, t);
  }

  return {
    WIDTH, HEIGHT, PLANETS, TEXTURE_FILES,
    createAsteroidBelt, createStarField, createNebulaBlobs,
    drawFrame,
  };
}));
