# Solar System → YouTube Live (via GitHub Actions)

Renders an animated solar system (Sun, 8 planets, a moon, Saturn's rings,
and an asteroid belt) and streams it live to YouTube, entirely on GitHub's
servers — no local machine needs to stay on.

## How it works
- `solar-system-core.js` — the drawing logic, shared by the browser preview and the streamer.
- `show-content.js` — every word the stream shows: astronomy facts, quiz questions, planet stat cards, chat prompts. Edit this file to change what's said without touching any drawing code.
- `chat-bridge.js` — optional: polls YouTube's live chat and turns `!comet` / `!planet` / `!warp` / `!fact` into on-screen events. Only runs if you set the API key + video ID below; otherwise the stream runs exactly the same without it.
- `index.html` — open this locally in a browser just to preview the animation (no streaming).
- `stream.js` — a Node script that draws each frame headlessly (using the `canvas` package, no GPU/browser needed) and pipes raw video into `ffmpeg`, which encodes it and pushes it to YouTube over RTMP.
- `.github/workflows/youtube-stream.yml` — a GitHub Actions workflow that installs everything and runs `stream.js` on a GitHub-hosted runner.

## Engagement features baked in

**Always on, no setup required:**
- **Quiz rounds** — every 2.5 minutes, a question panel appears for 40 seconds ("Which planet has the most moons?" with A–D options), then reveals the answer with a one-line explanation for 8 seconds. 20 questions cycle before repeating. Edit the `QUIZ` array in `show-content.js` to add or change questions.
- **Planet spotlight card** — a stat card (width, day length, year length, moons, temperature) cycles through the Sun and all 8 planets, one every 40 seconds, bottom-left. Edit `BODY_INFO` in `show-content.js`.
- **Fact + prompt ticker** — astronomy facts and engagement prompts ("Which planet would you live on? Tell us in the chat.") alternate along the bottom every 8 seconds. Edit `FACTS` / `PROMPTS_GENERIC` in `show-content.js`.
- **Ambient audio** — `stream.js` has `ffmpeg` synthesize a soft, evolving pad (layered sine tones + a slow LFO swell + reverb) directly, so the stream is never silent. It's generated, not sampled, so there's no copyright/Content-ID risk. Tweak the `AMBIENT_TONES` / `-af` filter values in `stream.js` to change the sound.
- **Real planet textures (optional)** — drop real photo textures into `assets/` (see `assets/README.md` for exact filenames and free, properly licensed sources) and each planet renders as a lit, textured sphere instead of a flat circle. Any planet with no texture file just falls back to flat-shaded automatically — nothing breaks if you skip this.
- **Elliptical orbits** — each planet has an `ecc` (eccentricity) value in `solar-system-core.js` for a more realistic, less "circle stack" look.
- **Nebula background** — soft drifting color clouds behind the starfield. Tune `createNebulaBlobs(count, ...)` count/palette in `solar-system-core.js`.
- **Planet atmosphere halos** — a soft glow around each planet in its own color (shows even without a real texture).
- **Live "running for" clock** — a pulsing LIVE badge with elapsed time, top-right.
- **Comets** — a comet with a fading tail crosses the frame roughly every 95 seconds. Tune `COMET_PERIOD` / `COMET_DURATION`.
- **Meteor showers** — every 10 minutes, a burst of ~6 comets crosses the screen together as a rare "event" moment. Tune `SHOWER_PERIOD` / `SHOWER_DURATION` / `SHOWER_COUNT`.
- **Milestone callouts** — a banner flashes "✨ Live for N hours!" once an hour. Tune `MILESTONE_INTERVAL`.
- **Intro title card** — the first 6 seconds of each run show a title/subtitle overlay; the quiz and spotlight cards wait until it clears so nothing overlaps. Tune `INTRO_DURATION`.
- **Camera drift/zoom** — a slow, subtle pan and zoom on the whole scene so it never looks like a static frozen image.
- **Auto-retry on crash** — the GitHub Actions step now retries `node stream.js` up to 5 times (10s apart) if `ffmpeg`/the RTMP connection dies mid-run, instead of ending the job on the first hiccup.

