// 二改特性：全局播放源（一键切换播放源）
// 诉求来源：原版只有“当前歌曲换源”，换到 QQ 音乐后下一首又会回到歌曲原音源，
// 需要反复手动切换。这里增加一个可持久化的默认播放源：
//   1. 控制栏一键切换（chip + 面板）；
//   2. 切换一次后，后续每一首歌在播放前自动匹配同音源的同名同歌手版本；
//   3. 记住用户选择，重启后仍然生效；
//   4. 手动给单曲换源时也会把该音源记成默认音源（“切一次，后面都跟着走”）。

var PLAYBACK_SOURCE_PREFERENCE_STORE_KEY = 'mineradio-playback-source-preference';
var PREFERRED_SOURCE_AUTO = 'auto';
var PREFERRED_SOURCE_PROVIDER_KEYS = ['netease', 'qq', 'kugou', 'qishui', 'spotify'];
var PREFERRED_SOURCE_SEARCH_TIMEOUT_MS = 6500;
var PREFERRED_SOURCE_MATCH_TTL_MS = 5 * 60 * 1000;
var PREFERRED_SOURCE_FAILURE_TTL_MS = 10 * 60 * 1000;
var PREFERRED_SOURCE_MATCH_MIN_SCORE = 24;

var preferredPlaybackProvider = PREFERRED_SOURCE_AUTO;
var preferredSourceSwitcherState = { open: false, anchor: null };
var preferredSourceMatchCache = Object.create(null);
var preferredSourceFailureCache = Object.create(null);

function normalizePreferredPlaybackProvider(value) {
  var raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw || raw === PREFERRED_SOURCE_AUTO || raw === 'off' || raw === 'none' || raw === 'default') return PREFERRED_SOURCE_AUTO;
  return PREFERRED_SOURCE_PROVIDER_KEYS.indexOf(raw) >= 0 ? raw : PREFERRED_SOURCE_AUTO;
}

function preferredPlaybackProviderTitle(provider) {
  provider = normalizePreferredPlaybackProvider(provider);
  if (provider === PREFERRED_SOURCE_AUTO) return '自动（跟随歌曲原音源）';
  if (typeof platformMeta === 'function') {
    var meta = platformMeta(provider);
    if (meta && meta.label) return meta.label;
  }
  if (provider === 'qq') return 'QQ音乐';
  if (provider === 'kugou') return '酷狗音乐';
  if (provider === 'qishui') return '汽水音乐';
  if (provider === 'spotify') return 'Spotify';
  return '网易云';
}

function preferredPlaybackProviderShortLabel(provider) {
  provider = normalizePreferredPlaybackProvider(provider);
  if (provider === PREFERRED_SOURCE_AUTO) return '自动';
  if (typeof platformMeta === 'function') {
    var meta = platformMeta(provider);
    if (meta && meta.short) return meta.short;
  }
  if (provider === 'qq') return 'QQ';
  if (provider === 'kugou') return 'KG';
  if (provider === 'qishui') return 'QS';
  if (provider === 'spotify') return 'SP';
  return 'NE';
}

function readPreferredPlaybackProviderPreference() {
  try {
    return normalizePreferredPlaybackProvider(localStorage.getItem(PLAYBACK_SOURCE_PREFERENCE_STORE_KEY) || '');
  } catch (e) {
    return PREFERRED_SOURCE_AUTO;
  }
}

function savePreferredPlaybackProviderPreference(value) {
  try {
    localStorage.setItem(PLAYBACK_SOURCE_PREFERENCE_STORE_KEY, normalizePreferredPlaybackProvider(value));
  } catch (e) { }
}

function preferredPlaybackProviderActive() {
  return preferredPlaybackProvider !== PREFERRED_SOURCE_AUTO;
}

function preferredSourceSongProvider(song) {
  if (typeof songProviderKey === 'function') return normalizePlaybackProvider(songProviderKey(song));
  if (typeof normalizePlaybackProvider === 'function') return normalizePlaybackProvider(song && song.provider);
  return 'netease';
}

