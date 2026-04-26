# Telegram 通知功能开发规划文档

> 本文档为 Codex 提供完整的实现指引。Biscord 用户绑定 Telegram Bot 后，收到好友申请、好友申请通过、私信、或频道 @提及 时，Bot 会主动推送消息到用户的 Telegram。

---

## 一、功能概述

| 触发事件 | 接收通知的用户 | 推送内容示例 |
|---------|-------------|------------|
| 收到好友申请 | 被申请者 | `👤 江予白 向你发送了好友申请` |
| 好友申请被通过 | 申请发起者 | `✅ 沈温言 通过了你的好友申请` |
| 收到私信 | 收件人 | `💬 江予白：你今天有看第三章吗？` |
| 频道被 @提及 | 被提及的用户 | `📢 苏沐 在 #the-drifting 提到了你：@江予白 我觉得...` |

**通知开关**：每个用户有独立的开关，开启则始终推送，关闭则不推送。开关在 Settings → 通知 页面控制。

---

## 二、新增文件和改动文件

```
backend/
├── telegram_service.py          ← 新增：核心通知服务（注意：不能命名为 telegram.py，
│                                          会与第三方包 python-telegram-bot 冲突）
├── routers/telegram_bot.py      ← 新增：Webhook + 用户绑定 API
├── models.py                    ← 改造：User 新增 4 个字段
├── schemas.py                   ← 改造：新增 Telegram 相关 Pydantic 模型
├── main.py                      ← 改造：注册新路由，启动时注册 Webhook
├── routers/friends.py           ← 改造：申请/通过时调用通知
├── routers/dm.py                ← 改造：发私信时调用通知
├── routers/channels.py          ← 改造：发消息时解析 @ 并调用通知
└── .env.example                 ← 改造：新增 Telegram 环境变量

modals.jsx                       ← 改造：Settings 新增「通知」板块
```

---

## 三、数据库变更（models.py + Alembic）

### 3.1 User 表新增字段

```python
# 在 User 模型中新增以下 4 个字段
telegram_chat_id         BigInteger, 可空, 默认 None   # 绑定后存 Telegram chat_id
telegram_notify_enabled  Boolean, 非空, 默认 False      # 通知总开关
telegram_bind_code       String(4), 可空, 默认 None     # 当前有效的 4 位验证码
telegram_bind_expires_at DateTime, 可空, 默认 None      # 验证码过期时间
```

### 3.2 Alembic 迁移

创建新的迁移文件，执行以下 ALTER TABLE：
```sql
ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT;
ALTER TABLE users ADD COLUMN telegram_notify_enabled BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN telegram_bind_code VARCHAR(4);
ALTER TABLE users ADD COLUMN telegram_bind_expires_at DATETIME;
```

---

## 四、核心通知服务（backend/telegram_service.py）

> ⚠️ 文件必须命名为 `telegram_service.py`，不能用 `telegram.py`，否则将与 `python-telegram-bot` 第三方包的顶层 `telegram` 模块产生命名冲突，导致导入错误。

```python
"""
Telegram 通知服务。
所有推送都通过此模块的 notify() 函数发出。
"""
import os
import httpx
from sqlalchemy.orm import Session
from database import SessionLocal
from models import User

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


async def notify(user_id: int, text: str) -> None:
    """
    向指定用户推送 Telegram 消息。
    用户未绑定、未开启通知或无 BOT_TOKEN 时静默跳过。
    """
    if not BOT_TOKEN:
        return

    with SessionLocal() as db:
        user = db.get(User, user_id)
        if not user or not user.telegram_chat_id or not user.telegram_notify_enabled:
            return
        chat_id = user.telegram_chat_id

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                f"{TELEGRAM_API}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            )
    except Exception:
        pass  # 通知失败不影响主流程


async def register_webhook(base_url: str, secret: str) -> None:
    """
    向 Telegram 注册 Webhook。在 main.py lifespan 中调用。
    base_url 示例：https://example.com
    """
    if not BOT_TOKEN:
        return
    webhook_url = f"{base_url}/api/telegram/webhook"
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            f"{TELEGRAM_API}/setWebhook",
            json={"url": webhook_url, "secret_token": secret, "allowed_updates": ["message"]},
        )
```

**设计原则：**
- `notify()` 永不抛出异常，失败时静默跳过，不影响主业务逻辑
- 发送使用 HTML parse_mode，支持 `<b>加粗</b>` 等简单格式

---

## 五、Webhook 路由（backend/routers/telegram_bot.py）

### 5.1 接口列表

