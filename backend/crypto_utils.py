"""
对称加密工具：用 SECRET_KEY 派生 Fernet 密钥，加密存储 bot 密码等敏感字段。

设计要点：
- 密文带 `enc:v1:` 前缀，可明确区分「已加密」与「历史明文」，避免把恰好是合法
  base64 的旧明文误当密文解密。
- decrypt_secret 对无前缀的历史明文原样返回，实现零停机的向后兼容：旧 bot 不用
  停机迁移，下次被创建/更新时会自动写成密文。
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from auth import SECRET_KEY

_PREFIX = "enc:v1:"

# 从 SECRET_KEY 稳定派生一个 32 字节 urlsafe-base64 的 Fernet 密钥
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest()))


def encrypt_secret(plain: str) -> str:
    """加密明文，返回带前缀的密文字符串。"""
    return _PREFIX + _fernet.encrypt(plain.encode()).decode()


def decrypt_secret(value: str | None) -> str:
    """解密；对没有前缀的历史明文数据原样返回（向后兼容）。"""
    if not value:
        return value or ""
    if not value.startswith(_PREFIX):
        return value  # 旧的明文数据
    try:
        return _fernet.decrypt(value[len(_PREFIX):].encode()).decode()
    except (InvalidToken, ValueError):
        return value