function preferredSourceQuery(song) {
  song = song || {};
  var artist = String(song.artist || '').split(/\s*\/\s*|\s*,\s*|&|、/)[0] || '';
  if (!artist && Array.isArray(song.artists) && song.artists[0]) artist = song.artists[0].name || '';
  return [song.name || song.title || '', artist].filter(Boolean).join(' ').trim();
}

function preferredSourceSearchUrl(provider, query) {
  var q = encodeURIComponent(query);
  if (provider === 'qq') return '/api/qq/search?keywords=' + q + '&limit=8';
  if (provider === 'kugou') return '/api/kugou/search?keywords=' + q + '&limit=8';
  if (provider === 'qishui') return '/api/qishui/search?keywords=' + q + '&limit=8';
  if (provider === 'spotify') return '/api/spotify/search?keywords=' + q + '&limit=8';
  return '/api/search?keywords=' + q + '&limit=10';
}

function preferredSourceSongEligible(song, opts) {
  opts = opts || {};
  if (!song) return false;
  if (song.type === 'local' || song.source === 'local' || song.localUrl) return false;
  if (song.type === 'podcast' || song.source === 'podcast') return false;
  if (opts.fallbackDepth || opts.preResolvedPlaybackData || opts.albumGaplessHandoff) return false;
  if (opts.cuefieldAutoMix || opts.preloadedAudio || opts.preloadedData) return false;
  if (!preferredSourceQuery(song)) return false;
  if (song.__preferredSourceSkippedFor === preferredPlaybackProvider) return false;
  return true;
}

// 预载（专辑无缝 / Cuefield 过渡）只能对着真实会播放的那首歌做，
// 否则会把另一个音源的文件混进来。这里给预载路径一个统一的跳过判断。
function preferredPlaybackSourceBlocksPreload(song) {
  if (!preferredPlaybackProviderActive() || !song) return false;
  if (song.type === 'local' || song.source === 'local' || song.localUrl) return false;
  if (song.type === 'podcast' || song.source === 'podcast') return false;
  return preferredSourceSongProvider(song) !== preferredPlaybackProvider;
}

function preferredSourceCacheKey(song, provider) {
  var id = '';
  if (typeof queueItemKey === 'function') {
    try { id = queueItemKey(song) || ''; } catch (e) { id = ''; }
  }
  if (!id) {
    id = [
      preferredSourceSongProvider(song),
      (song && (song.id || song.mid || song.hash || song.spotifyId)) || '',
      (song && (song.name || song.title)) || '',
      (song && song.artist) || ''
    ].join(':');
  }
  return normalizePreferredPlaybackProvider(provider) + '|' + id;
}

function preferredSourceFailureFresh(cacheKey) {
  var at = Number(preferredSourceFailureCache[cacheKey]) || 0;
  if (!at) return false;
  if (Date.now() - at > PREFERRED_SOURCE_FAILURE_TTL_MS) {
    delete preferredSourceFailureCache[cacheKey];
    return false;
  }
  return true;
}

// 目标音源的版本播放失败（例如该平台没有版权/需要会员）时，
// 短时间内不要再对同一首歌重复尝试，避免每首都先失败一次再回退。
function notePreferredPlaybackSourceFailure(failedSong) {
  if (!failedSong) return false;
  var provider = failedSong.__preferredSourceAppliedFor;
  if (!provider) return false;
  var key = failedSong.__preferredSourceCacheKey || preferredSourceCacheKey(failedSong, provider);
  if (!key) return false;
  preferredSourceFailureCache[key] = Date.now();
  return true;
}

