/* Seed data — all original, Chinese content for the interest-group community Hearth */

const SERVERS = [
  { id: 'dm', name: '私信', kind: 'dm' },
  { id: 'divider' },
  { id: 'teahouse', name: '山茶茶馆', short: '山', color: 'av-1', unread: 3 },
  { id: 'bookclub', name: '午夜读书会', short: '读', color: 'av-6', active: true },
  { id: 'botanist', name: '植物志同好', short: '植', color: 'av-2' },
  { id: 'filmclub', name: '胶片放映室', short: '胶', color: 'av-4', unread: 12 },
  { id: 'coffee', name: '慢咖啡馆', short: '咖', color: 'av-3' },
  { id: 'cooking', name: '家常厨房', short: '厨', color: 'av-8' },
  { id: 'divider2' },
  { id: 'add', name: '新建或加入服务器', kind: 'add' },
];

const CHANNELS = {
  teahouse: [
    { group: 'Hall · 大厅', items: [
      { id: 'welcome', name: 'welcome', kind: 'announce', topic: '新朋友请先在这里打招呼 ☕' },
      { id: 'rules', name: 'rules', kind: 'announce' },
    ]},
    { group: 'Chat · 闲话', items: [
      { id: 'general', name: 'general', kind: 'text', unread: true },
      { id: 'photos', name: 'photos', kind: 'text' },
    ]},
  ],
  bookclub: [
    { group: 'Foyer · 门廊', items: [
      { id: 'welcome', name: 'welcome', kind: 'announce', topic: '欢迎来到午夜读书会 · 我们每周五晚讨论一本书' },
      { id: 'events', name: 'events', kind: 'announce' },
    ]},
    { group: 'Reading · 阅读中', items: [
      { id: 'the-drifting', name: 'the-drifting-classroom', kind: 'text', topic: '当下共读：《漂流教室》— 第 3 章' , active: true },
      { id: 'essays', name: 'short-essays', kind: 'text', unread: true },
      { id: 'annotations', name: 'annotations', kind: 'text' },
    ]},
    { group: 'Salons · 沙龙', items: [
      { id: 'monthly', name: 'monthly-picks', kind: 'text' },
      { id: 'translations', name: 'translations', kind: 'text', mentions: 2 },
      { id: 'archive', name: 'archive', kind: 'text' },
    ]},
    { group: 'Voice · 语音', items: [
      { id: 'reading-room', name: 'Reading Room', kind: 'voice', members: ['wen', 'jiang'] },
      { id: 'quiet-study', name: 'Quiet Study', kind: 'voice' },
    ]},
  ],
  botanist: [
    { group: 'Greenhouse · 温室', items: [
      { id: 'welcome', name: 'welcome', kind: 'announce' },
      { id: 'identification', name: 'identify-this', kind: 'text', unread: true, active: true },
      { id: 'propagation', name: 'propagation', kind: 'text' },
      { id: 'trips', name: 'field-trips', kind: 'text' },
    ]},
  ],
  filmclub: [
    { group: 'Reel · 胶片', items: [
      { id: 'welcome', name: 'welcome', kind: 'announce', active: true },
      { id: 'reviews', name: 'reviews', kind: 'text', unread: true },
      { id: 'screenings', name: 'screenings', kind: 'text', mentions: 5 },
    ]},
  ],
  coffee: [
    { group: 'Bar · 吧台', items: [
      { id: 'welcome', name: 'welcome', kind: 'announce', active: true },
      { id: 'beans', name: 'beans', kind: 'text' },
      { id: 'brewing', name: 'brewing', kind: 'text' },
      { id: 'cafes', name: 'cafes-spotted', kind: 'text' },
    ]},
  ],
  cooking: [
    { group: 'Kitchen · 厨房', items: [
      { id: 'welcome', name: 'welcome', kind: 'announce', active: true },
      { id: 'recipes', name: 'recipes', kind: 'text' },
      { id: 'weeknight', name: 'weeknight', kind: 'text' },
    ]},
  ],
};

const DM_LIST = [
  { id: 'dm-wen', name: '沈温言', handle: '@wenyan', status: 'online', color: 'av-4', preview: '那我先把第三章的注解发你', unread: 2 },
  { id: 'dm-jiang', name: '江予白', handle: '@jiangyubai', status: 'idle', color: 'av-5', preview: 'typing...', unread: 0 },
  { id: 'dm-chen', name: '陈砚', handle: '@chenyan', status: 'dnd', color: 'av-1' },
  { id: 'dm-lu', name: '陆时笙', handle: '@lushisheng', status: 'online', color: 'av-3' },
  { id: 'dm-ye', name: '叶知秋', handle: '@yezhiqiu', status: 'offline', color: 'av-2' },
  { id: 'dm-group', name: '读书会 · 本月', handle: '4 members', status: 'online', color: 'av-6', group: true, preview: '周五晚上见～' },
];

