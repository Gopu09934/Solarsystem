/**
 * Optional: polls the YouTube Data API for live chat messages and turns
 * !commands into entries on a shared `engagement` state object that
 * solar-system-core.js reads each frame.
 *
 * This is entirely optional. Without YOUTUBE_API_KEY + YOUTUBE_VIDEO_ID set,
 * stream.js never calls startChatBridge and the stream runs exactly as
 * before, just without the chat-triggered extras.
 *
 * Requires only Node's built-in fetch (Node 18+) — no new npm dependency.
 *
 * Auth note: liveChatMessages.list only needs an API key for a public
 * live chat (delete/insert are the calls that need OAuth as the channel
 * owner). So a plain, restricted API key is enough here.
 *
 * Quota note: each poll costs a small number of units against your
 * project's default 10,000-unit daily quota. This module never polls
 * faster than every 8 seconds, and backs off to YouTube's own suggested
 * pollingIntervalMillis when it's longer than that — so an hours-long
 * stream comfortably fits inside the daily quota.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const MIN_POLL_MS = 8000;
const KNOWN_PLANETS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const COOLDOWN_MS = { comet: 4000, shower: 30000, planet: 4000, fact: 5000 };

function properCase(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

async function resolveLiveChatId(apiKey, videoId) {
  const url = `${API_BASE}/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`videos.list failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const item = data.items && data.items[0];
  const chatId = item && item.liveStreamingDetails && item.liveStreamingDetails.activeLiveChatId;
  if (!chatId) throw new Error('No activeLiveChatId — is this video actually live yet?');
  return chatId;
}

function parseCommand(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!')) return null;
  const [cmdRaw, ...rest] = trimmed.slice(1).split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(' ').toLowerCase();
  return { cmd, arg };
}

/**
 * Starts polling. `engagement` is mutated in place; solar-system-core.js
 * reads engagement.comet / .shower / .highlight / .fact / .chatConnected
 * each frame. `logFn` defaults to console.log.
 */
function startChatBridge(engagement, apiKey, videoId, logFn) {
  const log = logFn || console.log;
  const lastFired = {};
  let stopped = false;

  function canFire(kind) {
    const now = Date.now();
    if (lastFired[kind] && now - lastFired[kind] < COOLDOWN_MS[kind]) return false;
    lastFired[kind] = now;
    return true;
  }

  function handleMessage(msg) {
    const text = msg.snippet && msg.snippet.displayMessage;
    if (!text) return;
    const parsed = parseCommand(text);
    if (!parsed) return;
    const { cmd, arg } = parsed;

    if (cmd === 'comet' && canFire('comet')) {
      engagement.comet = { ts: Date.now() };
      log(`[chat] !comet triggered`);
    } else if (cmd === 'warp' && canFire('shower')) {
      engagement.shower = { ts: Date.now() };
      log(`[chat] !warp triggered a meteor shower`);
    } else if (cmd === 'planet' && arg && canFire('planet')) {
      const match = KNOWN_PLANETS.find((p) => p === arg || arg.includes(p));
      if (match) {
        engagement.highlight = { name: properCase(match), ts: Date.now() };
        log(`[chat] !planet ${match} highlighted`);
      }
    } else if (cmd === 'fact' && canFire('fact')) {
      const CONTENT = require('./show-content.js');
      const facts = CONTENT.FACTS;
      const text2 = facts[Math.floor(Math.random() * facts.length)];
      engagement.fact = { text: text2, ts: Date.now() };
      log(`[chat] !fact triggered`);
    }
    // !help and unknown commands are silently ignored — viewers can read
    // the ticker prompts for the command list rather than getting spammed
    // with a bot reply, since posting back requires OAuth we deliberately
    // don't set up here.
  }

  async function pollLoop(liveChatId, pageToken) {
    if (stopped) return;
    try {
      const params = new URLSearchParams({
        liveChatId,
        part: 'snippet,authorDetails',
        key: apiKey,
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(`${API_BASE}/liveChat/messages?${params.toString()}`);
      if (!res.ok) {
        log(`[chat] poll failed: ${res.status} ${await res.text()}`);
        engagement.chatConnected = false;
        setTimeout(() => pollLoop(liveChatId, pageToken), MIN_POLL_MS);
        return;
      }
      const data = await res.json();
      engagement.chatConnected = true;
      (data.items || []).forEach(handleMessage);
      const delay = Math.max(MIN_POLL_MS, data.pollingIntervalMillis || MIN_POLL_MS);
      setTimeout(() => pollLoop(liveChatId, data.nextPageToken), delay);
    } catch (err) {
      log(`[chat] poll error: ${err.message}`);
      engagement.chatConnected = false;
      setTimeout(() => pollLoop(liveChatId, pageToken), MIN_POLL_MS);
    }
  }

  (async () => {
    try {
      const liveChatId = await resolveLiveChatId(apiKey, videoId);
      log(`[chat] connected to live chat ${liveChatId}`);
      pollLoop(liveChatId, null);
    } catch (err) {
      log(`[chat] could not start chat bridge: ${err.message}`);
      engagement.chatConnected = false;
    }
  })();

  return { stop: () => { stopped = true; } };
}

module.exports = { startChatBridge };
