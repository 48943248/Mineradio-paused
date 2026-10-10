# 一键切换播放源（个人二改说明）

> 二改基础版本：Mineradio 2.2.0（`XxHuberrr/Mineradio-paused`，上游长期停更）
> 改动目的：原版只有「当前歌曲换源」，切到 QQ 音乐后播放下一首又会回到歌曲原音源，需要反复手动切换。

## 1. 使用方式

1. 播放任意歌曲，播放器左上角歌曲标题旁会出现一个「音源」小按钮（例如 `音源 自动`）。
2. 点一下「音源」按钮，在弹出的面板里点 **QQ音乐**。
   - 当前歌曲会立刻切到 QQ 音乐版本（保持当前播放进度）；
   - 该选择会被记为本机的**默认播放源**。
3. 之后播放下一首、上一首、歌单里的任何一首，都会自动在 QQ 音乐里匹配「同名同歌手」的版本再播放，**不需要再手动切换**。
4. 想恢复原样：点「音源」按钮 → 选 **自动**，即回到“跟随歌曲自己的音源”。

原有的「单曲换源」入口（歌曲标题上的 `NE / QQ / KG` 小标签）也保留：用它给某一首换源后，同样会记住该音源作为默认播放源。

## 2. 行为细节

| 场景 | 行为 |
| --- | --- |
| 已锁定播放源，播放下一首 | 播放前先在目标音源搜索「歌名 + 主歌手」，严格匹配成功才替换，然后正常播放 |
| **目标音源没有版权**（搜不到同名同歌手版本） | ①先找**其它已登录平台**的同名同歌手正版并播放；②其它平台都没登录/没匹配时，退回**目标音源自己的试听版本**（歌名一致即可）；③仍然没有才保留原歌并缓存结果 |
| 目标音源无匹配的兜底结果 | 兜底得到的平台会标记为"已为锁定音源兜底"，避免下一轮又切回目标音源来回横跳；结果缓存 5 分钟 |
| 选中的音源没有登录/播放授权（如 QQ、酷狗未登录） | 不锁定该音源，弹出提示并打开对应平台的登录入口；登录后再点一次即可 |
| 匹配到的版本播放失败（如需要会员） | 走原有的自动换源/回退逻辑，并记录 10 分钟内不再对这首歌重复尝试 |
| 歌曲本身已经是目标音源 | 不做任何请求，直接播放 |
| 本地音乐、播客、电台 | 不参与默认音源匹配 |
| 专辑无缝预载 / Cuefield AutoMix 预混 | 当下一首要跨音源时自动跳过预载，避免把另一个音源的文件混进播放 |
| 重启软件 | 从本机 `localStorage` 读回上次选择的播放源 |

## 3. 存储位置

- `localStorage` 键名：`mineradio-playback-source-preference`
- 取值：`auto` / `netease` / `qq` / `kugou` / `qishui` / `spotify`

## 4. 代码改动清单（二改）

| 文件 | 改动 |
| --- | --- |
| `public/js/modules/05-playback/12a-preferred-playback-source.js` | 新增：默认播放源状态、持久化、一键切换面板、同音源匹配与应用逻辑 |
| `public/js/index-loader.js` | 注册新模块（排在 `13-playback-start-audio.js` 之前） |
| `public/js/modules/05-playback/13-playback-start-audio.js` | `playQueueAt` 在解析播放地址前调用 `applyPreferredPlaybackSourceAt`；跨音源时跳过专辑无缝预载 |
| `public/js/modules/05-playback/07-search.js` | 单曲换源成功后把该音源记为默认播放源；换源面板加说明文字 |
| `public/js/modules/05-playback/11-provider-fallback.js` | 默认音源候选播放失败时写入失败缓存 |
| `public/js/modules/05-playback/18-cuefield-automix-integration.js` | 跨音源时跳过 Cuefield 预混预载 |
| `public/js/modules/02-visual/15-ripples-cover-depth.js` | 在歌曲标题徽标区渲染「音源」按钮 |
| `public/css/index.css` | 新按钮与面板说明样式 |
| `tests/preferred-playback-source.test.js` | 新增回归测试 |
| `server.js` | `QQ_QUALITY_CANDIDATE_TEMPLATES` 增加 `AI00`（臻品母带）/ `Q000`（臻品全景声），`normalizeQualityPreference` 增加 `spatial` 档位 |
| `public/js/modules/00-state/00-core-stores.js` | QQ 音质面板增加两个会员档位 |
| `public/js/modules/05-playback/00-api-quality-output.js` | 档位归一化 / 标签 / 排序 / 会员提示 |
| `public/js/modules/05-playback/11-provider-fallback.js` | QQ 会员音质失败后逐级降档 |
| `tests/qq-member-quality-tier.test.js` | 音质档位回归测试 |

## 5. 回到原版

删除 `public/js/modules/05-playback/12a-preferred-playback-source.js`，并撤销上表中除该文件外的改动即可；所有改动都以 `typeof xxx === 'function'` 做守卫，缺少新模块时不会影响原版逻辑。

## 6. 音质档位（同一批二改）

音质档位严格按平台区分，音质面板显示的永远是**当前歌曲所属平台**的档位：

| 平台 | 档位（从高到低） | 说明 |
| --- | --- | --- |
| 网易云 | 超清母带 → 高清臻音 → 无损 SQ → 极高 HQ → 标准 | 「超清母带」需要网易云 SVIP，未开通时置灰 |
| QQ 音乐 | **臻品母带 → 臻品全景声** → Hi-Res FLAC → 无损 FLAC → 320k → 128k | 前两档为本次新增的 QQ 会员音质（`AI00` / `Q000`） |
| 酷狗 | Hi-Res / 臻品 → 无损 FLAC → 320k → 128k | 未改动 |
| 汽水 / Spotify | 匹配源 | 未改动 |

QQ 会员音质的处理方式：

- 面板里可以**直接选择**（不预先锁死），选到时会提示"需要 QQ 音乐 SVIP"；
- 服务端按 `AI00 → Q000 → RS01 → F000 → M800 → M500 → C400` 顺序请求，**哪个档位有权限就用哪个**；
- 实际播放档位低于所选档位时，播放页提示"QQ 音质自动降级：请求 臻品母带，实际播放 无损 FLAC"；
- 网易云「超清母带」的行为保持不变（没有 SVIP 时禁止选择）。