async function preferredSourceFindMatchResult(song, provider) {
  var query = preferredSourceQuery(song);
  if (!query) return { song: null, issue: 'no_source' };
  var cacheKey = preferredSourceCacheKey(song, provider);
  var cached = preferredSourceMatchCache[cacheKey];
  if (cached && Date.now() - cached.at <= PREFERRED_SOURCE_MATCH_TTL_MS) {
    return { song: cached.song ? Object.assign({}, cached.song) : null, issue: cached.issue || 'no_source' };
  }
  var data = await apiJson(preferredSourceSearchUrl(provider, query), { timeoutMs: PREFERRED_SOURCE_SEARCH_TIMEOUT_MS });
  var list = data && (data.songs || data.result || []);
  var result = { song: null, issue: 'no_source' };
  if (Array.isArray(list) && list.length) {
    var best = null;
    var bestScore = -Infinity;
    var bestIssue = 'no_source';
    for (var i = 0; i < list.length; i++) {
      var candidate = list[i];
      var issue = typeof sourceCandidateRejectReason === 'function'
        ? sourceCandidateRejectReason(song, candidate, provider)
        : '';
      if (issue) {
        if (bestIssue === 'no_source' || issue === 'blocked_artist' || issue === 'artist_extra' || issue === 'artist_mismatch') bestIssue = issue;
        continue;
      }
      var score = typeof scoreSongSearchResult === 'function' ? scoreSongSearchResult(candidate, query, i) : 0;
      if (typeof isSameTitleArtist === 'function' && isSameTitleArtist(song, candidate)) score += 120;
      if (candidate && candidate.playable === false) score -= 18;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best && bestScore >= PREFERRED_SOURCE_MATCH_MIN_SCORE) {
      result = { song: typeof cloneSong === 'function' ? cloneSong(best) : Object.assign({}, best), issue: '' };
    } else {
      result = { song: null, issue: bestIssue };
    }
  }
  preferredSourceMatchCache[cacheKey] = {
    at: Date.now(),
    song: result.song ? Object.assign({}, result.song) : null,
    issue: result.issue || ''
  };
  preferredSourceTrimCaches();
  return result;
}

// 长时间播放会累积缓存条目，这里做上限收敛，避免内存无界增长。
function preferredSourceTrimCaches() {
  var now = Date.now();
  Object.keys(preferredSourceFailureCache).forEach(function (key) {
    if (now - (Number(preferredSourceFailureCache[key]) || 0) > PREFERRED_SOURCE_FAILURE_TTL_MS) {
      delete preferredSourceFailureCache[key];
    }
  });
  var keys = Object.keys(preferredSourceMatchCache);
  if (keys.length <= 240) return;
  keys.sort(function (a, b) {
    return (Number(preferredSourceMatchCache[a].at) || 0) - (Number(preferredSourceMatchCache[b].at) || 0);
  });
  keys.slice(0, keys.length - 160).forEach(function (key) {
    delete preferredSourceMatchCache[key];
  });
}

// 目标音源没有版权时，按「其它已登录平台的正版 → 目标音源的试听版本」兜底。
// 用户诉求：锁定 QQ 音乐后，优先播 QQ 的歌；QQ 没版权才用其它已登录平台的歌；
// 其它平台都没登录时，回到 QQ 音乐自己的试听片段。
var preferredSourceRescueCache = Object.create(null);

function preferredSourceNormalizeText(text) {
  if (typeof normalizeMatchText === 'function') return normalizeMatchText(text);
  return String(text || '').toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s·・\-—_.,，。:：'"“”‘’/\\|]+/g, '');
}

// 宽松匹配：只要求歌名一致，用来拿音源平台的试听片段。
async function preferredSourceFindLooseMatch(song, provider) {
  var query = preferredSourceQuery(song);
  if (!query) return null;
  var data = await apiJson(preferredSourceSearchUrl(provider, query), { timeoutMs: PREFERRED_SOURCE_SEARCH_TIMEOUT_MS });
  var list = data && (data.songs || data.result || []);
  if (!Array.isArray(list) || !list.length) return null;
  var title = preferredSourceNormalizeText(song.name || song.title || '');
  if (!title) return null;
  var playableFallback = null;
  var anyFallback = null;
  for (var i = 0; i < list.length; i++) {
    var candidate = list[i];
    if (!candidate) continue;
    if (preferredSourceNormalizeText(candidate.name || candidate.title || '') !== title) continue;
    if (candidate.playable === false) {
      if (!playableFallback) playableFallback = candidate;
      continue;
    }
    if (!anyFallback) anyFallback = candidate;
  }
  var best = anyFallback || playableFallback;
  if (!best) return null;
  return typeof cloneSong === 'function' ? cloneSong(best) : Object.assign({}, best);
}

