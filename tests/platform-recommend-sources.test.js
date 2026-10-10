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
  // 官方热歌榜兜底
  assert.ok(serverText.indexOf('fcg_v8_toplist_cp.fcg') >= 0, '个性化推荐不可用时回退到官方榜单');
  assert.ok(serverText.indexOf("topid: 26") >= 0, '兜底使用 QQ 热歌榜');
  // 复用 QQ 搜索的详情补全，保证字段结构和搜索一致
  assert.ok(serverText.indexOf('await qqSongDetail(mid, { mid })') >= 0, '推荐歌曲要复用 qqSongDetail 补全');
}

function testDashboardWiring() {
  assert.ok(indexHtml.indexOf('data-home-recommend-source="qq"') >= 0, '平台推荐面板要有 QQ 标签页');
  assert.ok(dashboardText.indexOf("qq: { loading: false, loaded: false, songs: []") >= 0, '要有 QQ 的 feed 状态');
  assert.ok(dashboardText.indexOf("endpoint: '/api/qq/recommendations?limit=12'") >= 0, 'QQ feed 要指向新端点');
  assert.ok(dashboardText.indexOf("source === 'qq' && feedState.fallback") >= 0, 'QQ 走榜单兜底时文案要说明来源');
  assert.ok(dashboardText.indexOf("sectionTitle = '官方热歌榜'") >= 0);
  // 三个平台的标签页都在
  ['netease', 'qishui', 'qq', 'kugou'].forEach((source) => {
    assert.ok(indexHtml.indexOf('data-home-recommend-source="' + source + '"') >= 0, source + ' 标签页缺失');
  });
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
testDashboardWiring();
testQQFunctionsStillIntact();
console.log('OK platform-recommend-sources');
