# 摸鱼社区 — 系统管理员平台设计文档

**日期**：2026-04-27  
**状态**：已批准，待实现

---

## 背景

摸鱼社区目前只有服务器级别的权限体系（founder / mod / member），没有全局管理员角色，没有任何 `/api/admin` 路由，缺少对用户、服务器、举报内容的统一管理能力。本文档描述新增系统管理员平台的完整设计。

---

## 目标

为网站运营者提供一个独立的管理后台，涵盖：

- 用户管理（查看、封禁、提权）
- 服务器管理（查看、删除、推荐控制）
- 频道 & 分组管理（查看、删除）
- 举报队列（用户举报 → 管理员处理）
- 邀请码管理（查看、撤销）
- 加入申请跨服务器查看
- 数据统计概览
- 操作审计日志

---

## 架构方案

**方案 A（已选）：单文件极简**

```
admin.html                       ← 独立入口
admin.jsx                        ← 全部管理 UI（单文件）
backend/routers/admin.py         ← 全部管理 API（单路由文件）
```

- 沿用现有无构建工具模式（CDN React 18 + Babel Standalone）
- 独立于主站，普通用户零影响
- 不引入任何新依赖

---

## 数据库变更

### `users` 表新增字段

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `is_admin` | Boolean | `False` | 是否为系统管理员 |
| `is_banned` | Boolean | `False` | 是否已封禁 |
| `banned_reason` | String (nullable) | `NULL` | 封禁原因 |

**注意**：`servers.is_recommended` 字段已在现有模型中存在，无需新增。

**管理员引导**：服务启动事件中读取 `.env` 的 `ADMIN_USERNAME`，若该用户存在且 `is_admin` 为 `False`，则置为 `True`。每次启动均执行（幂等），确保被手动撤权的初始管理员在重启后恢复权限。若用户名不存在则记录警告日志，不报错。

**登录封禁校验**：`/api/auth/login` 在验证密码通过后额外检查 `is_banned`，被封禁用户返回 `403 Forbidden`，附 `banned_reason`。

### 新增表：`reports`（举报记录）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Integer PK | |
| `reporter_id` | FK → users | 举报人 |
| `target_type` | String | `message` / `user` / `server` |
| `target_id` | Integer | 被举报对象 ID（裸 ID，无外键约束，允许目标已删除） |
| `content_snapshot` | Text (nullable) | 举报时记录的内容快照，用于目标被删除后仍可查阅：消息类取 `message.content`，用户类取 `username + display_name`，服务器类取 `server.name` |
| `reason` | String | 举报原因 |
| `status` | String | `pending` / `resolved` / `dismissed` |
| `resolution_note` | String (nullable) | 管理员处理/驳回备注 |
| `resolved_by` | FK → users (nullable) | 处理管理员（与 `resolved_at` 必须同时为 null 或同时有值） |
| `resolved_at` | DateTime (nullable) | 处理时间（与 `resolved_by` 同时写入） |
| `created_at` | DateTime | |

**防滥用**：同一用户对同一 `(target_type, target_id)` 组合只能存在一条 `pending` 举报（数据库唯一约束 + 业务层检查），重复提交返回 `429`。

### 新增表：`audit_logs`（操作日志）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | Integer PK | |
| `admin_id` | FK → users | 执行操作的管理员 |
| `action` | String | 操作类型（见下方列表） |
| `target_type` | String | `user` / `server` / `channel` / `channel_group` / `report` / `invite` |
| `target_id` | Integer | 操作对象 ID |
| `detail` | JSON (nullable) | 附加信息（封禁原因、旧值/新值等） |
| `created_at` | DateTime | |

**`action` 枚举值**：`ban_user` / `unban_user` / `grant_admin` / `revoke_admin` / `delete_server` / `toggle_recommended` / `delete_channel` / `delete_channel_group` / `resolve_report` / `dismiss_report` / `revoke_invite`

---

## 后端 API

### 权限中间件

所有 `/api/admin/*` 路由在现有 JWT 校验基础上额外检查 `current_user.is_admin`，否则返回 `403 Forbidden`。所有写操作（ban、unban、grant_admin、revoke_admin、delete_server、toggle_recommended、delete_channel、delete_channel_group、resolve_report、dismiss_report、revoke_invite）均在执行后写入 `audit_logs` 记录。

### 边界规则（所有写操作均适用）

- **禁止操作自身**：`ban`、`revoke_admin` 不允许目标为当前登录管理员自身，返回 `400`。
- **保护最后一个管理员**：`revoke_admin` 前检查系统中 `is_admin=True` 的用户数，若仅剩一人则拒绝，返回 `400`（附提示"至少保留一名管理员"）。同理，`ban` 操作不允许封禁拥有 `is_admin=True` 的用户（须先撤权再封禁）。

### 统计概览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/stats` | 用户总数、服务器总数、频道总数、消息总数、今日新增用户数、待处理举报数 |

### 用户管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/users` | 用户列表（分页、按用户名/显示名搜索） |
| GET | `/api/admin/users/{id}` | 用户详情（含所属服务器、注册时间、封禁状态） |
| POST | `/api/admin/users/{id}/ban` | 封禁用户，body: `{ reason }`；不可封禁管理员（需先撤权） |
| POST | `/api/admin/users/{id}/unban` | 解封用户 |
| PATCH | `/api/admin/users/{id}/admin` | 提升/撤销管理员，body: `{ is_admin: bool }`；不可操作自身；不可撤销最后一个管理员 |

