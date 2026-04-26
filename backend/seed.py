from __future__ import annotations

from passlib.context import CryptContext
from sqlalchemy import inspect, select, text

from database import Base, SessionLocal, engine
from models import Channel, ChannelGroup, DirectMessage, Message, Reaction, Server, ServerMember, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


USERS = [
    {"username": "demo1", "display_name": "苏沐", "avatar_color": "av-4", "status": "online"},
    {"username": "demo2", "display_name": "江予白", "avatar_color": "av-5", "status": "idle"},
    {"username": "wenyan", "display_name": "沈温言", "avatar_color": "av-4", "status": "online"},
    {"username": "chenyan", "display_name": "陈砚", "avatar_color": "av-1", "status": "online"},
    {"username": "lushisheng", "display_name": "陆时笙", "avatar_color": "av-3", "status": "online"},
    {"username": "beidaoyi", "display_name": "北岛一", "avatar_color": "av-7", "status": "online"},
    {"username": "kora", "display_name": "Kora", "avatar_color": "av-2", "status": "online"},
    {"username": "librarian", "display_name": "Librarian", "avatar_color": "av-6", "status": "online"},
    {"username": "meizi", "display_name": "梅子黄时", "avatar_color": "av-8", "status": "idle"},
    {"username": "qinchuan", "display_name": "秦川", "avatar_color": "av-3", "status": "idle"},
    {"username": "yezhiqiu", "display_name": "叶知秋", "avatar_color": "av-2", "status": "offline"},
]

