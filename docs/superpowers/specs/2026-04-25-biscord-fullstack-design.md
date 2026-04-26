# Biscord 全栈开发规划文档

> 本文档为 Codex 提供完整的实现指引。按阶段顺序执行，每个阶段可独立交付。

---

## 一、项目概述

Biscord（Hearth Community）是一个仿 Discord 风格的中文互动社区，目前为纯前端静态项目。本次开发目标是接入 FastAPI 后端，实现真实的用户系统、消息持久化和实时通讯。

**术语对照（与 Discord 完全一致）：**

| 本文档用词 | Discord 对应 | 含义 |
|-----------|-------------|------|
| 服务器（Server） | Server | 用户创建的独立空间，包含频道列表和成员列表。任何用户都可以创建服务器，也可以通过邀请链接加入别人的服务器。 |
| 频道（Channel） | Channel | 服务器内的子空间，分文字频道、公告频道、语音频道。 |
| 私信（DM） | Direct Message | 用户之间一对一的消息，不属于任何服务器。 |
| 成员（Member） | Member | 加入了某个服务器的用户，在该服务器内有角色（founder/mod/member）。 |

> 代码层面模型名称保持英文 Server / Channel，UI 层中文显示"服务器"。

**技术栈决策：**
- 前端：保持现有 CDN React 18 + Babel standalone 架构，不引入构建工具
- 后端：Python 3.11 + FastAPI
- ORM：SQLAlchemy 2.x（支持一行切换 SQLite/PostgreSQL）
- 认证：JWT（python-jose + passlib bcrypt）
- 实时：WebSocket（FastAPI 原生支持）
- 开发数据库：SQLite
- 生产数据库：PostgreSQL（仅改 DATABASE_URL）

---

## 二、目录结构

```
biscord/                          ← 项目根目录
├── Hearth Community.html         ← 前端入口（保持不变）
├── styles.css                    ← 样式（保持不变）
├── icons.jsx                     ← 图标（保持不变）
├── data.jsx                      ← 改造：保留种子数据结构，启动时从 API 覆盖
├── sidebars.jsx                  ← 保持不变
├── chat.jsx                      ← 改造：消息从 API 加载，发送调用 API
├── modals.jsx                    ← 改造：创建服务器/加入服务器接入真实 API
├── extra.jsx                     ← 改造：DMView 接入 API
├── app.jsx                       ← 改造：加入认证检查，数据从 API 加载
├── api.jsx                       ← 新增：统一 API 客户端
├── auth.jsx                      ← 新增：登录/注册界面
└── backend/
    ├── main.py                   ← FastAPI 应用入口
    ├── database.py               ← SQLAlchemy 引擎和 session
    ├── models.py                 ← 所有 ORM 数据模型
    ├── schemas.py                ← 所有 Pydantic 请求/响应模型
    ├── auth.py                   ← JWT 工具函数
    ├── seed.py                   ← 数据库种子脚本
    ├── requirements.txt
    ├── .env                      ← 环境变量（不提交 git）
    ├── .env.example              ← 环境变量示例
    └── routers/
        ├── __init__.py
        ├── auth.py               ← 注册/登录接口
        ├── users.py              ← 用户信息接口
        ├── servers.py            ← 社区接口
        ├── channels.py           ← 频道和消息接口
        ├── dm.py                 ← 私信接口
        └── websocket.py          ← WebSocket 实时接口
```

---

## 三、数据库模型（models.py）

所有模型使用 SQLAlchemy 2.x declarative style。

### User（用户）
```
id            Integer, 主键, 自增
username      String(32), 唯一, 非空        ← 登录用，英文
display_name  String(32), 非空              ← 显示名，可用中文
password_hash String, 非空
avatar_color  String(8), 默认 'av-1'        ← 取值 av-1 到 av-8
status        String(16), 默认 'online'     ← online/idle/dnd/offline
bio           String(256), 可空             ← 自我介绍
created_at    DateTime, 默认当前时间
```