| 方法 | 路径 | 说明 |
|-----|------|------|
| POST | `/api/telegram/webhook` | Telegram Webhook 回调（Bot 收到消息时触发） |
| POST | `/api/telegram/bind/generate` | 生成 4 位绑定验证码 |
| GET  | `/api/telegram/status` | 查询当前用户的绑定状态 |
| PATCH | `/api/telegram/notify` | 开启/关闭通知 |
| DELETE | `/api/telegram/bind` | 解除绑定 |

### 5.2 POST /api/telegram/webhook

```python
"""
Telegram 推送过来的消息在这里处理。
安全性：校验请求头 X-Telegram-Bot-Api-Secret-Token 是否匹配环境变量 TELEGRAM_WEBHOOK_SECRET。
"""
@router.post("/webhook")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    # 1. 验证 secret token
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if secret != os.getenv("TELEGRAM_WEBHOOK_SECRET", ""):
        raise HTTPException(status_code=403)

    body = await request.json()
    message = body.get("message", {})
    text = message.get("text", "").strip()
    chat_id = message.get("chat", {}).get("id")
    if not text or not chat_id:
        return {"ok": True}

    # 2. 处理 /bind XXXX 命令
    if text.startswith("/bind"):
        parts = text.split()
        code = parts[1] if len(parts) > 1 else ""
        await handle_bind(db, chat_id, code)

    return {"ok": True}


async def handle_bind(db, chat_id: int, code: str):
    """验证 4 位码，绑定 telegram_chat_id 到对应用户。"""
    from datetime import datetime
    user = db.scalar(
        select(User).where(
            User.telegram_bind_code == code,
            User.telegram_bind_expires_at > datetime.utcnow()
        )
    )
    if user is None:
        await send_message(chat_id, "❌ 验证码无效或已过期，请在 Biscord 重新生成。")
        return

    user.telegram_chat_id = chat_id
    user.telegram_bind_code = None
    user.telegram_bind_expires_at = None
    user.telegram_notify_enabled = True   # 绑定后默认开启
    db.commit()
    await send_message(chat_id, f"✅ 绑定成功！你已和 Biscord 账号 <b>{user.display_name}</b> 关联。\n发送通知已自动开启。")
```

### 5.3 POST /api/telegram/bind/generate（需登录）

```python
请求：无 body
响应：{ "code": "7391", "expires_in": 600 }

逻辑：
1. 用 secrets 模块生成 4 位数字字符串：
   import secrets
   code = str(secrets.randbelow(9000) + 1000)   # 1000-9999，均匀分布
2. 写入 current_user.telegram_bind_code 和 telegram_bind_expires_at（当前时间 + 10 分钟）
   每次调用覆盖旧验证码，不会有多个有效码并存
3. 返回 code 和剩余秒数（600）
```

### 5.4 GET /api/telegram/status（需登录）

```python
响应：
{
  "bound": true,          # 是否已绑定
  "notify_enabled": true, # 通知开关状态
  "chat_id": 123456789    # Telegram chat_id（可用于调试，生产可省略）
}
```

### 5.5 PATCH /api/telegram/notify（需登录）

```python
请求：{ "enabled": true }
响应：{ "ok": true }

规则：未绑定时调用此接口返回 400（"请先绑定 Telegram"）
```

### 5.6 DELETE /api/telegram/bind（需登录）

```python
响应：{ "ok": true }
逻辑：将 telegram_chat_id、telegram_notify_enabled、telegram_bind_code、
      telegram_bind_expires_at 全部清空/重置
```

---

## 六、改造现有路由

### 6.1 routers/friends.py

在两个位置添加通知调用：

**位置 1：`create_friend_request`（发出好友申请后）**
```python
# 在 await manager.send_to_user(target.id, ...) 之后添加：
await telegram.notify(
    target.id,
    f"👤 <b>{current_user.display_name}</b> 向你发送了好友申请"
)
```

**位置 2：`approve_friend_request`（通过好友申请后）**
```python
# 在 await manager.send_to_user(item.requester_id, ...) 之后添加：
await telegram.notify(
    item.requester_id,
    f"✅ <b>{current_user.display_name}</b> 通过了你的好友申请"
)
```

在文件顶部新增：`from telegram_service import notify as tg_notify`（统一用此别名，三个文件保持一致）

### 6.2 routers/dm.py

**在 `create_dm_message` 中，`await manager.send_to_user(user_id, ...)` 之后添加：**
```python
# 截取消息预览（最多 60 个字符）
preview = payload.content[:60] + ("…" if len(payload.content) > 60 else "")
await telegram.notify(
    user_id,
    f"💬 <b>{current_user.display_name}</b>：{preview}"
)
```

注意：只通知接收方（`user_id`），不通知发送方自己。

