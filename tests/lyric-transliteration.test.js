const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appRoot = path.resolve(__dirname, '..');
const fetchParsePath = path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js');
const fetchParseText = fs.readFileSync(fetchParsePath, 'utf8');
const persistenceText = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'),
  'utf8'
);
const actionsText = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js'),
  'utf8'
);
const indexHtml = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');

function createSandbox() {
  const store = new Map();
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
    RegExp,
    isFinite,
    parseInt,
    parseFloat,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); },
    },
    window: {},
    apiJson: async function () { return { songs: [] }; },
    songProviderKey(song) { return (song && song.provider) || 'netease'; },
    isSameTitleArtist(a, b) { return !!a && !!b && a.name === b.name && a.artist === b.artist; },
    cloneLyricLines(lines) { return (Array.isArray(lines) ? lines : []).map(line => Object.assign({}, line)); },
    normalizeStageLyricText(text) { return String(text || '').trim(); },
    currentLyricSong() { return null; },
    trackSwitchToken: 1,
  };
  vm.runInNewContext(fetchParseText, sandbox, { filename: fetchParsePath });
  return sandbox;
}

function testTransliterationAliases() {
  const sb = createSandbox();
  assert.strictEqual(sb.lyricTransliterationTextFromAliases({ romalrc: 'A' }), 'A');
  assert.strictEqual(sb.lyricTransliterationTextFromAliases({ roma: 'B' }), 'B');
  assert.strictEqual(sb.lyricTransliterationTextFromAliases({ romaji: 'C' }), 'C');
  assert.strictEqual(sb.lyricTransliterationTextFromAliases({ tlyric: 'x' }), '', '译文不应被当成音译');
  assert.strictEqual(sb.lyricYrcTransliterationTextFromAliases({ yromalrc: 'D' }), 'D');
}

function testTransliterationPayload() {
  const sb = createSandbox();
  // 网易云：带时间轴的 romalrc
  const timed = sb.buildLyricTransliterationPayload({
    romalrc: '[00:01.00]ni hao\n[00:03.00]shi jie',
  });
  assert.strictEqual(timed.lines.length, 2, 'romalrc 应解析出两行');
  assert.strictEqual(timed.lines[0].text, 'ni hao');
  assert.strictEqual(timed.source, 'romalrc');

  // QQ：roma 可能没有时间轴，需要按行序铺开
  const plain = sb.buildLyricTransliterationPayload({ roma: 'ni hao\nshi jie\nyue liang' });
  assert.strictEqual(plain.lines.length, 3, '无时间轴的 roma 也应按行铺开');
  assert.strictEqual(plain.lines[2].text, 'yue liang');
  assert.ok(plain.source.indexOf('roma-plain') >= 0);

  // 没有音译时不应编造内容
  const empty = sb.buildLyricTransliterationPayload({ lyric: '[00:01.00]你好' });
  assert.strictEqual(empty.lines.length, 0);
  assert.strictEqual(empty.source, 'none');
}

function testAttachToPrimaryLines() {
  const sb = createSandbox();
  const state = sb.parseLyricResponseToOriginalState(
    { name: '夜曲', artist: '周杰伦', provider: 'netease', id: 'n1' },
    {
      lyric: '[00:01.00]你好\n[00:03.00]世界',
      tlyric: '[00:01.00]hello\n[00:03.00]world',
      romalrc: '[00:01.00]ni hao\n[00:03.00]shi jie',
    }
  );
  assert.strictEqual(state.lines.length, 2);
  assert.strictEqual(state.lines[0].translation, 'hello', '译文仍应贴在主行上');
  assert.strictEqual(state.lines[0].transliteration, 'ni hao', '音译应贴在主行上');
  assert.strictEqual(state.lines[1].transliteration, 'shi jie');
  assert.strictEqual(state.transliterationSource, 'romalrc');
  assert.strictEqual(state.translationSource, 'tlyric');
}

