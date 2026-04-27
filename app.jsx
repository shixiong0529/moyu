/* Main App shell and mounts */

const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp, useMemo } = React;

const ACCENT_MAP = {
  wood: { a: '#8a5a2b', soft: '#c79968', ink: '#5c3a14' },
  rust: { a: '#b5583a', soft: '#d17a54', ink: '#7a3520' },
  sage: { a: '#6b7e5e', soft: '#8ea37d', ink: '#475641' },
  amber: { a: '#c9933e', soft: '#e0b065', ink: '#7a5a26' },
  plum: { a: '#7a4a5c', soft: '#9a6478', ink: '#4f2d3a' },
  teal: { a: '#4e7472', soft: '#6e9593', ink: '#2d4a48' },
};

const USER = { name: '苏沐', handle: '@sumu', color: 'av-6', status: 'online' };

function formatMessageTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

function apiServerToRail(server) {
  return {
    id: server.id,
    name: server.name,
    short: server.short_name,
    short_name: server.short_name,
    color: server.color,
    icon_url: server.logo_url || API.assetUrl(server.icon_url),
    role: server.role,
    owner_id: server.owner_id,
    owner_username: server.owner_username,
    owner: server.owner,
    created_at: server.created_at,
    join_policy: server.join_policy,
    pending_join_requests: server.pending_join_requests || 0,
  };
}

function buildServerRailItems(apiServers) {
  const sortedServers = [...(apiServers || [])].sort((a, b) => {
    if (a.name === '管理员服务器') return -1;
    if (b.name === '管理员服务器') return 1;
    return 0;
  });
  return [
    { id: 'dm', name: '私信', kind: 'dm' },
    { id: 'divider' },
    ...sortedServers.map(apiServerToRail),
    { id: 'divider2' },
    { id: 'add', name: '新建或加入服务器', kind: 'add' },
  ];
}

function apiMessageToView(message) {
  const author = message.author || {};
  return {
    id: message.id,
    type: 'message',
    name: author.display_name || author.username || 'Unknown',
    color: author.avatar_color || 'av-1',
    avatar_url: author.avatar_url || null,
    authorId: author.id,
    channelId: message.channel_id,
    replyToId: message.reply_to_id,
    content: message.content || '',
    isEdited: message.is_edited,
    isDeleted: message.is_deleted,
    time: formatMessageTime(message.created_at),
    lines: String(message.content || '').split('\n'),
    reactions: (message.reactions || []).map(reaction => ({
      emo: reaction.emoji,
      count: reaction.count,
      mine: reaction.mine,
    })),
    pending: message.pending,
  };
}

function apiDMToListItem(conversation) {
  const user = conversation.user;
  return {
    id: user.id,
    name: user.display_name,
    handle: '@' + user.username,
    status: user.status || 'offline',
    color: user.avatar_color || 'av-1',
    preview: conversation.last_message?.content,
    unread: conversation.unread_count || 0,
  };
}

function apiDMMessageToView(message, currentUserDisplay) {
  const sender = message.sender || {};
  const isMine = sender.id === currentUserDisplay.id;
  return {
    id: message.id,
    type: 'message',
    name: isMine ? currentUserDisplay.name : sender.display_name || sender.username || 'Unknown',
    color: isMine ? currentUserDisplay.color : sender.avatar_color || 'av-1',
    avatar_url: isMine ? currentUserDisplay.avatar_url : sender.avatar_url || null,
    authorId: sender.id,
    time: formatMessageTime(message.created_at),
    content: message.content || '',
    lines: String(message.content || '').split('\n'),
  };
}

function parseInviteFromContent(content) {
  const text = String(content || '');
  const match = text.match(/https?:\/\/\S+|hearth:\/\/invite\/\S+|invite:[^\s]+/i);
  if (!match) return null;
  const raw = match[0].replace(/[，。！？、,.!?]+$/, '');
  const code = API.parseInviteCode(raw);
  if (!code) return null;
  let channelId = null;
  try {
    const url = new URL(raw);
    const channelParam = Number(url.searchParams.get('channel') || '');
    channelId = channelParam || null;
  } catch {}
  return { code, channelId, url: raw };
}

function mergeServerMessages(existing, serverMessages) {
  const serverIds = new Set(serverMessages.map(message => message.id));
  const pending = (existing || []).filter(message => String(message.id).startsWith('pending-'));
  return [
    ...serverMessages,
    ...pending.filter(message => !serverIds.has(message.id)),
  ];
}

function replacePendingOrAppend(existing, pendingId, view) {
  const list = existing || [];
  if (list.some(item => item.id === view.id)) {
    return list.filter(item => item.id !== pendingId);
  }
  let replaced = false;
  const next = list.map(item => {
    if (item.id !== pendingId) return item;
    replaced = true;
    return view;
  });
  return replaced ? next : [...next, view];
}