### Server（社区）
```
id            Integer, 主键, 自增
name          String(64), 非空
short_name    String(4), 非空               ← 左侧导轨显示的缩写
color         String(8), 默认 'av-1'
owner_id      Integer, FK(users.id), 非空
created_at    DateTime, 默认当前时间
```

### ServerMember（社区成员，多对多）
```
id            Integer, 主键, 自增
server_id     Integer, FK(servers.id), 非空
user_id       Integer, FK(users.id), 非空
role          String(16), 默认 'member'     ← founder/editor/mod/member
joined_at     DateTime, 默认当前时间
```
> 唯一约束：(server_id, user_id)

### ChannelGroup（频道分组）
```
id            Integer, 主键, 自增
server_id     Integer, FK(servers.id), 非空
name          String(64), 非空
position      Integer, 默认 0              ← 排序用
```

### Channel（频道）
```
id            Integer, 主键, 自增
server_id     Integer, FK(servers.id), 非空
group_id      Integer, FK(channel_groups.id), 可空
name          String(64), 非空
kind          String(16), 默认 'text'      ← text/announce/voice
topic         String(256), 可空
position      Integer, 默认 0
```

### Message（消息）
```
id            Integer, 主键, 自增
channel_id    Integer, FK(channels.id), 非空
author_id     Integer, FK(users.id), 非空
content       Text, 非空
reply_to_id   Integer, FK(messages.id), 可空   ← 引用回复
is_edited     Boolean, 默认 False
edited_at     DateTime, 可空
created_at    DateTime, 默认当前时间
is_deleted    Boolean, 默认 False             ← 软删除
```

### Reaction（消息表情回应）
```
id            Integer, 主键, 自增
message_id    Integer, FK(messages.id), 非空
user_id       Integer, FK(users.id), 非空
emoji         String(8), 非空
```
> 唯一约束：(message_id, user_id, emoji)

### DirectMessage（私信）
```
id            Integer, 主键, 自增
sender_id     Integer, FK(users.id), 非空
receiver_id   Integer, FK(users.id), 非空
content       Text, 非空
created_at    DateTime, 默认当前时间
is_read       Boolean, 默认 False
is_deleted    Boolean, 默认 False    ← 软删除，与 Message 保持一致
```

### PinnedMessage（置顶消息）
```
id            Integer, 主键, 自增
channel_id    Integer, FK(channels.id), 非空
message_id    Integer, FK(messages.id), 非空
pinned_by     Integer, FK(users.id), 非空
pinned_at     DateTime, 默认当前时间
```

### Invite（邀请码）
```
id            Integer, 主键, 自增
server_id     Integer, FK(servers.id), 非空
creator_id    Integer, FK(users.id), 非空
code          String(16), 唯一, 非空
uses          Integer, 默认 0
max_uses      Integer, 可空                  ← null 表示无限制
expires_at    DateTime, 可空                 ← null 表示永不过期
created_at    DateTime, 默认当前时间
```

---

## 四、API 接口规范

**基础约定：**
- 所有接口前缀：`/api`
- 请求/响应格式：JSON
- 认证方式：请求头 `Authorization: Bearer <access_token>`
- 错误格式：`{"detail": "错误说明"}`
- 分页参数：`?limit=50&before=<message_id>`（cursor-based，不用 offset）

### 4.1 认证接口（routers/auth.py）

**POST /api/auth/register**
```
请求：{ "username": "sumu", "display_name": "苏沐", "password": "123456" }
响应：{ "access_token": "...", "refresh_token": "...", "user": UserSchema }
规则：username 3-32位，仅字母数字下划线；password 最少6位；username 已存在返回 409
```

**POST /api/auth/login**
```
请求：{ "username": "sumu", "password": "123456" }
响应：{ "access_token": "...", "refresh_token": "...", "user": UserSchema }
规则：密码错误返回 401
```

**POST /api/auth/refresh**
```
请求：{ "refresh_token": "..." }
响应：{ "access_token": "..." }
规则：refresh_token 过期/无效返回 401
```

