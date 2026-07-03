"""
一次性迁移脚本：把 bots 表里的历史明文密码加密为 enc:v1: 密文。

背景：BUG-04 修复后，新建/编辑 bot 会自动加密密码，但改动之前建的 bot 密码在
库里仍是明文（读取时兼容明文，能正常跑）。本脚本把这些历史明文立即转成密文。

特性：
- 幂等：已是密文（enc:v1: 前缀）的跳过，可重复运行。
- 零停机：运行后无需重启——bot_runner 读取时会自动解密（明文/密文都兼容）。

用法（在服务器上）：
    cd /opt/biscord/current/backend && source .venv/bin/activate
    python migrate_bot_passwords.py
"""
from database import SessionLocal
from models import Bot
from crypto_utils import _PREFIX, decrypt_secret, encrypt_secret


def main() -> None:
    db = SessionLocal()
    try:
        bots = db.query(Bot).all()
        migrated = 0
        for bot in bots:
            password = bot.password or ""
            if password.startswith(_PREFIX):
                continue
            bot.password = encrypt_secret(password)
            migrated += 1
        db.commit()
        print(f"共 {len(bots)} 个 bot，本次加密 {migrated} 个，其余已是密文。")

        # 校验：全部为密文且可正常解密
        for bot in db.query(Bot).all():
            assert bot.password.startswith(_PREFIX), f"bot {bot.id} 仍非密文"
            assert decrypt_secret(bot.password), f"bot {bot.id} 解密结果为空"
        print("校验通过：所有 bot 密码均为密文且可正常解密。运行后无需重启。")
    finally:
        db.close()


if __name__ == "__main__":
    main()
