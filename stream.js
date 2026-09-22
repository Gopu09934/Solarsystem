/**
 * Renders the solar system animation frame-by-frame (headless, no browser/GPU
 * needed) and pipes raw video into ffmpeg, which encodes it and pushes it
 * live to YouTube over RTMP.
 *
 * Env vars:
 *   YOUTUBE_STREAM_KEY       (required) - from YouTube Studio > Go Live
 *   STREAM_DURATION_MINUTES  (optional) - how long to stream, default 60
 *   YOUTUBE_API_KEY          (optional) - enables !comet / !planet / !warp / !fact chat commands
 *   YOUTUBE_VIDEO_ID         (optional) - the live video's ID (the part after watch?v= in its URL);
 *                                         required if YOUTUBE_API_KEY is set
 */
const { spawn } = require('child_process');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const {
  WIDTH, HEIGHT, createAsteroidBelt, createStarField, createNebulaBlobs, drawFrame, TEXTURE_FILES,
} = require('./solar-system-core.js');
const { startChatBridge } = require('./chat-bridge.js');

const FPS = 30;
const DURATION_MIN = parseFloat(process.env.STREAM_DURATION_MINUTES || '60');
const STREAM_KEY = process.env.YOUTUBE_STREAM_KEY;
const API_KEY = process.env.YOUTUBE_API_KEY;
const VIDEO_ID = process.env.YOUTUBE_VIDEO_ID;

if (!STREAM_KEY) {
  console.error('Missing YOUTUBE_STREAM_KEY environment variable.');
  process.exit(1);
}

// Bundled font so text renders consistently on any machine, including a
// bare GitHub Actions runner that has no "Barlow" installed system-wide.
try {
  registerFont(path.join(__dirname, 'assets/fonts/Barlow-Regular.ttf'), { family: 'Barlow', weight: 'normal' });
  registerFont(path.join(__dirname, 'assets/fonts/Barlow-SemiBold.ttf'), { family: 'Barlow', weight: 'bold' });
} catch (e) {
  console.log('Could not register bundled font, falling back to system sans-serif.', e.message);
}

// Shared, mutated-in-place state that chat-bridge.js writes to and
// solar-system-core.js reads from every frame. Stays empty (no chat
// commands fire) if YOUTUBE_API_KEY / YOUTUBE_VIDEO_ID aren't set.
const engagement = { chatConnected: false };
if (API_KEY && VIDEO_ID) {
  startChatBridge(engagement, API_KEY, VIDEO_ID);
} else {
  console.log('YOUTUBE_API_KEY / YOUTUBE_VIDEO_ID not set — chat commands disabled, everything else runs as normal.');
}

const RTMP_URL = `rtmp://a.rtmp.youtube.com/live2/${STREAM_KEY}`;

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
const asteroids = createAsteroidBelt(220);
const stars = createStarField(250, WIDTH, HEIGHT);
const nebula = createNebulaBlobs(4, WIDTH, HEIGHT);

// Loads any real planet textures that exist under assets/. Any missing file
// is skipped (not an error) — that planet just renders as a flat-shaded
// circle instead. See assets/README.md for where to get free textures.
async function loadTextures() {
  const images = {};
  const found = [];
  for (const [name, relPath] of Object.entries(TEXTURE_FILES)) {
    const fullPath = path.join(__dirname, relPath);
    try {
      images[name] = await loadImage(fullPath);
      found.push(name);
    } catch (e) {
      // no texture file at that path — fall back to flat color for this body
    }
  }
  if (found.length) {
    console.log(`Loaded real textures for: ${found.join(', ')}`);
  } else {
    console.log('No texture files found under assets/ — using flat-shaded planets. See assets/README.md to add real textures.');
  }
  return images;
}

// Procedurally generated ambient pad — three slow sine tones with a gentle
// LFO swell, one expression per stereo channel for width. This is fully
// synthesized by ffmpeg itself (not a sample or recording), so there's no
// copyright/Content-ID risk, and it beats streaming with silent audio.
const AMBIENT_TONES = '0.05*sin(2*PI*110*t)+0.035*sin(2*PI*164.81*t)+0.025*sin(2*PI*220*t)';
const AMBIENT_L = `(${AMBIENT_TONES})*(0.85+0.15*sin(2*PI*0.03*t))`;
const AMBIENT_R = `(${AMBIENT_TONES})*(0.85+0.15*cos(2*PI*0.03*t))`;
const AMBIENT_SOURCE = `aevalsrc=${AMBIENT_L}|${AMBIENT_R}:s=44100`;

const ffmpegArgs = [
  '-y',
  '-f', 'rawvideo',
  '-pixel_format', 'bgra',        // node-canvas toBuffer('raw') format
  '-video_size', `${WIDTH}x${HEIGHT}`,
  '-framerate', String(FPS),
  '-i', '-',
  '-f', 'lavfi',
  '-i', AMBIENT_SOURCE,
  '-af', 'aecho=0.8:0.9:1000:0.3,lowpass=f=2000,volume=0.5',
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-tune', 'zerolatency',
  '-maxrate', '3000k',
  '-bufsize', '6000k',
  '-pix_fmt', 'yuv420p',
  '-g', String(FPS * 2),
  '-c:a', 'aac',
  '-b:a', '128k',
  '-ar', '44100',
  '-shortest', // stop the (infinite) ambient audio once the video frames end
  '-f', 'flv',
  RTMP_URL,
];

console.log(`Starting ffmpeg -> ${RTMP_URL.replace(STREAM_KEY, '****')}`);
const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

ffmpeg.on('exit', (code) => {
  console.log(`ffmpeg exited with code ${code}`);
  process.exit(code || 0);
});
ffmpeg.on('error', (err) => {
  console.error('Failed to start ffmpeg — is it installed?', err);
  process.exit(1);
});

const totalFrames = Math.floor(DURATION_MIN * 60 * FPS);
const frameIntervalMs = 1000 / FPS;
let frameCount = 0;
let nextFrameTime = Date.now();

console.log(`Rendering ${totalFrames} frames (~${DURATION_MIN} min) at ${FPS}fps, ${WIDTH}x${HEIGHT}`);

function renderLoop() {
  if (frameCount >= totalFrames) {
    console.log('Duration reached, closing stream.');
    ffmpeg.stdin.end();
    return;
  }

  const t = frameCount / FPS;
  drawFrame(ctx, WIDTH, HEIGHT, t, asteroids, stars, nebula, textures, engagement);
  const buffer = canvas.toBuffer('raw'); // raw BGRA pixels
  const canWriteMore = ffmpeg.stdin.write(buffer);
  frameCount++;

  nextFrameTime += frameIntervalMs;
  const delay = Math.max(0, nextFrameTime - Date.now());

  if (canWriteMore) {
    setTimeout(renderLoop, delay);
  } else {
    ffmpeg.stdin.once('drain', () => setTimeout(renderLoop, delay));
  }
}

let textures = {};
(async () => {
  textures = await loadTextures();
  renderLoop();
})();