**POST /api/auth/logout**
```
请求：无 body
响应：{ "ok": true }
说明：前端清除 token 即可，服务端无状态
```

### 4.2 用户接口（routers/users.py）

**GET /api/users/me**
```
响应：UserSchema（含 id/username/display_name/avatar_color/status/bio）
```

**PATCH /api/users/me**
```
请求：{ "display_name": "...", "bio": "...", "status": "idle", "avatar_color": "av-3" }
响应：更新后的 UserSchema
规则：字段均可选，只更新传入的字段
```

**GET /api/users/{user_id}**
```
响应：UserSchema（公开信息，不含邮箱等敏感字段）
```

### 4.3 社区接口（routers/servers.py）

**GET /api/servers**
```
响应：[ServerSchema, ...]
说明：返回当前用户加入的所有社区，含成员角色信息
```

**POST /api/servers**
```
请求：{ "name": "午夜读书会", "short_name": "读", "color": "av-6" }
响应：ServerSchema
副作用：创建者自动成为该服务器的 founder 并加入
```

**GET /api/servers/{server_id}**
```
响应：ServerSchema（含频道分组和频道列表）
规则：用户不在该社区返回 403
```

**GET /api/servers/{server_id}/members**
```
响应：[MemberSchema, ...]（含 user 信息和 role）
```

**POST /api/servers/{server_id}/invite**
```
请求：{ "max_uses": null, "expires_hours": null }
响应：{ "code": "abc123", "url": "hearth://invite/abc123" }
规则：仅 founder/mod 可创建
```

**POST /api/servers/join**
```
请求：{ "code": "abc123" }
响应：ServerSchema
规则：邀请码不存在/过期/超出使用次数返回 400
```

### 4.4 频道和消息接口（routers/channels.py）

**GET /api/servers/{server_id}/channels**
```
响应：[{ "group": "阅读中", "items": [ChannelSchema, ...] }, ...]
说明：按 ChannelGroup 分组返回，格式与前端 CHANNELS 结构一致
```

**POST /api/servers/{server_id}/channels**
```
请求：{ "name": "新频道", "kind": "text", "group_id": 1, "topic": "..." }
响应：ChannelSchema
规则：仅 founder/mod 可创建
```

**GET /api/channels/{channel_id}/messages**
```
参数：?limit=50&before=<message_id>
响应：{ "messages": [MessageSchema, ...], "has_more": true }
说明：返回结果按 created_at 升序，消息含作者信息和 reactions
```

**POST /api/channels/{channel_id}/messages**
```
请求：{ "content": "消息内容", "reply_to_id": null }
响应：MessageSchema
副作用：通过 WebSocket 广播到该频道所有在线用户
```

**PATCH /api/messages/{message_id}**
```
请求：{ "content": "修改后内容" }
响应：MessageSchema
规则：仅消息作者可编辑；is_edited 置为 true，edited_at 更新
副作用：WebSocket 广播 message.edit 事件
```

**DELETE /api/messages/{message_id}**
```
响应：{ "ok": true }
规则：消息作者或频道 mod/founder 可删除；软删除（is_deleted=true）
副作用：WebSocket 广播 message.delete 事件
```

**POST /api/messages/{message_id}/reactions**
```
请求：{ "emoji": "📚" }
响应：{ "reactions": [{ "emoji": "📚", "count": 3, "mine": true }, ...] }
规则：同一用户对同一消息同一表情只能添加一次（重复则移除，即 toggle）
副作用：WebSocket 广播 reaction.update 事件
```

**GET /api/channels/{channel_id}/pins**
```
响应：[PinnedMessageSchema, ...]（含完整消息内容）
```

**POST /api/channels/{channel_id}/pins/{message_id}**
```
响应：PinnedMessageSchema
规则：仅 founder/mod 可置顶
```

**DELETE /api/channels/{channel_id}/pins/{message_id}**
```
响应：{ "ok": true }
```

### 4.5 私信接口（routers/dm.py）

**GET /api/dm/conversations**
```
响应：[{ "user": UserSchema, "last_message": ..., "unread_count": 2 }, ...]
说明：返回当前用户的所有私信对话，按最后消息时间降序
```

