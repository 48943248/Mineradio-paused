const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

const mainText = read('desktop', 'main.js');
const cssText = read('public', 'css', 'index.css');

function testDesktopLyricsBoundsPersistence() {
  // 回归：桌面歌词窗口位置原先只存在内存里，软件退出重进会回到初始位置。
  assert.ok(mainText.indexOf("const DESKTOP_LYRICS_BOUNDS_FILE = 'desktop-lyrics-bounds.json'") >= 0,
    '要有窗口位置的存档文件名');
  assert.ok(mainText.indexOf('function desktopLyricsBoundsFilePath()') >= 0);
  assert.ok(mainText.indexOf("path.join(app.getPath('userData'), DESKTOP_LYRICS_BOUNDS_FILE)") >= 0,
    '存档要放在 userData 目录');
  assert.ok(mainText.indexOf('function readDesktopLyricsBoundsFile()') >= 0, '启动时要能读回位置');
  assert.ok(mainText.indexOf('function writeDesktopLyricsBoundsFile(bounds)') >= 0, '移动后要落盘');
  assert.ok(mainText.indexOf('function scheduleDesktopLyricsBoundsSave(bounds)') >= 0, '落盘要节流，避免拖动时频繁写盘');
  assert.ok(mainText.indexOf('scheduleDesktopLyricsBoundsSave(desktopLyricsUserBounds);') >= 0,
    '记住 bounds 时要触发保存');
  assert.ok(mainText.indexOf('if (!desktopLyricsUserBounds) desktopLyricsUserBounds = readDesktopLyricsBoundsFile();') >= 0,
    '定位窗口前要先用磁盘里记住的位置');
}

function testPlatformRecommendLayout() {
  // 回归：面板是 flex 纵向布局，状态行会被列表压扁，文字爬到标签按钮上。
  const ruleOf = (selector) => (cssText.match(new RegExp(selector + '\\s*\\{[^}]*\\}')) || [''])[0];
  const tabsRule = ruleOf('\\.home-platform-recommend-tabs');
  const statusRule = ruleOf('\\.home-platform-recommend-status');
  const headRule = ruleOf('\\.home-platform-recommend-head');
  assert.ok(/flex:\s*0 0 auto/.test(tabsRule), '标签行不能被压缩');
  assert.ok(/flex:\s*0 0 auto/.test(statusRule), '状态行不能被列表压扁（本次遮挡根因）');
  assert.ok(/flex:\s*0 0 auto/.test(headRule), '标题行不能被压缩');
  assert.ok(/overflow-wrap:\s*anywhere/.test(statusRule), '长状态文字要能换行');
  assert.ok(/z-index:\s*2/.test(tabsRule), '标签行要压在状态行之上');
}

testDesktopLyricsBoundsPersistence();
testPlatformRecommendLayout();
console.log('OK desktop-lyrics-bounds-and-layout');