### 服务器管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/servers` | 所有服务器列表（分页、搜索、含成员数） |
| GET | `/api/admin/servers/{id}` | 服务器详情（含频道列表、成员数） |
| DELETE | `/api/admin/servers/{id}` | 强制删除服务器（管理员服务器除外） |
| PATCH | `/api/admin/servers/{id}/recommended` | 切换 `is_recommended` 状态 |

### 频道 & 分组管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/servers/{id}/channels` | 查看某服务器所有频道（含分组） |
| DELETE | `/api/admin/channels/{id}` | 强制删除频道 |
| DELETE | `/api/admin/channel-groups/{id}` | 强制删除分组（级联删除其下所有频道） |

### 举报管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/reports` | 举报列表（按 status / target_type 筛选，分页，pending 优先） |
| GET | `/api/admin/reports/{id}` | 举报详情（含 `content_snapshot`，即使目标已删除也可查阅） |
| POST | `/api/admin/reports/{id}/resolve` | 处理举报，body: `{ note }`，写入 `resolution_note` |
| POST | `/api/admin/reports/{id}/dismiss` | 驳回举报，body: `{ note }`，写入 `resolution_note` |

### 邀请码管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/invites` | 所有邀请码列表（分页、按服务器筛选） |
| DELETE | `/api/admin/invites/{code}` | 强制撤销邀请码 |

### 加入申请管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/join-requests` | 全站所有服务器的待审加入申请列表（分页、可选按 `server_id` 筛选；不区分服务器加入策略，管理员可跨服查看） |

### 操作日志

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/audit-logs` | 操作日志列表（分页、按管理员/操作类型/时间筛选） |

### 举报提交（普通用户）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/reports` | 普通用户提交举报，body: `{ target_type, target_id, reason }`；自动抓取 `content_snapshot`；同一用户对同一目标只能有一条 pending 举报 |

---

## 前端结构

### 文件

| 文件 | 说明 |
|---|---|
| `admin.html` | 独立入口，加载 CDN React/Babel + styles.css + admin.jsx |
| `admin.jsx` | 全部管理 UI，末尾 `Object.assign(window, { AdminApp })` |

### 主题

固定 `theme-forest density-default`，不提供主题切换。复用现有 `styles.css` 的变量和组件样式。

### 组件树

```
AdminApp
├── AdminLogin              ← 未登录时显示，调用 /api/auth/login，登录后检查 is_admin
└── AdminShell              ← 已登录主框架
    ├── AdminSidebar        ← 左侧导航（7 个模块 + 登出）
    └── AdminMain           ← 右侧内容区
        ├── DashboardPage       ← 统计概览卡片
        ├── UsersPage           ← 用户列表 + 搜索 + 封禁
        ├── UserDetailPage      ← 单用户详情
        ├── ServersPage         ← 服务器列表 + 搜索
        ├── ServerDetailPage    ← 服务器详情（含频道/分组管理）
        ├── ReportsPage         ← 举报队列
        ├── ReportDetailPage    ← 单条举报详情 + 处理
        ├── InvitesPage         ← 邀请码列表 + 撤销
        ├── JoinRequestsPage    ← 全站加入申请
        └── AuditLogPage        ← 操作日志
```

**登录后权限验证**：`AdminLogin` 登录成功后调用 `/api/users/me` 确认 `is_admin === true`，若非管理员则显示"无权限"提示并清除 token，不进入管理界面。

### 路由

无 URL 路由，用 React state `{ page, params }` 驱动视图切换：

```js
{ page: 'dashboard' }
{ page: 'user-detail', params: { userId: 42 } }
{ page: 'server-detail', params: { serverId: 7 } }
{ page: 'report-detail', params: { reportId: 15 } }
```

### Token 管理

- 登录后 JWT 存入 `localStorage['hearth-admin-token']`，与主站 `hearth-token` 完全隔离，互不干扰
- 所有请求携带 `Authorization: Bearer <token>`
- `401` 响应时清除 `hearth-admin-token`，跳回登录页
- 管理员登出仅清除 `hearth-admin-token`，不影响主站登录状态；Token 过期策略复用现有 access token（60 分钟）+ refresh token（30 天）机制

---

## 实现顺序

1. **Alembic 迁移** — 新增 `is_admin`、`is_banned`、`banned_reason` 字段，创建 `reports`、`audit_logs` 表
2. **`.env` 引导逻辑** — `main.py` 启动事件中读取 `ADMIN_USERNAME` 自动提权（可立即测试管理员身份）
3. **登录封禁校验** — `auth.py` 登录接口新增 `is_banned` 检查
4. **`POST /api/reports`** — 普通用户举报接口（新增 `backend/routers/reports.py` 或并入 channels 路由）
5. **`backend/routers/admin.py`** — 实现全部管理 API，注册到 `main.py`
6. **`admin.html`** — 入口 HTML
7. **`admin.jsx`** — 全部管理 UI

---

## 不在本期范围内

- 消息内容过滤 / 自动审核
- 多管理员权限分级（本期所有管理员权限相同）
- 管理员操作的通知推送
- 数据导出功能