**GET /api/dm/{user_id}/messages**
```
参数：?limit=50&before=<message_id>
响应：{ "messages": [DMMessageSchema, ...], "has_more": true }
副作用：将该对话未读消息标记为已读
```

**POST /api/dm/{user_id}/messages**
```
请求：{ "content": "消息内容" }
响应：DMMessageSchema
副作用：WebSocket 通知接收方
```

---

## 五、WebSocket 协议（routers/websocket.py）

### 连接方式
```
频道：ws://localhost:8000/ws/channel/{channel_id}
私信：ws://localhost:8000/ws/dm
```

**认证流程（token 不放 URL，防止日志泄露）：**
1. 客户端建立 WebSocket 连接（无 token）
2. 连接建立后立即发送认证消息：`{"type": "auth", "token": "<access_token>"}`
3. 服务端验证 token：
   - 有效：继续，开始接收/广播消息
   - 无效：发送 `{"type": "error", "detail": "unauthorized"}` 后关闭连接
4. 服务端在认证成功前不处理任何其他消息类型

### 服务端 → 客户端事件（JSON）

**新消息**
```json
{ "type": "message.new", "data": MessageSchema }
```

**消息编辑**
```json
{ "type": "message.edit", "data": { "id": 123, "content": "...", "edited_at": "..." } }
```

**消息删除**
```json
{ "type": "message.delete", "data": { "id": 123 } }
```

**表情更新**
```json
{ "type": "reaction.update", "data": { "message_id": 123, "reactions": [...] } }
```

**正在输入**
```json
{ "type": "typing.start", "data": { "user_id": 5, "display_name": "江予白" } }
```

**停止输入**
```json
{ "type": "typing.stop", "data": { "user_id": 5 } }
```

**新私信**
```json
{ "type": "dm.new", "data": DMMessageSchema }
```

### 客户端 → 服务端事件（JSON）

**发送输入状态**
```json
{ "type": "typing", "typing": true }
```

### 连接管理器设计
```python
# websocket.py 中维护一个全局连接管理器
class ConnectionManager:
    # channel_id → set of WebSocket connections
    channel_connections: dict[int, set]
    # user_id → WebSocket connection (用于私信推送)
    user_connections: dict[int, WebSocket]
    
    async def connect(channel_id, websocket)
    async def disconnect(channel_id, websocket)
    async def broadcast_to_channel(channel_id, message)
    async def send_to_user(user_id, message)
```

---

## 六、前端改造说明

### 6.1 新增：api.jsx

统一的 API 客户端，挂载到 `window.API`，所有网络请求通过此文件。

```javascript
// 核心功能：
// 1. 自动注入 Authorization header
// 2. access_token 过期时自动用 refresh_token 刷新，刷新后重试原请求
// 3. refresh_token 也过期则清除 token，触发重新登录
// 4. 封装 WebSocket，自动重连（指数退避，最多 5 次）

window.API = {
  // HTTP
  get(path),
  post(path, body),
  patch(path, body),
  del(path),              // 注意：用 del 而非 delete（delete 是 JS 保留字）
  
  // WebSocket
  connectChannel(channelId, handlers),   // handlers: { onMessage, onTyping, ... }
  connectDM(handlers),
  disconnect(),
  sendTyping(typing),
  
  // Token 管理
  getToken(),
  setToken(access, refresh),
  clearToken(),
  isLoggedIn(),
}
```

### 6.2 新增：auth.jsx

登录/注册界面，使用现有 Modal 组件样式，挂载到 `window.AuthScreen`。

```javascript
// 功能：
// - 两个 tab：登录 / 注册
// - 登录：输入 username + password，调用 POST /api/auth/login
// - 注册：输入 username + display_name + password，调用 POST /api/auth/register
// - 成功后调用 onSuccess(user) 回调
// - 错误提示直接显示在表单下方
```

### 6.3 改造：app.jsx

