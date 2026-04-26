# 服务器操作菜单开发规划文档

> 本文档为 Codex 提供完整的实现指引。  
> **目标**：点击频道侧边栏左上角的服务器名称，弹出一个下拉操作菜单，与服务器 Logo 右键菜单保持一致，并扩充完整的服务器管理功能。

---

## 零、现有功能实现状态（Codex 必读）

> 在开始开发前，请先确认以下功能的现状，避免重复开发或覆盖已有代码。

### ✅ 已完整实现（无需开发，直接复用）

| 功能 | 实现位置 | 说明 |
|------|---------|------|
| **InviteModal** | `modals.jsx` | 生成邀请链接，支持设置次数/时效 |
| **JoinRequestsModal** | `modals.jsx` | 管理员审核加入申请，支持通过/拒绝 |
| **CreateChannelModal** | `modals.jsx` | 创建频道，支持选择分组、类型、话题 |
| **右键菜单（服务器 Logo）** | `sidebars.jsx` → `ServerRail` | 已有：邀请成员、加入申请（mod+）、退出服务器 |
| **handleLeaveServer** | `app.jsx` | 退出服务器逻辑（含 founder 保护） |
| **图片上传** | `API.upload()` in `api.jsx` + `POST /api/upload` | 可直接用于上传服务器图标 |
| **logo-upload-wrap CSS** | `styles.css` | 图标上传区域的点击上传样式，含 hover 遮罩 |
| **refreshServers / refreshActiveServerDetail** | `app.jsx` | 操作后刷新数据的函数，已封装好 |
| **setInviteServer / setJoinRequestsServer** | `app.jsx` | 打开对应 modal 的 state setter |
| **onCreateChannel handler** | `app.jsx` → `ChannelSidebarFlex` | 分组的"+"号点击已接线，打开 CreateChannelModal |

### ⚠️ 部分实现（已有后端，缺前端；或已有前端入口，缺功能）

| 功能 | 现状 | 需要补充 |
|------|------|---------|
| **侧边栏服务器名下拉菜单** | `sidebar-header` 有 chevron-down 图标，但**点击无响应** | 核心功能：添加 click handler + 菜单渲染逻辑（Step 2） |
| **右键菜单补全** | 已有邀请、加入申请、退出，**缺少创建频道、服务器设置** | Step 6 补充 |
| **App 组件 handler 传递** | `onInvite`、`onLeave`、`onReviewRequests` 已传入 ServerRail，但**未传入 ChannelSidebarFlex** | Step 2：在 App 中给 ChannelSidebarFlex 传新 props |

### ❌ 未实现（需要从零开发）

| 功能 | 需要新建 | 涉及文件 |
|------|---------|---------|
| **服务器名点击下拉菜单** | MenuItem / MenuDivider 子组件 + menuOpen state | `app.jsx` |
| **CreateGroupModal** | 新组件（创建频道分组） | `modals.jsx` |
| **ServerSettingsModal** | 新组件（编辑服务器信息 + 删除服务器） | `modals.jsx` |
| **PATCH /api/servers/{id}** | 更新服务器信息接口 | `backend/routers/servers.py` |
| **DELETE /api/servers/{id}** | 删除服务器接口（手动级联） | `backend/routers/servers.py` |
| **POST /api/servers/{id}/channel-groups** | 创建频道分组接口 | `backend/routers/servers.py` |
| **ServerUpdateRequest schema** | Pydantic 模型 | `backend/schemas.py` |
| **ChannelGroupCreateRequest schema** | Pydantic 模型 | `backend/schemas.py` |

---

## 一、功能概述

### 触发方式

点击频道侧边栏顶部的 **服务器名称区域**（`.sidebar-header`），弹出下拉菜单。chevron-down 图标同时充当视觉提示。

### 完整菜单项（按角色权限）

| 菜单项 | 触发操作 | 所需角色 | 备注 |
|--------|---------|---------|------|
| 邀请成员 | 打开 InviteModal | 所有成员 | 已有 modal |
| 加入申请 | 打开 JoinRequestsModal | mod / founder | 有待审数量时显示红色徽标，如「加入申请（3）」|
| ─ 分隔线 ─ | | mod / founder | |
| 创建频道 | 打开 CreateChannelModal | mod / founder | 已有 modal，默认不预填分组 |
| 创建分组 | 打开 CreateGroupModal（新） | mod / founder | 仅创建分组，不创建频道 |
| ─ 分隔线 ─ | | mod / founder | |
| 服务器设置 | 打开 ServerSettingsModal（新） | mod / founder | 编辑名称、缩写、图标、描述、颜色 |
| ─ 分隔线 ─ | | 所有成员 | 危险操作区 |
| 退出服务器 | 调用 handleLeaveServer | 非 founder | 已有逻辑，founder 不显示此项 |
| 删除服务器 | 打开确认对话框（新） | founder | 需输入服务器名称二次确认 |