SERVERS = [
    {
        "key": "admin",
        "name": "管理员服务器",
        "short_name": "管",
        "color": "av-6",
        "description": "系统默认服务器，用于公告、审核和管理通知。",
        "is_recommended": False,
        "channels": [
            {
                "group": "管理 · 默认",
                "items": [
                    {"key": "announcements", "name": "系统公告", "kind": "announce", "topic": "平台公告和管理员通知"},
                    {"key": "help", "name": "帮助与反馈", "kind": "text", "topic": "新用户可以在这里提问"},
                ],
            }
        ],
    },
    {
        "key": "teahouse",
        "name": "山茶茶馆",
        "short_name": "山",
        "color": "av-1",
        "description": "适合闲聊、茶饮、生活记录的温柔小厅。",
        "is_recommended": True,
        "channels": [
            {
                "group": "Hall · 大厅",
                "items": [
                    {"key": "welcome", "name": "welcome", "kind": "announce", "topic": "新朋友请先在这里打招呼 ☕"},
                    {"key": "rules", "name": "rules", "kind": "announce"},
                ],
            },
            {
                "group": "Chat · 闲话",
                "items": [
                    {"key": "general", "name": "general", "kind": "text"},
                    {"key": "photos", "name": "photos", "kind": "text"},
                ],
            },
        ],
    },
    {
        "key": "bookclub",
        "name": "午夜读书会",
        "short_name": "读",
        "color": "av-6",
        "description": "每周共读一本书，慢慢讨论，欢迎认真潜水。",
        "is_recommended": True,
        "channels": [
            {
                "group": "Foyer · 门廊",
                "items": [
                    {"key": "welcome", "name": "welcome", "kind": "announce", "topic": "欢迎来到午夜读书会 · 我们每周五晚讨论一本书"},
                    {"key": "events", "name": "events", "kind": "announce"},
                ],
            },
            {
                "group": "Reading · 阅读中",
                "items": [
                    {
                        "key": "the-drifting",
                        "name": "the-drifting-classroom",
                        "kind": "text",
                        "topic": "当下共读：《漂流教室》— 第 3 章",
                    },
                    {"key": "essays", "name": "short-essays", "kind": "text"},
                    {"key": "annotations", "name": "annotations", "kind": "text"},
                ],
            },
            {
                "group": "Salons · 沙龙",
                "items": [
                    {"key": "monthly", "name": "monthly-picks", "kind": "text"},
                    {"key": "translations", "name": "translations", "kind": "text"},
                    {"key": "archive", "name": "archive", "kind": "text"},
                ],
            },
            {
                "group": "Voice · 语音",
                "items": [
                    {"key": "reading-room", "name": "Reading Room", "kind": "voice"},
                    {"key": "quiet-study", "name": "Quiet Study", "kind": "voice"},
                ],
            },
        ],
    },
    {
        "key": "botanist",
        "name": "植物志同好",
        "short_name": "植",
        "color": "av-2",
        "description": "植物辨认、养护经验和周末观察路线。",
        "is_recommended": True,
        "channels": [
            {
                "group": "Greenhouse · 温室",
                "items": [
                    {"key": "welcome", "name": "welcome", "kind": "announce"},
                    {"key": "identification", "name": "identify-this", "kind": "text"},
                    {"key": "propagation", "name": "propagation", "kind": "text"},
                    {"key": "trips", "name": "field-trips", "kind": "text"},
                ],
            }
        ],
    },
    {
        "key": "filmclub",
        "name": "胶片放映室",
        "short_name": "胶",
        "color": "av-4",
        "description": "电影、影评、放映计划和胶片美学。",
        "is_recommended": True,
        "channels": [
            {
                "group": "Reel · 胶片",
                "items": [
                    {"key": "welcome", "name": "welcome", "kind": "announce"},
                    {"key": "reviews", "name": "reviews", "kind": "text"},
                    {"key": "screenings", "name": "screenings", "kind": "text"},
                ],
            }
        ],
    },
    {
        "key": "coffee",
        "name": "慢咖啡馆",
        "short_name": "咖",
        "color": "av-3",
        "description": "咖啡豆、冲煮参数和城市咖啡馆地图。",
        "is_recommended": False,
        "channels": [
            {
                "group": "Bar · 吧台",
                "items": [
                    {"key": "welcome", "name": "welcome", "kind": "announce"},
                    {"key": "beans", "name": "beans", "kind": "text"},
                    {"key": "brewing", "name": "brewing", "kind": "text"},
                    {"key": "cafes", "name": "cafes-spotted", "kind": "text"},
                ],
            }
        ],
    },
    {
        "key": "cooking",
        "name": "家常厨房",
        "short_name": "厨",
        "color": "av-8",
        "description": "家常菜、工作日晚餐和厨房小技巧。",
        "is_recommended": False,
        "channels": [
            {
                "group": "Kitchen · 厨房",
                "items": [
                    {"key": "welcome", "name": "welcome", "kind": "announce"},
                    {"key": "recipes", "name": "recipes", "kind": "text"},
                    {"key": "weeknight", "name": "weeknight", "kind": "text"},
                ],
            }
        ],
    },
]

SEED_MESSAGES = [
    {
        "author": "wenyan",
        "content": "读第三章的时候总觉得，那种日常突然坍塌的质感，不是靠情节推进来的，而是靠一种光线。\n早晨像铁片一样压在窗户上，孩子们在里面做题 —— 这句我抄下来了。",
        "reactions": [("📖", 4), ("☕", 2)],
    },
    {
        "author": "demo2",
        "content": "我昨晚也停在这一句。像是在写时间压在人身上的重量。",
        "reactions": [("🌿", 3), ("🕯", 1)],
    },
    {
        "author": "chenyan",
        "content": "顺便记一下本周四的线上朗读：\n21:30 开始，语音频道 · Reading Room。这次朗读者是 @沈温言。\n欢迎潜水听～",
    },
    {
        "author": "librarian",
        "content": "共读朗读 · 第 3 章\n周四 21:30 — 22:30 · Reading Room\n主持：沈温言\n已报名：7 人",
    },
    {
        "author": "lushisheng",
        "content": "我想聊一下第三章里时间的处理 —— 当教室\"漂流\"出去之后，时钟不再走了，但孩子们仍然在看表。\n这个细节特别像一种集体催眠：他们知道时间停了，但还是要把目光放在那个旧的坐标上。",
        "reactions": [("👀", 5), ("💭", 2)],
    },
    {
        "author": "wenyan",
        "content": "这让我想到格雷厄姆·斯威夫特《水之乡》里的 — 历史也是这样被反复回望出来的。\n下周我会整理一个小对照笔记，贴到 #annotations。",
        "reactions": [("📝", 3)],
    },
    {
        "author": "kora",
        "content": "（潜水听了半个月，今天第一次发言）作为一个刚加入的成员想说：谢谢你们把讨论留得这么慢 🙏",
        "reactions": [("🌱", 9), ("🫖", 4), ("📚", 3)],
    },
]

