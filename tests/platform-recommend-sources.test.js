const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
const dashboardText = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '05-playback', '03a-home-dashboard.js'),
  'utf8'
);
const indexHtml = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');

function testQQRecommendationEndpoint() {
  assert.ok(serverText.indexOf("pn === '/api/qq/recommendations'") >= 0, '服务端要提供 QQ 推荐端点');
  assert.ok(serverText.indexOf('async function handleQQRecommendations(') >= 0);
  assert.ok(serverText.indexOf('async function qqRecommendRawMids(') >= 0);
  // 个性化推荐（musicu smartbox）优先
  assert.ok(serverText.indexOf('music.smartboxCgi.MusicSmartBoxSvr') >= 0, '优先取 QQ 个性化推荐');
  assert.ok(serverText.indexOf('GetRecommendSongList') >= 0);
  // 个性化对第三方返回 500003，改为多榜单轮换兜底
  assert.ok(serverText.indexOf('const QQ_RECOMMEND_TOPLISTS = [') >= 0, '要有榜单列表');
  ['热歌榜', '新歌榜', '飙升榜', '原创榜'].forEach((name) => {
    assert.ok(serverText.indexOf("name: '" + name + "'") >= 0, '缺少榜单：' + name);
  });
  assert.ok(serverText.indexOf('qqRecommendToplistCursor') >= 0, '榜单要轮流切换，而不是固定一个');
  assert.ok(serverText.indexOf('fcg_v8_toplist_cp.fcg') >= 0, '兜底使用官方榜单接口');
  assert.ok(serverText.indexOf('toplistName') >= 0, '要把榜单名回传给前端显示');
  // 复用 QQ 搜索的详情补全，保证字段结构和搜索一致
  assert.ok(serverText.indexOf('await qqSongDetail(mid, { mid })') >= 0, '推荐歌曲要复用 qqSongDetail 补全');
}

function testQQRecommendCardsAreClickable() {
  // 回归：点击分派的正则曾漏掉 qq，导致点 QQ 推荐歌曲没有任何反应。
  assert.ok(
    dashboardText.indexOf('/^(qishui|kugou|spotify|qq)-song$/.test(kind)') >= 0,
    'QQ 推荐歌曲的点击分派必须被支持'
  );
  assert.ok(dashboardText.indexOf('feedState.toplistName') >= 0, '面板要显示实际榜单名');
  assert.ok(dashboardText.indexOf("feedState.toplistName || '官方榜单'") >= 0);
}

function testDashboardWiring() {
  assert.ok(indexHtml.indexOf('data-home-recommend-source="qq"') >= 0, '平台推荐面板要有 QQ 标签页');
  assert.ok(dashboardText.indexOf("qq: { loading: false, loaded: false, songs: []") >= 0, '要有 QQ 的 feed 状态');
  assert.ok(dashboardText.indexOf("endpoint: '/api/qq/recommendations?limit=12'") >= 0, 'QQ feed 要指向新端点');
  assert.ok(dashboardText.indexOf("source === 'qq' && feedState.fallback") >= 0, 'QQ 走榜单兜底时文案要说明来源');
  assert.ok(dashboardText.indexOf('sectionTitle = qqRankName;') >= 0);
  // 三个平台的标签页都在
  ['netease', 'qishui', 'qq', 'kugou'].forEach((source) => {
    assert.ok(indexHtml.indexOf('data-home-recommend-source="' + source + '"') >= 0, source + ' 标签页缺失');
  });
  // 二改：Spotify 已按要求整体移除，不应再出现在平台推荐面板里。
  assert.strictEqual(indexHtml.indexOf('data-home-recommend-source="spotify"'), -1, 'Spotify 标签页应已移除');
  assert.strictEqual(
    dashboardText.indexOf('/api/spotify/recommendations'),
    -1,
    'Spotify 推荐配置应已移除'
  );
  // 布局回归：状态文字曾把标签按钮挡住，标签行必须压在状态之上且不被压缩。
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const tabsRule = (cssText.match(/\.home-platform-recommend-tabs\s*\{[^}]*\}/) || [''])[0];
  assert.ok(/z-index:\s*2/.test(tabsRule), '标签行要压在状态文字之上，避免被遮挡');
  assert.ok(/flex:\s*0 0 auto/.test(tabsRule), '标签行不能被 flex 压缩');
  const statusRule = (cssText.match(/\.home-platform-recommend-status\s*\{[^}]*\}/) || [''])[0];
  assert.ok(/overflow-wrap:\s*anywhere/.test(statusRule), '长状态文字要能换行而不是溢出遮挡');
  // 酷狗 / 汽水的既有接入保持可用（需要登录态时由前端提示）
  assert.ok(serverText.indexOf("pn === '/api/kugou/recommendations'") >= 0, '酷狗推荐端点应保留');
  assert.ok(serverText.indexOf("pn === '/api/qishui/feed'") >= 0, '汽水推荐端点应保留');
  assert.ok(dashboardText.indexOf("kugou: {") >= 0 && dashboardText.indexOf("qishui: {") >= 0);
}

function testQQFunctionsStillIntact() {
  // 本次改动挨着 QQ 播放权限判断，确认没有误删函数体
  assert.ok(serverText.indexOf('function truthyQQPlaybackHint(value) {') >= 0);
  assert.ok(serverText.indexOf("text === 'vip'") >= 0, 'truthyQQPlaybackHint 函数体不能丢');
  assert.ok(serverText.indexOf('function qqPlaybackMemberHints(hints) {') >= 0);
}

testQQRecommendationEndpoint();
testQQRecommendCardsAreClickable();
testDashboardWiring();
testQQFunctionsStillIntact();
console.log('OK platform-recommend-sources');
