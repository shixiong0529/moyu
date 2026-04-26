# Biscord Codex 提交提示词

## 使用须知

1. **每次只提交一个 Phase**，不要一次提交全部，容易出错
2. **验收后再提交下一个 Phase**，在浏览器里自己测试一遍
3. **如果 Codex 问你不确定的地方**，让它以文档 `docs/superpowers/specs/2026-04-25-biscord-fullstack-design.md` 为准
4. **Phase 4（WebSocket）之后**，记得用两个浏览器窗口登录不同账号测试实时效果

---

## Phase 1 — 后端骨架

```
请阅读项目规划文档：docs/superpowers/specs/2026-04-25-biscord-fullstack-design.md

请实现 Phase 1（后端骨架），要求：
- 创建 backend/ 目录及所有子文件：main.py、database.py、models.py、schemas.py、auth.py、seed.py、requirements.txt、.env.example、routers/__init__.py
- 按文档第三节创建全部 9 张数据库表的 ORM 模型
- 配置 Alembic 数据库迁移，生成初始迁移文件
- 实现 GET /api/health 接口，返回 {"status": "ok"}
- 实现 seed.py，写入文档中的种子数据和两个测试账号（demo1/demo2，密码均为 demo1234）
- 按文档第八节配置 CORS（allow_origins=["null","http://localhost","http://127.0.0.1"]）

不要实现任何认证或业务接口，Phase 1 只建骨架。

验收：uvicorn main:app --reload 启动无报错，访问 http://localhost:8000/docs 可见 Swagger，python seed.py 执行成功。
```

---

## Phase 2 — 用户认证

```
请阅读项目规划文档：docs/superpowers/specs/2026-04-25-biscord-fullstack-design.md

Phase 1 已完成。请实现 Phase 2（用户认证）：

后端：
- 实现文档第 4.1 节全部认证接口（register/login/refresh/logout）
- 实现文档第 4.2 节用户接口（GET /api/users/me、PATCH /api/users/me、GET /api/users/{user_id}）
- 实现 backend/auth.py 中的 JWT 工具函数（见文档第八节）

前端：
- 新增 api.jsx（见文档第 6.1 节，挂载到 window.API，方法名用 del 不用 delete）
- 新增 auth.jsx（见文档第 6.2 节，登录/注册双 tab 界面，复用现有 Modal 样式）
- 改造 app.jsx（见文档第 6.3 节第 1、4 条：启动时检查登录状态，未登录显示 AuthScreen）
- 在 Hearth Community.html 的 script 标签列表中，在 app.jsx 之前加载 api.jsx 和 auth.jsx

验收：能注册新账号、登录、退出；刷新页面保持登录状态；错误时表单下方显示提示。
```

---

## Phase 3 — 数据真实化

```
请阅读项目规划文档：docs/superpowers/specs/2026-04-25-biscord-fullstack-design.md

Phase 1、2 已完成。请实现 Phase 3（数据真实化）：

后端：
- 实现文档第 4.3 节服务器接口（GET/POST /api/servers、GET /api/servers/{id}、GET /api/servers/{id}/members）
- 实现文档第 4.4 节频道和消息接口（GET /api/servers/{id}/channels、GET/POST /api/channels/{id}/messages）
- 实现文档第 4.5 节私信接口（GET /api/dm/conversations、GET/POST /api/dm/{user_id}/messages）

前端：
- 改造 app.jsx（见文档第 6.3 节第 2、3、5 条）：服务器列表和频道列表从 API 加载
- 改造 chat.jsx（见文档第 6.4 节第 1、2 条）：消息从 API 加载，发送使用乐观更新策略
- 改造 extra.jsx 中的 DMView：消息从 API 加载，发送调用 API
- 改造 modals.jsx（见文档第 6.6 节第 1、2 条）：创建/加入服务器按钮接入真实 API

验收：刷新页面消息仍在；两个浏览器分别登录 demo1/demo2，demo1 发消息后 demo2 刷新页面可见。
```

---

## Phase 4 — WebSocket 实时

