# 摸鱼社区 服务器更新命令

服务器信息：

```
IP：    8.148.27.161
路径：  /opt/biscord/current
域名：  https://moyu.in  /  https://shi.show
SSH：   ssh root@8.148.27.161
```

> ⚠️ Git 仓库已从 `biscord` 改名为 `moyu`。服务器首次 pull 前需执行一次：
> ```bash
> cd /opt/biscord/current
> git remote set-url origin https://github.com/shixiong0529/moyu.git
> ```

旧站点 `/opt/red/current` 不动，`chat.slow.best` 继续走旧站。

## 常规更新

在服务器执行：

```bash
cd /opt/biscord/current
git pull origin main

cd /opt/biscord/current/backend
source .venv/bin/activate
python -m alembic upgrade head

sudo systemctl restart biscord
sudo systemctl status biscord --no-pager
curl https://moyu.in/api/health
```

说明：

- 如果本次更新包含 `backend/alembic/versions/` 下的新迁移文件，执行 `python -m alembic upgrade head` 会同步数据库结构。
- 如果只是前端、后端业务代码或样式更新，没有数据库结构变化，`git pull` 后重启 `biscord` 服务即可。
- `python -m alembic heads` 可用于查看当前代码里最新的迁移头，正常情况下应只显示一个 head。

`curl` 正常返回：

```json
{"status":"ok"}
```

## 数据库同步（本地覆盖服务器）

> 将本地 SQLite 数据完整替换到生产 PostgreSQL，适用于数据重置或初始化场景。

### 第一步：本地导出（Windows 本地执行）

```bash
cd c:\Users\Administrator\Desktop\moyu\backend
python export_sqlite.py
```

生成 `backend/export.sql`（UTF-8，自动写文件无需重定向）。

### 第二步：上传到服务器

```bash
# 上传数据库文件
scp backend/export.sql root@8.148.27.161:/opt/biscord/current/backend/export_new.sql

# 上传图片（有新增图片时执行）
scp -r backend/uploads/* root@8.148.27.161:/opt/biscord/current/backend/uploads/
```

### 第三步：服务器上验证完整性

```bash
grep -c "COMMIT" /opt/biscord/current/backend/export_new.sql
tail -3 /opt/biscord/current/backend/export_new.sql
```

`COMMIT` 数量必须为 `1`，最后一行是 `COMMIT;` 再继续。

### 第四步：停服、导入、重启

```bash
sudo systemctl stop biscord

cd /opt/biscord/current/backend
source .venv/bin/activate

# 过滤孤立私信（避免 FK 约束报错）
grep -v "INSERT INTO direct_messages" export_new.sql > export_clean.sql

# 导入（遇错自动停止）
psql "postgresql://biscord:Biscord_2026_Strong_Pass@127.0.0.1:5432/biscord" \
  -v ON_ERROR_STOP=1 -f export_clean.sql 2>&1 | tail -5

# 验证服务器数据
psql "postgresql://biscord:Biscord_2026_Strong_Pass@127.0.0.1:5432/biscord" \
  -c "SELECT id, name FROM servers ORDER BY id;"

sudo systemctl start biscord
curl https://moyu.in/api/health
```

## 查看日志

```bash
sudo journalctl -u biscord -n 80 --no-pager -l
```

实时查看：

```bash
sudo journalctl -u biscord -f
```

## 查看服务器状态

Biscord 服务：

```bash
sudo systemctl status biscord --no-pager
curl https://moyu.in/api/health
```

Nginx 服务：

```bash
sudo systemctl status nginx --no-pager
sudo nginx -t
```

PostgreSQL 服务：

```bash
sudo systemctl status postgresql --no-pager
psql "postgresql://biscord:Biscord_2026_Strong_Pass@127.0.0.1:5432/biscord" -c "select current_database(), current_user;"
```

端口监听：

```bash
sudo ss -lntp | grep -E ":80|:443|:8000|:8001|:5432"
```

最近错误日志：

```bash
sudo journalctl -u biscord -n 100 --no-pager -l
sudo tail -n 80 /var/log/nginx/error.log
```

## 服务管理

```bash
sudo systemctl start biscord
sudo systemctl stop biscord
sudo systemctl restart biscord
sudo systemctl status biscord --no-pager
```