function testLyricPlatformPreference() {
  const sb = createSandbox();
  assert.strictEqual(sb.normalizeLyricPlatform('QQ'), 'qq');
  assert.strictEqual(sb.normalizeLyricPlatform('netease'), 'netease');
  assert.strictEqual(sb.normalizeLyricPlatform('bogus'), 'auto');
  assert.strictEqual(sb.lyricPlatformPreference, 'auto', '默认跟随音源');

  const song = { name: '夜曲', artist: '周杰伦', provider: 'netease', id: 'n1' };
  const autoKey = sb.persistentLyricCacheKey(song);
  sb.lyricPlatformPreference = 'qq';
  const qqKey = sb.persistentLyricCacheKey(song);
  assert.notStrictEqual(autoKey, qqKey, '锁定不同歌词平台时不能复用同一份歌词缓存');
  assert.ok(qqKey.indexOf('|qq') >= 0);
  assert.ok(autoKey.indexOf('|auto') >= 0);
  assert.ok(qqKey.indexOf('lyrics-v2') === 0, '缓存版本要升级，避免命中没有音译的旧缓存');
}

function testUiWiringPresent() {
  // 快捷开关与歌词平台现在挂在播放器控制台的「歌词校准」面板里。
  assert.ok(indexHtml.indexOf('id="lyric-calib-translation"') >= 0, '歌词校准面板应有翻译开关');
  assert.ok(indexHtml.indexOf('id="lyric-calib-transliteration"') >= 0, '歌词校准面板应有音译开关');
  assert.ok(indexHtml.indexOf('id="lyric-platform-seg"') >= 0, '歌词校准面板应有歌词接入平台');
  assert.ok(indexHtml.indexOf('id="lyric-platform-state"') >= 0, '应显示当前锁定的歌词平台');
  assert.ok(indexHtml.indexOf('toggleLyricTranslationQuick(') >= 0);
  assert.ok(indexHtml.indexOf('toggleLyricTransliterationQuick(') >= 0);
  assert.ok(indexHtml.indexOf('setLyricPlatform(') >= 0);
  // 旧的外观面板入口已经移除（改为校准面板里的两个开关）。
  assert.strictEqual(indexHtml.indexOf('id="lyric-transliteration-mode-seg"'), -1, '旧音译档位段应已移除');

  assert.ok(actionsText.indexOf('function setLyricTransliterationMode(') >= 0);
  assert.ok(actionsText.indexOf('function updateLyricTransliterationModeControls(') >= 0);
  assert.ok(actionsText.indexOf('function setLyricPlatform(') >= 0);
  assert.ok(actionsText.indexOf('function updateLyricPlatformControls(') >= 0);
  assert.ok(actionsText.indexOf('function toggleLyricTranslationQuick(') >= 0);
  assert.ok(actionsText.indexOf('function toggleLyricTransliterationQuick(') >= 0);
  assert.ok(actionsText.indexOf('line.transliteration ||') >= 0, '歌词渲染签名要包含音译，否则音译变化不刷新');
  assert.ok(persistenceText.indexOf('normalizeSavedLyricTransliterationMode') >= 0, '音译档位要能持久化');
  // 开启即"全行显示"，避免译文/音译只出现在两行上。
  assert.ok(actionsText.indexOf("fx.lyricTranslationMode = turningOn ? 'multi' : 'off'") >= 0);
  assert.ok(actionsText.indexOf("fx.lyricTransliterationMode = turningOn ? 'multi' : 'off'") >= 0);
}

function testServerLyricLrcGuard() {
  // 网易云 lyric_new 的 lrc 是逐字 JSON，不是 LRC；服务端必须识别并回退到纯 LRC，
  // 否则主歌词解析为空，译文与音译都无处可贴。
  assert.ok(serverText.indexOf('function lyricTextLooksStructured(') >= 0, '服务端要识别结构化伪 LRC');
  assert.ok(serverText.indexOf('lyricTextLooksStructured(primaryLrcText) ? \'\' : primaryLrcText') >= 0, '发送前不能把 JSON 当 LRC 下发');
  assert.ok(serverText.indexOf('!lyricTextLooksStructured(fallbackLrcText)') >= 0, '合并时要优先保留纯 LRC');
  assert.ok(serverText.indexOf('lyricTextLooksStructured(lrc)') >= 0, '结构化 lrc 不应被当作可用主歌词');
}

testTransliterationAliases();
testTransliterationPayload();
testAttachToPrimaryLines();
testLyricPlatformPreference();
testUiWiringPresent();
testServerLyricLrcGuard();
console.log('OK lyric-transliteration');
