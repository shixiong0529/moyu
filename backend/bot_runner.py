"""
BotRunner — runs a single bot as an asyncio background task inside FastAPI.
Each bot has its own auth state, LLM client, and per-channel history.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import TYPE_CHECKING

import httpx
import websockets
from openai import AsyncOpenAI

from crypto_utils import decrypt_secret

os.environ.setdefault("NO_PROXY", "localhost,127.0.0.1")

if TYPE_CHECKING:
    from models import Bot as BotModel

log = logging.getLogger("bot_runner")

HISTORY_LIMIT = 12

# Global registry: bot_id → BotRunner
running_bots: dict[int, "BotRunner"] = {}

# ── 联网搜索（可选）──────────────────────────────────────────────
# 通过环境变量启用：BOT_SEARCH_PROVIDER=tavily|bocha + BOT_SEARCH_API_KEY=xxx
# 启用后 bot 以 OpenAI function calling 方式按需调用 web_search 工具，
# DeepSeek/Kimi/OpenAI 等兼容接口均支持。未配置时行为与之前完全一致。
SEARCH_TOOL = [{
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "联网搜索最新信息。当用户问题涉及时事新闻、实时数据、近期发生的事件或你知识截止日期之后的内容时调用。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词，用简洁的中文或英文"},
            },
            "required": ["query"],
        },
    },
}]


def _search_config() -> tuple[str, str, str] | None:
    provider = os.getenv("BOT_SEARCH_PROVIDER", "").strip().lower()
    api_key = os.getenv("BOT_SEARCH_API_KEY", "").strip()
    if provider not in {"tavily", "bocha"} or not api_key:
        return None
    default_base = "https://api.tavily.com" if provider == "tavily" else "https://api.bochaai.com"
    api_base = os.getenv("BOT_SEARCH_API_BASE", "").strip() or default_base
    return provider, api_key, api_base.rstrip("/")


async def web_search(query: str) -> str:
    """执行联网搜索，返回给 LLM 的纯文本结果；失败时返回错误说明（不抛异常）。"""
    config = _search_config()
    if config is None:
        return "（未配置搜索服务，无法联网查询）"
    provider, api_key, api_base = config
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if provider == "tavily":
                r = await client.post(f"{api_base}/search", json={
                    "api_key": api_key, "query": query, "max_results": 5,
                })
                r.raise_for_status()
                results = r.json().get("results", [])
                items = [(it.get("title", ""), it.get("url", ""), it.get("content", "")) for it in results]
            else:  # bocha
                r = await client.post(
                    f"{api_base}/v1/web-search",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"query": query, "count": 5, "summary": True},
                )
                r.raise_for_status()
                pages = (((r.json().get("data") or {}).get("webPages") or {}).get("value") or [])
                items = [(it.get("name", ""), it.get("url", ""), it.get("summary") or it.get("snippet", "")) for it in pages]
    except Exception as e:
        log.warning(f"web_search failed: {type(e).__name__}: {e}")
        return f"（搜索服务暂时不可用：{type(e).__name__}）"
    if not items:
        return "（没有找到相关结果）"
    lines = []
    for i, (title, url, snippet) in enumerate(items[:5], 1):
        lines.append(f"{i}. {title}\n   {snippet[:300]}\n   来源: {url}")
    return "\n".join(lines)


class BotRunner:
    def __init__(self, bot: "BotModel", api_base: str) -> None:
        self.bot_id = bot.id
        self.username = bot.username
        self.api_base = api_base.rstrip("/")
        self.ws_base = self.api_base.replace("http://", "ws://").replace("https://", "wss://")
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._state: dict = {"access_token": None, "refresh_token": None, "user_id": None}
        self._histories: dict[int, list] = {}
        self._reload(bot)

    def _reload(self, bot: "BotModel") -> None:
        self.password = decrypt_secret(bot.password)
        self.display_name = bot.display_name
        self.llm = AsyncOpenAI(api_key=bot.llm_api_key, base_url=bot.llm_base_url)
        self.llm_model = bot.llm_model
        self.system_prompt = bot.system_prompt
        try:
            self.channel_ids: list[int] = json.loads(bot.channel_ids or "[]")
        except Exception:
            self.channel_ids = []

    async def _login(self, client: httpx.AsyncClient) -> None:
        r = await client.post(f"{self.api_base}/api/auth/login",
                              json={"username": self.username, "password": self.password})
        if r.status_code == 401:
            r = await client.post(f"{self.api_base}/api/auth/register",
                                  json={"username": self.username,
                                        "display_name": self.display_name,
                                        "password": self.password})
            r.raise_for_status()
        r.raise_for_status()
        data = r.json()
        self._state["access_token"] = data["access_token"]
        self._state["refresh_token"] = data["refresh_token"]
        self._state["user_id"] = data["user"]["id"]
        log.info(f"[bot:{self.bot_id}] logged in as user_id={self._state['user_id']}")

    async def _refresh_token(self, client: httpx.AsyncClient) -> None:
        r = await client.post(f"{self.api_base}/api/auth/refresh",
                              json={"refresh_token": self._state["refresh_token"]})
        r.raise_for_status()
        self._state["access_token"] = r.json()["access_token"]


    async def _discover_channels(self, client: httpx.AsyncClient) -> list[int]:
        headers = {"Authorization": f"Bearer {self._state['access_token']}"}
        r = await client.get(f"{self.api_base}/api/servers", headers=headers)
        r.raise_for_status()
        servers = r.json()
        target = next(
            (s for s in servers if s.get("is_admin_server") or "管理员" in s.get("name", "")),
            None,
        )
        if not target:
            log.warning(f"[bot:{self.bot_id}] not a member of 管理员服务器, no channels to watch")
            return []
        r2 = await client.get(f"{self.api_base}/api/servers/{target['id']}/channels", headers=headers)
        r2.raise_for_status()
        ids = [
            ch["id"]
            for group in r2.json()
            for ch in group.get("items", [])
            if ch.get("kind", "text") == "text"
        ]
        log.info(f"[bot:{self.bot_id}] discovered {len(ids)} channel(s) in '{target['name']}'")
        return ids


    async def _ask_llm(self, channel_id: int, user_display: str, question: str) -> str:
        hist = self._histories.setdefault(channel_id, [])
        if question.strip() == "/reset":
            hist.clear()
            return "好的，对话上下文已重置 👌"
        hist.append({"role": "user", "content": f"{user_display}: {question}"})
        if len(hist) > HISTORY_LIMIT * 2:
            hist[:] = hist[-HISTORY_LIMIT * 2:]

        system_prompt = self.system_prompt
        search_enabled = _search_config() is not None
        if search_enabled:
            from datetime import date
            system_prompt += f"\n\n今天的日期是 {date.today().isoformat()}。你可以调用 web_search 工具联网搜索最新信息；引用搜索结果时附上来源链接。"
        messages = [{"role": "system", "content": system_prompt}] + list(hist)

        try:
            kwargs = {"model": self.llm_model, "messages": messages, "max_tokens": 1024}
            if search_enabled:
                kwargs["tools"] = SEARCH_TOOL
            resp = await self.llm.chat.completions.create(**kwargs)
            msg = resp.choices[0].message

            # 工具调用循环：模型请求搜索 → 执行 → 把结果喂回去，最多 3 轮防死循环
            rounds = 0
            while getattr(msg, "tool_calls", None) and rounds < 3:
                rounds += 1
                messages.append({
                    "role": "assistant",
                    "content": msg.content,
                    "tool_calls": [{
                        "id": tc.id, "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    } for tc in msg.tool_calls],
                })
                for tc in msg.tool_calls:
                    if tc.function.name == "web_search":
                        try:
                            query = json.loads(tc.function.arguments or "{}").get("query", question)
                        except Exception:
                            query = question
                        log.info(f"[bot:{self.bot_id}] web_search: {query}")
                        result = await web_search(query)
                    else:
                        result = "（未知工具）"
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
                kwargs["messages"] = messages
                resp = await self.llm.chat.completions.create(**kwargs)
                msg = resp.choices[0].message

            answer = (msg.content or "").strip() or "（AI 没有给出回答，请换个问法试试）"
            hist.append({"role": "assistant", "content": answer})
            return answer
        except Exception as e:
            log.error(f"[bot:{self.bot_id}] LLM error: {e}")
            return "（AI 暂时无响应，请稍后再试 🔧）"


    async def _send_message(self, channel_id: int, content: str,
                            reply_to_id: int | None, client: httpx.AsyncClient) -> None:
        headers = {"Authorization": f"Bearer {self._state['access_token']}"}
        body = {"content": content, "reply_to_id": reply_to_id}
        r = await client.post(f"{self.api_base}/api/channels/{channel_id}/messages",
                              json=body, headers=headers)
        if r.status_code == 401:
            await self._refresh_token(client)
            headers["Authorization"] = f"Bearer {self._state['access_token']}"
            r = await client.post(f"{self.api_base}/api/channels/{channel_id}/messages",
                                  json=body, headers=headers)
        if not r.is_success:
            log.error(f"[bot:{self.bot_id}] send_message failed: {r.status_code}")


    async def _watch_channel(self, channel_id: int, client: httpx.AsyncClient) -> None:
        mention = f"@{self.display_name}"
        while not self._stop_event.is_set():
            try:
                uri = f"{self.ws_base}/ws/channel/{channel_id}"
                async with websockets.connect(uri) as ws:
                    await ws.send(json.dumps({"type": "auth",
                                              "token": self._state["access_token"]}))
                    ack = json.loads(await ws.recv())
                    if ack.get("type") != "auth.ok":
                        detail = ack.get("detail", "unauthorized")
                        log.error(f"[bot:{self.bot_id}] cannot watch channel {channel_id}: {detail}")
                        if detail in {"unauthorized", "forbidden"}:
                            return
                        await asyncio.sleep(5)
                        continue
                    log.info(f"[bot:{self.bot_id}] watching channel {channel_id}")

                    async for raw in ws:
                        if self._stop_event.is_set():
                            return
                        event = json.loads(raw)
                        if event.get("type") == "error":
                            detail = event.get("detail", "websocket error")
                            log.error(f"[bot:{self.bot_id}] channel {channel_id} closed by server: {detail}")
                            if detail in {"unauthorized", "forbidden"}:
                                return
                            continue
                        if event.get("type") != "message.new":
                            continue
                        msg = event["data"]
                        if msg["author"]["id"] == self._state["user_id"]:
                            continue
                        if mention not in msg["content"]:
                            continue
                        question = msg["content"].replace(mention, "").strip() or "你好"
                        answer = await self._ask_llm(channel_id,
                                                     msg["author"]["display_name"],
                                                     question)
                        await self._send_message(channel_id, answer,
                                                 reply_to_id=msg["id"], client=client)
                    if not self._stop_event.is_set():
                        await asyncio.sleep(5)
            except websockets.exceptions.ConnectionClosed as e:
                if self._stop_event.is_set():
                    return
                if getattr(e, "code", None) == 1008:
                    log.error(f"[bot:{self.bot_id}] channel {channel_id} closed with policy violation, stop reconnecting")
                    return
                await asyncio.sleep(5)
            except Exception as e:
                log.error(f"[bot:{self.bot_id}] ch{channel_id} error: {type(e).__name__}: {e}")
                if self._stop_event.is_set():
                    return
                await asyncio.sleep(10)


    async def _run(self) -> None:
        try:
            async with httpx.AsyncClient() as client:
                # 服务重启时 lifespan 先于 HTTP 端口就绪启动 runner，首次登录可能连不上自身 API；
                # 带退避重试，避免 bot 在服务重启后静默变成"已停止"
                for attempt in range(5):
                    try:
                        await self._login(client)
                        break
                    except Exception as e:
                        if attempt == 4:
                            raise
                        log.warning(f"[bot:{self.bot_id}] login attempt {attempt + 1} failed ({e}), retrying…")
                        await asyncio.sleep(2 * (attempt + 1))
                channel_ids = self.channel_ids or await self._discover_channels(client)
                if not channel_ids:
                    log.warning(f"[bot:{self.bot_id}] no channels to watch, exiting")
                    return
                log.info(f"[bot:{self.bot_id}] watching channels: {channel_ids}")
                await asyncio.gather(
                    *[self._watch_channel(cid, client) for cid in channel_ids],
                    return_exceptions=True,
                )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            log.error(f"[bot:{self.bot_id}] run error: {e}", exc_info=True)


    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run(), name=f"bot_{self.bot_id}")
        log.info(f"[bot:{self.bot_id}] started")

    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await asyncio.wait_for(self._task, timeout=5)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
        log.info(f"[bot:{self.bot_id}] stopped")

    def reload(self, bot: "BotModel") -> None:
        self._reload(bot)
        self._histories.clear()
