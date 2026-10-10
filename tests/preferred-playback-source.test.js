const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appRoot = path.resolve(__dirname, '..');
const modulePath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '12a-preferred-playback-source.js');
const moduleText = fs.readFileSync(modulePath, 'utf8');
const startPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js');
const startText = fs.readFileSync(startPath, 'utf8');
const loaderPath = path.join(appRoot, 'public', 'js', 'index-loader.js');
const loaderText = fs.readFileSync(loaderPath, 'utf8');

function song(provider, id, name, artist) {
  return { provider: provider, id: id, name: name, artist: artist };
}

function createStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    _map: map,
  };
}

function createSandbox(options) {
  options = options || {};
  const queue = options.queue || [];
  const calls = [];
  const toasts = [];
  const notices = [];
  const statuses = Object.assign({
    netease: { loggedIn: true },
    qq: { loggedIn: true, playbackKeyReady: true },
    kugou: { loggedIn: true, playbackKeyReady: true },
    qishui: { loggedIn: true },
    spotify: { loggedIn: true },
  }, options.statuses || {});

  const sandbox = {
    console,
    Promise,
    Date,
    Object,
    Array,
    Math,
    Number,
    String,
    JSON,
    isFinite,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    localStorage: createStorage(),
    document: {
      _elements: {},
      getElementById(id) { return sandbox.document._elements[id] || null; },
      createElement() {
        return {
          id: '', className: '', style: {}, textContent: '', innerHTML: '',
          children: [],
          setAttribute() { },
          appendChild() { },
          addEventListener() { },
          classList: { add() { }, remove() { }, toggle() { } },
        };
      },
      addEventListener() { },
      body: { appendChild() { } },
    },
    window: { innerWidth: 1280, innerHeight: 800, addEventListener() { } },
    escHtml(value) { return String(value == null ? '' : value); },
    normalizePlaybackProvider(provider) {
      return ['qq', 'kugou', 'qishui', 'spotify'].indexOf(provider) >= 0 ? provider : 'netease';
    },
    songProviderKey(item) { return (item && item.provider) || 'netease'; },
    queueItemKey(item) { return ((item && item.provider) || 'netease') + ':' + ((item && (item.id || item.mid)) || ''); },
    cloneSong(item) { return Object.assign({}, item); },
    hydrateCustomCover(item) { return Object.assign({}, item); },
    sourceCandidateRejectReason(source, candidate) {
      const norm = value => String(value || '').toLowerCase().replace(/\s+/g, '');
      if (norm(source.name) !== norm(candidate.name)) return 'title_mismatch';
      if (norm(source.artist) !== norm(candidate.artist)) return 'artist_mismatch';
      return '';
    },
    scoreSongSearchResult() { return 100; },
    isSameTitleArtist(a, b) { return !!a && !!b && a.name === b.name && a.artist === b.artist; },
    platformMeta(provider) {
      return {
        key: provider,
        short: provider === 'qq' ? 'QQ' : (provider === 'kugou' ? 'KG' : (provider === 'qishui' ? 'QS' : (provider === 'spotify' ? 'SP' : 'NE'))),
        label: provider === 'qq' ? 'QQ音乐' : '网易云音乐',
      };
    },
    platformStatus(provider) { return statuses[provider] || { loggedIn: false }; },
    apiJson: options.apiJson || (async function () { return { songs: [] }; }),
    safeRenderQueuePanel() { },
    safeShelfRebuild() { },
    updateControlTrackInfo() { },
    showToast(message) { toasts.push(message); },
    showSourceFallbackNotice(title, body) { notices.push({ title: title, body: body }); },
    alternatePlaybackProviders() { return options.alternateProviders || []; },
    searchAlternatePlatformSong(song, provider) {
      if (!options.alternateMatch) return null;
      return options.alternateMatch(provider, song);
    },
    switchCurrentSongSource: options.switchCurrentSongSource || (async function () { return true; }),
    currentControlSong() { return queue[sandbox.currentIdx] || null; },
    playQueue: queue,
    currentIdx: 0,
    trackSwitchToken: 7,
    miniQueueOpen: false,
    calls,
    toasts,
    notices,
  };
  if (options.preference) {
    sandbox.localStorage.setItem('mineradio-playback-source-preference', options.preference);
  }
  vm.runInNewContext(moduleText, sandbox, { filename: modulePath });
  return sandbox;
}