```
变更点：
1. 启动时检查 API.isLoggedIn()
   - 未登录：渲染 <AuthScreen onSuccess={user => setUser(user)} />
   - 已登录：调用 GET /api/users/me 恢复用户信息，再正常渲染

2. useEffect 加载服务器列表：
   - GET /api/servers → 替换静态 SERVERS 数组
   - 存入 state，传给 ServerRail

3. 切换服务器时：
   - GET /api/servers/{id} 获取频道列表（含分组）
   - 替换 channelGroups state

4. USER 常量改为 state：const [currentUser, setCurrentUser] = useState(null)

5. handleSend 改为乐观更新策略：
   - 发送前：立即将消息追加到本地列表（标记 pending: true），给用户即时反馈
   - 调用 API.post('/api/channels/{id}/messages', {content})
   - 成功：用服务端返回的消息（含真实 id）替换 pending 条目
   - 失败：移除 pending 条目，在 Composer 下方显示"发送失败，点击重试"
   - WebSocket 收到 message.new 时，若 id 已存在则跳过（避免重复）

6. 切换频道时连接 WebSocket：
   - API.connectChannel(channelId, { onMessage, onEdit, onDelete, onTyping })
   - 切换时先断开旧连接
```

### 6.4 改造：chat.jsx

```
变更点：
1. ChatArea 新增 props：onLoadMore（向上滚动到顶部时触发加载更早消息）

2. 消息列表初始化：
   - 切换频道时调用 GET /api/channels/{id}/messages?limit=50
   - 接收 WebSocket message.new 事件时 append 到列表末尾
   - 接收 message.edit 时更新对应消息的 content
   - 接收 message.delete 时将消息替换为 "此消息已被删除"

3. MessageGroup 新增功能：
   - 悬浮时显示操作栏：表情 / 回复 / 编辑（仅自己）/ 删除（仅自己或管理员）/ 更多
   - 右键菜单：与操作栏相同功能
   - 编辑状态：点击编辑将消息文本变为 textarea，Esc 取消，Enter 提交

4. Composer：
   - 输入时发送 API.sendTyping(true)，停止输入 2 秒后发送 typing(false)
   - 发送调用 API.post，不再本地 push
   - 支持 @username 自动补全：输入 @ 后弹出成员浮层，选择后插入 @display_name
```

### 6.5 改造：data.jsx

```
变更点：
- 保留现有 SERVERS / CHANNELS / DM_LIST / MEMBERS / SEED_MESSAGES 作为默认值
- 应用启动后由 app.jsx 通过 API 获取真实数据覆盖这些值
- data.jsx 本身不做 API 调用（保持无副作用）
```

### 6.6 改造：modals.jsx

```
变更点：
1. CreateServerModal 的 Create 按钮：
   - 调用 POST /api/servers，成功后刷新服务器列表
   - 创建成功后自动切换到新服务器

2. Join 按钮：
   - 调用 POST /api/servers/join，成功后刷新服务器列表
   - 加入成功后显示生成的邀请链接，并提供"复制链接"按钮

3. 新增：InviteModal（邀请链接弹窗）
   - 在服务器名称右键菜单或服务器设置中触发
   - 调用 POST /api/servers/{id}/invite 生成邀请码
   - 展示完整邀请链接（格式：hearth://invite/<code>）
   - 提供"复制链接"按钮，点击后按钮文字临时变为"已复制！"

4. 新增：CreateChannelModal（创建频道弹窗）
   - 在频道列表分组标题旁的"+"按钮触发
   - 输入频道名称、选择类型（文字/公告/语音）、选择所属分组
   - 调用 POST /api/servers/{server_id}/channels
   - 创建成功后自动切换到新频道
```

### 6.7 服务器导轨（ServerRail）行为说明