### 6.3 routers/channels.py

**在 `create_message` 中，广播 `message.new` 之后添加 @提及检测：**

```python
# @提及检测与通知
# 注意：display_name 可能包含空格（如"John Doe"），所以不能只用 \S+ 匹配。
# 方案：先获取所有成员名字，再在消息内容中全文搜索 "@名字" 是否存在。
# 这样对中文名、含空格的名字都能正确匹配。

async def notify_mentions(content: str, channel: Channel, sender: User, db: Session) -> None:
    """
    检测消息中的 @display_name 提及，向被提及的成员推送 Telegram 通知。
    只通知该服务器的成员，且不通知发送者自己。
    """
    if "@" not in content:
        return

    # 获取该服务器所有成员的 display_name → user 映射
    members = db.scalars(
        select(ServerMember)
        .where(ServerMember.server_id == channel.server_id)
        .options(selectinload(ServerMember.user))
    ).all()

    preview = content[:80] + ("…" if len(content) > 80 else "")
    notified = set()

    for member in members:
        user = member.user
        if user.id == sender.id or user.id in notified:
            continue
        # 检查消息内容是否包含 "@display_name"（精确全名匹配）
        if f"@{user.display_name}" in content:
            notified.add(user.id)
            await tg_notify(
                user.id,
                f"📢 <b>{sender.display_name}</b> 在 <b>#{channel.name}</b> 提到了你：\n{preview}"
            )

# 在 create_message 函数末尾、return data 之前调用：
await notify_mentions(payload.content, channel, current_user, db)
```

---

## 七、main.py 改造

### 7.1 注册新路由

```python
from routers import telegram_bot
app.include_router(telegram_bot.router)
```

### 7.2 启动时注册 Webhook（可选，生产环境使用）

```python
from contextlib import asynccontextmanager
import telegram_service as tg

@asynccontextmanager
async def lifespan(app: FastAPI):
    base_url = os.getenv("APP_BASE_URL", "")
    secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    if base_url and secret:
        await tg.register_webhook(base_url, secret)
    yield

app = FastAPI(title="Biscord API", version="0.1.0", lifespan=lifespan)
```