---

## 二、UI 交互规范

### 2.1 触发与关闭

- 点击 `.sidebar-header` 区域（服务器名 + chevron）→ 菜单显示
- 菜单已显示时再次点击 → 菜单隐藏（toggle）
- 点击菜单外任意区域 → 菜单隐藏（backdrop 覆盖层）
- 菜单显示时 chevron-down 图标旋转 180°（CSS transform）

### 2.2 位置

菜单紧贴 `.sidebar-header` 下方，宽度与侧边栏等宽（240px），`position: absolute`，`z-index: 100`。

### 2.3 视觉风格

复用现有 `.server-context-menu` 样式：
- 背景：`var(--paper-0)`
- 边框：`1px solid var(--paper-3)`
- 圆角：`8px`
- 阴影：`var(--shadow-md)`
- 内边距：`5px`

每个菜单按钮：
- 高度：`32px`
- 左内边距：`12px`
- 圆角：`6px`
- hover 背景：`var(--paper-2)`
- 危险项（退出、删除）：`color: var(--rust)`
- 分隔线：`1px solid var(--paper-3)`，上下各 `4px` margin

### 2.4 菜单项图标（可选）

每项左侧可显示小图标，使用已有 Icon 组件：

| 菜单项 | 图标名 |
|--------|--------|
| 邀请成员 | `users` |
| 加入申请 | `inbox` |
| 创建频道 | `hash` |
| 创建分组 | `plus` |
| 服务器设置 | `settings` |
| 退出服务器 | `log-out`（可省略） |
| 删除服务器 | `close`（可省略） |

---

## 三、后端新增接口

### 3.1 PATCH /api/servers/{server_id} — 更新服务器信息

```
权限：mod / founder
请求：
{
  "name":        "午夜读书会",      // 可选，1-64 字符
  "short_name":  "读",             // 可选，1-4 字符
  "color":       "av-3",           // 可选，av-1 ~ av-8
  "icon_url":    "/uploads/xxx.jpg", // 可选，null 表示清除图标
  "description": "每周共读一本书", // 可选，最长 256 字符
}
响应：更新后的 ServerSchema（含 channel_groups）
错误：403（权限不足）/ 404（服务器不存在）
```

实现位置：`backend/routers/servers.py`，复用 `require_manager` 权限检查。

### 3.2 DELETE /api/servers/{server_id} — 删除服务器

```
权限：仅 founder
请求：无 body
响应：{ "ok": true }
副作用：
  - 级联删除所有频道组、频道、消息、成员、邀请码、加入申请
  - 通过外键 CASCADE 或手动逐表删除（SQLite 不支持 CASCADE，需手动）
  - 通过 WebSocket 广播 server.deleted 事件给所有在线成员（可选）
错误：403（非 founder）/ 403（尝试删除"管理员服务器"，该服务器受保护）
```

实现位置：`backend/routers/servers.py`

### 3.3 POST /api/servers/{server_id}/channel-groups — 创建频道分组

```
权限：mod / founder
请求：
{
  "name": "新分组名称"   // 必填，1-64 字符
}
响应：
{
  "id":        42,
  "server_id": 3,
  "name":      "新分组名称",
  "position":  5     // 自动排在最后
}
逻辑：position = 当前最大 position + 1
错误：403（权限不足）/ 404（服务器不存在）
```

实现位置：`backend/routers/servers.py`

---

## 四、Pydantic Schema（schemas.py 新增）

```python
class ServerUpdateRequest(BaseModel):
    name:        str | None = Field(default=None, min_length=1, max_length=64)
    short_name:  str | None = Field(default=None, min_length=1, max_length=4)
    color:       str | None = Field(default=None, pattern=r"^av-[1-8]$")
    icon_url:    str | None = Field(default=None, max_length=256)
    description: str | None = Field(default=None, max_length=256)


class ChannelGroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
```

---

## 五、前端改动说明