```
左侧服务器导轨（最左一列）完整行为，与 Discord 一致：

显示内容（从上到下）：
1. 私信入口（固定第一位，图标为信封）
2. 分隔线
3. 用户加入的所有服务器（圆形图标，显示 short_name 缩写）
   - 有未读消息：图标左侧显示白色小圆点
   - 当前激活：图标左侧显示全长白色竖条
4. 分隔线
5. "+"按钮（创建或加入服务器，打开 CreateServerModal）
6. 指南针图标（浏览公开服务器，Phase 6 实现）

交互：
- 点击服务器图标：切换到该服务器，加载其频道列表
- 右键服务器图标：弹出菜单（邀请成员 / 服务器设置 / 退出服务器）
- 悬浮服务器图标：Tooltip 显示服务器完整名称

数据来源（Phase 3 之后）：
- GET /api/servers 返回当前用户加入的服务器列表
- 每次启动 app 时加载，创建/加入/退出服务器后重新加载
```

---

## 七、环境配置

### backend/.env.example
```
DATABASE_URL=sqlite:///./biscord.db
SECRET_KEY=请替换为随机字符串至少32位
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
```

### 生产环境切换 PostgreSQL
```
DATABASE_URL=postgresql://user:password@host:5432/biscord
```
仅需修改这一行，其他代码不变。

### backend/requirements.txt
```
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy==2.0.30
alembic==1.13.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
python-dotenv==1.0.1
python-multipart==0.0.9
```

### 本地启动步骤
```bash
# 1. 安装依赖
cd backend
pip install -r requirements.txt

# 2. 初始化数据库
python seed.py

# 3. 启动后端
uvicorn main:app --reload --port 8000

# 4. 打开前端
# 直接用浏览器打开 Hearth Community.html
# 后端 CORS 配置允许 null origin（file:// 协议）
```

---

## 八、后端关键实现细节

### CORS 配置（main.py）
```python
# file:// 协议打开的页面，浏览器发送的 Origin 为 "null"（字符串）
# allow_origins=["*"] 与 allow_credentials=True 不能同时使用（CORS 规范禁止）
# 开发环境明确列出允许的 origin：
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null", "http://localhost", "http://127.0.0.1"],  # 开发环境
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 生产环境将 "null" 替换为实际域名，例如 ["https://biscord.example.com"]
```

### JWT 工具（auth.py）
```python
# 生成 access_token：有效期 60 分钟，payload 含 user_id
# 生成 refresh_token：有效期 30 天，payload 含 user_id + token_type="refresh"
# 验证函数：decode → 提取 user_id → 查数据库返回 User 对象
# FastAPI 依赖注入：get_current_user = Depends(verify_token)
```

### 数据库 session（database.py）
```python
# 使用 SQLAlchemy 2.x with-statement 风格
# get_db() 作为 FastAPI 依赖注入，每个请求独立 session，请求结束自动关闭
```

### 种子数据脚本（seed.py）
```python
# 将 data.jsx 中的社区、频道、示例消息写入数据库
# 创建两个测试账号：
#   username: demo1, display_name: 苏沐, password: demo1234
#   username: demo2, display_name: 江予白, password: demo1234
# 运行方式：python seed.py（幂等，重复运行不重复插入）
```

---

## 九、六阶段实施计划

### Phase 1 — 后端骨架（预计 1-2 天）
- [ ] 创建 `backend/` 目录和所有文件
- [ ] 实现 `database.py`、`models.py`、`schemas.py`
- [ ] 配置 Alembic，生成初始迁移
- [ ] 实现 `GET /api/health`
- [ ] 实现 `seed.py`
- [ ] 验收：`uvicorn main:app` 启动成功，访问 `/docs` 能看到 Swagger 文档，运行 seed.py 后数据库有数据

### Phase 2 — 用户认证（预计 1-2 天）
- [ ] 实现 `routers/auth.py`（register/login/refresh）
- [ ] 实现 `routers/users.py`（me/update）
- [ ] 实现 `auth.py`（JWT 工具）
- [ ] 前端新增 `auth.jsx`（登录/注册 UI）
- [ ] 前端新增 `api.jsx`（API 客户端，含 token 管理）
- [ ] 改造 `app.jsx`（启动认证检查）
- [ ] 验收：能注册新账号、登录、退出；刷新页面保持登录状态