**本地开发说明：** 本地无法使用 Webhook（Telegram 要求公网 HTTPS）。本地测试时可用 [ngrok](https://ngrok.com) 暴露端口，然后在 `.env` 设置 `APP_BASE_URL=https://xxx.ngrok.io`，或者跳过 Webhook 注册直接测试通知逻辑。

---

## 八、环境变量

### backend/.env.example 新增

```
TELEGRAM_BOT_TOKEN=          # 从 @BotFather 获取，格式：123456789:AABBcc...
TELEGRAM_WEBHOOK_SECRET=     # 自定义随机字符串，用于验证 Webhook 请求合法性
APP_BASE_URL=                # 可选，生产环境填写服务器域名，如 https://biscord.example.com
```

**获取 Bot Token 步骤：**
1. 在 Telegram 搜索 @BotFather
2. 发送 `/newbot`，按提示设置 bot 名称
3. 复制返回的 token 填入 `.env`

---

## 九、前端改造（modals.jsx）

### 9.1 Settings 新增「通知」分组

在 `settings-sidebar` 的菜单项中新增：
```jsx
<div className="group-label">通知</div>
<a className={section === 'notifications' ? 'active' : ''} onClick={() => setSection('notifications')}>
  Telegram 推送
</a>
```

### 9.2 notifications 板块内容

```jsx
{section === 'notifications' && (
  <>
    <h1>Telegram 推送</h1>
    <p style={{ fontFamily:'var(--ff-serif)', fontStyle:'italic', color:'var(--ink-2)', marginTop:-16, marginBottom:20 }}>
      绑定 Telegram 后，即使不在线也能收到通知。
    </p>

    {/* 未绑定状态 */}
    {!bound && (
      <div className="settings-section">
        <div className="settings-row">
          <div className="label-block">
            <div className="title">绑定 Telegram 账号</div>
            <div className="desc">生成验证码，在 Telegram Bot 中发送 /bind 验证码 完成绑定。</div>
          </div>
          <button className="btn btn-primary" onClick={generateCode}>生成验证码</button>
        </div>

        {/* 验证码展示区（生成后显示） */}
        {bindCode && (
          <div style={{ marginTop:16, padding:'16px 20px', background:'var(--paper-1)',
                        border:'1px solid var(--paper-3)', borderRadius:10 }}>
            <div style={{ fontFamily:'var(--ff-mono)', fontSize:11, color:'var(--ink-2)',
                          textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
              验证码（{countdown} 秒后过期）
            </div>
            <div style={{ fontFamily:'var(--ff-mono)', fontSize:32, fontWeight:700,
                          color:'var(--accent)', letterSpacing:'0.2em' }}>
              {bindCode}
            </div>
            <div style={{ marginTop:12, fontSize:13, color:'var(--ink-1)' }}>
              打开 Telegram，找到 <b>@BiscordBot</b>，发送：
            </div>
            <div style={{ fontFamily:'var(--ff-mono)', marginTop:6, padding:'8px 12px',
                          background:'var(--paper-2)', borderRadius:6, fontSize:14 }}>
              /bind {bindCode}
            </div>
          </div>
        )}
      </div>
    )}

    {/* 已绑定状态 */}
    {bound && (
      <>
        <div className="settings-section">
          <div className="settings-row">
            <div className="label-block">
              <div className="title">已绑定 Telegram</div>
              <div className="desc">你的账号已和 Telegram 关联。</div>
            </div>
            <button className="btn btn-secondary" onClick={unbind}>解除绑定</button>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-row">
            <div className="label-block">
              <div className="title">推送通知</div>
              <div className="desc">开启后，收到好友申请、私信或 @提及 时推送到 Telegram。</div>
            </div>
            <ToggleSwitch defaultOn={notifyEnabled} onChange={toggleNotify}/>
          </div>
        </div>
      </>
    )}
  </>
)}
```

### 9.3 前端 API 调用

```javascript
// 生成验证码
const { code, expires_in } = await API.post('/api/telegram/bind/generate', {});

// 查询状态（进入 notifications 板块时调用）
const { bound, notify_enabled } = await API.get('/api/telegram/status');

// 切换通知开关
await API.patch('/api/telegram/notify', { enabled: true/false });

// 解除绑定
await API.del('/api/telegram/bind');
```

---

## 十、分步实施计划

### Step 1 — 数据库和核心服务
- [ ] `requirements.txt`：新增 `httpx>=0.27`（`telegram_service.py` 依赖此库）
- [ ] `models.py`：User 新增 4 个字段
- [ ] 创建 Alembic 迁移文件并执行
- [ ] 新建 `backend/telegram_service.py`（notify + register_webhook）
- [ ] `.env.example` 新增 3 个环境变量
- [ ] 验收：`python -c "from telegram_service import notify"` 无报错

### Step 2 — Webhook 和绑定 API
- [ ] 新建 `backend/routers/telegram_bot.py`（全部 5 个接口）
- [ ] `main.py`：注册路由，添加 lifespan（可选）
- [ ] `schemas.py`：新增 `TelegramNotifyUpdate` Pydantic 模型（`enabled: bool`）
- [ ] 验收：访问 `/docs` 可见 Telegram 相关接口

### Step 3 — 触发通知
- [ ] `routers/friends.py`：好友申请 + 通过时调用 `telegram.notify`
- [ ] `routers/dm.py`：发私信时调用 `telegram.notify`
- [ ] `routers/channels.py`：发消息时调用 `notify_mentions`
- [ ] 验收：用已绑定账号测试，确认 Telegram 收到通知

### Step 4 — 前端 Settings UI
- [ ] `modals.jsx`：Settings 新增「通知」菜单项和 notifications 板块
- [ ] 实现生成验证码 + 倒计时（60 秒内每秒 -1，显示剩余时间）
- [ ] 实现绑定状态轮询：
  - 生成验证码后每 5 秒调用 `GET /api/telegram/status`
  - **最多轮询 120 次（即 10 分钟，与验证码有效期一致）**，超时后停止轮询并显示「验证码已过期，请重新生成」
  - 轮询期间组件卸载（用户关闭设置）时自动清除定时器，防止内存泄漏
- [ ] 实现解绑和通知开关
- [ ] 验收：完整走通绑定流程，UI 状态实时更新；关闭设置再打开不会有残留轮询

---

## 十一、设计原则（供 Codex 遵守）

1. **通知永不阻塞主流程**：`telegram_service.py` 中所有网络调用都包在 `try/except` 内，失败静默处理
2. **`notify()` 是唯一对外接口**：其他 router 只调用 `notify(user_id, text)`，不直接调用 httpx
3. **验证码安全**：`/bind/generate` 接口每次调用覆盖旧验证码（不会有多个有效码并存）；验证码 4 位数字，10 分钟过期，用完即清空
4. **Webhook 安全**：校验 `X-Telegram-Bot-Api-Secret-Token` header，不匹配直接 403
5. **本地开发**：`TELEGRAM_BOT_TOKEN` 为空时 `notify()` 直接返回，不报错，不影响本地开发调试