### 5.1 改造：InlineChannelSidebar（app.jsx）

**新增 props：**
```javascript
function InlineChannelSidebar({
  server,
  channelGroups,
  activeChannel,
  onSelectChannel,
  onCreateChannel,
  // ── 新增 ──
  onInvite,            // () => void
  onReviewRequests,    // () => void
  onCreateGroup,       // () => void
  onServerSettings,    // () => void
  onLeaveServer,       // () => void
  onDeleteServer,      // () => void
}) { ... }
```

**新增 state：**
```javascript
const [menuOpen, setMenuOpen] = useState(false);
```

**`.sidebar-header` 改造：**
```jsx
<div
  className="sidebar-header"
  onClick={() => setMenuOpen(v => !v)}
  style={{ cursor: 'pointer', position: 'relative' }}
>
  <span>{server.name}</span>
  <Icon
    name="chevron-down"
    size={14}
    style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
  />

  {menuOpen && (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
      />

      {/* Dropdown */}
      <div
        className="server-context-menu"
        style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 菜单项（见下方详细规范） */}
      </div>
    </>
  )}
</div>
```

**菜单项 JSX 模板（按本文档第一节权限表渲染）：**

```jsx
{/* ── 所有成员可见 ── */}
<MenuItem icon="users" label="邀请成员" onClick={() => { setMenuOpen(false); onInvite?.(); }} />

{/* ── mod / founder 可见 ── */}
{['mod', 'founder'].includes(server.role) && (
  <MenuItem
    icon="inbox"
    label={`加入申请${server.pending_join_requests ? `（${server.pending_join_requests}）` : ''}`}
    badge={server.pending_join_requests}
    onClick={() => { setMenuOpen(false); onReviewRequests?.(); }}
  />
)}

{['mod', 'founder'].includes(server.role) && <MenuDivider />}

{['mod', 'founder'].includes(server.role) && (
  <>
    <MenuItem icon="hash" label="创建频道" onClick={() => { setMenuOpen(false); onCreateChannel?.(); }} />
    <MenuItem icon="plus" label="创建分组" onClick={() => { setMenuOpen(false); onCreateGroup?.(); }} />
  </>
)}

{['mod', 'founder'].includes(server.role) && <MenuDivider />}

{['mod', 'founder'].includes(server.role) && (
  <MenuItem icon="settings" label="服务器设置" onClick={() => { setMenuOpen(false); onServerSettings?.(); }} />
)}

<MenuDivider />

{/* ── 危险操作 ── */}
{server.role !== 'founder' && (
  <MenuItem danger label="退出服务器" onClick={() => { setMenuOpen(false); onLeaveServer?.(); }} />
)}
{server.role === 'founder' && (
  <MenuItem danger label="删除服务器" onClick={() => { setMenuOpen(false); onDeleteServer?.(); }} />
)}
```

**辅助子组件（同文件内定义）：**

```jsx
function MenuItem({ icon, label, badge, danger, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', height: 32, border: 0,
        borderRadius: 6, background: 'transparent',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 10px', cursor: 'pointer', textAlign: 'left',
        color: danger ? 'var(--rust)' : 'var(--ink-1)',
        fontSize: 13.5,
      }}
    >
      {icon && <Icon name={icon} size={14} style={{ color: 'inherit', opacity: 0.8 }} />}
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: 9,
          background: 'var(--rust)', color: '#fff',
          fontSize: 11, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px',
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--paper-3)', margin: '4px 0' }} />;
}
```

### 5.2 改造：ChannelSidebarFlex（app.jsx）

透传新增 props 给 `InlineChannelSidebar`：

```jsx
function ChannelSidebarFlex(props) {
  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
        <InlineChannelSidebar {...props} />
      </div>
    </div>
  );
}
```

### 5.3 改造：App 组件（app.jsx）

**新增 state：**
```javascript
const [serverSettingsOpen, setServerSettingsOpen] = useStateApp(null); // server 对象
const [createGroupOpen, setCreateGroupOpen] = useStateApp(false);
```