```
请阅读项目规划文档：docs/superpowers/specs/2026-04-25-biscord-fullstack-design.md

Phase 1-3 已完成。请实现 Phase 4（WebSocket 实时通讯）：

后端：
- 实现 backend/routers/websocket.py，包含 ConnectionManager 类和频道/私信两个 WebSocket 端点
- 认证方式：连接建立后客户端发送 {"type":"auth","token":"..."} 消息，验证通过后才处理其他消息（见文档第五节认证流程）
- 广播事件：message.new / message.edit / message.delete / reaction.update / typing.start / typing.stop / dm.new
- POST /api/channels/{id}/messages 成功后触发广播

前端：
- 改造 api.jsx（见文档第 6.1 节 WebSocket 部分）：封装 WebSocket 客户端，支持自动重连（指数退避，最多 5 次），连接后立即发送 auth 消息
- 改造 app.jsx（见文档第 6.3 节第 6 条）：切换频道时连接对应 WebSocket，离开时断开
- 改造 chat.jsx（见文档第 6.4 节第 2 条）：接收 WS 事件更新消息列表；Composer 输入时发送 typing 事件，2 秒无输入发送停止
- 底部"正在输入"改为真实 WS 数据驱动

验收：两个浏览器窗口登录不同账号打开同一频道，一方发消息另一方无需刷新即时显示；"正在输入"提示正常出现消失。
```

---

## Phase 5 — 核心交互

```
请阅读项目规划文档：docs/superpowers/specs/2026-04-25-biscord-fullstack-design.md

Phase 1-4 已完成。请实现 Phase 5（核心交互功能）：

后端：
- 实现 PATCH /api/messages/{id}（编辑，仅作者）
- 实现 DELETE /api/messages/{id}（软删除，作者或 mod/founder）
- 实现 POST /api/messages/{id}/reactions（toggle 逻辑）
- 实现 GET/POST/DELETE /api/channels/{id}/pins/{message_id}
- 以上操作均需通过 WebSocket 广播对应事件

前端（均在 chat.jsx）：
- MessageGroup 悬浮时显示操作栏（表情/回复/编辑/删除/更多），仅自己的消息显示编辑，作者或管理员显示删除
- 右键消息弹出上下文菜单（与操作栏功能相同）
- 点击编辑：消息内容变为 textarea，Enter 提交，Esc 取消，提交后调用 PATCH 接口
- 删除后消息显示为"此消息已被删除"（不移除条目）
- 表情回应点击 toggle，调用 reactions 接口
- 引入 marked.js（CDN）渲染消息中的 Markdown（**加粗** *斜体* `代码` ```代码块```）
- Composer 输入 @ 时弹出成员浮层，上下键选择，Enter 插入 @display_name，消息渲染时高亮 @提及
- 置顶消息面板：点击 Header 的 Pin 图标展开/收起，展示该频道所有置顶消息

验收：消息编辑删除正常；Markdown 正确渲染；@提及 高亮；表情 toggle 计数正确；置顶面板可查看。
```

---

## Phase 6 — 服务器管理

```
请阅读项目规划文档：docs/superpowers/specs/2026-04-25-biscord-fullstack-design.md

Phase 1-5 已完成。请实现 Phase 6（服务器管理）：

后端：
- 实现 POST /api/servers/{id}/channels（创建频道，仅 founder/mod）
- 实现 POST /api/servers/{id}/invite（生成邀请码）
- 实现 POST /api/servers/join（通过邀请码加入）
- 实现文件上传：POST /api/upload，接收图片文件，存到 backend/uploads/ 目录，返回可访问的静态文件 URL
- 在 main.py 挂载 /uploads 为静态文件目录

前端：
- modals.jsx 新增 CreateChannelModal：频道列表分组旁"+"按钮触发，输入名称/选类型/选分组，调用 POST /api/servers/{id}/channels，成功后刷新频道列表并切换到新频道
- modals.jsx 新增 InviteModal：服务器图标右键菜单"邀请成员"触发，调用生成邀请接口，展示完整链接，提供"复制链接"按钮（复制后按钮文字临时变"已复制！"）
- 服务器图标右键菜单：邀请成员 / 退出服务器（调用对应接口后刷新服务器列表）
- Composer 附件按钮：点击打开文件选择，选图片后上传并在消息中发送图片链接
- MessageGroup 渲染消息内容时，识别图片链接（.jpg/.png/.gif/.webp 结尾）自动显示为 <img> 预览，最大宽度 400px
- Thread 线索回复侧边栏（基础版）：点击消息操作栏的"Thread"按钮，右侧展开侧边栏，显示该消息的所有回复，可在侧边栏内发送回复

验收：能创建频道、生成邀请链接并复制、通过链接加入服务器、发送图片并在聊天中预览。
```
