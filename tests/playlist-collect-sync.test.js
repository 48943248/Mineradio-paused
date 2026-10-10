const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appRoot = path.resolve(__dirname, '..');
const serverPath = path.join(appRoot, 'server.js');
const kugouPath = path.join(appRoot, 'kugou-api.js');
const detailPath = path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '02-playlist-detail.js');
const shellPath = path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '01-playlist-panel-shell.js');
const statePath = path.join(appRoot, 'public', 'js', 'modules', '00-state', '01-perf-render-state.js');

const kugouText = fs.readFileSync(kugouPath, 'utf8');
const serverText = fs.readFileSync(serverPath, 'utf8');
const detailText = fs.readFileSync(detailPath, 'utf8');
const shellText = fs.readFileSync(shellPath, 'utf8');
const stateText = fs.readFileSync(statePath, 'utf8');

function extractFunction(sourceText, functionName) {
  const start = sourceText.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing ${functionName}`);
  const bodyStart = sourceText.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `missing body for ${functionName}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    const next = sourceText[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return sourceText.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function ${functionName}`);
}

function testKugouPlaylistSources() {
  const fn = extractFunction(kugouText, 'extractKugouGatewayPlaylistLists');
  const sandbox = { console, Object, Array, String, Number };
  vm.runInNewContext(`${fn}\nthis.extract = extractKugouGatewayPlaylistLists;`, sandbox);
  const lists = sandbox.extract({
    data: {
      info: {
        collect: [{ name: '别人收藏的歌单 A' }, { name: '别人收藏的歌单 B' }],
        self: [{ name: '我创建的歌单' }],
        love: [{ name: '我喜欢' }],
      },
    },
  });
  const items = Array.prototype.slice.call(lists);
  assert.strictEqual(items.length, 4, '收藏 + 自建歌单都应保留');
  const collected = items.filter(item => item.__kugouSubscribed === true).map(item => item.name).join(',');
  assert.strictEqual(collected, '别人收藏的歌单 A,别人收藏的歌单 B', '酷狗 collect 列表必须标记为收藏');
  assert.ok(items.some(item => item.name === '我创建的歌单' && !item.__kugouSubscribed), '自建歌单不应标记为收藏');
  assert.ok(items.some(item => item.name === '我喜欢' && !item.__kugouSubscribed), '「我喜欢」属于自有歌单');

  assert.ok(
    kugouText.includes('subscribed: item.__kugouSubscribed === true'),
    'mapKugouPlaylistItem 应把收藏标记输出成 subscribed'
  );
}

function testPlaylistGroupKey() {
  const fn = extractFunction(detailText, 'playlistPanelGroupKey');
  const sandbox = {
    console,
    Object,
    String,
    normalizePlaylistProvider(provider) {
      if (provider === 'mineradio') return 'mineradio';
      return ['qq', 'kugou', 'qishui', 'spotify'].indexOf(provider) >= 0 ? provider : 'netease';
    },
  };
  vm.runInNewContext(`${fn}\nthis.groupKey = playlistPanelGroupKey;`, sandbox);
  assert.strictEqual(sandbox.groupKey({ provider: 'qq', subscribed: true }), 'qq|collect');
  assert.strictEqual(sandbox.groupKey({ provider: 'qq', subscribed: false }), 'qq|created');
  assert.strictEqual(sandbox.groupKey({ provider: 'netease', id: '1' }), 'netease|created');
  assert.strictEqual(sandbox.groupKey({ provider: 'kugou', subscribed: true }), 'kugou|collect');
  assert.strictEqual(sandbox.groupKey({ provider: 'mineradio' }), 'mineradio|created');

  assert.ok(detailText.includes("'qq|collect': 'QQ 音乐 · 我收藏的'"), '面板应有「我收藏的」分组标题');
  assert.ok(detailText.includes("'netease|collect': '网易云 · 我收藏的'"));
  assert.ok(detailText.includes('var order = baseOrder.concat'), '未知分组也要照常显示');
}

function testCatalogRefreshWiring() {
  assert.ok(stateText.includes('var PLAYLIST_CATALOG_STALE_MS'), '需要定义歌单同步过期时间');
  assert.ok(shellText.includes('PLAYLIST_CATALOG_STALE_MS'), '面板刷新逻辑应使用该过期时间');
  assert.ok(shellText.includes('finishedAt = Date.now()'), '同步结束后要记录时间，避免每次都强制刷新');
  const staleIndex = shellText.indexOf('catalogStale');
  const cachedReturnIndex = shellText.indexOf('if (!force && (userPlaylists.length || myPodcastCollections.length)) {');
  assert.ok(staleIndex >= 0 && cachedReturnIndex > staleIndex, '过期判断必须发生在"用缓存直接返回"之前');
}

function testQqPlaylistFieldCompat() {
  const likedIdFn = extractFunction(serverText, 'isQQLikedPlaylistId');
  const favFn = extractFunction(serverText, 'isQQFavoritePlaylist');
  const mapFn = extractFunction(serverText, 'mapQQPlaylist');
  const sandbox = {
    console,
    Object,
    Array,
    String,
    Number,
    QQ_LIKED_DIRID: 201,
    QQ_LIKED_PLAYLIST_ID: 'liked',
    QQ_LIKED_PLAYLIST_NAME: 'QQ 音乐·我的喜欢',
    QQ_LIKED_PLAYLIST_COVER: '',
    decodeQQCookieValue: value => value,
  };
  vm.runInNewContext(`${likedIdFn}\n${favFn}\n${mapFn}\nthis.mapQQPlaylist = mapQQPlaylist;`, sandbox);

  // 收藏歌单接口（fcg_get_profile_order_asset）用的是 dissname / disscover 这类无下划线字段。
  const collected = sandbox.mapQQPlaylist({ dissid: '7520334743', dissname: '爆款收割机！抖音流行热歌合集', song_cnt: 30 }, 'collect');
  assert.strictEqual(collected.name, '爆款收割机！抖音流行热歌合集', '收藏歌单必须能读到 dissname，否则会因名字为空被丢弃');
  assert.strictEqual(collected.subscribed, true, '收藏歌单必须标记 subscribed');
  assert.strictEqual(collected.id, '7520334743');
  assert.strictEqual(collected.trackCount, 30);

  // 创建歌单接口用的是 diss_name（带下划线），不能因此回归。
  const created = sandbox.mapQQPlaylist({ dissid: '9430446234', diss_name: '收藏歌单', song_cnt: 5 }, 'created');
  assert.strictEqual(created.name, '收藏歌单');
  assert.strictEqual(created.subscribed, false);

  // 「我喜欢」虚拟歌单仍按 dirid 识别。
  const liked = sandbox.mapQQPlaylist({ dirid: 201, dissname: '我喜欢' }, 'created');
  assert.strictEqual(liked.virtual, true);
  assert.strictEqual(liked.id, 'liked');
}

testKugouPlaylistSources();
testQqPlaylistFieldCompat();
testPlaylistGroupKey();
testCatalogRefreshWiring();
console.log('OK playlist-collect-sync');