async function preferredSourceFindRescueSong(song, targetProvider) {
  var cacheKey = preferredSourceCacheKey(song, targetProvider);
  var cached = preferredSourceRescueCache[cacheKey];
  if (cached && Date.now() - cached.at <= PREFERRED_SOURCE_MATCH_TTL_MS) {
    if (!cached.song) return null;
    return { song: Object.assign({}, cached.song), via: cached.via, trial: !!cached.trial };
  }
  var rescue = null;
  var alternates = typeof alternatePlaybackProviders === 'function' ? alternatePlaybackProviders(song) : [];
  for (var i = 0; i < alternates.length && !rescue; i++) {
    var provider = alternates[i];
    if (provider === targetProvider) continue;
    var match = null;
    try {
      match = await searchAlternatePlatformSong(song, provider, null);
    } catch (err) {
      match = null;
    }
    if (match) rescue = { song: match, via: provider, trial: false };
  }
  if (!rescue) {
    var trialSong = null;
    try {
      trialSong = await preferredSourceFindLooseMatch(song, targetProvider);
    } catch (err) {
      trialSong = null;
    }
    if (trialSong) rescue = { song: trialSong, via: targetProvider, trial: true };
  }
  preferredSourceRescueCache[cacheKey] = {
    at: Date.now(),
    song: rescue && rescue.song ? Object.assign({}, rescue.song) : null,
    via: rescue ? rescue.via : '',
    trial: !!(rescue && rescue.trial)
  };
  preferredSourceTrimCaches();
  return rescue;
}

function preferredSourceCommitSwitch(idx, originalSong, nextSong, meta) {
  meta = meta || {};
  var from = preferredSourceSongProvider(originalSong);
  var next = typeof hydrateCustomCover === 'function' ? hydrateCustomCover(nextSong) : nextSong;
  next.preferredSourceSwitchFrom = from;
  next.preferredSourceSwitchAt = Date.now();
  if (meta.appliedFor) next.__preferredSourceAppliedFor = meta.appliedFor;
  if (meta.skipFor) next.__preferredSourceSkippedFor = meta.skipFor;
  if (meta.trialFallback) next.__preferredSourceTrialFallback = true;
  if (meta.rescuedFrom) next.__preferredSourceRescuedFrom = meta.rescuedFrom;
  // 记住"这首歌在目标音源下的缓存键"，播放失败时可以精确定位到同一首歌，避免每首都重试。
  if (meta.cacheKey) next.__preferredSourceCacheKey = meta.cacheKey;
  playQueue[idx] = next;
  if (typeof safeRenderQueuePanel === 'function') {
    try { safeRenderQueuePanel('preferred-source-switch', { scrollCurrent: miniQueueOpen }); } catch (e) { }
  }
  if (typeof safeShelfRebuild === 'function') {
    try { safeShelfRebuild('preferred-source-switch'); } catch (e) { }
  }
  if (typeof updateControlTrackInfo === 'function') {
    try { updateControlTrackInfo(next); } catch (e) { }
  }
  return { song: next, from: from, to: meta.to || from, via: meta.via || '', trial: !!meta.trialFallback, original: originalSong };
}