DM_SEEDS = [
    ("wenyan", "demo1", "那我先把第三章的注解发你"),
    ("demo2", "demo1", "周五晚上见～"),
]


def ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("servers"):
        return
    with engine.begin() as connection:
        server_columns = {column["name"] for column in inspector.get_columns("servers")}
        if "icon_url" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN icon_url VARCHAR(256)"))
        if "description" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN description VARCHAR(256)"))
        if "is_recommended" not in server_columns:
            connection.execute(text("ALTER TABLE servers ADD COLUMN is_recommended BOOLEAN NOT NULL DEFAULT 0"))
        if not inspector.has_table("join_requests"):
            connection.execute(text("""
                CREATE TABLE join_requests (
                    id INTEGER NOT NULL PRIMARY KEY,
                    server_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'pending',
                    note VARCHAR(256),
                    decided_by INTEGER,
                    decided_at DATETIME,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(server_id) REFERENCES servers (id),
                    FOREIGN KEY(user_id) REFERENCES users (id),
                    FOREIGN KEY(decided_by) REFERENCES users (id)
                )
            """))
            connection.execute(text("CREATE INDEX ix_join_requests_id ON join_requests (id)"))
        if not inspector.has_table("friend_requests"):
            connection.execute(text("""
                CREATE TABLE friend_requests (
                    id INTEGER NOT NULL PRIMARY KEY,
                    requester_id INTEGER NOT NULL,
                    receiver_id INTEGER NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'pending',
                    decided_at DATETIME,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(requester_id) REFERENCES users (id),
                    FOREIGN KEY(receiver_id) REFERENCES users (id)
                )
            """))
            connection.execute(text("CREATE INDEX ix_friend_requests_id ON friend_requests (id)"))
        if not inspector.has_table("friendships"):
            connection.execute(text("""
                CREATE TABLE friendships (
                    id INTEGER NOT NULL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    friend_id INTEGER NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users (id),
                    FOREIGN KEY(friend_id) REFERENCES users (id),
                    UNIQUE(user_id, friend_id)
                )
            """))
            connection.execute(text("CREATE INDEX ix_friendships_id ON friendships (id)"))


def get_or_create_user(db, user_data: dict[str, str]) -> User:
    user = db.scalar(select(User).where(User.username == user_data["username"]))
    if user:
        return user

    user = User(
        username=user_data["username"],
        display_name=user_data["display_name"],
        password_hash=pwd_context.hash("demo1234"),
        avatar_color=user_data["avatar_color"],
        status=user_data["status"],
    )
    db.add(user)
    db.flush()
    return user


SERVER_MEMBER_MAP = {
    "admin": [user["username"] for user in USERS],
    "teahouse": ["demo2", "wenyan", "chenyan", "beidaoyi", "meizi", "qinchuan"],
    "bookclub": ["demo2", "wenyan", "chenyan", "lushisheng", "kora", "librarian"],
    "botanist": ["demo2", "chenyan", "kora", "qinchuan", "yezhiqiu"],
    "filmclub": ["demo2", "wenyan", "lushisheng", "meizi"],
    "coffee": ["demo2", "beidaoyi", "kora", "qinchuan"],
    "cooking": ["demo2", "chenyan", "lushisheng", "meizi", "yezhiqiu"],
}