**ChannelSidebarFlex 传入新 props：**
```jsx
<ChannelSidebarFlex
  server={activeServer}
  channelGroups={channelGroups}
  activeChannel={activeChannel}
  onSelectChannel={(ch) => setActiveChannelId(ch.id)}
  onCreateChannel={(group) => setCreateChannelGroup(group || {})}
  // ── 新增 ──
  onInvite={() => setInviteServer(activeServer)}
  onReviewRequests={() => setJoinRequestsServer(activeServer)}
  onCreateGroup={() => setCreateGroupOpen(true)}
  onServerSettings={() => setServerSettingsOpen(activeServer)}
  onLeaveServer={() => handleLeaveServer(activeServer)}
  onDeleteServer={() => handleDeleteServer(activeServer)}
/>
```

**新增 handleDeleteServer：**
```javascript
const handleDeleteServer = async (server) => {
  // 前端二次确认逻辑由 DeleteServerModal 承担
  setServerSettingsOpen({ ...server, _deleteMode: true });
};
```

或者直接在弹窗里处理，不单独设 state。

**新增渲染区块：**
```jsx
{createGroupOpen && (
  <CreateGroupModal
    server={activeServer}
    onClose={() => setCreateGroupOpen(false)}
    onCreated={async () => {
      setCreateGroupOpen(false);
      await refreshActiveServerDetail();
    }}
  />
)}

{serverSettingsOpen && (
  <ServerSettingsModal
    server={serverSettingsOpen}
    onClose={() => setServerSettingsOpen(null)}
    onUpdated={async () => {
      await refreshServers();
      await refreshActiveServerDetail();
      setServerSettingsOpen(null);
    }}
    onDeleted={async () => {
      setServerSettingsOpen(null);
      await refreshServers();
      // 跳转到第一个剩余服务器
    }}
  />
)}
```

---

## 六、新增前端组件规范

### 6.1 CreateGroupModal（modals.jsx）

**功能：** 仅创建频道分组，不创建频道。

**UI：**
```
标题：创建分组
描述：分组用于在频道列表中归类频道。

表单字段：
  - 分组名称 *（必填，最长 64 字符）
    placeholder：如"阅读中 · Reading"

底部按钮：
  - 返回（btn-ghost）
  - 创建（btn-primary，disabled 时为空）
```

**API 调用：**
```javascript
await API.post(`/api/servers/${server.id}/channel-groups`, { name: name.trim() });
```

**创建成功后：** 调用 `onCreated()`，不自动切换频道。

---

### 6.2 ServerSettingsModal（modals.jsx）

**功能：** 编辑服务器基本信息，以及（founder 专属）删除服务器。

**结构：左侧分类导航 + 右侧内容区，**与 Settings 页面一致。

**导航分类：**

```
概览（Overview）← 默认
危险操作（Danger Zone）← founder 专属
```

#### 概览（Overview）板块

```
标题：服务器设置

[ 服务器图标（点击上传，复用 logo-upload-wrap 样式）]

字段：
  服务器名称 * —— form-input，最长 64 字符
  服务器缩写 * —— form-input，最长 4 字符，显示在左侧导轨图标中
  服务器颜色 —— 颜色选择器，av-1 ~ av-8，仅在无图标时生效
  服务器描述 —— form-input / textarea，最长 256 字符，可选

底部按钮：
  取消（btn-ghost）
  保存更改（btn-primary，仅在内容有改动时启用）
```

**API 调用（保存）：**
```javascript
await API.patch(`/api/servers/${server.id}`, {
  name, short_name, color, icon_url, description,
});
```

**图标上传：** 复用现有 `API.upload(file)` + 上传后将返回 URL 填入 `icon_url` 字段。

#### 危险操作（Danger Zone）板块（founder 专属）

```
[ 删除服务器 ]
  描述：此操作不可撤销。删除后所有频道、消息和成员资料将永久丢失。
  按钮：删除服务器（btn 带 danger 样式）

点击"删除服务器"后展开二次确认区：
  提示：请输入服务器名称"午夜读书会"以确认删除
  输入框：placeholder = 服务器名称
  确认按钮：仅当输入内容与服务器名完全一致时启用
  取消按钮
```

**API 调用（删除）：**
```javascript
await API.del(`/api/servers/${server.id}`);
```

**删除成功后：**
1. 关闭 modal
2. 调用 `onDeleted()`
3. 刷新服务器列表
4. 切换到列表中第一个剩余服务器（若无则切换到 DM 视图）

---

## 七、同步右键菜单（sidebars.jsx）

现有的 `server-context-menu`（右键服务器 Logo 弹出）也需同步补充：

**当前内容：**
- 邀请成员
- 加入申请（mod+）
- 退出服务器

**新增项：**
- 创建频道（mod+）
- 服务器设置（mod+）