// 在 playQueueAt 内、真正解析播放地址之前调用：
// 若当前歌曲不是默认播放源，则先在同音源里找同名同歌手的版本并替换队列项。
async function applyPreferredPlaybackSourceAt(idx, token, opts, song) {
  if (!preferredPlaybackProviderActive()) return null;
  if (!preferredSourceSongEligible(song, opts)) return null;
  var target = preferredPlaybackProvider;
  if (preferredSourceSongProvider(song) === target) return null;
  var cacheKey = preferredSourceCacheKey(song, target);
  if (preferredSourceFailureFresh(cacheKey)) return null;
  var result = null;
  try {
    result = await preferredSourceFindMatchResult(song, target);
  } catch (err) {
    console.warn('[PreferredSource] 匹配失败', target, err);
    return null;
  }
  if (token !== trackSwitchToken || currentIdx !== idx) return null;
  if (result && result.song) {
    var switched = preferredSourceCommitSwitch(idx, song, result.song, {
      appliedFor: target,
      to: target,
      via: target,
      cacheKey: cacheKey
    });
    return switched;
  }
  // 目标音源没有版权：先找其它已登录平台，再退回目标音源的试听版本。
  var rescue = null;
  try {
    rescue = await preferredSourceFindRescueSong(song, target);
  } catch (rescueError) {
    console.warn('[PreferredSource] 兜底匹配失败', rescueError);
    rescue = null;
  }
  if (token !== trackSwitchToken || currentIdx !== idx) return null;
  if (!rescue || !rescue.song) {
    song.__preferredSourceSkippedFor = target;
    return null;
  }
  var targetLabel = preferredPlaybackProviderTitle(target);
  if (typeof showSourceFallbackNotice === 'function' && (!opts || !opts.startupAutoplay)) {
    if (rescue.trial) {
      showSourceFallbackNotice('使用试听版本', targetLabel + ' 没有该歌曲的完整版权，正在播放它的试听片段。');
    } else {
      showSourceFallbackNotice(
        '已切换音源',
        targetLabel + ' 没有该歌曲的版权，已改用 ' + preferredPlaybackProviderTitle(rescue.via) + ' 播放。'
      );
    }
  }
  // 切到其它平台说明目标音源这首歌确实没有版权，记下来，短时间内不再重复尝试。
  if (!rescue.trial) preferredSourceFailureCache[cacheKey] = Date.now();
  return preferredSourceCommitSwitch(idx, song, rescue.song, {
    // 标记这首歌已经为锁定音源兜底过，避免下一轮又尝试切回目标音源来回横跳。
    skipFor: target,
    rescuedFrom: rescue.trial ? '' : target,
    trialFallback: rescue.trial,
    to: target,
    via: rescue.via,
    cacheKey: cacheKey
  });
}


// ---------- 一键切换 UI ----------

function preferredSourceProviderList() {
  return [
    { key: PREFERRED_SOURCE_AUTO, label: '自动', title: '自动（跟随歌曲原音源）', desc: '不锁定，播放歌曲自己的音源' },
    { key: 'netease', label: 'NE', title: '网易云音乐', desc: '优先使用网易云音源' },
    { key: 'qq', label: 'QQ', title: 'QQ音乐', desc: '所有歌曲优先用 QQ 音乐播放' },
    { key: 'kugou', label: 'KG', title: '酷狗音乐', desc: '所有歌曲优先用酷狗音乐播放' },
    { key: 'qishui', label: 'QS', title: '汽水音乐', desc: '仅匹配源，播放可能自动换源' },
    { key: 'spotify', label: 'SP', title: 'Spotify', desc: '仅匹配源，播放可能自动换源' }
  ];
}

function preferredSourceProviderStatusText(provider) {
  provider = normalizePreferredPlaybackProvider(provider);
  if (provider === PREFERRED_SOURCE_AUTO) return preferredPlaybackProviderActive() ? '可切回' : '当前';
  var status = typeof platformStatus === 'function' ? (platformStatus(provider) || {}) : {};
  if (provider === 'netease') return status.loggedIn ? '已登录' : '免登录可用';
  if (provider === 'qq' || provider === 'kugou') {
    if (!status.loggedIn) return '未登录';
    return status.playbackKeyReady === true ? '可播放' : '缺少播放授权';
  }
  return status.loggedIn ? '仅匹配源' : '未登录';
}

function preferredSourceProviderSelectable(provider) {
  provider = normalizePreferredPlaybackProvider(provider);
  if (provider === PREFERRED_SOURCE_AUTO) return true;
  return PREFERRED_SOURCE_PROVIDER_KEYS.indexOf(provider) >= 0;
}