async function testPreferencePersists() {
  const sb = createSandbox();
  assert.strictEqual(sb['preferredPlaybackProvider'], 'auto', '默认应为自动音源');
  sb['lockPreferredPlaybackSource']('qq');
  assert.strictEqual(sb['preferredPlaybackProvider'], 'qq');
  assert.strictEqual(sb.localStorage.getItem('mineradio-playback-source-preference'), 'qq', '选择应写入 localStorage');
  sb['setPreferredPlaybackSource']('auto');
  await Promise.resolve();
  assert.strictEqual(sb['preferredPlaybackProvider'], 'auto');
  assert.strictEqual(sb.localStorage.getItem('mineradio-playback-source-preference'), 'auto');
  assert.ok(sb.toasts.some(text => String(text).indexOf('自动') >= 0), '切回自动应给出提示');
}

async function testRestoresSavedPreference() {
  const sb = createSandbox({ preference: 'qq' });
  assert.strictEqual(sb['preferredPlaybackProvider'], 'qq', '重启后应读回保存的播放源');
  assert.strictEqual(sb['readPreferredPlaybackProviderPreference'](), 'qq');
  assert.strictEqual(sb['preferredPlaybackProviderActive'](), true);
}

async function testAutoProviderDoesNotTouchQueue() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦')];
  let calls = 0;
  const sb = createSandbox({
    queue: queue,
    apiJson: async function () { calls++; return { songs: [] }; },
  });
  const result = await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, queue[0]);
  assert.strictEqual(result, null);
  assert.strictEqual(calls, 0, '未锁定播放源时不应发起匹配请求');
  assert.strictEqual(queue[0].provider, 'netease');
}

async function testSwitchesEveryTrackToLockedProvider() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦'), song('netease', 'n2', '晴天', '周杰伦')];
  const urls = [];
  const sb = createSandbox({
    queue: queue,
    apiJson: async function (url) {
      urls.push(url);
      const hit = /%E5%A4%9C%E6%9B%B2/.test(url);
      return { songs: [hit ? { provider: 'qq', mid: 'qq-1', name: '夜曲', artist: '周杰伦' } : { provider: 'qq', mid: 'qq-2', name: '晴天', artist: '周杰伦' }] };
    },
  });
  sb['lockPreferredPlaybackSource']('qq');

  sb.currentIdx = 0;
  const first = await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, queue[0]);
  assert.ok(first && first.song, '第一首应匹配到 QQ 音乐版本');
  assert.strictEqual(first.from, 'netease');
  assert.strictEqual(first.to, 'qq');
  assert.strictEqual(sb.playQueue[0].provider, 'qq');
  assert.strictEqual(sb.playQueue[0].mid, 'qq-1');
  assert.strictEqual(sb.playQueue[0]['__preferredSourceAppliedFor'], 'qq');
  assert.ok(urls[0].indexOf('/api/qq/search') === 0, '应搜索 QQ 音乐目录');

  // 第二首无需用户再次手动切换，播放前自动匹配。
  sb.currentIdx = 1;
  const second = await sb['applyPreferredPlaybackSourceAt'](1, sb.trackSwitchToken, {}, queue[1]);
  assert.ok(second && second.song, '下一首应自动换到 QQ 音乐');
  assert.strictEqual(sb.playQueue[1].provider, 'qq');
  assert.strictEqual(sb.playQueue[1].mid, 'qq-2');
  assert.strictEqual(urls.length, 2);

  // 已经是目标音源的歌曲不再重复搜索。
  sb.currentIdx = 0;
  const again = await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, sb.playQueue[0]);
  assert.strictEqual(again, null);
  assert.strictEqual(urls.length, 2, '同音源不应重复请求');
}