**Optional — live chat commands (viewers can trigger things on screen):**
- `!comet` — launches an extra gold comet across the sky.
- `!planet mars` (or any planet name) — draws a pulsing ring around that planet for 6 seconds.
- `!warp` — triggers an on-demand meteor shower.
- `!fact` — pulls up a random fact immediately, overriding the ticker for 7 seconds.

These only activate if you set `YOUTUBE_API_KEY` and `YOUTUBE_VIDEO_ID` — see setup below. Without them the stream runs exactly as it did before, just without anyone being able to trigger these. When they're on, a small "chat commands live" indicator appears near the bottom-left so viewers know it's real, not decoration.

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

4. **(Optional) Enable live chat commands (`!comet`, `!planet`, `!warp`, `!fact`)**
   - In the [Google Cloud Console](https://console.cloud.google.com/), create a project (or reuse one), enable the **YouTube Data API v3**, then create an **API key** under *Credentials*. Restrict it to the YouTube Data API v3 so it can't be used for anything else.
   - Add it as a GitHub secret named `YOUTUBE_API_KEY`.
   - You do **not** need OAuth for this — reading public live chat messages only needs an API key; only posting/deleting messages needs OAuth, and this project never does either.
   - You don't set the video ID as a secret — you'll paste it into the `video_id` workflow input each time you start a stream (see below), since it's only known once you've actually gone live.
   - **Quota**: this polls at most every 8 seconds and backs off to YouTube's own suggested interval when it's longer. That's well inside the default 10,000-unit daily quota for a multi-hour stream.

## Running it

1. Go to YouTube Studio → *Create* → *Go live*, start the broadcast, and copy the video ID from its URL (`youtube.com/watch?v=`**`VIDEO_ID`**).
2. Go to the **Actions** tab of your repo → "Stream Solar System to YouTube" → **Run workflow**.
3. Optionally set `duration_minutes` (default 60) and, if you set up chat commands above, paste the `video_id` from step 1.
4. Open YouTube Studio → your stream should go live within ~30-60 seconds. If you set a `video_id`, try typing `!comet` in your own chat to confirm commands are working.

## Important limits to know

- **GitHub Actions job limit is 6 hours** (360 minutes) per run on GitHub-hosted runners. `duration_minutes` above ~350 will get cut off by the job timeout, not by the script.
- To stream **longer than 6 hours continuously**, uncomment the `schedule:` block in `youtube-stream.yml` (set to fire every ~5h50m) so a fresh job keeps reconnecting to the same YouTube stream key. There will be a brief gap (a minute or two) between runs while `ffmpeg` restarts — this is a GitHub limitation, not something the script can avoid.
- Free/public repos get more included Actions minutes than private ones — long-running streams will consume your Actions minutes quota, so check your plan's limits.

## Testing locally (optional)

```bash
npm install
YOUTUBE_STREAM_KEY=your_key_here STREAM_DURATION_MINUTES=2 node stream.js
```

To also test chat commands locally, add `YOUTUBE_API_KEY=your_api_key YOUTUBE_VIDEO_ID=your_live_video_id` to that same command.

Requires `ffmpeg` installed locally (`apt install ffmpeg`, `brew install ffmpeg`, etc).

## Customizing

Edit `show-content.js` for anything you'd say, not draw:
- `FACTS` — astronomy facts shown in the bottom ticker.
- `QUIZ` — quiz questions, options, correct answer index, and the one-line explanation shown on reveal.
- `BODY_INFO` — the Sun/planet stat cards (width, day length, year length, moons, temperature).
- `PROMPTS_GENERIC` / `PROMPTS_CHAT` — engagement prompts woven into the ticker; the `_CHAT` ones only ever show once live chat commands are actually connected.

Edit `solar-system-core.js` for how things look or time out:
- `PLANETS` array — orbit radius, size, color, speed per planet.
- `createAsteroidBelt(count)` — number/spread of asteroids.
- `WIDTH` / `HEIGHT` — resolution (larger = more CPU to render each frame; 1280x720 is a safe default for a free GitHub runner).
- `QUIZ_INTERVAL` / `QUIZ_QUESTION_DURATION` / `QUIZ_REVEAL_DURATION` — quiz pacing.
- `SPOTLIGHT_INTERVAL` — how long each planet stat card stays up.
