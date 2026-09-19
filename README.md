# Solar System → YouTube Live (via GitHub Actions)

Renders an animated solar system (Sun, 8 planets, a moon, Saturn's rings,
and an asteroid belt) and streams it live to YouTube, entirely on GitHub's
servers — no local machine needs to stay on.

## How it works
- `solar-system-core.js` — the drawing logic, shared by the browser preview and the streamer.
- `index.html` — open this locally in a browser just to preview the animation (no streaming).
- `stream.js` — a Node script that draws each frame headlessly (using the `canvas` package, no GPU/browser needed) and pipes raw video into `ffmpeg`, which encodes it and pushes it to YouTube over RTMP.
- `.github/workflows/youtube-stream.yml` — a GitHub Actions workflow that installs everything and runs `stream.js` on a GitHub-hosted runner.

## Engagement features baked in
- **Ambient audio** — `stream.js` has `ffmpeg` synthesize a soft, evolving pad (layered sine tones + a slow LFO swell + reverb) directly, so the stream is never silent. It's generated, not sampled, so there's no copyright/Content-ID risk. Tweak the `AMBIENT_TONES` / `-af` filter values in `stream.js` to change the sound.
- **Real planet textures (optional)** — drop real photo textures into `assets/` (see `assets/README.md` for exact filenames and free, properly licensed sources) and each planet renders as a lit, textured sphere instead of a flat circle. Any planet with no texture file just falls back to flat-shaded automatically — nothing breaks if you skip this.
- **Elliptical orbits** — each planet has an `ecc` (eccentricity) value in `solar-system-core.js` for a more realistic, less "circle stack" look.
- **Nebula background** — soft drifting color clouds behind the starfield. Tune `createNebulaBlobs(count, ...)` count/palette in `solar-system-core.js`.
- **Planet atmosphere halos** — a soft glow around each planet in its own color (shows even without a real texture).
- **Fact ticker** — a rotating astronomy fact fades in/out along the bottom every 8 seconds. Edit the `FACTS` array to change or add facts.
- **Live "running for" clock** — a pulsing LIVE badge with elapsed time, top-right.
- **Comets** — a comet with a fading tail crosses the frame roughly every 95 seconds. Tune `COMET_PERIOD` / `COMET_DURATION`.
- **Meteor showers** — every 10 minutes, a burst of ~6 comets crosses the screen together as a rare "event" moment. Tune `SHOWER_PERIOD` / `SHOWER_DURATION` / `SHOWER_COUNT`.
- **Milestone callouts** — a banner flashes "✨ Live for N hours!" once an hour. Tune `MILESTONE_INTERVAL`.
- **Intro title card** — the first 6 seconds of each run show a title/subtitle overlay. Tune `INTRO_DURATION`.
- **Camera drift/zoom** — a slow, subtle pan and zoom on the whole scene so it never looks like a static frozen image.
- **Auto-retry on crash** — the GitHub Actions step now retries `node stream.js` up to 5 times (10s apart) if `ffmpeg`/the RTMP connection dies mid-run, instead of ending the job on the first hiccup.

## One-time setup

1. **Create a GitHub repo** and push all these files to it (keep the `.github/workflows/` folder).

2. **Get a YouTube stream key**
   - Go to YouTube Studio → *Create* → *Go live*.
   - Choose "Stream" (not webcam). YouTube will give you a **Stream key**.
   - Tip: enabling a "Persistent stream" for this stream key makes it easier to reconnect after each GitHub job restarts.

3. **Add the key as a GitHub secret**
   - In your repo: Settings → Secrets and variables → Actions → New repository secret.
   - Name: `YOUTUBE_STREAM_KEY`
   - Value: the stream key from YouTube Studio.

## Running it

1. Go to the **Actions** tab of your repo → "Stream Solar System to YouTube" → **Run workflow**.
2. Optionally set `duration_minutes` (default 60).
3. Open YouTube Studio → your stream should go live within ~30-60 seconds.

## Important limits to know

- **GitHub Actions job limit is 6 hours** (360 minutes) per run on GitHub-hosted runners. `duration_minutes` above ~350 will get cut off by the job timeout, not by the script.
- To stream **longer than 6 hours continuously**, uncomment the `schedule:` block in `youtube-stream.yml` (set to fire every ~5h50m) so a fresh job keeps reconnecting to the same YouTube stream key. There will be a brief gap (a minute or two) between runs while `ffmpeg` restarts — this is a GitHub limitation, not something the script can avoid.
- Free/public repos get more included Actions minutes than private ones — long-running streams will consume your Actions minutes quota, so check your plan's limits.

## Testing locally (optional)

```bash
npm install
YOUTUBE_STREAM_KEY=your_key_here STREAM_DURATION_MINUTES=2 node stream.js
```

Requires `ffmpeg` installed locally (`apt install ffmpeg`, `brew install ffmpeg`, etc).

## Customizing

Edit `solar-system-core.js`:
- `PLANETS` array — orbit radius, size, color, speed per planet.
- `createAsteroidBelt(count)` — number/spread of asteroids.
- `WIDTH` / `HEIGHT` — resolution (larger = more CPU to render each frame; 1280x720 is a safe default for a free GitHub runner).