**改造后完整右键菜单：**
```jsx
<button onClick={...}>邀请成员</button>

{isMod && <button onClick={...}>加入申请{badge}</button>}

{isMod && (
  <>
    <Divider />
    <button onClick={...}>创建频道</button>
    <button onClick={...}>服务器设置</button>
  </>
)}

<Divider />

{isFounder
  ? <button className="danger" onClick={...}>删除服务器</button>
  : <button className="danger" onClick={...}>退出服务器</button>
}
```

右键菜单触发时需将 `server` 对象通过 props 传递给 App 组件对应的处理函数（已有 `onInvite`、`onLeave`、`onReviewRequests`，新增 `onServerSettings`）。

---

## 八、分步实施计划

### Step 1 — 后端接口（先于前端）

- [ ] `schemas.py`：新增 `ServerUpdateRequest`、`ChannelGroupCreateRequest`
- [ ] `servers.py`：实现 `PATCH /api/servers/{id}`（更新服务器信息）
- [ ] `servers.py`：实现 `DELETE /api/servers/{id}`（删除服务器，手动级联）
- [ ] `servers.py`：实现 `POST /api/servers/{id}/channel-groups`（创建分组）
- [ ] 验收：通过 `/docs` Swagger 测试三个新接口，确认权限控制正确

### Step 2 — 下拉菜单（核心 UI）

- [ ] `app.jsx`：在 `InlineChannelSidebar` 中新增 `menuOpen` state，改造 `.sidebar-header`
- [ ] `app.jsx`：实现 `MenuItem` 和 `MenuDivider` 子组件
- [ ] `app.jsx`：按权限渲染完整菜单项
- [ ] `app.jsx`：`ChannelSidebarFlex` 透传新 props，`App` 组件传入所有 handler
- [ ] 验收：点击服务器名能打开/关闭菜单；点击外部关闭；权限项按角色显示正确

### Step 3 — 创建分组 Modal

- [ ] `modals.jsx`：新增 `CreateGroupModal` 组件
- [ ] `app.jsx`：新增 `createGroupOpen` state，绑定 `onCreateGroup` handler，渲染 Modal
- [ ] 验收：创建成功后频道侧边栏出现新分组，可向其中添加频道

### Step 4 — 服务器设置 Modal

- [ ] `modals.jsx`：新增 `ServerSettingsModal` 组件（Overview 板块）
- [ ] `app.jsx`：新增 `serverSettingsOpen` state，渲染 Modal
- [ ] 验收：修改服务器名后，侧边栏标题和左侧导轨 Tooltip 同步更新

### Step 5 — 删除服务器

- [ ] `modals.jsx`：在 `ServerSettingsModal` 内新增「危险操作」分类和二次确认 UI
- [ ] `app.jsx`：`onDeleted` 回调实现（刷新列表 → 切换服务器）
- [ ] 验收：输入名称匹配后可删除；删除后自动切换到其他服务器

### Step 6 — 同步右键菜单

- [ ] `sidebars.jsx`：在 `ServerRail` 右键菜单中补充「创建频道」「服务器设置」
- [ ] `sidebars.jsx`：`ServerRail` 新增 `onServerSettings` prop
- [ ] `app.jsx`：`ServerRail` 传入 `onServerSettings`
- [ ] 验收：左键下拉菜单与右键菜单功能完全一致

---

## 九、设计原则（供 Codex 遵守）

1. **复用已有 Modal 样式**：`CreateGroupModal` 和 `ServerSettingsModal` 复用 `Modal` 组件基础结构（`.modal-head`、`.modal-body`、`.modal-foot`）
2. **图标上传复用**：`ServerSettingsModal` 的图标上传复用 `CreateServerModal` 里已有的 `.logo-upload-wrap` 样式和 `API.upload()` 逻辑
3. **权限复用**：后端使用已有的 `require_manager()`（mod+）和 `require_member()` 检查，不单独实现
4. **删除级联顺序**：删除服务器时手动按依赖顺序删除（reactions → pinned_messages → messages → channels → channel_groups → invites → join_requests → server_members → server），避免外键约束报错
5. **刷新策略**：操作成功后统一调用 `refreshServers()` + `refreshActiveServerDetail()` 而非重载整个页面
6. **保持菜单一致**：侧边栏下拉菜单和右键菜单的操作集合保持同步，两处调用同一组 App 级 handler