### Phase 3 — 数据真实化（预计 2-3 天）
- [ ] 实现 `routers/servers.py`（list/create/detail/members）
- [ ] 实现 `routers/channels.py`（channels/messages CRUD）
- [ ] 实现 `routers/dm.py`（conversations/messages）
- [ ] 改造 `app.jsx`（服务器列表和频道列表从 API 加载）
- [ ] 改造 `chat.jsx`（消息从 API 加载，发送调用 API）
- [ ] 验收：刷新后消息还在；切换频道加载对应消息；两个账号同时登录发送消息（轮询刷新可见）

### Phase 4 — WebSocket 实时（预计 1-2 天）
- [ ] 实现 `routers/websocket.py`（ConnectionManager + 频道/私信端点）
- [ ] 改造 `api.jsx`（WebSocket 客户端封装）
- [ ] 改造 `app.jsx` / `chat.jsx`（接收 WS 事件更新 UI）
- [ ] 实现打字指示器
- [ ] 验收：两个浏览器窗口打开同一频道，一方发消息另一方即时显示

### Phase 5 — 核心交互（预计 2-3 天）
- [ ] 实现消息编辑/删除 API + 前端 UI
- [ ] 实现表情回应 API + Emoji 选择器（使用 emoji-mart CDN 或自制简单版）
- [ ] 实现 Markdown 渲染（marked.js CDN）
- [ ] 实现 @提及 自动补全
- [ ] 实现消息悬浮操作栏和右键菜单
- [ ] 实现置顶消息 API + 面板
- [ ] 验收：所有消息操作正常，Markdown 正确渲染，@提及 高亮显示

### Phase 6 — 服务器管理（预计 2-3 天）
- [ ] 实现创建服务器/频道 API + 前端表单接入
- [ ] 实现邀请链接生成/加入 API + InviteModal 前端界面
- [ ] 实现图片/文件上传（本地存储，返回静态文件 URL）
- [ ] 消息中图片自动预览
- [ ] 线索回复（Thread）侧边栏基础版
- [ ] 验收：能创建服务器、在服务器内创建频道、生成邀请链接、通过链接加入、发送图片

---

## 十、前端 API 调用示例

Codex 在改造前端文件时，所有网络请求统一使用 `window.API`：

```javascript
// 加载消息
const { messages, has_more } = await API.get(`/api/channels/${channelId}/messages?limit=50`);

// 发送消息
const msg = await API.post(`/api/channels/${channelId}/messages`, { content: text });

// 编辑消息
await API.patch(`/api/messages/${msgId}`, { content: newText });

// 删除消息
await API.del(`/api/messages/${msgId}`);

// 添加/切换表情
await API.post(`/api/messages/${msgId}/reactions`, { emoji: '📚' });

// 获取服务器列表
const servers = await API.get('/api/servers');

// 创建服务器
const server = await API.post('/api/servers', { name, short_name, color });

// 在服务器内创建频道
const channel = await API.post(`/api/servers/${serverId}/channels`, { name, kind, group_id });

// 生成邀请链接
const invite = await API.post(`/api/servers/${serverId}/invite`, {});
// invite.code → 拼成完整链接展示给用户

// 通过邀请码加入服务器
const server = await API.post('/api/servers/join', { code: 'abc123' });
```

---

## 十一、设计原则（供 Codex 遵守）

1. **每个文件只做一件事**：路由、模型、schema、工具函数严格分离
2. **不重复造轮子**：认证用 python-jose，密码用 passlib，不手写加密
3. **软删除消息**：`is_deleted=true`，前端显示"此消息已被删除"，数据不丢失
4. **错误返回一致**：所有错误统一返回 `{"detail": "说明"}` 格式
5. **前端状态最小化**：WebSocket 收到事件后直接更新对应消息，不重新拉取整个列表
6. **向后兼容**：前端改造时保留静态种子数据作为 fallback，API 请求失败时降级显示
7. **不过度工程化**：当前阶段不需要消息队列、Redis 缓存、多进程部署，保持简单
