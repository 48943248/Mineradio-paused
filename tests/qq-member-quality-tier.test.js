const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appRoot = path.resolve(__dirname, '..');
const serverPath = path.join(appRoot, 'server.js');
const qualityPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '00-api-quality-output.js');
const storesPath = path.join(appRoot, 'public', 'js', 'modules', '00-state', '00-core-stores.js');
const fallbackPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '11-provider-fallback.js');
const startPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js');

const serverText = fs.readFileSync(serverPath, 'utf8');
const qualityText = fs.readFileSync(qualityPath, 'utf8');
const storesText = fs.readFileSync(storesPath, 'utf8');
const fallbackText = fs.readFileSync(fallbackPath, 'utf8');
const startText = fs.readFileSync(startPath, 'utf8');

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

function extractConstArray(sourceText, name) {
  const start = sourceText.indexOf(`const ${name} = [`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = sourceText.indexOf('];', start);
  assert.notEqual(end, -1, `missing end of ${name}`);
  return sourceText.slice(start, end + 2);
}

function testServerQualityChain() {
  const templates = extractConstArray(serverText, 'QQ_QUALITY_CANDIDATE_TEMPLATES');
  const normalize = extractFunction(serverText, 'normalizeQualityPreference');
  const candidatesFrom = extractFunction(serverText, 'qualityCandidatesFrom');
  const sandbox = { console, Object, Array, String, Math, JSON };
  vm.runInNewContext(`${templates}\n${normalize}\n${candidatesFrom}\nthis.T = QQ_QUALITY_CANDIDATE_TEMPLATES; this.norm = normalizeQualityPreference; this.from = qualityCandidatesFrom;`, sandbox);

  assert.strictEqual(sandbox.norm('spatial'), 'spatial', 'QQ 臻品全景声应有独立档位');
  assert.strictEqual(sandbox.norm('atmos'), 'spatial');
  assert.strictEqual(sandbox.norm('jymaster'), 'jymaster');
  assert.strictEqual(sandbox.norm('svip'), 'jymaster');
  assert.strictEqual(sandbox.norm('hires'), 'hires');

  const chain = sandbox.from('jymaster', sandbox.T).map(item => item.level).join(',');
  assert.strictEqual(
    chain,
    'jymaster,spatial,hires,lossless,exhigh,standard,aac',
    'QQ 会员音质必须构成从母带向下的完整降级链'
  );
  assert.strictEqual(sandbox.from('spatial', sandbox.T)[0].prefix, 'Q000');
  assert.strictEqual(sandbox.from('jymaster', sandbox.T)[0].prefix, 'AI00');
  assert.strictEqual(
    sandbox.from('standard', sandbox.T).map(item => item.prefix).join(','),
    'M500,C400',
    '标准档位的原有降级行为不应改变'
  );
  assert.strictEqual(
    sandbox.from('lossless', sandbox.T).map(item => item.prefix).join(','),
    'F000,M800,M500,C400',
    '无损档位的原有降级行为不应改变'
  );
}

function testFrontendQualityNormalization() {
  const isProvider = extractFunction(qualityText, 'normalizePlaybackProvider');
  const normalize = extractFunction(qualityText, 'normalizePlaybackQuality');
  const forProvider = extractFunction(qualityText, 'normalizePlaybackQualityForProvider');
  const label = extractFunction(qualityText, 'playbackQualityLabel');
  const shortLabel = extractFunction(qualityText, 'playbackQualityShortLabel');
  const rank = extractFunction(qualityText, 'playbackQualityRank');
  const sandbox = { console, Object, Array, String, Math, JSON };
  vm.runInNewContext(
    `${isProvider}\n${normalize}\n${forProvider}\n${label}\n${shortLabel}\n${rank}\n` +
    'this.forProvider = normalizePlaybackQualityForProvider; this.label = playbackQualityLabel;' +
    'this.shortLabel = playbackQualityShortLabel; this.rank = playbackQualityRank; this.normalize = normalizePlaybackQuality;',
    sandbox
  );

  assert.strictEqual(sandbox.normalize('spatial'), 'spatial');
  assert.strictEqual(sandbox.normalize('atmos'), 'spatial');
  assert.strictEqual(sandbox.normalize('臻品母带'), 'hires', 'unknown text keeps the old fallback');

  // 关键回归：QQ 的臻品母带以前会被强制降成 hires，现在必须保留。
  assert.strictEqual(sandbox.forProvider('jymaster', 'qq'), 'jymaster');
  assert.strictEqual(sandbox.forProvider('spatial', 'qq'), 'spatial');
  assert.strictEqual(sandbox.forProvider('jymaster', 'netease'), 'jymaster', '网易云超清母带保持可用');
  assert.strictEqual(sandbox.forProvider('spatial', 'netease'), 'hires', '网易云没有全景声档位，应回落');
  assert.strictEqual(sandbox.forProvider('jymaster', 'kugou'), 'hires', '其它平台不应请求不认识的档位');
  assert.strictEqual(sandbox.forProvider('spatial', 'spotify'), 'hires');

  assert.strictEqual(sandbox.label('jymaster', 'qq'), '臻品母带');
  assert.strictEqual(sandbox.label('spatial', 'qq'), '臻品全景声');
  assert.strictEqual(sandbox.label('jymaster', 'netease'), '超清母带');
  assert.strictEqual(sandbox.shortLabel('jymaster', 'qq'), 'QQ 母带');
  assert.strictEqual(sandbox.shortLabel('spatial', 'qq'), 'QQ 空间');

  assert.ok(sandbox.rank('jymaster', 'qq') > sandbox.rank('spatial', 'qq'));
  assert.ok(sandbox.rank('spatial', 'qq') > sandbox.rank('hires', 'qq'));
  assert.ok(sandbox.rank('hires', 'qq') > sandbox.rank('lossless', 'qq'));
  assert.ok(sandbox.rank('lossless', 'qq') > sandbox.rank('exhigh', 'qq'));
  assert.ok(sandbox.rank('exhigh', 'qq') > sandbox.rank('standard', 'qq'));
  assert.ok(sandbox.rank('jymaster', 'netease') > sandbox.rank('hires', 'netease'), '网易云超清母带仍高于 Hi-Res');
  assert.ok(sandbox.rank('jymaster', 'netease') >= sandbox.rank('jymaster', 'qq'), '超清母带与臻品母带同为最高档');
}

function testQqOptionList() {
  const qqBlock = storesText.slice(
    storesText.indexOf('qq: ['),
    storesText.indexOf('kugou: [')
  );
  assert.ok(qqBlock.includes("key: 'jymaster'"), 'QQ 音质面板应包含臻品母带');
  assert.ok(qqBlock.includes("key: 'spatial'"), 'QQ 音质面板应包含臻品全景声');
  assert.ok(qqBlock.includes('臻品母带') && qqBlock.includes('臻品全景声'));
  assert.ok(qqBlock.includes('member: true'), 'QQ 会员档位用 member 标记（可尝试，不锁死）');
  assert.ok(!qqBlock.includes('svip: true'), 'QQ 会员档位不应套用网易云 SVIP 的锁定逻辑');
  const neteaseBlock = storesText.slice(storesText.indexOf('netease: ['), storesText.indexOf('qq: ['));
  assert.ok(neteaseBlock.includes("key: 'jymaster'") && neteaseBlock.includes('svip: true'), '网易云超清母带仍保持 SVIP 锁定');
}

function testQqRetryQualities() {
  const fn = extractFunction(fallbackText, 'qqPlaybackRetryQualities');
  const sandbox = {
    console,
    Object,
    Array,
    String,
    normalizePlaybackQualityForProvider(value) { return value; },
    getProviderPlaybackQuality() { return 'lossless'; },
  };
  vm.runInNewContext(`${fn}\nthis.retry = qqPlaybackRetryQualities;`, sandbox);
  const retry = value => Array.prototype.slice.call(value).join(',');
  assert.strictEqual(retry(sandbox.retry('jymaster', 'standard')), 'hires,lossless,exhigh,standard');
  assert.strictEqual(retry(sandbox.retry('spatial', 'standard')), 'hires,lossless,exhigh,standard');
  assert.strictEqual(retry(sandbox.retry('hires', 'standard')), 'exhigh,standard');
  assert.strictEqual(retry(sandbox.retry('exhigh', 'standard')), 'standard');
  assert.ok(retry(sandbox.retry('spatial', 'spatial')).includes('hires'), '全景声解析失败时不能直接跳到 320k');
}

function testWiringIsPresent() {
  assert.ok(qualityText.includes('QQ 会员音质'), '选择 QQ 会员音质时应给出会员权限提示');
  assert.ok(qualityText.includes('function playbackQualityMemberReady('));
  assert.ok(
    startText.includes("requestedQuality === 'jymaster' || requestedQuality === 'spatial'"),
    'playQueueAt 应只在用户主动选 QQ 会员音质时才弹降级提示'
  );
}

testServerQualityChain();
testFrontendQualityNormalization();
testQqOptionList();
testQqRetryQualities();
testWiringIsPresent();
console.log('OK qq-member-quality-tier');