## Nginx 检查

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo nginx -T 2>/dev/null | grep -nE "server_name moyu.in|server_name shi.show|server_name chat.slow.best|proxy_pass http://127.0.0.1:8000|proxy_pass http://127.0.0.1:8001"
```

当前约定：

```text
moyu.in        -> 127.0.0.1:8001 -> Biscord
shi.show       -> 127.0.0.1:8001 -> Biscord
chat.slow.best -> 127.0.0.1:8000 -> 旧 red 项目
```

## 首次部署关键配置

Biscord systemd 服务：

```bash
/etc/systemd/system/biscord.service
```

后端环境变量：

```bash
/opt/biscord/current/backend/.env
```

示例：

```env
DATABASE_URL=postgresql://biscord:Biscord_2026_Strong_Pass@127.0.0.1:5432/biscord
SECRET_KEY=替换为服务器上的随机密钥
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
APP_BASE_URL=https://moyu.in
# Bot 进程调用自身 API（填本地端口，避免绕道域名）
API_BASE=http://localhost:8001
# 允许跨域的前端来源
CORS_ORIGINS=https://shi.show,https://moyu.in
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

## SSL 证书续期

**现状：`acme.sh` + DNS-01（阿里云 DNS API）自动续期，装完不用再管。已停用 Certbot / HTTP-01。**

> ⚠️ **为什么不能用 Certbot / HTTP-01**：这台 ECS 装了阿里云云安全中心（Aegis/云盾），会拦截被判定为"可疑"的境外流量。Let's Encrypt 验证节点大多在境外——nginx access log 里请求已返回 200，但 Aegis 在更前面把响应换成 403 发给 Let's Encrypt，导致 `certbot --webroot`/`--standalone`/`--nginx` 在本机 curl 正常的情况下始终失败。同机所有域名走 HTTP-01 都会被拦，已统一改用 DNS-01。旧 certbot 续期配置已移到 `/etc/letsencrypt/renewal-disabled/`。

### 自动续期

`acme.sh` 安装时会写一条 `acme.sh --cron` 的 crontab，到期前自动改 DNS TXT、自动续期、自动 reload nginx。查看 cron：

```bash
crontab -l | grep acme
```

### 查看证书到期时间

```bash
~/.acme.sh/acme.sh --list --config-home /root/.acme.sh-intl   # 国际站：moyu.in / chat.slow.best
~/.acme.sh/acme.sh --list --config-home /root/.acme.sh-cn     # 中国站：shi.show
```

### 手动重签 / 申请一个域名

```bash
# 阿里云 RAM 子账号 AccessKey，只给 AliyunDNSFullAccess 权限
export Ali_Key="AccessKey-ID"
export Ali_Secret="AccessKey-Secret"

# --dnssleep 30：跳过不可靠的 DNS 自检，固定等 30 秒再校验
~/.acme.sh/acme.sh --issue --dns dns_ali -d moyu.in -d www.moyu.in \
  --server letsencrypt --dnssleep 30
~/.acme.sh/acme.sh --install-cert -d moyu.in \
  --key-file       /etc/letsencrypt/live/moyu.in/privkey.pem \
  --fullchain-file /etc/letsencrypt/live/moyu.in/fullchain.pem \
  --reloadcmd      "nginx -t && systemctl reload nginx"
```

> ⚠️ **多账号踩坑**：`dns_ali` 把 `Ali_Key`/`Ali_Secret` 存在全局共享的 `~/.acme.sh/account.conf`，同机多账号时后签发的会覆盖前面的 key，几个月后自动续期用错账号 key 静默失败。本机账号归属：
>
> | 域名 | 阿里云账号 | `--config-home` |
> |------|-----------|-----------------|
> | `moyu.in` / `www.moyu.in` / `chat.slow.best` | 国际站 | `/root/.acme.sh-intl` |
> | `shi.show` / `www.shi.show` | 中国站 | `/root/.acme.sh-cn` |
>
> 解法：每个账号用各自的 AccessKey + 独立 `--config-home` 签发，并给 cron 加对应的独立续期任务：
>
> ```bash
> # 国际站（moyu.in / chat.slow.best）
> mkdir -p /root/.acme.sh-intl
> export Ali_Key="国际站-AK-ID"; export Ali_Secret="国际站-AK-Secret"
> ~/.acme.sh/acme.sh --issue --dns dns_ali -d moyu.in -d www.moyu.in \
>   --server letsencrypt --dnssleep 30 --config-home /root/.acme.sh-intl
>
> # 中国站（shi.show）
> mkdir -p /root/.acme.sh-cn
> export Ali_Key="中国站-AK-ID"; export Ali_Secret="中国站-AK-Secret"
> ~/.acme.sh/acme.sh --issue --dns dns_ali -d shi.show -d www.shi.show \
>   --server letsencrypt --dnssleep 30 --config-home /root/.acme.sh-cn
> ```

### 验证

```bash
curl -I https://moyu.in
curl -I https://shi.show
```

> 完整根因排查记录见 `../gaokao/README.md`（同一台服务器、同类 Aegis 拦截问题）。