function LeftSidebarWrapper({ children, user, muted, deafened, onToggleMute, onToggleDeafen, onOpenSettings, onOpenProfile }) {
  return (
    <div style={{ width: 240, flex: '0 0 240px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {children}
      </div>
      <UserCard
        user={user}
        muted={muted} deafened={deafened}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
        onOpenSettings={onOpenSettings}
        onOpenProfile={onOpenProfile}
      />
    </div>
  );
}

// Make ChannelSidebar/DMSidebar expand to fill wrapper — override their fixed width via CSS class
function SidebarFill({ children }) {
  return (
    <div style={{ width: '100%', display: 'flex' }}>
      {React.cloneElement(children, { style: { width: '100%', flex: 1 } })}
    </div>
  );
}

function App() {
  const init = (k, d) => {
    try { const v = localStorage.getItem('hearth-' + k); return v ? JSON.parse(v) : d; } catch { return d; }
  };
  const [theme, setTheme] = useStateApp(init('theme', 'dark'));
  const [accent, setAccent] = useStateApp(init('accent', 'teal'));
  const [density, setDensity] = useStateApp(init('density', 'default'));
  const [sendMode, setSendMode] = useStateApp(init('send-mode', 'enter'));
  const [reduceMotion, setReduceMotion] = useStateApp(init('reduce-motion', false));
  const [fontSize, setFontSize] = useStateApp(init('font-size', 100));
  const [alwaysTimestamps, setAlwaysTimestamps] = useStateApp(init('always-timestamps', false));
  const [blurImages, setBlurImages] = useStateApp(init('blur-images', false));
  const [activeServerId, setActiveServerId] = useStateApp(init('server', 'bookclub'));
  const [activeChannelId, setActiveChannelId] = useStateApp(init('channel', 'the-drifting'));
  const [activeDMId, setActiveDMId] = useStateApp(init('dm', 'dm-wen'));
  const [authStatus, setAuthStatus] = useStateApp('checking');
  const [currentUser, setCurrentUser] = useStateApp(null);
  const [apiServers, setApiServers] = useStateApp([]);
  const [apiChannelGroups, setApiChannelGroups] = useStateApp(null);
  const [dmList, setDmList] = useStateApp([]);
  const [friendList, setFriendList] = useStateApp([]);
  const [friendRequests, setFriendRequests] = useStateApp([]);

  const [createOpen, setCreateOpen] = useStateApp(false);
  const [createChannelGroup, setCreateChannelGroup] = useStateApp(null);
  const [createGroupOpen, setCreateGroupOpen] = useStateApp(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useStateApp(null);
  const [channelInviteOpen, setChannelInviteOpen] = useStateApp(null);
  const [channelEditOpen, setChannelEditOpen] = useStateApp(null);
  const [inviteServer, setInviteServer] = useStateApp(null);
  const [joinRequestsServer, setJoinRequestsServer] = useStateApp(null);
  const [leaveServerOpen, setLeaveServerOpen] = useStateApp(null);
  const [friendRequestsOpen, setFriendRequestsOpen] = useStateApp(false);
  const [friendsInitialTab, setFriendsInitialTab] = useStateApp('all');
  const [settingsOpen, setSettingsOpen] = useStateApp(false);
  const [settingsInitialSection, setSettingsInitialSection] = useStateApp('appearance');
  const [quickSwitchOpen, setQuickSwitchOpen] = useStateApp(false);
  const [telegramOpen, setTelegramOpen] = useStateApp(false);
  const [profileCard, setProfileCard] = useStateApp(null);
  const [muted, setMuted] = useStateApp(false);
  const [deafened, setDeafened] = useStateApp(false);
  const [showMembers, setShowMembers] = useStateApp(true);
  const [search, setSearch] = useStateApp('');
  const [tweaksOn, setTweaksOn] = useStateApp(false);
  const [messagesByChannel, setMessagesByChannel] = useStateApp({});
  const [inviteDecisions, setInviteDecisions] = useStateApp(init('invite-decisions', {}));
  const [sendError, setSendError] = useStateApp('');
  const [typingUsers, setTypingUsers] = useStateApp({});
  const [serverMembers, setServerMembers] = useStateApp([]);
  const [membersRefreshKey, setMembersRefreshKey] = useStateApp(0);
  const inviteHandledRef = useRefApp(false);

  useEffectApp(function restoreSession() {
    let cancelled = false;

    async function loadCurrentUser() {
      if (!window.API?.isLoggedIn()) {
        setAuthStatus('unauthenticated');
        return;
      }

      try {
        const user = await API.get('/api/users/me');
        if (cancelled) return;
        setCurrentUser(user);
        setAuthStatus('authenticated');
      } catch {
        if (cancelled) return;
        API.clearToken();
        setCurrentUser(null);
        setAuthStatus('unauthenticated');
      }
    }

    loadCurrentUser();
    return function cancelRestoreSession() {
      cancelled = true;
    };
  }, []);

  useEffectApp(function subscribeAuthExpired() {
    function handleAuthExpired() {
      setCurrentUser(null);
      setAuthStatus('unauthenticated');
    }

    window.addEventListener('biscord:auth-expired', handleAuthExpired);
    return function unsubscribeAuthExpired() {
      window.removeEventListener('biscord:auth-expired', handleAuthExpired);
    };
  }, []);

  useEffectApp(function loadApiServers() {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;

    async function fetchServers() {
      try {
        const servers = await API.get('/api/servers');
        if (cancelled) return;
        setApiServers(servers);
        if (servers.length === 0) {
          setActiveServerId('dm');
        } else if (activeServerId === 'bookclub' || !servers.some(server => server.id === activeServerId)) {
          setActiveServerId(servers[0].id);
        }
      } catch {
        if (!cancelled) setApiServers([]);
      }
    }

    fetchServers();
    return function cancelLoadServers() {
      cancelled = true;
    };
  }, [authStatus]);

  useEffectApp(function joinFromInviteLink() {
    if (authStatus !== 'authenticated' || inviteHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = API.parseInviteCode(params.get('invite'));
    const inviteChannelId = Number(params.get('channel') || '');
    if (!code) return;
    inviteHandledRef.current = true;
    API.post('/api/servers/join', { code })
      .then(async result => {
        const server = result?.server || result;
        if (result?.status === 'pending') {
          await refreshServers();
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
        await enterServer(server);
        if (inviteChannelId) setActiveChannelId(inviteChannelId);
        window.history.replaceState({}, document.title, window.location.pathname);
      })
      .catch(() => {});
  }, [authStatus]);

  useEffectApp(function loadDMConversations() {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;

    async function fetchConversations() {
      try {
        const conversations = await API.get('/api/dm/conversations');
        if (cancelled) return;
        const next = conversations.map(apiDMToListItem);
        setDmList(next);
        if (next.length && (!activeDMId || !next.some(item => item.id === activeDMId))) {
          setActiveDMId(next[0].id);
        } else if (!next.length) {
          setActiveDMId(null);
        }
      } catch {
        if (!cancelled) setDmList([]);
      }
    }

    fetchConversations();
    return function cancelLoadDMConversations() {
      cancelled = true;
    };
  }, [authStatus]);

  const refreshFriendData = async () => {
    const [friends, requests] = await Promise.all([
      API.get('/api/friends'),
      API.get('/api/friends/requests'),
    ]);
    setFriendList(friends);
    setFriendRequests(requests);
    return { friends, requests };
  };

  useEffectApp(function loadFriendData() {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;

    async function fetchFriendData() {
      try {
        const { friends, requests } = await refreshFriendData();
        if (cancelled) return;
        setFriendList(friends);
        setFriendRequests(requests);
      } catch {
        if (!cancelled) {
          setFriendList([]);
          setFriendRequests([]);
        }
      }
    }

    fetchFriendData();
    return function cancelLoadFriendData() {
      cancelled = true;
    };
  }, [authStatus]);

  useEffectApp(() => { localStorage.setItem('hearth-theme', JSON.stringify(theme)); }, [theme]);
  useEffectApp(() => { localStorage.setItem('hearth-accent', JSON.stringify(accent)); }, [accent]);
  useEffectApp(() => { localStorage.setItem('hearth-density', JSON.stringify(density)); }, [density]);
  useEffectApp(() => { localStorage.setItem('hearth-send-mode', JSON.stringify(sendMode)); }, [sendMode]);
  useEffectApp(() => { localStorage.setItem('hearth-reduce-motion', JSON.stringify(reduceMotion)); }, [reduceMotion]);
  useEffectApp(() => { localStorage.setItem('hearth-font-size', JSON.stringify(fontSize)); }, [fontSize]);
  useEffectApp(() => { localStorage.setItem('hearth-always-timestamps', JSON.stringify(alwaysTimestamps)); }, [alwaysTimestamps]);
  useEffectApp(() => { localStorage.setItem('hearth-blur-images', JSON.stringify(blurImages)); }, [blurImages]);
  useEffectApp(() => { localStorage.setItem('hearth-server', JSON.stringify(activeServerId)); }, [activeServerId]);
  useEffectApp(() => { localStorage.setItem('hearth-channel', JSON.stringify(activeChannelId)); }, [activeChannelId]);
  useEffectApp(() => { localStorage.setItem('hearth-dm', JSON.stringify(activeDMId)); }, [activeDMId]);
  useEffectApp(() => { localStorage.setItem('hearth-invite-decisions', JSON.stringify(inviteDecisions)); }, [inviteDecisions]);

  useEffectApp(() => {
    const handler = (e) => {
      const img = e.target.closest?.('.image-previews img');
      if (!img) return;
      if (!img.hasAttribute('data-revealed')) {
        e.preventDefault();
        e.stopPropagation();
        img.setAttribute('data-revealed', '1');
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  useEffectApp(() => {
    const h = (e) => {
      if (e.key !== 'Escape') return;
      if (quickSwitchOpen) setQuickSwitchOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
      else if (channelEditOpen) setChannelEditOpen(null);
      else if (channelInviteOpen) setChannelInviteOpen(null);
      else if (leaveServerOpen) setLeaveServerOpen(null);
      else if (serverSettingsOpen) setServerSettingsOpen(null);
      else if (createGroupOpen) setCreateGroupOpen(false);
      else if (createOpen) setCreateOpen(false);
      else if (profileCard) setProfileCard(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [quickSwitchOpen, settingsOpen, channelEditOpen, channelInviteOpen, leaveServerOpen, serverSettingsOpen, createGroupOpen, createOpen, profileCard]);

  useEffectApp(() => {
    const h = (e) => {
      const modifier = e.ctrlKey || e.metaKey;
      if (!modifier) return;
      const target = e.target;
      const inEditable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (e.key === '/') {
        e.preventDefault();
        setSettingsInitialSection('shortcuts');
        setSettingsOpen(true);
        return;
      }
      if (e.key.toLowerCase() === 'k' && !inEditable) {
        e.preventDefault();
        setQuickSwitchOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffectApp(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOn(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOn(false);
    };
    window.addEventListener('message', handler);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch {}
    return () => window.removeEventListener('message', handler);
  }, []);

  const serverRailItems = useMemo(() => buildServerRailItems(apiServers), [apiServers]);
  const activeServer = useMemo(() => (
    serverRailItems.find(s => s.id === activeServerId) ||
    serverRailItems.find(s => s.id === 'bookclub') ||
    serverRailItems.find(s => !s.kind && !String(s.id).startsWith('divider')) ||
    serverRailItems.find(s => s.id === 'dm')
  ), [activeServerId, serverRailItems]);
  const currentUserDisplay = useMemo(() => {
    if (!currentUser) return USER;
    return {
      id: currentUser.id,
      name: currentUser.display_name,
      handle: '@' + currentUser.username,
      color: currentUser.avatar_color || 'av-6',
      avatar_url: currentUser.avatar_url || null,
      status: currentUser.status || 'online',
      bio: currentUser.bio,
    };
  }, [currentUser]);
  const isDM = activeServer?.kind === 'dm';
  const fallbackChannelGroups = CHANNELS[activeServerId] || [];
  const channelGroups = apiChannelGroups || fallbackChannelGroups;
  const allChannels = channelGroups.flatMap(g => g.items);
  const activeChannel = allChannels.find(c => c.id === activeChannelId) || allChannels.find(c => c.kind === 'text') || allChannels[0];

  useEffectApp(function loadServerChannels() {
    if (authStatus !== 'authenticated' || isDM || !activeServerId || typeof activeServerId !== 'number') return;
    let cancelled = false;

    async function fetchChannels() {
      try {
        const detail = await API.get(`/api/servers/${activeServerId}`);
        if (cancelled) return;
        const groups = detail.channel_groups || [];
        setApiChannelGroups(groups);
        const firstChannel = groups.flatMap(group => group.items).find(channel => channel.kind === 'text' || channel.kind === 'announce');
        if (firstChannel && !groups.flatMap(group => group.items).some(channel => channel.id === activeChannelId)) {
          setActiveChannelId(firstChannel.id);
        }
      } catch {
        if (!cancelled) setApiChannelGroups(null);
      }
    }

    fetchChannels();
    return function cancelLoadServerChannels() {
      cancelled = true;
    };
  }, [authStatus, activeServerId, isDM]);

  useEffectApp(function loadServerMembers() {
    if (authStatus !== 'authenticated' || isDM || !activeServerId || typeof activeServerId !== 'number') return;
    let cancelled = false;

    async function fetchMembers() {
      try {
        const apiMembers = await API.get(`/api/servers/${activeServerId}/members`);
        if (cancelled) return;
        const mapped = apiMembers.map(m => ({
          id: 'u-' + m.user.id,
          userId: m.user.id,
          username: m.user.username,
          handle: '@' + m.user.username,
          name: m.user.display_name,
          color: m.user.avatar_color || 'av-1',
          avatar_url: m.user.avatar_url || null,
          role: m.role,
          status: m.user.status || 'offline',
          activity: m.user.bio || '',
        }));
        const founders = mapped.filter(m => m.role === 'founder' && m.status === 'online');
        const online = mapped.filter(m => m.role !== 'founder' && m.status === 'online');
        const dnd = mapped.filter(m => m.status === 'dnd');
        const idle = mapped.filter(m => m.status === 'idle');
        const offline = mapped.filter(m => m.status === 'offline' || !['online','idle','dnd'].includes(m.status));
        const groups = [];
        if (founders.length) groups.push({ group: '在线 · 创建者', key: 'online-f', items: founders });
        if (online.length) groups.push({ group: '在线', key: 'online', items: online });
        if (dnd.length) groups.push({ group: '勿扰', key: 'dnd', items: dnd });
        if (idle.length) groups.push({ group: '离开', key: 'idle', items: idle });
        if (offline.length) groups.push({ group: '离线', key: 'offline', items: offline });
        setServerMembers(groups);
      } catch {
        if (!cancelled) setServerMembers([]);
      }
    }

    fetchMembers();
    const interval = setInterval(fetchMembers, 30000);
    return function cancelLoadServerMembers() {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authStatus, activeServerId, isDM, membersRefreshKey]);

  const baseMessages = useMemo(() => {
    if (activeServerId === 'bookclub' && activeChannel?.id === 'the-drifting') return SEED_MESSAGES;
    if (activeChannel?.kind === 'voice') return [];
    return [
      { id: 'intro-' + activeChannel?.id, type: 'intro', title: activeChannel?.name || 'channel', body: activeChannel?.topic || '这里还很安静，留下第一句话吧。' },
      { id: 'day-' + activeChannel?.id, type: 'day', label: '今天 · TODAY' },
    ];
  }, [activeServerId, activeChannel?.id]);

  const channelKey = isDM ? 'dm:' + activeDMId : activeServerId + '/' + activeChannel?.id;
  useEffectApp(function loadChannelMessages() {
    if (authStatus !== 'authenticated' || isDM || !activeChannel?.id || typeof activeChannel.id !== 'number') return;
    let cancelled = false;

    async function fetchMessages() {
      try {
        const result = await API.get(`/api/channels/${activeChannel.id}/messages?limit=50`);
        if (cancelled) return;
        const serverMessages = (result.messages || []).map(apiMessageToView);
        setMessagesByChannel(prev => ({
          ...prev,
          [channelKey]: mergeServerMessages(prev[channelKey], serverMessages),
        }));
      } catch {
        if (!cancelled) {
          setMessagesByChannel(prev => ({ ...prev, [channelKey]: [] }));
        }
      }
    }

    fetchMessages();
    return function cancelLoadChannelMessages() {
      cancelled = true;
    };
  }, [authStatus, isDM, activeChannel?.id, channelKey]);

  useEffectApp(function connectChannelSocket() {
    if (authStatus !== 'authenticated' || isDM || !activeChannel?.id || typeof activeChannel.id !== 'number') return;

    API.connectChannel(activeChannel.id, {
      onMessage: (message) => {
        const view = apiMessageToView(message);
        setMessagesByChannel(prev => {
          const existing = prev[channelKey] || [];
          if (existing.some(item => item.id === view.id)) return prev;
          const withoutMatchingPending = existing.filter(item => !(
            String(item.id).startsWith('pending-') &&
            item.authorId === view.authorId &&
            item.lines?.join('\n') === view.lines?.join('\n')
          ));
          return { ...prev, [channelKey]: [...withoutMatchingPending, view] };
        });
      },
      onEdit: (message) => {
        setMessagesByChannel(prev => ({
          ...prev,
          [channelKey]: (prev[channelKey] || []).map(item => item.id === message.id ? {
            ...item,
            content: message.content || '',
            lines: String(message.content || '').split('\n'),
            edited_at: message.edited_at,
            isEdited: true,
          } : item),
        }));
      },
      onDelete: (message) => {
        setMessagesByChannel(prev => ({
          ...prev,
          [channelKey]: (prev[channelKey] || []).map(item => item.id === message.id ? {
            ...item,
            content: '此消息已被删除',
            lines: ['此消息已被删除'],
            isDeleted: true,
          } : item),
        }));
      },
      onReaction: (reaction) => {
        setMessagesByChannel(prev => ({
          ...prev,
          [channelKey]: (prev[channelKey] || []).map(item => item.id === reaction.message_id ? {
            ...item,
            reactions: (reaction.reactions || []).map(r => ({ emo: r.emoji, count: r.count, mine: r.mine })),
          } : item),
        }));
      },
      onTyping: (event) => {
        if (event.user_id === currentUserDisplay.id) return;
        setTypingUsers(prev => {
          const next = { ...prev };
          if (event.typing) next[event.user_id] = event.display_name;
          else delete next[event.user_id];
          return next;
        });
      },
    });

    return function disconnectChannelSocket() {
      API.disconnectChannel();
      setTypingUsers({});
    };
  }, [authStatus, isDM, activeChannel?.id, channelKey, currentUserDisplay.id]);

  useEffectApp(function connectDMSocket() {
    if (authStatus !== 'authenticated' || !currentUserDisplay.id) return;

    API.connectDM({
      onDM: (message) => {
        const other = message.sender_id === currentUserDisplay.id ? message.receiver : message.sender;
        if (!other?.id) return;
        const item = {
          id: other.id,
          name: other.display_name,
          handle: '@' + other.username,
          status: other.status || 'offline',
          color: other.avatar_color || 'av-1',
          preview: message.content,
          unread: message.receiver_id === currentUserDisplay.id ? 1 : 0,
        };
        setDmList(prev => {
          const existing = prev.find(dm => dm.id === item.id);
          const nextItem = existing ? {
            ...existing,
            preview: item.preview,
            unread: item.unread ? (existing.unread || 0) + 1 : existing.unread || 0,
          } : item;
          return [nextItem, ...prev.filter(dm => dm.id !== item.id)];
        });
        const dmKey = 'dm:' + other.id;
        const view = apiDMMessageToView(message, currentUserDisplay);
        setMessagesByChannel(prev => {
          const list = prev[dmKey] || [];
          if (list.some(existing => existing.id === view.id)) return prev;
          return { ...prev, [dmKey]: [...list, view] };
        });
      },
      onFriend: async () => {
        try {
          await refreshFriendData();
        } catch {}
      },
    });

    return function disconnectDMSocket() {
      API.disconnectDM();
    };
  }, [authStatus, currentUserDisplay.id]);

  useEffectApp(function loadDMMessages() {
    if (authStatus !== 'authenticated' || !isDM || !activeDMId || typeof activeDMId !== 'number') return;
    let cancelled = false;

    async function fetchDMMessages() {
      try {
        const result = await API.get(`/api/dm/${activeDMId}/messages?limit=50`);
        if (cancelled) return;
        setMessagesByChannel(prev => ({
          ...prev,
          [channelKey]: (result.messages || []).map(message => apiDMMessageToView(message, currentUserDisplay)),
        }));
      } catch {
        if (!cancelled) {
          setMessagesByChannel(prev => ({ ...prev, [channelKey]: [] }));
        }
      }
    }

    fetchDMMessages();
    return function cancelLoadDMMessages() {
      cancelled = true;
    };
  }, [authStatus, isDM, activeDMId, channelKey, currentUserDisplay.id]);

  const allMessages = useMemo(() => {
    const extras = messagesByChannel[channelKey] || [];
    return [...baseMessages, ...extras];
  }, [channelKey, baseMessages, messagesByChannel]);

  const visibleMessages = useMemo(() => {
    if (!search.trim()) return allMessages;
    const q = search.toLowerCase();
    return allMessages.filter(m =>
      m.type !== 'message' ||
      m.name.toLowerCase().includes(q) ||
      m.lines?.some(l => l.toLowerCase().includes(q))
    );
  }, [allMessages, search]);
  const typingText = useMemo(() => {
    const names = Object.values(typingUsers);
    if (!names.length) return '';
    if (names.length === 1) return `${names[0]} 正在输入…`;
    if (names.length === 2) return `${names[0]} 和 ${names[1]} 正在输入…`;
    return `${names[0]} 等 ${names.length} 人正在输入…`;
  }, [typingUsers]);

  const dmMessages = useMemo(() => {
    if (!isDM) return [];
    const dm = dmList.find(d => d.id === activeDMId);
    if (!dm) return [];
    return messagesByChannel[channelKey] || [];
  }, [isDM, activeDMId, channelKey, messagesByChannel, dmList]);

  const handleSend = async (text, options = {}) => {
    const now = new Date();
    const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const pendingId = 'pending-' + Date.now();
    const msg = {
      id: pendingId,
      type: 'message',
      name: currentUserDisplay.name, color: currentUserDisplay.color,
      authorId: currentUserDisplay.id,
      channelId: activeChannel?.id,
      replyToId: options.reply_to_id,
      content: text,
      time, lines: String(text).split('\n'), reactions: [], pending: true,
    };
    setSendError('');
    setMessagesByChannel(prev => ({
      ...prev,
      [channelKey]: [...(prev[channelKey] || []), msg],
    }));

    try {
      if (isDM && typeof activeDMId === 'number') {
        const saved = await API.post(`/api/dm/${activeDMId}/messages`, { content: text });
        const view = apiDMMessageToView(saved, currentUserDisplay);
        setMessagesByChannel(prev => ({
          ...prev,
          [channelKey]: replacePendingOrAppend(prev[channelKey], pendingId, view),
        }));
      } else if (!isDM && activeChannel?.id && typeof activeChannel.id === 'number') {
        const saved = await API.post(`/api/channels/${activeChannel.id}/messages`, {
          content: text,
          reply_to_id: options.reply_to_id || null,
        });
        const view = apiMessageToView(saved);
        setMessagesByChannel(prev => ({
          ...prev,
          [channelKey]: replacePendingOrAppend(prev[channelKey], pendingId, view),
        }));
      } else {
        throw new Error('channel is not ready');
      }
    } catch {
      setMessagesByChannel(prev => ({
        ...prev,
        [channelKey]: (prev[channelKey] || []).filter(item => item.id !== pendingId),
      }));
      setSendError('发送失败，点击重试');
    }
  };

  const handleOpenProfile = (member, e) => {
    const rect = e?.currentTarget?.getBoundingClientRect?.();
    const apiMember = serverMembers.flatMap(g => g.items).find(m => m.name === member.name);
    const seedMember = MEMBERS.flatMap(g => g.items).find(m => m.name === member.name);
    const fullMember = apiMember || seedMember || {
      id: 'u-' + (member.name || 'anon'),
      name: member.name,
      color: member.color,
      role: member.role,
      status: 'online',
    };
    setProfileCard({
      member: fullMember,
      position: rect
        ? { x: rect.right + 12, y: rect.top - 20 }
        : { x: window.innerWidth / 2 - 170, y: 100 },
    });
  };

  const handleOpenMember = (m, e) => {
    const rect = e?.currentTarget?.getBoundingClientRect?.();
    setProfileCard({
      member: m,
      position: rect ? { x: rect.left - 340, y: rect.top - 40 } : { x: window.innerWidth / 2 - 170, y: 100 },
    });
  };

  const handleOpenSelf = (e) => {
    const rect = e?.currentTarget?.getBoundingClientRect?.();
    setProfileCard({
      member: { id: 'u-self', name: currentUserDisplay.name, color: currentUserDisplay.color, avatar_url: currentUserDisplay.avatar_url, status: currentUserDisplay.status, role: 'founder' },
      position: rect ? { x: rect.right + 12, y: rect.top - 300 } : { x: 200, y: 200 },
    });
  };

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setAuthStatus('authenticated');
  };

  const handleLogout = async () => {
    try {
      await API.post('/api/auth/logout', {});
    } catch {}
    API.clearToken();
    setCurrentUser(null);
    setAuthStatus('unauthenticated');
    setSettingsOpen(false);
  };

  const refreshActiveServerDetail = async (serverId = activeServerId) => {
    if (!serverId || typeof serverId !== 'number') return null;
    const detail = await API.get(`/api/servers/${serverId}`);
    setApiChannelGroups(detail.channel_groups || []);
    return detail;
  };

  const refreshServers = async () => {
    const servers = await API.get('/api/servers');
    setApiServers(servers);
    return servers;
  };

  const enterServer = async (server) => {
    if (!server?.id) return;
    const servers = await refreshServers();
    const nextServer = servers.find(item => item.id === server.id) || server;
    // Clear first so the loadServerChannels useEffect reliably triggers a fresh load.
    // Doing an extra fetch here races with that effect and the catch block can overwrite
    // channels that the effect already loaded successfully.
    setApiChannelGroups(null);
    setActiveServerId(nextServer.id);
  };

  const handleChannelCreated = async (channel) => {
    await refreshActiveServerDetail(channel.server_id || activeServerId);
    setActiveChannelId(channel.id);
    setCreateChannelGroup(null);
  };

  const handleGroupCreated = async () => {
    setCreateGroupOpen(false);
    await refreshActiveServerDetail();
  };

  const handleChannelUpdated = async (channel) => {
    await refreshActiveServerDetail(channel.server_id || activeServerId);
    setActiveChannelId(channel.id);
    setChannelEditOpen(null);
  };

  const handleChannelDeleted = async (deleted) => {
    const serverId = deleted?.server_id || activeServerId;
    const detail = await refreshActiveServerDetail(serverId);
    const nextChannel = detail?.channel_groups?.flatMap(group => group.items)
      .find(channel => channel.kind === 'text' || channel.kind === 'announce');
    setActiveChannelId(nextChannel?.id || null);
    setChannelEditOpen(null);
  };

  const markInviteDecision = (messageId, decision) => {
    setInviteDecisions(prev => ({ ...prev, [messageId]: decision }));
  };

  const handleAcceptInvite = async (message) => {
    const invite = parseInviteFromContent(message?.content || message?.lines?.join('\n'));
    if (!invite?.code) return;
    setSendError('');
    try {
      const result = await API.post('/api/servers/join', { code: invite.code });
      if (result?.status === 'pending') {
        markInviteDecision(message.id, 'pending');
        await refreshServers();
        return;
      }
      markInviteDecision(message.id, 'accepted');
      const server = result?.server || result;
      await enterServer(server);
      if (invite.channelId) setActiveChannelId(invite.channelId);
    } catch (err) {
      setSendError(err.message || '接受邀请失败');
    }
  };

  const handleRejectInvite = (message) => {
    if (!message?.id) return;
    markInviteDecision(message.id, 'rejected');
  };

  const handleServerUpdated = async (server) => {
    await refreshServers();
    if (server?.id === activeServerId) {
      await refreshActiveServerDetail(server.id);
    }
    setServerSettingsOpen(null);
  };

  const handleServerDeleted = async (deletedServer) => {
    setServerSettingsOpen(null);
    const servers = await refreshServers();
    const next = servers.find(item => item.id !== deletedServer?.id) || servers[0];
    setApiChannelGroups(null);
    setActiveServerId(next?.id || 'dm');
  };

  const handleLeaveServer = async (server) => {
    if (!server?.id || server.role === 'founder') {
      alert('服务器创建者暂时不能退出自己的服务器。');
      return;
    }
    try {
      await API.del(`/api/servers/${server.id}/members/me`);
      const servers = await refreshServers();
      if (activeServerId === server.id) {
        const next = servers[0];
        setActiveServerId(next?.id || 'dm');
        setApiChannelGroups(null);
      }
    } catch (err) {
      alert(err.message || '退出服务器失败');
    }
  };

  const accentVars = ACCENT_MAP[accent] || ACCENT_MAP.wood;
  const rootStyle = {
    '--accent': accentVars.a,
    '--accent-soft': accentVars.soft,
    '--accent-ink': accentVars.ink,
  };

  if (authStatus === 'checking') {
    return (
      <div className={`app theme-${theme} density-${density}`} style={{
        ...rootStyle,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ink-1)',
        fontFamily: 'var(--ff-serif)',
      }}>
        正在进入 Biscord…
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <AuthScreen onSuccess={handleAuthSuccess}/>;
  }

  return (
    <div className={`app theme-${theme} density-${density}${reduceMotion ? ' reduce-motion' : ''}${alwaysTimestamps ? ' always-timestamps' : ''}${blurImages ? ' blur-images' : ''}`} style={{ ...rootStyle, zoom: fontSize / 100 }}>
      <ServerRail
        servers={serverRailItems}
        activeServer={activeServerId}
        theme={theme}
        onSetTheme={setTheme}
        onSelect={(id) => {
          if (id === activeServerId) return;
          setActiveServerId(id);
          setApiChannelGroups(null);
          const ch = (CHANNELS[id] || []).flatMap(g => g.items).find(c => c.kind === 'text' || c.kind === 'announce');
          if (ch) setActiveChannelId(ch.id);
        }}
        onAdd={() => setCreateOpen(true)}
        onInvite={(server) => setInviteServer(server)}
        onReviewRequests={(server) => setJoinRequestsServer(server)}
        onCreateChannel={(server) => {
          setActiveServerId(server.id);
          setCreateChannelGroup({});
        }}
        onServerSettings={(server) => setServerSettingsOpen(server)}
        onDeleteServer={(server) => setServerSettingsOpen({ ...server, _dangerOpen: true })}
        onLeave={(server) => setLeaveServerOpen(server)}
      />

      <div style={{ width: 240, flex: '0 0 240px', display: 'flex', flexDirection: 'column', background: 'var(--paper-1)' }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          {isDM ? (
            <DMSidebarFlex
              activeDM={dmList.find(d => d.id === activeDMId)}
              activeView={activeDMId}
              dmList={dmList}
              friendRequests={friendRequests}
              onSelect={(dm) => setActiveDMId(dm.id)}
              onOpenFriends={() => { setFriendsInitialTab('all'); setActiveDMId('friends'); }}
              onOpenPendingFriends={() => { setFriendsInitialTab('pending'); setActiveDMId('friends'); }}
              onOpenAddFriend={() => setFriendRequestsOpen(true)}
            />
          ) : (
            <ChannelSidebarFlex
              server={activeServer}
              channelGroups={channelGroups}
              activeChannel={activeChannel}
              onSelectChannel={(ch) => setActiveChannelId(ch.id)}
              onCreateChannel={(group) => setCreateChannelGroup(group || {})}
              onInvite={() => setInviteServer(activeServer)}
              onReviewRequests={() => setJoinRequestsServer(activeServer)}
              onCreateGroup={() => setCreateGroupOpen(true)}
              onServerSettings={() => setServerSettingsOpen(activeServer)}
              onLeaveServer={() => setLeaveServerOpen(activeServer)}
              onDeleteServer={() => setServerSettingsOpen({ ...activeServer, _dangerOpen: true })}
              onInviteChannel={(channel) => setChannelInviteOpen(channel)}
              onEditChannel={(channel) => setChannelEditOpen(channel)}
            />
          )}
        </div>
        <UserCard
          user={currentUserDisplay}
          muted={muted} deafened={deafened}
          onToggleMute={() => setMuted(v => !v)}
          onToggleDeafen={() => setDeafened(v => !v)}
          onOpenSettings={() => { setSettingsInitialSection('appearance'); setSettingsOpen(true); }}
          onOpenProfile={handleOpenSelf}
          onOpenTelegram={() => setTelegramOpen(v => !v)}
        />
      </div>

      {isDM ? (
        activeDMId === 'friends' ? (
          <FriendsView
            friends={friendList}
            requests={friendRequests}
            initialTab={friendsInitialTab}
            onAddFriend={() => setFriendRequestsOpen(true)}
            onRefresh={refreshFriendData}
            onOpenDM={(friend) => {
              const existing = dmList.find(item => item.id === friend.id);
              const next = existing || {
                id: friend.id,
                name: friend.display_name,
                handle: '@' + friend.username,
                status: friend.status || 'offline',
                color: friend.avatar_color || 'av-1',
                preview: '',
                unread: 0,
              };
              if (!existing) setDmList(prev => [next, ...prev]);
              setActiveDMId(next.id);
            }}
          />
        ) : (
          <DMView
            dm={dmList.find(d => d.id === activeDMId)}
            messages={dmMessages}
            onSend={handleSend}
            onOpenProfile={handleOpenProfile}
            currentUser={currentUserDisplay}
            inviteDecisions={inviteDecisions}
            onAcceptInvite={handleAcceptInvite}
            onRejectInvite={handleRejectInvite}
            sendMode={sendMode}
            sendError={sendError}
          />
        )
      ) : (
        <ChatArea
          channel={activeChannel}
          messages={visibleMessages}
          onSend={handleSend}
          onToggleMembers={() => setShowMembers(v => !v)}
          onOpenProfile={handleOpenProfile}
          onReact={() => {}}
          searchValue={search}
          setSearchValue={setSearch}
          sendError={sendError}
          typingText={typingText}
          currentUser={currentUserDisplay}
          currentRole={activeServer?.role}
          sendMode={sendMode}
        />
      )}

      {!isDM && showMembers && <MemberSidebar members={serverMembers} onOpenMember={handleOpenMember}/>}

      {createOpen && (
        <CreateServerModal
          onClose={() => setCreateOpen(false)}
          onCreated={enterServer}
        />
      )}

      {createChannelGroup && (
        <CreateChannelModal
          server={activeServer}
          groups={channelGroups}
          initialGroup={createChannelGroup}
          onClose={() => setCreateChannelGroup(null)}
          onCreated={handleChannelCreated}
        />
      )}

      {createGroupOpen && (
        <CreateGroupModal
          server={activeServer}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={handleGroupCreated}
        />
      )}

      {serverSettingsOpen && (
        <ServerSettingsModal
          server={serverSettingsOpen}
          onClose={() => setServerSettingsOpen(null)}
          onUpdated={handleServerUpdated}
          onDeleted={handleServerDeleted}
        />
      )}

      {channelInviteOpen && (
        <ChannelInviteModal
          server={activeServer}
          channel={channelInviteOpen}
          onClose={() => setChannelInviteOpen(null)}
        />
      )}

      {channelEditOpen && (
        <ChannelEditModal
          server={activeServer}
          channel={channelEditOpen}
          onClose={() => setChannelEditOpen(null)}
          onUpdated={handleChannelUpdated}
          onDeleted={handleChannelDeleted}
        />
      )}

      {inviteServer && (
        <InviteModal
          server={inviteServer}
          onClose={() => setInviteServer(null)}
        />
      )}

      {joinRequestsServer && (
        <JoinRequestsModal
          server={joinRequestsServer}
          onClose={() => setJoinRequestsServer(null)}
          onChanged={async () => {
            const servers = await refreshServers();
            const updated = servers.find(item => item.id === joinRequestsServer.id);
            if (updated) setJoinRequestsServer(apiServerToRail(updated));
            if (activeServerId === joinRequestsServer.id) {
              refreshActiveServerDetail(joinRequestsServer.id);
              setMembersRefreshKey(value => value + 1);
            }
          }}
        />
      )}

      {leaveServerOpen && (
        <ConfirmLeaveServerModal
          server={leaveServerOpen}
          onClose={() => setLeaveServerOpen(null)}
          onConfirm={async () => {
            await handleLeaveServer(leaveServerOpen);
            setLeaveServerOpen(null);
          }}
        />
      )}

      {friendRequestsOpen && (
        <FriendRequestsModal
          onClose={() => setFriendRequestsOpen(false)}
          onChanged={async () => {
            try {
              const conversations = await API.get('/api/dm/conversations');
              setDmList(conversations.map(apiDMToListItem));
              await refreshFriendData();
            } catch {}
          }}
        />
      )}

      {profileCard && (
        <ProfileCard
          member={profileCard.member}
          position={profileCard.position}
          onClose={() => setProfileCard(null)}
          onOpenDM={(m) => {
            setActiveServerId('dm');
            const existing = dmList.find(d => d.name === m.name);
            if (existing) {
              setActiveDMId(existing.id);
              return;
            }
            if (m.userId) {
              const next = {
                id: m.userId,
                name: m.name,
                handle: m.handle || '@' + (m.username || 'user'),
                status: m.status || 'offline',
                color: m.color || 'av-1',
                preview: '',
                unread: 0,
              };
              setDmList(prev => [next, ...prev.filter(item => item.id !== next.id)]);
              setActiveDMId(next.id);
            }
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          theme={theme} setTheme={setTheme}
          accent={accent} setAccent={setAccent}
          density={density} setDensity={setDensity}
          sendMode={sendMode} setSendMode={setSendMode}
          initialSection={settingsInitialSection}
          user={currentUserDisplay}
          onUserUpdate={(updated) => setCurrentUser(updated)}
          onLogout={handleLogout}
          reduceMotion={reduceMotion} setReduceMotion={setReduceMotion}
          fontSize={fontSize} setFontSize={setFontSize}
          alwaysTimestamps={alwaysTimestamps} setAlwaysTimestamps={setAlwaysTimestamps}
          blurImages={blurImages} setBlurImages={setBlurImages}
        />
      )}

      {quickSwitchOpen && (
        <QuickSwitchModal
          servers={apiServers}
          channelGroups={channelGroups}
          friends={dmList}
          activeServerId={activeServerId}
          onClose={() => setQuickSwitchOpen(false)}
          onSelect={(item) => {
            if (item.type === 'channel') {
              setActiveServerId(item.serverId);
              setActiveChannelId(item.channel.id);
            } else if (item.type === 'server') {
              setActiveServerId(item.server.id);
              setApiChannelGroups(null);
            } else if (item.type === 'dm') {
              setActiveServerId('dm');
              setActiveDMId(item.dm.id);
            }
            setQuickSwitchOpen(false);
          }}
        />
      )}

      {telegramOpen && (
        <TelegramPanel onClose={() => setTelegramOpen(false)}/>
      )}

      <TweaksPanel
        active={tweaksOn}
        theme={theme} setTheme={setTheme}
        accent={accent} setAccent={setAccent}
        density={density} setDensity={setDensity}
        onClose={() => setTweaksOn(false)}
      />
    </div>
  );
}

function QuickSwitchModal({ servers = [], channelGroups = [], friends = [], activeServerId, onSelect, onClose }) {
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef(null);
  const items = React.useMemo(() => {
    const channelItems = (channelGroups || []).flatMap(group => (group.items || []).map(channel => ({
      type: 'channel',
      key: `channel-${channel.id}`,
      title: `# ${channel.name}`,
      subtitle: group.name || '当前服务器',
      channel,
      serverId: activeServerId,
      icon: 'hash',
    })));
    const serverItems = (servers || []).map(server => ({
      type: 'server',
      key: `server-${server.id}`,
      title: server.name,
      subtitle: '服务器',
      server,
      icon: 'compass',
    }));
    const dmItems = (friends || []).map(dm => ({
      type: 'dm',
      key: `dm-${dm.id}`,
      title: dm.name,
      subtitle: dm.handle || '私信',
      dm,
      icon: 'message-circle',
    }));
    return [...channelItems, ...serverItems, ...dmItems];
  }, [servers, channelGroups, friends, activeServerId]);
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items.filter(item => `${item.title} ${item.subtitle}`.toLowerCase().includes(q)).slice(0, 16);
  }, [items, query]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const h = (e) => {
      if (e.key === 'Enter' && visible[0]) {
        e.preventDefault();
        onSelect?.(visible[0]);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visible, onSelect]);

  return (
    <div className="quick-switch-backdrop" onClick={onClose}>
      <div className="quick-switch" onClick={e => e.stopPropagation()}>
        <div className="quick-switch-input">
          <Icon name="search" size={16}/>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="跳转到频道、服务器或私信"
          />
        </div>
        <div className="quick-switch-list">
          {visible.length ? visible.map(item => (
            <button key={item.key} onClick={() => onSelect?.(item)}>
              <Icon name={item.icon} size={16}/>
              <span>
                <strong>{item.title}</strong>
                <em>{item.subtitle}</em>
              </span>
            </button>
          )) : (
            <div className="quick-switch-empty">没有找到结果</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrappers that make sidebars flexible-width inside our outer column
function ChannelSidebarFlex(props) {
  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
        <InlineChannelSidebar {...props}/>
      </div>
    </div>
  );
}
function DMSidebarFlex(props) {
  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
        <InlineDMSidebar {...props}/>
      </div>
    </div>
  );
}

// Inline copies that use width: 100%
function InlineChannelSidebar({
  server,
  channelGroups,
  activeChannel,
  onSelectChannel,
  onCreateChannel,
  onInvite,
  onReviewRequests,
  onCreateGroup,
  onServerSettings,
  onLeaveServer,
  onDeleteServer,
  onInviteChannel,
  onEditChannel,
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const groups = channelGroups || CHANNELS[server.id] || [];
  const isFounder = server?.role === 'founder';
  const closeThen = (action) => {
    setMenuOpen(false);
    action?.();
  };
  return (
    <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--paper-1)', borderRight: '1px solid var(--paper-3)', minHeight: 0 }}>
      <div
        className="sidebar-header"
        onClick={() => setMenuOpen(open => !open)}
        style={{ cursor: 'pointer', position: 'relative' }}
      >
        <span>{server.name}</span>
        <span style={{ display: 'inline-flex', transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <Icon name="chevron-down" size={14}/>
        </span>
        {menuOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 250 }}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
            />
            <div
              className="server-context-menu"
              style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 8, right: 8, zIndex: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem icon="users" label="邀请成员" onClick={() => closeThen(onInvite)} />
              {isFounder && (
                <MenuItem
                  icon="inbox"
                  label={`审核申请${server.pending_join_requests ? `（${server.pending_join_requests}）` : ''}`}
                  badge={server.pending_join_requests}
                  onClick={() => closeThen(onReviewRequests)}
                />
              )}
              {isFounder && <MenuDivider />}
              {isFounder && (
                <>
                  <MenuItem icon="hash" label="创建频道" onClick={() => closeThen(() => onCreateChannel?.({}))} />
                  <MenuItem icon="plus" label="创建分组" onClick={() => closeThen(onCreateGroup)} />
                </>
              )}
              {isFounder && <MenuDivider />}
              {isFounder && (
                <MenuItem icon="settings" label="服务器设置" onClick={() => closeThen(onServerSettings)} />
              )}
              <MenuDivider />
              {!isFounder && (
                <MenuItem danger label="退出服务器" onClick={() => closeThen(onLeaveServer)} />
              )}
              {isFounder && (
                <MenuItem danger icon="close" label="删除服务器" onClick={() => closeThen(onDeleteServer)} />
              )}
            </div>
          </>
        )}
      </div>
      <div className="sidebar-scroll" style={{ flex: 1 }}>
        {groups.map((g, gi) => (
          <React.Fragment key={gi}>
            <div className="section-label">
              <span>{g.group}</span>
              {isFounder && (
                <span className="plus" title="创建频道" onClick={(e) => { e.stopPropagation(); onCreateChannel?.(g); }}><Icon name="plus" size={14}/></span>
              )}
            </div>
            {g.items.map(ch => (
              <ChannelRowInline
                key={ch.id}
                ch={ch}
                active={activeChannel?.id === ch.id}
                onClick={() => onSelectChannel(ch)}
                onInvite={() => onInviteChannel?.(ch)}
                onEdit={() => onEditChannel?.(ch)}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, badge, danger, onClick }) {
  return (
    <button
      className={danger ? 'danger' : ''}
      onClick={onClick}
      style={{
        width: '100%',
        height: 32,
        border: 0,
        borderRadius: 6,
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px',
        cursor: 'pointer',
        textAlign: 'left',
        color: danger ? 'var(--rust)' : 'var(--ink-1)',
        fontSize: 13.5,
      }}
    >
      {icon && <Icon name={icon} size={14}/>}
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          background: 'var(--rust)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 5px',
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--paper-3)', margin: '4px 0' }} />;
}

function ChannelActionButtons({ onInvite, onEdit }) {
  return (
    <span className="channel-actions-inline">
      <button
        type="button"
        title="邀请到频道"
        aria-label="邀请到频道"
        onClick={(e) => { e.stopPropagation(); onInvite?.(); }}
      >
        <Icon name="users" size={17} stroke={2.2}/>
        <Icon name="plus" size={10} stroke={2.4}/>
      </button>
      <button
        type="button"
        title="编辑频道"
        aria-label="编辑频道"
        onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
      >
        <Icon name="settings" size={18} stroke={2.1}/>
      </button>
    </span>
  );
}

function ChannelRowInline({ ch, active, onClick, onInvite, onEdit }) {
  if (ch.kind === 'voice') {
    return (
      <>
        <div className={`channel-item ${active ? 'active' : ''}`} onClick={onClick}>
          <span className="glyph"><ChannelGlyph kind={ch.kind}/></span>
          <span className="name">{ch.name}</span>
          <ChannelActionButtons onInvite={onInvite} onEdit={onEdit}/>
        </div>
        {ch.members && ch.members.length > 0 && (
          <div style={{ paddingLeft: 30, marginBottom: 4 }}>
            {ch.members.map(m => (
              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 4, fontSize: 12.5, color: 'var(--ink-1)' }}>
                <div className={`av-${m==='wen'?4:5}`} style={{ width: 20, height: 20, borderRadius: '50%' }}/>
                <span>{m === 'wen' ? '沈温言' : '江予白'}</span>
                <Icon name="mic" size={11}/>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }
  return (
    <div className={`channel-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="glyph"><ChannelGlyph kind={ch.kind}/></span>
      <span className="name">{ch.name}</span>
      {ch.mentions > 0 && <span className="badge">{ch.mentions}</span>}
      {ch.unread && !ch.mentions && !active && <span className="unread-dot"/>}
      <ChannelActionButtons onInvite={onInvite} onEdit={onEdit}/>
    </div>
  );
}

function InlineDMSidebar({ activeDM, activeView, onSelect, dmList = [], friendRequests = [], onOpenFriends, onOpenPendingFriends, onOpenAddFriend }) {
  const incomingRequests = friendRequests.filter(item => item.direction === 'incoming' && item.status === 'pending');
  return (
    <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--paper-1)', borderRight: '1px solid var(--paper-3)', minHeight: 0 }}>
      <div className="sidebar-header" style={{ cursor: 'default' }}>
          <span>私信</span>
      </div>
      <div className="sidebar-scroll" style={{ flex: 1 }}>
        <div className={`channel-item ${activeView === 'friends' ? 'active' : ''}`} onClick={onOpenFriends}>
          <span className="glyph"><Icon name="users" size={14}/></span>
          <span className="name">好友</span>
          {incomingRequests.length > 0 && <span className="badge">{incomingRequests.length}</span>}
          <span className="plus" title="添加好友" onClick={(e) => { e.stopPropagation(); onOpenAddFriend?.(); }}><Icon name="plus" size={14}/></span>
        </div>
        {incomingRequests.map(item => (
          <div key={'friend-request-' + item.id} className="dm-item" onClick={onOpenPendingFriends || onOpenFriends}>
            <div className={`avatar ${item.user.avatar_color || 'av-1'}`} style={{ position: 'relative', width: 28, height: 28, borderRadius: '50%' }}/>
            <div className="name">
              <div>{item.user.display_name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                请求添加你为好友
              </div>
            </div>
            <span className="badge">待定</span>
          </div>
        ))}
        <div className="section-label">
          <span>私信 · {dmList.length}</span>
        </div>
        {dmList.length === 0 && (
          <div style={{ padding: '10px 14px', color: 'var(--ink-2)', fontSize: 12, lineHeight: 1.5 }}>
            暂无私信。可以从服务器成员资料卡里点击 Message 开始对话。
          </div>
        )}
        {dmList.map(dm => (
          <div key={dm.id} className={`dm-item ${activeDM?.id === dm.id ? 'active' : ''}`} onClick={() => onSelect(dm)}>
            <div className={`avatar ${dm.color}`} style={{ position: 'relative', width: 28, height: 28, borderRadius: '50%' }}>
              <span className={`status-dot ${dm.status}`}/>
            </div>
            <div className="name">
              <div>{dm.name}</div>
              {dm.preview && (
                <div style={{ fontSize: 11, color: 'var(--ink-2)', fontStyle: dm.preview === 'typing...' ? 'italic' : 'normal', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dm.preview}
                </div>
              )}
            </div>
            {dm.unread > 0 && <span className="badge">{dm.unread}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