const MEMBERS = [
  { group: 'Online · Founders', key: 'online-f', items: [
    { id: 'u-jiang', name: '江予白', color: 'av-5', role: 'founder', status: 'online', activity: 'Reading 《漂流教室》' },
    { id: 'u-wen', name: '沈温言', color: 'av-4', role: 'editor', status: 'online', activity: 'In voice · Reading Room' },
  ]},
  { group: 'Online', key: 'online', items: [
    { id: 'u-chen', name: '陈砚', color: 'av-1', role: 'mod', status: 'online' },
    { id: 'u-lu', name: '陆时笙', color: 'av-3', status: 'online', activity: 'Listening · Debussy' },
    { id: 'u-bei', name: '北岛一', color: 'av-7', status: 'online' },
    { id: 'u-kora', name: 'Kora', color: 'av-2', status: 'online' },
    { id: 'u-bot', name: 'Librarian', color: 'av-6', role: 'bot', status: 'online', activity: 'type /find to search' },
  ]},
  { group: 'Idle', key: 'idle', items: [
    { id: 'u-mei', name: '梅子黄时', color: 'av-8', status: 'idle' },
    { id: 'u-qin', name: '秦川', color: 'av-3', status: 'idle' },
  ]},
  { group: 'Offline', key: 'offline', items: [
    { id: 'u-ye', name: '叶知秋', color: 'av-2', status: 'offline' },
    { id: 'u-you', name: '有琴', color: 'av-4', status: 'offline' },
    { id: 'u-xiao', name: '小满', color: 'av-5', status: 'offline' },
  ]},
];

// Messages for the active channel "the-drifting-classroom"
const SEED_MESSAGES = [
  { id: 'm-intro', type: 'intro', title: 'the-drifting-classroom', body: '这是读书会本月的共读频道。当下我们在读楳図かずお《漂流教室》 — 讨论请按章节标清楚。' },
  { id: 'd1', type: 'day', label: '星期四 · MAY 15' },
  {
    id: 'm1', type: 'message',
    author: 'u-wen', name: '沈温言', color: 'av-4', role: 'editor',
    time: '21:07',
    lines: [
      '读第三章的时候总觉得，那种日常突然坍塌的质感，不是靠情节推进来的，而是靠一种光线。',
      '早晨像铁片一样压在窗户上，孩子们在里面做题 —— 这句我抄下来了。',
    ],
    reactions: [{ emo: '📖', count: 4, mine: true }, { emo: '☕', count: 2 }],
  },
  {
    id: 'm2', type: 'message',
    author: 'u-jiang', name: '江予白', color: 'av-5', role: 'founder',
    time: '21:09',
    replyTo: { name: '沈温言', text: '早晨像铁片一样压在窗户上，孩子们在里面做题' },
    lines: [
      '我昨晚也停在这一句。像是在写时间压在人身上的重量。',
    ],
    reactions: [{ emo: '🌿', count: 3 }, { emo: '🕯', count: 1 }],
  },
  {
    id: 'm3', type: 'message',
    author: 'u-chen', name: '陈砚', color: 'av-1', role: 'mod',
    time: '21:14',
    lines: [
      '顺便记一下本周四的线上朗读：',
      '21:30 开始，语音频道 · Reading Room。这次朗读者是 @沈温言。',
      '欢迎潜水听～',
    ],
  },
  {
    id: 'm4', type: 'message',
    author: 'bot-lib', name: 'Librarian', color: 'av-6', role: 'bot', bot: true,
    time: '21:14',
    embedCard: {
      kind: 'event',
      title: '共读朗读 · 第 3 章',
      meta: '周四 21:30 — 22:30 · Reading Room',
      hostedBy: '沈温言',
      rsvp: 7,
    },
  },
  { id: 'd2', type: 'day', label: '今天 · TODAY' },
  {
    id: 'm5', type: 'message',
    author: 'u-lu', name: '陆时笙', color: 'av-3',
    time: '10:22',
    lines: [
      '我想聊一下第三章里时间的处理 —— 当教室"漂流"出去之后，时钟不再走了，但孩子们仍然在看表。',
      '这个细节特别像一种集体催眠：他们知道时间停了，但还是要把目光放在那个旧的坐标上。',
    ],
    reactions: [{ emo: '👀', count: 5, mine: false }, { emo: '💭', count: 2 }],
  },
  {
    id: 'm6', type: 'message',
    author: 'u-wen', name: '沈温言', color: 'av-4', role: 'editor',
    time: '10:25',
    lines: [
      '这让我想到格雷厄姆·斯威夫特《水之乡》里的 — 历史也是这样被反复回望出来的。',
      '下周我会整理一个小对照笔记，贴到 #annotations。',
    ],
    reactions: [{ emo: '📝', count: 3 }],
  },
  {
    id: 'm7', type: 'message',
    author: 'u-kora', name: 'Kora', color: 'av-2',
    time: '10:31',
    lines: [
      '（潜水听了半个月，今天第一次发言）作为一个刚加入的成员想说：谢谢你们把讨论留得这么慢 🙏',
    ],
    reactions: [{ emo: '🌱', count: 9, mine: true }, { emo: '🫖', count: 4 }, { emo: '📚', count: 3 }],
  },
];

Object.assign(window, { SERVERS, CHANNELS, DM_LIST, MEMBERS, SEED_MESSAGES });
