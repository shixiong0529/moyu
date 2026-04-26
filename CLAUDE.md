# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在此仓库中工作时的指引。

## 运行项目

用浏览器直接打开 `Hearth Community.html`，无需构建步骤，无需服务器。React 18、ReactDOM 和 Babel standalone 均从 CDN 加载，所有 `.jsx` 文件在浏览器运行时由 Babel 即时转译。

本项目没有测试、lint 工具和包管理器。

## 架构

**无模块系统。** 每个 `.jsx` 文件末尾通过 `Object.assign(window, { 组件A, 组件B })` 将组件暴露到全局。脚本必须按 HTML 中 `<script>` 标签声明的顺序加载：

```
icons.jsx → data.jsx → sidebars.jsx → chat.jsx → modals.jsx → extra.jsx → app.jsx
```

**状态集中在 `app.jsx`** 的 `App` 组件中管理，包括当前服务器、频道、私信、主题、强调色、密度、消息列表，全部以 props 向下传递。用户偏好以 `hearth-` 为前缀持久化到 `localStorage`。

**静态种子数据在 `data.jsx`**，通过 `Object.assign` 挂载到 `window`。主要数据结构：
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
| `app.jsx` | `App`（根组件）、内联侧边栏包装器 |

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
  embedCard: { kind, title, meta, hostedBy, rsvp },  // 可选，嵌入卡片
  bot: true,          // 可选，显示 BOT 徽标
}
```
消息列表中还支持 `type: 'intro'`（频道介绍块）和 `type: 'day'`（日期分隔线）两种特殊类型。
