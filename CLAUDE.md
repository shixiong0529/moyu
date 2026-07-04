# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在此仓库中工作时的指引。

## 运行项目

本项目是 FastAPI 后端 + React 18/Babel Standalone 前端。前端没有构建步骤，`.jsx` 文件在浏览器运行时由 Babel 即时转译；完整功能需要启动后端。

本地启动：

```bash
cd backend
python -m alembic upgrade head
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

浏览器访问 `http://localhost:8000` 打开主站，访问 `http://localhost:8000/admin.html` 打开管理后台。直接双击打开 `Hearth Community.html` 只能用于静态界面预览，登录、上传、聊天、WebSocket、管理后台等功能需要后端。

本项目没有前端构建、lint 工具和包管理器。

## 架构

**无前端模块系统。** 每个 `.jsx` 文件末尾通过 `Object.assign(window, { 组件A, 组件B })` 将组件暴露到全局。主站脚本必须按 HTML 中 `<script>` 标签声明的顺序加载：

```
icons.jsx → data.jsx → sidebars.jsx → chat.jsx → modals.jsx → extra.jsx → api.jsx → auth.jsx → app.jsx
```

管理后台入口是 `admin.html`，加载独立的 `admin.jsx`。

**状态集中在 `app.jsx`** 的 `App` 组件中管理，包括认证用户、当前服务器、频道、私信、主题、强调色、密度、消息列表和弹窗状态，全部以 props 向下传递。用户偏好以 `hearth-` 为前缀持久化到 `localStorage`。

**后端 API 在 `backend/routers/`**，数据库模型在 `backend/models.py`，Pydantic schema 在 `backend/schemas.py`。数据库结构变更需要新增 Alembic 迁移并执行 `python -m alembic upgrade head`。

**静态种子数据在 `data.jsx`**，通过 `Object.assign` 挂载到 `window`，仅作为 fallback/界面预览使用。主要数据结构：
- `SERVERS` — 服务器栏条目（`kind: 'dm'` 表示私信入口）
- `CHANNELS` — 以服务器 id 为键，每项包含分组的频道数组
- `DM_LIST` — 私信联系人列表
- `MEMBERS` — 右侧成员栏的分组成员
- `SEED_MESSAGES` — `bookclub/the-drifting` 频道的种子消息

用户发送的新消息存入 `messagesByChannel` 状态映射（键为 `serverId/channelId` 或 `dm:dmId`），渲染时与种子消息合并。

## 主题系统

根 `<div>` 携带 `className="app theme-{light|dark} density-{compact|default|cozy}"` 以及内联 CSS 变量：

| 变量 | 来源 |
|---|---|
| `--accent` / `--accent-soft` / `--accent-ink` | app.jsx 中的 `ACCENT_MAP[accent]` |
| `--paper-0/1/2/3`、`--ink-0/1/2` | styles.css 主题类 |
| `--ff-serif`、`--ff-mono` | styles.css（Source Serif 4 / JetBrains Mono）|

头像颜色为 styles.css 中定义的 `av-1` 到 `av-8` CSS 类。

## TweaksPanel 调试面板

一个浮动的设计微调覆盖层（extra.jsx），通过向窗口发送消息激活：
```js
window.postMessage({ type: '__activate_edit_mode' }, '*')
```
HTML 中还内嵌了 `window.__HEARTH_TWEAKS`，包含初始 theme/accent/density 配置，供外部编辑器集成使用。

## 组件索引

| 文件 | 主要导出 |
|---|---|
| `icons.jsx` | `Icon`、`ChannelGlyph`、`Avatar` |
| `data.jsx` | `SERVERS`、`CHANNELS`、`DM_LIST`、`MEMBERS`、`SEED_MESSAGES` |
| `sidebars.jsx` | `ServerRail`、`ChannelSidebar`、`DMSidebar`、`MemberSidebar`、`UserCard` |
| `chat.jsx` | `ChatArea`、`ChatHeader`、`MessageGroup`、`Composer` |
| `modals.jsx` | `Modal`、`CreateServerModal`、`ProfileCard`、`Settings`、`ToggleSwitch` |
| `extra.jsx` | `TweaksPanel`、`DMView` |
| `api.jsx` | `API` HTTP/WebSocket 客户端 |
| `auth.jsx` | 登录、注册、认证状态 |
| `app.jsx` | `App`（根组件）、内联侧边栏包装器 |
| `admin.jsx` | 管理后台单页应用 |

## 消息格式

`MessageGroup`（chat.jsx）渲染的消息对象结构：
```js
{
  id, type: 'message',
  name, color,        // 显示名 + av-N 头像色类
  role,               // 'founder' | 'editor' | 'mod' | 'bot'，影响名字颜色
  time,               // 显示时间字符串，如 '21:07'
  lines: [...],       // 文本段落数组
  reactions: [{ emo, count, mine }],
  replyTo: { name, text },           // 可选，引用回复
  embed: { kind: 'link', url, title, description, image, siteName },  // 可选，链接预览卡片
  isAnonymous: true,  // 可选，匿名树洞消息（见下）
  bot: true,          // 可选，显示 BOT 徽标
}
```
消息列表中还支持 `type: 'intro'`（频道介绍块）和 `type: 'day'`（日期分隔线）两种特殊类型。

`embedCard: { kind, meta, hostedBy, rsvp }`（data.jsx 种子数据里的旧字段）从未真正接入渲染，是历史遗留的静态展示数据，与上面这个真实工作的 `embed` 字段无关，不要混淆。

## 链接预览卡片

发消息时后端（`backend/link_preview.py`）会检测正文里的第一个 URL，抓取其 Open Graph 元数据（`og:title`/`og:description`/`og:image`/`og:site_name`），写入 `messages.embed_json`，前端 `LinkPreviewCard`（chat.jsx）渲染成卡片。抓取前会做 SSRF 防护：解析域名对应的所有 IP，任意一个落在内网/回环/链路本地范围就拒绝抓取；重定向也会逐跳重新校验。抓取失败（超时、内网地址、非 HTML 响应等）时 `embed` 就是 `null`，不影响消息本身发送成功。

## 匿名树洞

频道（`Channel.allow_anonymous`）可以在编辑频道弹窗里开启"允许匿名发言"。开启后 Composer 会出现 🎭 匿名切换按钮，发送时传 `is_anonymous: true`。同一用户在同一频道内的匿名身份编号固定不变（`channel_anon_identities` 表），显示为"🎭 树洞居民 #N"；不同频道之间编号不复用，避免互相关联。

脱敏是**按查看者身份**在后端动态计算的，不是简单的一份数据发给所有人：服务器 founder/mod 看到的永远是真实身份（用于内容审核），其他成员（包括匿名消息的发送者本人）看到的是脱敏后的"树洞居民 #N"。REST 接口和 WebSocket 广播（`ConnectionManager.broadcast_to_channel_masked`）都按这个规则分别计算，不能只生成一份数据广播给所有连接。匿名消息不触发 `@提及` 的 Telegram 通知（通知文案会带发送者真实身份，等于变相解除匿名）。