function preferredSourceEscape(value) {
  if (typeof escHtml === 'function') return escHtml.call(null, value);
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 当前队列里这首歌实际用的是哪个平台的音源（可能与锁定的播放源不同：
// 例如锁定 QQ 音乐，但这首歌 QQ 没有版权，实际播的是网易云）。
function preferredSourceActualProvider() {
  var song = typeof currentControlSong === 'function' ? currentControlSong() : null;
  if (!song) return '';
  if (song.type === 'local' || song.source === 'local' || song.localUrl) return 'local';
  return preferredSourceSongProvider(song);
}

function preferredSourceChipHtml() {
  var provider = preferredPlaybackProvider;
  var active = provider !== PREFERRED_SOURCE_AUTO;
  var chipClass = active ? provider : 'mineradio';
  var actual = preferredSourceActualProvider();
  var mismatch = !!(active && actual && actual !== 'local' && actual !== provider);
  var label = active
    ? ('音源 ' + preferredPlaybackProviderShortLabel(provider) + (mismatch ? '→' + preferredPlaybackProviderShortLabel(actual) : ''))
    : '音源 自动';
  var title;
  if (!active) title = '一键切换播放源 · 当前自动跟随歌曲原音源';
  else if (mismatch) {
    title = '已锁定播放源：' + preferredPlaybackProviderTitle(provider)
      + ' · 本首实际播放：' + preferredPlaybackProviderTitle(actual)
      + '（目标音源没有这首歌的版权，已自动改用其它已登录平台）';
  } else {
    title = '一键切换播放源 · 当前锁定：' + preferredPlaybackProviderTitle(provider) + '（后续歌曲自动使用同名同歌手版本）';
  }
  return '<button type="button" id="preferred-source-chip" class="tag-source ' + chipClass + ' control-source-chip preferred-source-chip' + (active ? ' active' : '') + (mismatch ? ' source-mismatch' : '') + '"' +
    ' title="' + preferredSourceEscape(title) + '" aria-haspopup="true" onclick="togglePreferredSourceSwitcher(event)">' +
    preferredSourceEscape(label) +
    '</button>';
}

function ensurePreferredSourceSwitcher() {
  var el = document.getElementById('preferred-source-switcher');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'preferred-source-switcher';
  el.className = 'control-source-switcher preferred-source-switcher';
  el.setAttribute('role', 'menu');
  el.addEventListener('click', function (e) { e.stopPropagation(); });
  document.body.appendChild(el);
  return el;
}

function preferredSourcePositionSwitcher(anchor) {
  var el = ensurePreferredSourceSwitcher();
  anchor = anchor || preferredSourceSwitcherState.anchor;
  if (!anchor || !anchor.getBoundingClientRect) return;
  var rect = anchor.getBoundingClientRect();
  var width = Math.min(300, window.innerWidth - 24);
  var left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
  el.style.width = width + 'px';
  el.style.left = left + 'px';
  el.style.bottom = Math.max(18, window.innerHeight - rect.top + 10) + 'px';
}

function closePreferredSourceSwitcher() {
  preferredSourceSwitcherState.open = false;
  preferredSourceSwitcherState.anchor = null;
  var el = document.getElementById('preferred-source-switcher');
  if (el) el.classList.remove('show');
}

function renderPreferredSourceSwitcher() {
  var el = ensurePreferredSourceSwitcher();
  var current = preferredPlaybackProvider;
  var locked = current !== PREFERRED_SOURCE_AUTO;
  var actual = preferredSourceActualProvider();
  var mismatch = !!(locked && actual && actual !== 'local' && actual !== current);
  var head = '<div class="control-source-switcher-head"><span>播放源</span><small>'
    + preferredSourceEscape(locked ? ('已锁定：' + preferredPlaybackProviderTitle(current)) : '自动（跟随歌曲原音源）')
    + '</small></div>';
  var options = preferredSourceProviderList().map(function (provider) {
    var active = provider.key === current;
    var selectable = preferredSourceProviderSelectable(provider.key);
    var status = active ? '已锁定' : preferredSourceProviderStatusText(provider.key);
    var title = active
      ? ('当前锁定的播放源：' + provider.title)
      : ('一键切换为 ' + provider.title + '，并让后续歌曲自动使用该音源');
    return '<button type="button" class="control-source-option' + (active ? ' active' : '') + (!selectable ? ' disabled' : '') + '"' +
      ' data-source-provider="' + provider.key + '" title="' + preferredSourceEscape(title) + '"' + (!selectable ? ' disabled' : '') +
      ' onclick="setPreferredPlaybackSource(\'' + provider.key + '\')">' +
      '<span class="tag-source ' + (provider.key === PREFERRED_SOURCE_AUTO ? 'mineradio' : provider.key) + '">' + preferredSourceEscape(provider.label) + '</span>' +
      '<span class="control-source-option-title">' + preferredSourceEscape(provider.title) + '</span>' +
      '<small>' + preferredSourceEscape(status) + '</small>' +
      '</button>';
  }).join('');
  var actualNote = '';
  if (locked && actual && actual !== 'local') {
    actualNote = mismatch
      ? '<div class="control-source-switcher-note source-mismatch">'
        + preferredSourceEscape('本首实际播放：' + preferredPlaybackProviderTitle(actual) + '。' + preferredPlaybackProviderTitle(current) + ' 没有这首歌的版权，已自动改用其它已登录平台；下次会直接沿用，不会重复尝试。')
        + '</div>'
      : '<div class="control-source-switcher-note">'
        + preferredSourceEscape('本首实际播放：' + preferredPlaybackProviderTitle(actual) + '（与锁定音源一致）')
        + '</div>';
  }
  var note = '<div class="control-source-switcher-note">' + preferredSourceEscape('切换一次即可：之后每首歌都会自动匹配该音源；该平台没有版权时会改用其它已登录平台，都没有才用它的试听片段。选「自动」可恢复跟随歌曲原音源。') + '</div>';
  el.innerHTML = head + '<div class="control-source-options">' + options + '</div>' + actualNote + note;
  preferredSourcePositionSwitcher();
}

function togglePreferredSourceSwitcher(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (typeof closeControlSourceSwitcher === 'function') closeControlSourceSwitcher();
  var el = ensurePreferredSourceSwitcher();
  var anchor = e && e.currentTarget ? e.currentTarget : null;
  if (preferredSourceSwitcherState.open && preferredSourceSwitcherState.anchor === anchor) {
    closePreferredSourceSwitcher();
    return;
  }
  preferredSourceSwitcherState.open = true;
  preferredSourceSwitcherState.anchor = anchor;
  renderPreferredSourceSwitcher();
  preferredSourcePositionSwitcher(anchor);
  el.classList.add('show');
}

// 用户主动切换播放源时清空失败记录：既然是他手动选的，就重新尝试一次。
function preferredSourceClearFailureCache() {
  preferredSourceFailureCache = Object.create(null);
}

function syncPreferredSourceUi() {
  if (typeof updateControlTrackInfo === 'function' && typeof currentControlSong === 'function') {
    var song = currentControlSong();
    if (song) {
      try { updateControlTrackInfo(song); } catch (e) { }
    }
  }
  if (preferredSourceSwitcherState.open) renderPreferredSourceSwitcher();
}

// 手动给单曲换源时调用：把该音源记成默认播放源，避免下一首又回到原音源。
function lockPreferredPlaybackSource(provider, opts) {
  opts = opts || {};
  provider = normalizePreferredPlaybackProvider(provider);
  if (provider === PREFERRED_SOURCE_AUTO) return false;
  if (preferredPlaybackProvider === provider) {
    syncPreferredSourceUi();
    return false;
  }
  preferredSourceClearFailureCache();
  preferredPlaybackProvider = provider;
  savePreferredPlaybackProviderPreference(provider);
  syncPreferredSourceUi();
  if (opts.silent !== true && typeof showToast === 'function') {
    showToast('播放源已切换：' + preferredPlaybackProviderTitle(provider) + '，后续歌曲自动使用');
  }
  return true;
}

// 该平台现在是否真的能出播放地址；不能出地址时先引导登录，避免锁定后每首都白试一次。
function preferredSourceProviderReadyForPlayback(provider) {
  provider = normalizePreferredPlaybackProvider(provider);
  if (provider === PREFERRED_SOURCE_AUTO) return true;
  if (provider === 'netease') return true;
  var status = typeof platformStatus === 'function' ? (platformStatus(provider) || {}) : {};
  if (provider === 'qq' || provider === 'kugou') return !!(status.loggedIn && status.playbackKeyReady === true);
  return !!status.loggedIn;
}

async function setPreferredPlaybackSource(provider) {
  provider = normalizePreferredPlaybackProvider(provider);
  closePreferredSourceSwitcher();
  if (provider !== PREFERRED_SOURCE_AUTO && !preferredSourceProviderReadyForPlayback(provider)) {
    var blockedTitle = preferredPlaybackProviderTitle(provider);
    if (typeof showToast === 'function') showToast(blockedTitle + ' 还没有可用的播放授权，已打开登录入口，登录后再点一次「音源」即可');
    if (typeof openProviderLogin === 'function') openProviderLogin(provider);
    return;
  }
  preferredSourceClearFailureCache();
  preferredPlaybackProvider = provider;
  savePreferredPlaybackProviderPreference(provider);
  syncPreferredSourceUi();
  if (provider === PREFERRED_SOURCE_AUTO) {
    if (typeof showToast === 'function') showToast('播放源已恢复自动：跟随歌曲原音源');
    return;
  }
  var title = preferredPlaybackProviderTitle(provider);
  var song = typeof currentControlSong === 'function' ? currentControlSong() : null;
  var canSwitchNow = !!(
    song
    && song.type !== 'local'
    && song.source !== 'local'
    && !song.localUrl
    && song.type !== 'podcast'
    && song.source !== 'podcast'
    && typeof switchCurrentSongSource === 'function'
  );
  if (!canSwitchNow) {
    if (typeof showToast === 'function') showToast('播放源已锁定：' + title + '，下一首开始自动使用');
    return;
  }
  if (preferredSourceSongProvider(song) === provider) {
    if (typeof showToast === 'function') showToast('播放源已锁定：' + title + '，后续歌曲自动使用');
    return;
  }
  if (typeof showToast === 'function') showToast('正在切换到 ' + title + '…');
  try {
    await switchCurrentSongSource(provider, { skipPreferredLock: true });
  } catch (err) {
    console.warn('[PreferredSource] 切换失败', provider, err);
  }
}

// 用户在网易云歌曲上点了「超清母带」，但会员在别的平台（例如 QQ SVIP）时：
// 直接把播放源锁到那个平台、把音质设为该平台的会员档位，并把当前歌曲切过去。
async function switchToProviderMemberQuality(provider, quality) {
  provider = normalizePreferredPlaybackProvider(provider);
  if (provider === PREFERRED_SOURCE_AUTO) return false;
  quality = quality || 'jymaster';
  preferredSourceClearFailureCache();
  preferredPlaybackProvider = provider;
  savePreferredPlaybackProviderPreference(provider);
  syncPreferredSourceUi();
  if (typeof setProviderPlaybackQuality === 'function') setProviderPlaybackQuality(provider, quality);
  if (typeof updatePlaybackQualityUi === 'function') updatePlaybackQualityUi();
  var title = preferredPlaybackProviderTitle(provider);
  var label = typeof playbackQualityLabel === 'function' ? playbackQualityLabel(quality, provider) : '';
  var song = typeof currentControlSong === 'function' ? currentControlSong() : null;
  var canSwitchSong = !!(
    song
    && song.type !== 'local'
    && song.source !== 'local'
    && !song.localUrl
    && song.type !== 'podcast'
    && song.source !== 'podcast'
    && typeof switchCurrentSongSource === 'function'
    && preferredSourceSongProvider(song) !== provider
  );
  if (!canSwitchSong) {
    if (typeof showToast === 'function') showToast('已启用 ' + title + ' · ' + label + '，后续歌曲自动使用');
    return true;
  }
  if (typeof showToast === 'function') showToast('正在切到 ' + title + ' · ' + label + '…');
  try {
    await switchCurrentSongSource(provider, { skipPreferredLock: true });
  } catch (err) {
    console.warn('[PreferredSource] 会员音质切源失败', err);
  }
  return true;
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', function (e) {
    var el = document.getElementById('preferred-source-switcher');
    if (!el || !preferredSourceSwitcherState.open) return;
    if (el.contains(e.target)) return;
    if (preferredSourceSwitcherState.anchor && preferredSourceSwitcherState.anchor.contains && preferredSourceSwitcherState.anchor.contains(e.target)) return;
    closePreferredSourceSwitcher();
  });
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('resize', function () {
    if (preferredSourceSwitcherState.open) preferredSourcePositionSwitcher();
  });
}

preferredPlaybackProvider = readPreferredPlaybackProviderPreference();
