const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('spotify provider is restored with a login surface and callable routes', () => {
  const index = read('public', 'index.html');
  const search = read('public', 'js', 'modules', '05-playback', '07-search.js');
  const loginModule = read('public', 'js', 'modules', '08-account', '01-login-modal-utils.js');
  const server = read('server.js');

  // 二改：本仓库按要求恢复 Spotify——前端有登录入口，搜索源可选，服务端不再拦截。
  assert.match(index, /account-add-spotify/);
  assert.match(loginModule, /async function startSpotifyLogin\(\)/);
  assert.match(search, /MUSIC_SEARCH_PROVIDER_ORDER\s*=\s*\[[^\]]*spotify/);
  assert.doesNotMatch(server, /PROVIDER_REMOVED/);
  assert.match(server, /handleSpotifyStatus/);
  assert.match(server, /\/api\/spotify\/oauth\/start/);
  assert.match(server, /\/api\/spotify\/oauth\/callback/);
  assert.match(server, /\/api\/spotify\/user\/playlists/);
  assert.match(server, /\/api\/spotify\/playlist\/tracks/);
});

test('fullscreen DIY control follows the bottom-most visible account pill', () => {
  const source = read('public', 'js', 'modules', '00-state', '02-preferences-ui-modes.js');
  assert.match(source, /querySelectorAll\('\.top-account-pill'\)/);
  assert.match(source, /bounds\.bottom = Math\.max\(bounds\.bottom, rect\.bottom\)/);
  assert.match(source, /top = rect\.bottom \+ gap/);
  assert.match(source, /new ResizeObserver\(scheduleFullscreenDiyLayout\)/);
  assert.match(source, /new MutationObserver\(scheduleFullscreenDiyLayout\)/);
});

test('full-track cinematic analysis waits for playback and retries bounded failures', () => {
  const source = read('public', 'js', 'modules', '03-beat', '00-tempo-worker-cache-prefetch.js');
  assert.match(source, /function queueCurrentTrackAnalysis\(delay\)/);
  assert.match(source, /if \(!audio \|\| audio\.paused\) \{\s*queueCurrentTrackAnalysis\(620\)/);
  assert.match(source, /analysisAttempts\+\+/);
  assert.match(source, /analysisAttempts < 3/);
  assert.match(source, /smoothBeatMapHandoff\(songId, map, token, song \|\| null\)/);
  assert.match(source, /skipMusicTempo: beatAnalysisConfig\.skipMusicTempoWhilePlaying && !audio\.paused/);
});
