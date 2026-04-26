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
