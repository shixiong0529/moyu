"""
链接预览：消息里出现的第一个 URL，抓取其 Open Graph 元数据渲染成卡片。

安全要点（防 SSRF）：
- 只允许 http/https；抓取前解析域名对应的所有 IP，任意一个落在内网/回环/
  链路本地范围就拒绝抓取——不能让服务器被当跳板去探测内网地址。
- 限制重定向次数，且每次跳转都要重新做上面的地址校验（否则可以先指向一个
  合法公网地址通过校验，再 302 到内网）。
- 限制读取的响应体大小和总耗时，避免被巨大/挂起的响应拖死一个 worker。
"""
from __future__ import annotations

import ipaddress
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx

URL_PATTERN = re.compile(r'https?://[^\s<>"\']+', re.IGNORECASE)
MAX_BYTES = 200_000
MAX_REDIRECTS = 5
TIMEOUT_SECONDS = 4.0


def find_first_url(text: str) -> str | None:
    match = URL_PATTERN.search(text or "")
    return match.group(0) if match else None


def _is_public_host(hostname: str) -> bool:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    return True


def _safe_url(url: str) -> str | None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    if not _is_public_host(parsed.hostname):
        return None
    return url


class _HeadMetaParser(HTMLParser):
    """只扫描 <head> 里的 <title>/<meta> 标签，遇到 </head> 就停。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title: str = ""
        self._in_title = False
        self._done = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._done:
            return
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            attr_map = {k.lower(): (v or "") for k, v in attrs}
            key = attr_map.get("property") or attr_map.get("name")
            if key and "content" in attr_map:
                self.meta[key.lower()] = attr_map["content"]

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "head":
            self._done = True

    def handle_data(self, data: str) -> None:
        if self._in_title and not self._done:
            self.title += data


async def fetch_link_preview(url: str) -> dict | None:
    """尽力而为：任何失败都返回 None，不应该影响消息发送本身。"""
    current_url = _safe_url(url)
    if current_url is None:
        return None

    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=TIMEOUT_SECONDS) as client:
            for _ in range(MAX_REDIRECTS):
                resp = await client.get(current_url, headers={"User-Agent": "Mozilla/5.0 (compatible; MoyuLinkPreview/1.0)"})
                if resp.status_code in (301, 302, 303, 307, 308) and "location" in resp.headers:
                    next_url = _safe_url(urljoin(current_url, resp.headers["location"]))
                    if next_url is None:
                        return None
                    current_url = next_url
                    continue
                break
            else:
                return None

            content_type = resp.headers.get("content-type", "")
            if "text/html" not in content_type:
                return None
            html = resp.text[:MAX_BYTES]
    except (httpx.HTTPError, UnicodeDecodeError):
        return None

    parser = _HeadMetaParser()
    try:
        parser.feed(html)
    except Exception:
        return None

    title = parser.meta.get("og:title") or parser.title.strip()
    if not title:
        return None
    description = parser.meta.get("og:description") or parser.meta.get("description") or ""
    image = parser.meta.get("og:image") or ""
    site_name = parser.meta.get("og:site_name") or urlparse(current_url).hostname or ""

    return {
        "kind": "link",
        "url": url,
        "title": title[:200],
        "description": description[:280],
        "image": urljoin(current_url, image) if image else None,
        "siteName": site_name[:80],
    }
