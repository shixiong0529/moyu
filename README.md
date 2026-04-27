# 摸鱼社区

> 一个摸鱼风格的中文互动社区平台，支持服务器、频道、实时聊天、私信、好友系统和 Telegram 推送通知。

![Biscord Login](docs/demo-login.png)

---

## 目录

- [技术栈](#技术栈)
- [功能列表](#功能列表)
- [项目结构](#项目结构)
- [快速启动](#快速启动)
- [环境变量](#环境变量)
- [数据库结构](#数据库结构)
- [API 接口](#api-接口)
- [WebSocket 实时协议](#websocket-实时协议)
- [Telegram 通知](#telegram-通知)
- [前端架构](#前端架构)
- [主题系统](#主题系统)

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | FastAPI 0.111 + Python 3.11 |
| ORM | SQLAlchemy 2.x |
| 数据库 | PostgreSQL（生产）/ SQLite（本地开发） |
| 迁移 | Alembic |
| 认证 | JWT（python-jose）+ bcrypt 密码加密 |
| 实时通讯 | WebSocket（FastAPI 原生） |
| HTTP 客户端 | httpx（用于 Telegram API 调用） |
| 前端 | React 18 + Babel Standalone（无构建工具） |
| 字体 | IBM Plex Sans / Source Serif 4 / JetBrains Mono / Noto Serif SC |

---

## 功能列表

### 用户系统
- [x] 注册 / 登录 / 登出（用户名 + 密码）
- [x] JWT access token + refresh token，自动续期
- [x] 个人资料编辑（显示名、自我介绍、头像颜色、在线状态）
- [x] 在线状态：在线 / 离开 / 请勿打扰 / 离线

### 服务器（社区）
- [x] 创建服务器（可上传图标，自动创建默认频道）
- [x] 发现推荐服务器（公开服务器列表）
- [x] 通过邀请码加入（支持完整链接、hearth://协议链接、纯码、服务器名）
- [x] 申请加入（管理员审核模式）
- [x] 退出服务器
- [x] 服务器成员管理（founder / mod / member 三级角色）
- [x] 生成邀请链接（可设置使用次数和过期时间）
- [x] 邀请好友加入：通过私信发送带邀请链接的消息
- [x] 加入申请的审核（通过 / 拒绝），仅 founder 可操作
- [x] 加入申请提交时自动向 founder 发送私信通知
- [x] 服务器设置（founder 可修改名称、缩写、颜色、图标、描述）
- [x] 加入策略（open 自由加入 / approval 需要审核 / closed 禁止加入）
- [x] 删除服务器（需输入名称二次确认，仅 founder）

### 频道
- [x] 频道分组（可自定义分组名和顺序）
- [x] 频道类型：文字频道、公告频道、语音频道
- [x] 在服务器内创建频道
- [x] 频道话题（Topic）
- [x] 编辑 / 删除频道（mod+ 可操作）

### 消息
- [x] 发送 / 编辑 / 删除消息
- [x] 引用回复（Reply）
- [x] @提及成员（高亮显示）
- [x] Markdown 渲染（**加粗** *斜体* `代码` 等）
- [x] 图片消息（自动识别图片链接并展示预览）
- [x] 文件/图片上传（JPG、PNG、GIF、WebP，最大 5MB）
- [x] 表情回应（Emoji Reactions，toggle 逻辑）
- [x] 快速回应（📚 ☕ 🌿 ✨）
- [x] 置顶消息（mod/founder 可操作）
- [x] 消息软删除（显示"此消息已被删除"，数据保留）
- [x] 无限滚动加载历史消息（cursor-based 分页）
- [x] 正在输入提示（实时）
- [x] 右键消息上下文菜单
- [x] 消息悬浮操作栏

### 私信（DM）
- [x] 一对一私信
- [x] 未读消息计数
- [x] 消息已读标记
- [x] 私信会话列表
- [x] 私信中服务器邀请卡片（接受 / 拒绝）

### 好友系统
- [x] 发送 / 接受 / 拒绝好友申请（通过用户名）
- [x] 删除好友
- [x] 好友列表（在线状态）
- [x] 好友申请待定列表

### 实时通讯（WebSocket）
- [x] 新消息即时推送
- [x] 消息编辑 / 删除同步
- [x] 表情回应同步
- [x] 置顶消息同步
- [x] 好友申请 / 通过 / 删除事件
- [x] 新私信即时推送

### Telegram 推送通知
- [x] 每用户独立 Bot Token（自带 bot，不依赖服务器统一 bot）
- [x] 绑定方式：填入 Bot Token + Chat ID → 测试连接 → 自动绑定
- [x] 通知事件：收到好友申请 / 好友申请通过 / 收到私信 / 频道被 @提及 / 收到加入申请（founder）
- [x] 通知开关（随时开启/关闭）
- [x] 解除绑定

### 界面与体验
- [x] 6 种主题：暖纸、纯白、石板灰、暖夜、午夜、苔绿
- [x] 6 种强调色：木棕、锈红、鼠尾草、琥珀、李紫、青绿
- [x] 3 种密度：Compact / Default / Cozy
- [x] 亮色 / 暗色切换
- [x] 偏好持久化（localStorage）
- [x] 服务器图标支持自定义上传或颜色+缩写组合
- [x] 成员侧边栏（在线状态、活动状态）
- [x] 服务器右键菜单（邀请成员 / 审核申请 / 服务器设置 / 退出）
- [x] 服务器导轨悬停 tooltip（大字加粗，含箭头指示）
- [x] 用户资料卡弹窗
- [x] 频道快速跳转（Ctrl+K）
- [x] 辅助功能设置：
  - 减少动画效果（全局禁用 transition/animation）
  - 网站字体大小（80%–130% 滑块，实时缩放）
  - 始终显示时间戳（连续消息旁常态显示时间）
  - 图片点击前模糊（点击揭示，再次点击打开原图）

---

## 项目结构

```
biscord/
├── Hearth Community.html   # 前端入口（直接浏览器打开或通过后端访问）
├── styles.css              # 全局样式（主题变量、组件样式）
├── icons.jsx               # SVG 图标库
├── data.jsx                # 静态种子数据（fallback）
├── api.jsx                 # HTTP + WebSocket 客户端（window.API）
├── auth.jsx                # 登录 / 注册界面
├── sidebars.jsx            # 服务器导轨、频道侧边栏、成员侧边栏
├── chat.jsx                # 聊天区域、消息渲染、输入框
├── modals.jsx              # 所有弹窗（创建服务器、设置、好友、邀请等）
├── extra.jsx               # 辅助组件（DM 视图、好友页、Telegram 面板）
├── app.jsx                 # 根组件（状态管理、路由逻辑）
└── backend/
    ├── main.py             # FastAPI 应用入口、路由注册、静态文件服务
    ├── database.py         # SQLAlchemy 引擎和 session
    ├── models.py           # 所有 ORM 模型（13 张表）
    ├── schemas.py          # Pydantic 请求/响应模型
    ├── auth.py             # JWT 工具函数、密码验证
    ├── seed.py             # 数据库种子脚本（初始数据）
    ├── telegram_service.py # Telegram 通知服务
    ├── requirements.txt
    ├── .env.example
    ├── alembic/            # 数据库迁移文件
    ├── uploads/            # 用户上传的图片
    └── routers/
        ├── auth.py         # 注册 / 登录 / Token 刷新
        ├── users.py        # 用户信息读写
        ├── servers.py      # 服务器 CRUD、邀请、加入申请、加入策略
        ├── channels.py     # 频道、消息、反应、置顶
        ├── dm.py           # 私信
        ├── friends.py      # 好友系统
        ├── websocket.py    # WebSocket 连接管理器
        └── telegram_bot.py # Telegram 绑定 API
```

---

## 快速启动

### 1. 克隆项目

```bash
git clone <repo-url>
cd biscord
```

### 2. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少设置 SECRET_KEY
```

### 4. 初始化数据库

```bash
# 执行所有 Alembic 迁移
python -m alembic upgrade head

# 写入种子数据（创建示例服务器和测试账号）
python seed.py
```

### 5. 启动后端

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 6. 打开前端

浏览器访问：**http://localhost:8000**

或者直接双击打开 `Hearth Community.html`（从文件系统打开也可使用，但图片上传功能需要后端）

### 测试账号

种子脚本创建了两个测试账号：

| 用户名 | 密码 | 显示名 |
|--------|------|--------|
| `demo1` | `demo1234` | 苏沐 |
| `demo2` | `demo1234` | 江予白 |

---

## 环境变量

文件：`backend/.env`

```env
# 必填（生产环境用 PostgreSQL，本地开发可用 SQLite）
DATABASE_URL=postgresql://user:password@localhost:5432/biscord
SECRET_KEY=请替换为至少32位的随机字符串

# 可选（默认值）
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# Telegram 通知（可选）
# 留空时通知功能静默禁用，不影响其他功能
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
APP_BASE_URL=
```

### 本地开发用 SQLite

```env
DATABASE_URL=sqlite:///./biscord.db
```

其他代码无需改动。

---

## 数据库结构

共 13 张表：

| 表名 | 说明 |
|------|------|
| `users` | 用户账号，含 Telegram 绑定信息 |
| `servers` | 服务器（社区），含图标、描述、推荐标记、加入策略 |
| `server_members` | 服务器成员关系（founder / mod / member） |
| `channel_groups` | 频道分组（侧边栏中的分类） |
| `channels` | 频道（text / announce / voice） |
| `messages` | 频道消息，支持软删除、引用回复 |
| `reactions` | 消息表情回应 |
| `direct_messages` | 私信消息 |
| `pinned_messages` | 置顶消息 |
| `invites` | 服务器邀请码 |
| `join_requests` | 服务器加入申请 |
| `friend_requests` | 好友申请 |
| `friendships` | 好友关系（双向存储） |

---

## API 接口

所有接口前缀 `/api`，认证通过请求头：
```
Authorization: Bearer <access_token>
```

错误格式统一为：`{"detail": "错误说明"}`

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册（username, display_name, password） |
| POST | `/auth/login` | 登录，返回 tokens |
| POST | `/auth/refresh` | 刷新 access token |
| POST | `/auth/logout` | 登出（清除客户端 token） |

### 用户

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users/me` | 当前用户信息 |
| PATCH | `/users/me` | 更新个人资料 |
| GET | `/users/{id}` | 查看其他用户公开信息 |

### 服务器

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/servers` | 我加入的服务器列表（含 owner_username、join_policy） |
| POST | `/servers` | 创建服务器 |
| PATCH | `/servers/{id}` | 修改服务器信息（名称/图标/描述/加入策略，mod+） |
| DELETE | `/servers/{id}` | 删除服务器（仅 founder） |
| GET | `/servers/recommended` | 推荐服务器（含加入状态） |
| GET | `/servers/{id}` | 服务器详情（含频道列表、owner 信息） |
| GET | `/servers/{id}/members` | 成员列表（mod+） |
| DELETE | `/servers/{id}/members/me` | 退出服务器 |
| POST | `/servers/{id}/invite` | 生成邀请码（任意成员可操作） |
| POST | `/servers/{id}/invite-friend` | 向好友发送私信邀请（含邀请链接） |
| POST | `/servers/join` | 通过邀请码加入，按 join_policy 处理 |
| POST | `/servers/{id}/join-requests` | 申请加入（审核模式），自动通知 founder |
| GET | `/servers/{id}/join-requests` | 查看待审申请（仅 founder） |
| POST | `/servers/{id}/join-requests/{rid}/approve` | 通过申请（仅 founder） |
| POST | `/servers/{id}/join-requests/{rid}/reject` | 拒绝申请（仅 founder） |
| POST | `/servers/{id}/channels` | 创建频道（mod+） |
| POST | `/servers/{id}/channel-groups` | 创建频道分组（mod+） |

#### 加入策略（join_policy）

| 值 | 行为 |
|----|------|
| `open` | 任何人通过推荐列表或邀请链接可直接加入 |
| `approval` | 申请或接受邀请后进入待审队列，founder 审核通过才能加入，同时向 founder 发送私信通知 |
| `closed` | 拒绝所有新成员加入 |

### 频道与消息

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/servers/{id}/channels` | 按分组返回频道列表 |
| PATCH | `/channels/{id}` | 编辑频道名称/话题（mod+） |
| DELETE | `/channels/{id}` | 删除频道（mod+） |
| GET | `/channels/{id}/messages` | 消息列表（支持 limit + before 分页） |
| POST | `/channels/{id}/messages` | 发送消息 |
| PATCH | `/messages/{id}` | 编辑消息（仅作者） |
| DELETE | `/messages/{id}` | 删除消息（作者或 mod+，软删除） |
| POST | `/messages/{id}/reactions` | 添加/移除表情（toggle） |
| GET | `/channels/{id}/pins` | 置顶消息列表 |
| POST | `/channels/{id}/pins/{mid}` | 置顶（mod+） |
| DELETE | `/channels/{id}/pins/{mid}` | 取消置顶（mod+） |

### 私信

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/dm/conversations` | 私信会话列表（含未读数） |
| GET | `/dm/{uid}/messages` | 私信历史（自动标为已读） |
| POST | `/dm/{uid}/messages` | 发送私信 |

### 好友

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/friends` | 好友列表 |
| DELETE | `/friends/{id}` | 删除好友 |
| GET | `/friends/requests` | 好友申请列表 |
| POST | `/friends/requests` | 发送好友申请（by username） |
| POST | `/friends/requests/{id}/approve` | 通过申请 |
| POST | `/friends/requests/{id}/reject` | 拒绝申请 |

### 文件上传

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/upload` | 上传图片（最大 5MB，返回 URL） |
| GET | `/uploads/{filename}` | 访问已上传图片 |

### Telegram 通知

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/telegram/connect` | 填入 bot_token + chat_id 测试并绑定 |
| GET | `/telegram/status` | 查询绑定状态 |
| PATCH | `/telegram/notify` | 开启/关闭推送（`{"enabled": true}`） |
| DELETE | `/telegram/bind` | 解除绑定 |

---

## WebSocket 实时协议

### 连接地址

```
频道实时：ws://localhost:8000/ws/channel/{channel_id}
私信实时：ws://localhost:8000/ws/dm
```

### 认证流程

连接建立后立即发送认证消息（在任何其他消息之前）：

```json
{ "type": "auth", "token": "<access_token>" }
```

服务端回应：
- 成功：`{"type": "auth.ok", "data": {"user_id": 5}}`
- 失败：`{"type": "error", "detail": "unauthorized"}` + 断开连接

### 服务端 → 客户端事件

| 类型 | 触发时机 | 数据 |
|------|---------|------|
| `message.new` | 有新消息 | 完整消息对象（含作者、反应） |
| `message.edit` | 消息被编辑 | `{id, content, edited_at}` |
| `message.delete` | 消息被删除 | `{id}` |
| `reaction.update` | 表情回应变化 | `{message_id, reactions[]}` |
| `pin.update` | 置顶消息变化 | `{channel_id}` |
| `typing.start` | 有人开始输入 | `{user_id, display_name}` |
| `typing.stop` | 有人停止输入 | `{user_id, display_name}` |
| `dm.new` | 收到私信（含加入申请通知） | 完整私信对象 |
| `friend.request` | 收到好友申请 | 申请对象 |
| `friend.update` | 好友申请状态变化 | 申请对象 |
| `friend.deleted` | 被好友删除 | `{friend_id}` |

### 客户端 → 服务端事件

| 类型 | 说明 | 格式 |
|------|------|------|
| `typing` | 输入状态变化 | `{"type": "typing", "typing": true/false}` |

---

## Telegram 通知

Biscord 采用**每用户独立 Bot Token** 模式：

- 每个用户使用自己创建的 Telegram bot 接收通知
- 服务器无需统一 bot，无需公网 URL，无需 Webhook 配置

### 绑定步骤

1. 打开 Telegram，搜索 **@BotFather**
2. 发送 `/newbot`，按提示完成创建，复制 bot token
3. 搜索 **@userinfobot**，发送任意消息，获取自己的 Chat ID（纯数字）
4. 在 Biscord 底部点击纸飞机图标（或 设置 → 通知 → Telegram 推送）
5. 填入 Bot Token 和 Chat ID，点击「**测试并绑定**」
6. Telegram 收到确认消息，绑定完成

### 推送事件

| 事件 | 示例消息 |
|------|---------|
| 收到好友申请 | `👤 江予白 向你发送了好友申请` |
| 好友申请通过 | `✅ 沈温言 通过了你的好友申请` |
| 收到私信 | `💬 江予白：你今天有看第三章吗？` |
| 频道被 @提及 | `📢 苏沐 在 #the-drifting 提到了你：...` |
| 收到加入申请（founder） | `📋 用户名 申请加入「服务器名」` |

---

## 前端架构

### 无构建工具设计

前端使用 CDN 加载 React 18 + Babel Standalone，所有 JSX 文件在浏览器运行时转译。

**脚本加载顺序（顺序不可改变）：**
```
icons.jsx → data.jsx → sidebars.jsx → chat.jsx →
modals.jsx → extra.jsx → api.jsx → auth.jsx → app.jsx
```

**全局变量共享：** 每个文件末尾通过 `Object.assign(window, {...})` 暴露组件，下一个文件即可直接使用。

### 状态管理

所有核心状态集中在 `app.jsx` 的 `App` 组件，通过 props 向下传递：

- 当前服务器、频道、私信
- 用户认证状态、当前用户信息
- 服务器列表、频道组列表、消息列表
- 好友列表、好友申请列表
- 辅助功能设置（字体缩放、减少动画等）
- 各弹窗的开关状态

用户偏好通过 `localStorage` 持久化，键名以 `hearth-` 为前缀：

| 键名 | 说明 | 默认值 |
|------|------|--------|
| `hearth-theme` | 主题 | `dark` |
| `hearth-accent` | 强调色 | `teal` |
| `hearth-density` | 密度 | `default` |
| `hearth-send-mode` | 发送方式 | `enter` |
| `hearth-reduce-motion` | 减少动画 | `false` |
| `hearth-font-size` | 字体缩放（%） | `100` |
| `hearth-always-timestamps` | 始终显示时间戳 | `false` |
| `hearth-blur-images` | 图片点击前模糊 | `false` |

### API 客户端（api.jsx）

所有网络请求通过 `window.API` 发出：

```javascript
API.get('/api/servers')                          // GET 请求
API.post('/api/channels/1/messages', {content}) // POST 请求
API.patch('/api/messages/1', {content})         // PATCH 请求
API.del('/api/messages/1')                      // DELETE 请求
API.upload(file)                                // 文件上传

API.connectChannel(channelId, handlers)          // WebSocket 频道连接
API.connectDM(handlers)                          // WebSocket DM 连接
API.sendTyping(true/false)                       // 发送输入状态
API.disconnect()                                 // 断开所有 WebSocket
API.parseInviteCode(rawValue)                    // 解析邀请链接/码
API.inviteWebUrl(code)                           // 生成邀请 Web 链接
```

Token 自动管理：`401` 响应时自动用 refresh token 换取新 access token 并重试请求。

---

## 主题系统

根元素携带 CSS 类和内联变量：

```html
<div class="app theme-{主题名} density-{密度} [reduce-motion] [always-timestamps] [blur-images]"
     style="--accent: #8a5a2b; zoom: 1;">
```

辅助功能 CSS 类（存在即生效）：

| 类名 | 效果 |
|------|------|
| `reduce-motion` | 禁用所有 transition / animation |
| `always-timestamps` | 连续消息的 inline-time 常态可见 |
| `blur-images` | 图片预览默认模糊，点击揭示 |

字体缩放通过根元素 `zoom` 属性实现（80%–130%），所有子元素等比缩放。

### 可用主题

| 主题 ID | 名称 | 风格 |
|---------|------|------|
| `light` | Paper · 暖纸 | 暖米色，适合日间阅读 |
| `white` | White · 纯白 | 纯净白色，现代简洁 |
| `slate` | Slate · 石板灰 | 中性冷灰，现代商务 |
| `dark` | Lamp · 暖夜 | 深棕暖色，适合夜间 |
| `midnight` | Midnight · 午夜 | 深蓝黑，酷感暗色 |
| `forest` | Forest · 苔绿 | 深绿主题，自然风格 |

### 强调色

`wood`（木棕）/ `rust`（锈红）/ `sage`（鼠尾草）/ `amber`（琥珀）/ `plum`（李紫）/ `teal`（青绿）

### 密度

`compact`（紧凑）/ `default`（默认）/ `cozy`（宽松）

---

## 开发说明

### 添加新 API 接口

1. 在 `backend/routers/` 下的对应文件添加接口
2. 如需新表，在 `models.py` 添加模型，创建新 Alembic 迁移：
   ```bash
   python -m alembic revision --autogenerate -m "描述"
   python -m alembic upgrade head
   ```
3. 在 `schemas.py` 添加对应的 Pydantic 模型

### 添加新前端组件

1. 在对应的 `.jsx` 文件中编写组件
2. 在文件末尾的 `Object.assign(window, {...})` 中导出
3. 在需要使用的文件中直接引用（已全局可用）

### 切换生产数据库

```bash
# 修改 .env
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# 重新执行迁移
python -m alembic upgrade head
```

---

## 部署与运维

### Nginx 配置

站点配置文件位于 `/etc/nginx/sites-enabled/`，每个域名一个文件。配置结构：

- **80 端口**：acme-challenge 验证 + 301 跳转 HTTPS
- **443 端口**：SSL 终止，反向代理到本机 `127.0.0.1:8001`，支持 WebSocket Upgrade

### SSL 证书

使用 Let's Encrypt + Certbot，证书存放于 `/etc/letsencrypt/live/<域名>/`。

**自动续期正常，无需手动操作。** Certbot systemd timer 每天运行两次，证书剩余不足 30 天时自动续期。

> ⚠️ 注意：`certbot renew --dry-run` 在此服务器上会失败（阿里云屏蔽了 Let's Encrypt Staging 测试服务器的 IP），但真实续期完全正常，不影响自动续期。不要用 `--dry-run` 判断续期是否可用。

**申请新域名证书：**
```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d <域名> \
  -d www.<域名>
```

**查看证书到期时间：**
```bash
sudo certbot certificates
```

**验证 timer 状态：**
```bash
sudo systemctl status certbot.timer
```

详细续期操作见 `DEPLOY_UPDATE.md`。

### 已配置域名

| 域名 | 配置文件 | 后端端口 |
|------|---------|---------|
| shi.show | `/etc/nginx/sites-enabled/shixiong` | 8001 |
| moyu.in | `/etc/nginx/sites-enabled/moyu.in` | 8001 |

---

## License

MIT