async function testUnmatchedSongIsSkippedOnce() {
  const queue = [song('netease', 'n1', '不存在的歌', '某人')];
  let calls = 0;
  const sb = createSandbox({
    queue: queue,
    apiJson: async function () { calls++; return { songs: [] }; },
  });
  sb['lockPreferredPlaybackSource']('qq');
  const first = await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, queue[0]);
  assert.strictEqual(first, null);
  assert.strictEqual(calls, 2, '严格匹配失败后还会做一次宽松匹配（试听兜底）');
  assert.strictEqual(queue[0]['__preferredSourceSkippedFor'], 'qq');
  await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, queue[0]);
  assert.strictEqual(calls, 2, '同一首无匹配结果应被缓存，避免反复请求');

  // 换成新的歌曲对象（模拟重新水合）也应命中结果缓存。
  const rehydrated = Object.assign({}, queue[0]);
  delete rehydrated['__preferredSourceSkippedFor'];
  await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, rehydrated);
  assert.strictEqual(calls, 2, '匹配结果缓存应生效');
}

async function testRescueToOtherLoggedInPlatform() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦')];
  const sb = createSandbox({
    queue: queue,
    apiJson: async function () { return { songs: [] }; },
    alternateProviders: ['kugou'],
    alternateMatch: function () { return { provider: 'kugou', hash: 'kg-1', name: '夜曲', artist: '周杰伦' }; },
  });
  sb['lockPreferredPlaybackSource']('qq');
  const result = await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, queue[0]);
  assert.ok(result && result.song, 'QQ 没有版权时应改用其它已登录平台');
  assert.strictEqual(sb.playQueue[0].provider, 'kugou');
  assert.strictEqual(sb.playQueue[0]['__preferredSourceSkippedFor'], 'qq', '避免下一轮又切回 QQ 来回横跳');
  assert.strictEqual(sb.playQueue[0]['__preferredSourceRescuedFrom'], 'qq');
  assert.ok(sb.notices.some(item => String(item.title).indexOf('已切换音源') >= 0), '应提示已改用其它平台');
  assert.strictEqual(result.trial, false);
}

async function testRescueToTrialWhenNoOtherPlatformLoggedIn() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦')];
  let calls = 0;
  const sb = createSandbox({
    queue: queue,
    // 第一次严格匹配（同名同歌手）没有结果，第二次宽松匹配（只要歌名）命中 QQ 的试听版本。
    apiJson: async function () {
      calls++;
      if (calls === 1) return { songs: [] };
      return { songs: [{ provider: 'qq', mid: 'qq-trial-1', name: '夜曲', artist: '其它歌手', playable: true }] };
    },
    alternateProviders: [],
  });
  sb['lockPreferredPlaybackSource']('qq');
  const result = await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, queue[0]);
  assert.ok(result && result.song, '没有其它已登录平台时应退回音源平台的试听版本');
  assert.strictEqual(sb.playQueue[0].provider, 'qq');
  assert.strictEqual(sb.playQueue[0].mid, 'qq-trial-1');
  assert.strictEqual(sb.playQueue[0]['__preferredSourceTrialFallback'], true);
  assert.strictEqual(sb.playQueue[0]['__preferredSourceSkippedFor'], 'qq');
  assert.ok(sb.notices.some(item => String(item.title).indexOf('使用试听版本') >= 0), '应提示正在播放试听片段');
}

async function testLocalAndPodcastSongsAreIgnored() {
  let calls = 0;
  const localSong = { provider: 'netease', id: 'l1', name: '本地歌', artist: '我', localUrl: 'file:///a.mp3' };
  const podcast = { provider: 'netease', id: 'p1', name: '播客', artist: '主播', type: 'podcast' };
  const sb = createSandbox({
    queue: [localSong, podcast],
    apiJson: async function () { calls++; return { songs: [] }; },
  });
  sb['lockPreferredPlaybackSource']('qq');
  assert.strictEqual(await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, localSong), null);
  assert.strictEqual(await sb['applyPreferredPlaybackSourceAt'](1, sb.trackSwitchToken, {}, podcast), null);
  assert.strictEqual(calls, 0, '本地歌曲与播客不参与默认音源匹配');
}