def main() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility()

    with SessionLocal() as db:
        users = {user_data["username"]: get_or_create_user(db, user_data) for user_data in USERS}
        db.flush()

        server_by_key: dict[str, Server] = {}
        channel_by_key: dict[tuple[str, str], Channel] = {}
        owner = users["demo2"]

        for server_position, server_data in enumerate(SERVERS):
            server = db.scalar(select(Server).where(Server.name == server_data["name"]))
            if server is None:
                server = Server(
                    name=server_data["name"],
                    short_name=server_data["short_name"],
                    color=server_data["color"],
                    description=server_data.get("description"),
                    is_recommended=server_data.get("is_recommended", False),
                    owner_id=owner.id,
                )
                db.add(server)
                db.flush()
            else:
                server.description = server_data.get("description")
                server.is_recommended = server_data.get("is_recommended", False)
            server_by_key[server_data["key"]] = server

            member_usernames = SERVER_MEMBER_MAP.get(server_data["key"], SERVER_MEMBER_MAP["bookclub"])
            for username in member_usernames:
                user = users.get(username, owner)
                existing_member = db.scalar(
                    select(ServerMember).where(
                        ServerMember.server_id == server.id,
                        ServerMember.user_id == user.id,
                    )
                )
                if existing_member is None:
                    role = "founder" if user.id == owner.id else "member"
                    if username == "wenyan":
                        role = "editor"
                    elif username == "chenyan":
                        role = "mod"
                    db.add(ServerMember(server_id=server.id, user_id=user.id, role=role))

            for group_position, group_data in enumerate(server_data["channels"]):
                group = db.scalar(
                    select(ChannelGroup).where(
                        ChannelGroup.server_id == server.id,
                        ChannelGroup.name == group_data["group"],
                    )
                )
                if group is None:
                    group = ChannelGroup(server_id=server.id, name=group_data["group"], position=group_position)
                    db.add(group)
                    db.flush()

                for channel_position, channel_data in enumerate(group_data["items"]):
                    channel = db.scalar(
                        select(Channel).where(
                            Channel.server_id == server.id,
                            Channel.name == channel_data["name"],
                            Channel.group_id == group.id,
                        )
                    )
                    if channel is None:
                        channel = Channel(
                            server_id=server.id,
                            group_id=group.id,
                            name=channel_data["name"],
                            kind=channel_data["kind"],
                            topic=channel_data.get("topic"),
                            position=channel_position,
                        )
                        db.add(channel)
                        db.flush()
                    channel_by_key[(server_data["key"], channel_data["key"])] = channel

        active_channel = channel_by_key[("bookclub", "the-drifting")]
        existing_messages = db.scalar(select(Message).where(Message.channel_id == active_channel.id))
        if existing_messages is None:
            created_messages: list[Message] = []
            for message_data in SEED_MESSAGES:
                message = Message(
                    channel_id=active_channel.id,
                    author_id=users[message_data["author"]].id,
                    content=message_data["content"],
                )
                db.add(message)
                db.flush()
                created_messages.append(message)

                reactions = message_data.get("reactions", [])
                reaction_users = list(users.values())
                for emoji, count in reactions:
                    for user in reaction_users[:count]:
                        db.add(Reaction(message_id=message.id, user_id=user.id, emoji=emoji))

            if len(created_messages) > 1:
                created_messages[1].reply_to_id = created_messages[0].id

        for sender_username, receiver_username, content in DM_SEEDS:
            existing_dm = db.scalar(
                select(DirectMessage).where(
                    DirectMessage.sender_id == users[sender_username].id,
                    DirectMessage.receiver_id == users[receiver_username].id,
                    DirectMessage.content == content,
                )
            )
            if existing_dm is None:
                db.add(
                    DirectMessage(
                        sender_id=users[sender_username].id,
                        receiver_id=users[receiver_username].id,
                        content=content,
                    )
                )

        db.commit()

    print("Seed data inserted successfully.")


if __name__ == "__main__":
    main()
