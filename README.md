# Mineradio

> **本仓库为个人二改版（非官方 fork）**
>
> 本仓库是 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio) `v2.2.0` 的**修改版本**，由个人基于上游源码二改，与上游作者及 Mineradio 官方**没有隶属或背书关系**。上游项目已长期停更。
>
> 在上游 2.2.0 基础上新增 **一键切换播放源**：播放器歌曲标题旁的「音源」按钮点一次，即可把播放源切到 QQ 音乐（或酷狗 / 网易云 / 汽水 / Spotify），之后每一首都会自动匹配并使用该音源的同名同歌手版本，**不需要再逐首手动切换**；选择保存在本机，重启后仍然生效。详细说明见 [一键切换播放源](./docs/PLAYBACK_SOURCE_PREFERENCE.md)。
>
> 授权与修改声明：本二改版继续以 **GPL-3.0-only** 发布，版权与"已修改"声明见下方 [上游关系、版权与许可](#上游关系版权与许可)。

> **上游项目状态：长期停更**
>
> 目前因个人原因，Mineradio 项目处于长期停更状态。感兴趣的个人玩家可随意使用本项目进行创作，也可以自行修改和修复 bug。希望各位玩得开心，也希望世界和平，享受我们的音乐。
>
> 本仓库保留公开源码、历史版本和下载说明，方便个人玩家 Fork、建立分支或制作二创版本。

![Mineradio 暗场启动页](./docs/assets/readme/cinema-beat-smoke.png)

Mineradio 是一款 Windows 桌面沉浸式音乐播放器，把搜索播放、歌词舞台、粒子视觉、3D 歌单架和完整桌面模式组合成一个更接近现场感的私人音乐空间。

## 下载或安装被拦截怎么办

小众 Electron 桌面软件、未签名安装包有时会被浏览器、Windows Defender 或 SmartScreen 提示风险。请先确认安装包来自本次公告的下载入口，文件名是 `Mineradio-2.2.0-Setup.exe`。

1. 浏览器下载栏提示风险时，打开下载列表，点这条下载右侧的 `...` 三个点，选择 `保留` / `仍要保留` / `显示更多` 后继续保留。
2. Windows SmartScreen 弹出蓝色拦截窗口时，点 `更多信息`，再点 `仍要运行`。
3. 如果杀毒软件明确显示木马、高危或已经隔离，不要强行运行；删除该文件后重新从上面的网盘入口下载，仍然异常请带截图反馈给作者。

## 核心特性

- 一键切换播放源（二改）：播放器点一次「音源」即可锁定 QQ 音乐等平台，后续歌曲自动沿用，无需逐首手动换源
- 首页包含每日推荐、平台推荐、继续听、听歌画像和我的歌单入口
- 完整桌面模式保留播放器、主页、歌单和桌面交互
- 支持本地 MP4 与 Wallpaper Engine 视觉内容
- 播放后切换到 Emily / 默认播放态视觉，歌词舞台与粒子舞台同步工作
- 基于节奏的电影镜头视觉系统
- 面向长播客和 DJ 曲目的专属视觉模式
- 歌词舞台、自定义歌词、歌词位置与视觉控制
- 自定义专辑封面上传与裁剪
- 右键唤起 3D 歌单架，支持歌单队列浏览
- 网易云音乐账号、搜索、歌单、播客等体验接入
- QQ 音乐搜索、登录态与音源补充接入
- GitHub Releases 更新检测与下载入口
- 首次启动内置「默认测试」视觉用户存档，软件内默认视觉参数与该存档一致

## 开发运行

```bash
npm install
npm start
npm run build:win
```

桌面版入口由 Electron 主进程加载本地服务。`npm run build:win` 会生成 Windows NSIS 安装包，产物位于 `dist/`。

## 第三方音乐平台说明

Mineradio 不是网易云音乐、QQ 音乐或腾讯音乐娱乐集团的官方客户端，也不隶属于任何音乐平台。

项目中的第三方平台接入仅用于个人学习、本地客户端体验和用户自有账号的播放辅助。请遵守对应平台的用户协议、版权规则和会员权益规则。项目不会提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力。

## 用户数据与隐私

登录 Cookie、搜索历史、自定义封面、自定义歌词、节奏分析缓存等数据只应保存在本机用户数据目录或浏览器本地存储中，不应提交到仓库。

更多说明见 [PRIVACY.md](./PRIVACY.md)。

## 致谢

Mineradio 由 XxHuberrr 主要设计与打造。emily 作为早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此感谢。

同时感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈和发布准备中的帮助。

## 上游关系、版权与许可

### 上游关系

本仓库是 [XxHuberrr/Mineradio-paused](https://github.com/XxHuberrr/Mineradio-paused) 的**非官方修改版本（fork）**，以上游 `v2.2.0` 的公开源码为基线。除下方列出的改动外，其余代码、界面与文档均来自上游。

| 项目 | 上游 | 本仓库（二改版） |
| --- | --- | --- |
| 仓库 | [XxHuberrr/Mineradio-paused](https://github.com/XxHuberrr/Mineradio-paused) | [48943248/Mineradio-paused](https://github.com/48943248/Mineradio-paused) |
| 基线版本 | `v2.2.0` | `v2.2.0` + 二改补丁 |
| 授权 | GPL-3.0-only | GPL-3.0-only（沿用同一许可证） |
| 维护状态 | 长期停更 | 个人自用二改，非官方、无背书 |

### 版权

版权与授权声明以下方 [版权与授权](#版权与授权) 章节为准：上游原版版权归 XxHuberrr 所有，二改部分版权归本仓库维护者；第三方依赖与第三方音乐服务分别遵循其各自的授权与服务条款。

### 许可与"修改"声明

本项目（含二改部分）继续以 **GNU General Public License v3.0（GPL-3.0-only）** 发布，完整条款见 [LICENSE](./LICENSE)。

依据 **GPL-3.0 第 5 条**（修改版本必须以显著方式声明"已修改"及修改日期，并整体按 GPL 授权），特此声明：

1. **已修改**：本仓库是上游 `v2.2.0` 的修改版本，相对上游**有改动**。改动明细见 [CHANGELOG.md](./CHANGELOG.md)，完整差异见仓库根目录补丁 `mineradio-preferred-playback-source.patch`。
2. **修改日期**：二改工作于 **2026 年 10 月**进行。
3. **修改范围**（仅涉及下列文件，其余上游文件未改动）：
   - **新增**：`public/js/modules/05-playback/12a-preferred-playback-source.js`、`docs/PLAYBACK_SOURCE_PREFERENCE.md`、`tests/preferred-playback-source.test.js`、`tests/qq-member-quality-tier.test.js`、`tests/playlist-collect-sync.test.js`、`tests/lyric-transliteration.test.js`
   - **修改**：`server.js`、`kugou-api.js`、`public/index.html`、`public/css/index.css`、`public/js/index-loader.js`、`public/default-user-fx-archive.json`、`public/desktop-lyrics.html`、`desktop/main.js`、`desktop/preload.js`、`desktop/overlay-preload.js`、`CHANGELOG.md`、`README.md`，以及 `public/js/modules/` 下的状态、播放、歌词、视觉与面板相关模块（`00-state`、`02-visual`、`05-playback`、`06-lyrics`、`07-fx`、`10-shell`）
4. **再分发条件**：任何再分发（包括对二改版再次修改后分发）都必须：
   - 保留本文件与 [LICENSE](./LICENSE) 中的版权声明与许可声明，不得移除或改写；
   - 显著标注"已修改"以及修改日期；
   - 整体继续以 GPL-3.0（或 GPL 兼容方式）授权，**不得附加额外限制**；
   - 向接收者提供完整对应源码（本仓库源码 + 补丁即满足该要求）。
5. **二进制分发**：Release 中的 `Mineradio-2.2.0-mr.*-Setup.exe` 是上述修改版本的安装包；其完整对应源码就是本仓库源码，未做任何额外封闭。安装包**未做代码签名**。
6. **无担保**：与 GPL-3.0 第 15、16 条一致，本二改版按"现状"提供，**不提供任何明示或默示担保**（包括可售性与特定用途适用性）；因使用本软件产生的任何后果由使用者自行承担。
7. **合规提示**：GPL-3.0 允许商业性再分发，但再分发者必须自行遵守上述全部条款；`Mineradio` 名称、MR Logo 等标识的使用需另行获得权利人许可。

## 版权与授权

本项目是基于 [XxHuberrr/Mineradio-paused](https://github.com/XxHuberrr/Mineradio-paused) 的二次开发版本。

上游项目作者：XxHuberrr  
上游项目采用 **GNU General Public License v3.0 (GPL-3.0)** 授权。

本项目在上游项目基础上进行了修改和功能扩展，包括但不限于：

- 增加播放源一键切换功能
- 增加播放源选择的持久化
- 切换播放源后自动沿用所选播放源
- 其他个人修改和优化

由于本项目包含上游 GPL-3.0 授权代码，本项目整体按照 **GPL-3.0** 发布。

本项目的修改版本应继续遵守 GPL-3.0 的相关条款。

Copyright © 2026 48943248

### 上游原版版权保留

为遵守 GPL-3.0 对修改版本的要求，上游原版的版权声明在此一并保留：

Copyright (C) 2026 XxHuberrr.

MR Logo、Mineradio 名称、界面视觉设计与原创视觉表达归原作者所有，且**不随 GPL 授权转移**；第三方依赖和第三方服务分别遵循其各自授权与服务条款。完整差异与"已修改"声明见上方 [许可与"修改"声明](#许可与修改声明)。