async function testPreResolvedPlaybackIsNotReswitched() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦')];
  let calls = 0;
  const sb = createSandbox({
    queue: queue,
    apiJson: async function () { calls++; return { songs: [] }; },
  });
  sb['lockPreferredPlaybackSource']('qq');
  const skipOpts = ['preResolvedPlaybackData', 'albumGaplessHandoff', 'cuefieldAutoMix'];
  for (const key of skipOpts) {
    const opts = {}; opts[key] = key === 'preResolvedPlaybackData' ? { url: 'https://x/a.mp3' } : true;
    assert.strictEqual(await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, opts, queue[0]), null, key + ' 应跳过换源');
  }
  assert.strictEqual(await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, { fallbackDepth: 1 }, queue[0]), null);
  assert.strictEqual(calls, 0);
}

async function testFailureCacheStopsRetry() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦')];
  let calls = 0;
  const sb = createSandbox({
    queue: queue,
    apiJson: async function () {
      calls++;
      return { songs: [{ provider: 'qq', mid: 'qq-1', name: '夜曲', artist: '周杰伦' }] };
    },
  });
  sb['lockPreferredPlaybackSource']('qq');
  const original = queue[0];
  // 模拟：换到 QQ 的版本播放失败（QQ 没有这首歌的版权），换源逻辑把这个版本记下来。
  const failedQqVersion = {
    provider: 'qq',
    mid: 'qq-1',
    name: '夜曲',
    artist: '周杰伦',
    __preferredSourceAppliedFor: 'qq',
    __preferredSourceCacheKey: sb['preferredSourceCacheKey'](original, 'qq'),
  };
  assert.strictEqual(sb['notePreferredPlaybackSourceFailure'](failedQqVersion), true, '失败记录应写入缓存');
  assert.strictEqual(sb['notePreferredPlaybackSourceFailure'](original), false, '没有标记的普通歌曲不写入');
  const result = await sb['applyPreferredPlaybackSourceAt'](0, sb.trackSwitchToken, {}, original);
  assert.strictEqual(result, null, '候选版本播放失败后短时间内不再尝试');
  assert.strictEqual(calls, 0, '命中失败缓存时不应再发搜索请求');
}

async function testSwitchToProviderMemberQuality() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦')];
  let switched = null;
  const sb = createSandbox({
    queue: queue,
    switchCurrentSongSource: async function (provider, opts) { switched = { provider: provider, opts: opts }; return true; },
  });
  const ok = await sb['switchToProviderMemberQuality']('qq', 'jymaster');
  assert.strictEqual(ok, true);
  assert.strictEqual(sb['preferredPlaybackProvider'], 'qq', '应把播放源锁到有会员的平台');
  assert.strictEqual(sb.localStorage.getItem('mineradio-playback-source-preference'), 'qq');
  assert.ok(switched && switched.provider === 'qq', '应把当前歌曲切到该平台');
  assert.strictEqual(switched.opts.skipPreferredLock, true);
  assert.ok(sb.toasts.some(text => String(text).indexOf('QQ') >= 0), '应给出切换提示');
}

async function testStaleTokenAbortsSwitch() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦')];
  const sb = createSandbox({
    queue: queue,
    apiJson: async function () {
      sb.trackSwitchToken++;
      return { songs: [{ provider: 'qq', mid: 'qq-1', name: '夜曲', artist: '周杰伦' }] };
    },
  });
  sb['lockPreferredPlaybackSource']('qq');
  const staleToken = sb.trackSwitchToken;
  const result = await sb['applyPreferredPlaybackSourceAt'](0, staleToken, {}, queue[0]);
  assert.strictEqual(result, null, '切歌令牌已变化时应放弃换源');
  assert.strictEqual(queue[0].provider, 'netease', '队列不应被过期结果改写');
}

async function testPreloadGuard() {
  const sb = createSandbox();
  const neteaseSong = song('netease', 'n1', '夜曲', '周杰伦');
  const qqSong = song('qq', 'q1', '夜曲', '周杰伦');
  assert.strictEqual(sb['preferredPlaybackSourceBlocksPreload'](neteaseSong), false, '未锁定时不拦截预载');
  sb['lockPreferredPlaybackSource']('qq');
  assert.strictEqual(sb['preferredPlaybackSourceBlocksPreload'](neteaseSong), true, '跨音源预载应被拦截');
  assert.strictEqual(sb['preferredPlaybackSourceBlocksPreload'](qqSong), false, '同音源预载照常');
  assert.strictEqual(sb['preferredPlaybackSourceBlocksPreload']({ provider: 'netease', localUrl: 'file:///a.mp3' }), false);
}

