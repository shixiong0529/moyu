# Biscord 服务器更新命令

服务器路径：

```bash
/opt/biscord/current
```

域名：

```bash
https://shi.show
```

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
curl https://shi.show/api/health
```

`curl` 正常返回：

```json
{"status":"ok"}
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
curl https://shi.show/api/health
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
sudo nginx -T 2>/dev/null | grep -nE "server_name shi.show|server_name chat.slow.best|proxy_pass http://127.0.0.1:8000|proxy_pass http://127.0.0.1:8001"
```

当前约定：

```text
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
APP_BASE_URL=https://shi.show
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

## SSL 证书续期

**自动续期正常，无需手动操作。**

Certbot 注册了 systemd timer，每天运行两次 `certbot renew`，证书剩余不足 30 天时自动续期。

验证 timer 状态：

```bash
sudo systemctl status certbot.timer
```

看到 `active (waiting)` 即正常。

### 已知问题：`certbot renew --dry-run` 会失败

`--dry-run` 使用 Let's Encrypt 的 **Staging 测试服务器**，阿里云屏蔽了这些 IP，导致 403。但真实续期（`certbot renew` 不带 `--dry-run`）使用**生产服务器**，不受影响，可以正常续期。

**结论：不要用 `--dry-run` 测试，直接续期即可。**

### 需要手动续期时

逐个域名执行（选 `K` 保持现有密钥类型，选 `2` 续期）：

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d shi.show -d www.shi.show
sudo certbot certonly --webroot -w /var/www/certbot -d moyu.in -d www.moyu.in
sudo certbot certonly --webroot -w /var/www/certbot -d chat.slow.best
sudo nginx -s reload
```

证书到期时间：

```bash
sudo certbot certificates
```

**逐个域名续期：**

```bash
# shi.show
sudo certbot certonly --webroot -w /var/www/certbot -d shi.show -d www.shi.show

# moyu.in
sudo certbot certonly --webroot -w /var/www/certbot -d moyu.in -d www.moyu.in

# chat.slow.best（需确认 red 的 nginx 配置有 challenge 路径）
sudo certbot certonly --webroot -w /var/www/certbot -d chat.slow.best
```

续期后重载 nginx：

```bash
sudo nginx -s reload
```

**验证：**

```bash
sudo certbot certificates
curl -I https://shi.show
curl -I https://moyu.in
```

### 证书到期时间

```bash
sudo certbot certificates
```