async function testChipAndOptions() {
  const sb = createSandbox();
  let html = sb['preferredSourceChipHtml']();
  assert.ok(html.indexOf('preferred-source-chip') >= 0);
  assert.ok(html.indexOf('音源 自动') >= 0);
  sb['lockPreferredPlaybackSource']('qq');
  html = sb['preferredSourceChipHtml']();
  assert.ok(html.indexOf('音源 QQ') >= 0, '锁定时 chip 应显示当前音源');
  assert.ok(html.indexOf('preferred-source-chip active') >= 0);
  assert.ok(html.indexOf("togglePreferredSourceSwitcher(event)") >= 0);
  assert.strictEqual(sb['preferredSourceProviderStatusText']('qq'), '可播放');
  assert.strictEqual(sb['preferredSourceProviderStatusText']('kugou'), '可播放');
  assert.strictEqual(sb['preferredSourceProviderStatusText']('netease'), '已登录');
  const notReady = createSandbox({ statuses: { qq: { loggedIn: true, playbackKeyReady: false } } });
  assert.strictEqual(notReady['preferredSourceProviderStatusText']('qq'), '缺少播放授权');
}

async function testLoginGuideWhenProviderNotReady() {
  const queue = [song('netease', 'n1', '夜曲', '周杰伦')];
  let opened = '';
  const notReady = createSandbox({
    queue: queue,
    statuses: { qq: { loggedIn: false, playbackKeyReady: false } },
  });
  notReady['openProviderLogin'] = function (provider) { opened = provider; };
  await notReady['setPreferredPlaybackSource']('qq');
  assert.strictEqual(notReady['preferredPlaybackProvider'], 'auto', '未授权时不应锁定不可播放的音源');
  assert.strictEqual(opened, 'qq', '应打开对应平台的登录入口');
  assert.ok(notReady.toasts.some(text => String(text).indexOf('登录') >= 0), '应提示先登录');

  const ready = createSandbox({ queue: queue });
  await ready['setPreferredPlaybackSource']('qq');
  assert.strictEqual(ready['preferredPlaybackProvider'], 'qq', '授权就绪时应正常锁定');
  assert.strictEqual(ready.localStorage.getItem('mineradio-playback-source-preference'), 'qq');

  const neteaseReady = createSandbox({ queue: queue, statuses: { netease: { loggedIn: false } } });
  await neteaseReady['setPreferredPlaybackSource']('netease');
  assert.strictEqual(neteaseReady['preferredPlaybackProvider'], 'netease', '网易云免登录也应可锁定');
}

function testWiringIsPresent() {
  assert.ok(
    loaderText.indexOf('12a-preferred-playback-source.js') >= 0,
    'index-loader 应加载默认播放源模块'
  );
  assert.ok(
    startText.indexOf('applyPreferredPlaybackSourceAt(idx, token, opts, song)') >= 0,
    'playQueueAt 应在解析播放地址前调用默认音源匹配'
  );
}

async function main() {
  await testPreferencePersists();
  await testRestoresSavedPreference();
  await testAutoProviderDoesNotTouchQueue();
  await testSwitchesEveryTrackToLockedProvider();
  await testUnmatchedSongIsSkippedOnce();
  await testRescueToOtherLoggedInPlatform();
  await testRescueToTrialWhenNoOtherPlatformLoggedIn();
  await testLocalAndPodcastSongsAreIgnored();
  await testPreResolvedPlaybackIsNotReswitched();
  await testFailureCacheStopsRetry();
  await testSwitchToProviderMemberQuality();
  await testStaleTokenAbortsSwitch();
  await testPreloadGuard();
  await testChipAndOptions();
  await testLoginGuideWhenProviderNotReady();
  testWiringIsPresent();
  console.log('OK preferred-playback-source');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
