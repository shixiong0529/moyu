/* Tweaks panel + DM view */

const { useState: useStateT, useEffect: useEffectT } = React;

function TweaksPanel({ active, theme, setTheme, accent, setAccent, density, setDensity, onClose }) {
  if (!active) return null;
  const ACCENTS = [
    { id: 'wood', color: '#8a5a2b' },
    { id: 'rust', color: '#b5583a' },
    { id: 'sage', color: '#6b7e5e' },
    { id: 'amber', color: '#c9933e' },
    { id: 'plum', color: '#7a4a5c' },
    { id: 'teal', color: '#4e7472' },
  ];
  return (
    <div className="tweaks-panel">
      <div className="head">
        <span>Tweaks</span>
        <button className="icon-btn" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-2)' }} onClick={onClose}>
          <Icon name="close" size={14}/>
        </button>
      </div>
      <div className="body">
        <div className="tweak-row">
          <div className="label">Theme</div>
          <div className="seg">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Paper</button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Lamp</button>
          </div>
        </div>
        <div className="tweak-row">
          <div className="label">Accent</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {ACCENTS.map(a => (
              <div key={a.id}
                   onClick={() => setAccent(a.id)}
                   style={{
                     width: 24, height: 24, borderRadius: '50%',
                     background: a.color, cursor: 'pointer',
                     border: accent === a.id ? '2px solid var(--ink-0)' : '2px solid transparent',
                   }}/>
            ))}
          </div>
        </div>
        <div className="tweak-row">
          <div className="label">Density</div>
          <div className="seg">
            <button className={density === 'compact' ? 'active' : ''} onClick={() => setDensity('compact')}>Compact</button>
            <button className={density === 'default' ? 'active' : ''} onClick={() => setDensity('default')}>Default</button>
            <button className={density === 'cozy' ? 'active' : ''} onClick={() => setDensity('cozy')}>Cozy</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* DM chat view — reuses chat components but with a header showing the friend */
function DMView({ dm, messages, onSend, onOpenProfile, currentUser, inviteDecisions = {}, onAcceptInvite, onRejectInvite, sendError }) {
  if (!dm) {
    return (
      <div className="chat">
        <div className="chat-header">
          <div className="title" style={{ fontSize: 16 }}>私信</div>
          <div className="topic">只显示与你有关的私聊</div>
        </div>
        <div className="messages">
          <div className="channel-intro">
            <h2>暂无私信</h2>
            <p>从服务器成员资料卡中点击 Message，可以开始一段新的私聊。</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="chat">
      <div className="chat-header">
        <div className={`avatar ${dm.color}`} style={{ width: 28, height: 28, borderRadius: '50%', position: 'relative', marginRight: 6 }}>
          <span className={`status-dot ${dm.status}`}/>
        </div>
        <div className="title" style={{ fontSize: 16 }}>{dm.name}</div>
        <div className="topic">
          {dm.status === 'online' ? 'online' : dm.status === 'idle' ? 'away' : dm.status === 'dnd' ? 'do not disturb' : 'offline'}
        </div>
        <div className="actions">
          <button className="icon-btn" title="Voice call"><Icon name="voice-channel" size={17}/></button>
          <button className="icon-btn" title="Pinned"><Icon name="pin" size={17}/></button>
          <button className="icon-btn" title="Add"><Icon name="plus-circle" size={17}/></button>
          <div className="search-box"><Icon name="search" size={12}/><input placeholder="Search"/></div>
        </div>
      </div>
      <div className="messages">
        <div className="channel-intro">
          <div className={`avatar ${dm.color}`} style={{ width: 72, height: 72, borderRadius: '50%', marginBottom: 12, position: 'relative' }}>
            <span className={`status-dot ${dm.status}`} style={{ width: 18, height: 18, borderWidth: 4 }}/>
          </div>
          <h2>{dm.name}</h2>
          <p>{dm.handle} · 这是你和 {dm.name} 之间的私信。只有你们两个能看到。</p>
        </div>
        <div className="day-divider"><span>星期三 · MAY 14</span></div>
        {messages.map(m => (
          <MessageGroup
            key={m.id}
            msg={m}
            onOpenProfile={onOpenProfile}
            onReact={() => {}}
            inviteDecision={inviteDecisions[m.id]}
            onAcceptInvite={m.authorId === currentUser?.id ? null : onAcceptInvite}
            onRejectInvite={m.authorId === currentUser?.id ? null : onRejectInvite}
          />
        ))}
      </div>
      <Composer channelName={dm.name} onSend={onSend} error={sendError}/>
    </div>
  );
}

function FriendsView({ friends = [], requests = [], initialTab = 'all', onAddFriend, onRefresh, onOpenDM }) {
  const [tab, setTab] = useStateT(initialTab);
  const [query, setQuery] = useStateT('');
  const [statusText, setStatusText] = useStateT('');
  const [menuFriend, setMenuFriend] = useStateT(null);

  useEffectT(function syncInitialTab() {
    setTab(initialTab || 'all');
  }, [initialTab]);
  const incoming = requests.filter(item => item.direction === 'incoming' && item.status === 'pending');
  const outgoing = requests.filter(item => item.direction === 'outgoing' && item.status === 'pending');
  const visibleFriends = friends.filter(friend => {
    const text = `${friend.display_name} ${friend.username}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  const decide = async (request, action) => {
    setStatusText('');
    await API.post(`/api/friends/requests/${request.id}/${action}`, {});
    setStatusText(action === 'approve' ? '已通过好友申请。' : '已拒绝好友申请。');
    await onRefresh?.();
  };

  const openDM = (friend) => {
    setMenuFriend(null);
    onOpenDM?.(friend);
  };

  const deleteFriend = async (friend) => {
    setMenuFriend(null);
    if (!window.confirm(`确定要删除好友「${friend.display_name}」吗？`)) return;
    await API.del(`/api/friends/${friend.id}`);
    setStatusText(`已删除好友「${friend.display_name}」。`);
    await onRefresh?.();
  };

  const renderFriend = (friend) => (
    <div key={friend.id} className="friend-row" onClick={() => openDM(friend)}>
      <div className={`avatar ${friend.avatar_color || 'av-1'}`}>
        <span className={`status-dot ${friend.status || 'offline'}`}/>
      </div>
      <div className="friend-main">
        <div className="friend-name">{friend.display_name}</div>
        <div className="friend-sub">@{friend.username} · {friend.status === 'online' ? '在线' : '离线'}</div>
      </div>
      <button className="icon-btn" title="消息" onClick={(e) => { e.stopPropagation(); openDM(friend); }}><Icon name="message-circle" size={16}/></button>
      <div className="friend-menu-wrap">
        <button className="icon-btn" title="更多" onClick={(e) => { e.stopPropagation(); setMenuFriend(menuFriend?.id === friend.id ? null : friend); }}>
          <Icon name="more-vertical" size={16}/>
        </button>
        {menuFriend?.id === friend.id && (
          <>
            <div className="friend-menu-backdrop" onClick={(e) => { e.stopPropagation(); setMenuFriend(null); }}/>
            <div className="friend-menu" onClick={e => e.stopPropagation()}>
              <button className="danger" onClick={() => deleteFriend(friend)}>删除好友</button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderRequest = (item) => (
    <div key={item.id} className="friend-row">
      <div className={`avatar ${item.user.avatar_color || 'av-1'}`}/>
      <div className="friend-main">
        <div className="friend-name">{item.user.display_name}</div>
        <div className="friend-sub">
          @{item.user.username} · {item.direction === 'incoming' ? '请求添加你为好友' : '等待对方通过'}
        </div>
      </div>
      {item.direction === 'incoming' ? (
        <div className="friend-actions">
          <button className="btn btn-secondary" style={{ height: 30, padding: '0 12px' }} onClick={() => decide(item, 'reject')}>拒绝</button>
          <button className="btn btn-primary" style={{ height: 30, padding: '0 12px' }} onClick={() => decide(item, 'approve')}>通过</button>
        </div>
      ) : (
        <span className="friend-pill">待定</span>
      )}
    </div>
  );

  return (
    <div className="chat">
      <div className="chat-header friends-header">
        <span className="glyph"><Icon name="users" size={16}/></span>
        <div className="title">好友</div>
        <button className={`friend-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>全部</button>
        <button className={`friend-tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>待定</button>
        <button className="btn btn-primary" style={{ height: 32, padding: '0 14px' }} onClick={onAddFriend}>添加好友</button>
      </div>
      <div className="friends-page">
        <div className="search-box friends-search"><Icon name="search" size={14}/><input placeholder="搜索" value={query} onChange={e => setQuery(e.target.value)}/></div>
        {statusText && <div className="form-hint" style={{ color: 'var(--accent)' }}>{statusText}</div>}
        {tab === 'all' ? (
          <>
            <div className="friends-count">好友总数 - {visibleFriends.length}</div>
            <div className="friend-list">
              {visibleFriends.length ? visibleFriends.map(renderFriend) : <div className="form-hint">暂无好友。</div>}
            </div>
          </>
        ) : (
          <>
            <div className="friends-count">待处理 - {incoming.length + outgoing.length}</div>
            <div className="friend-list">
              {[...incoming, ...outgoing].length ? [...incoming, ...outgoing].map(renderRequest) : <div className="form-hint">暂无待定申请。</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Telegram binding panel — per-user bot token model */
function TelegramPanel({ onClose }) {
  const { useState: useStateTg, useEffect: useEffectTg } = React;
  const [bound, setBound] = useStateTg(false);
  const [notifyEnabled, setNotifyEnabled] = useStateTg(false);
  const [botToken, setBotToken] = useStateTg('');
  const [chatId, setChatId] = useStateTg('');
  const [loading, setLoading] = useStateTg(false);
  const [loadingStatus, setLoadingStatus] = useStateTg(true);
  const [error, setError] = useStateTg('');

  useEffectTg(() => {
    API.get('/api/telegram/status')
      .then(s => { setBound(s.bound); setNotifyEnabled(s.notify_enabled); })
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  async function connect() {
    const trimToken = botToken.trim();
    const numChatId = parseInt(chatId.trim(), 10);
    if (!trimToken) { setError('请填写 Bot Token'); return; }
    if (!numChatId) { setError('请填写有效的 Chat ID（纯数字）'); return; }
    setLoading(true);
    setError('');
    try {
      await API.post('/api/telegram/connect', { bot_token: trimToken, chat_id: numChatId });
      setBound(true);
      setNotifyEnabled(true);
      setBotToken('');
      setChatId('');
    } catch (err) {
      setError(err.message || '连接失败，请检查 Bot Token 和 Chat ID');
    } finally {
      setLoading(false);
    }
  }

  async function toggleNotify(val) {
    try {
      await API.patch('/api/telegram/notify', { enabled: val });
      setNotifyEnabled(val);
    } catch (err) {
      setError(err.message || '操作失败');
    }
  }

  async function unbind() {
    if (!confirm('确定解除 Telegram 绑定？')) return;
    try {
      await API.del('/api/telegram/bind');
      setBound(false);
      setNotifyEnabled(false);
    } catch (err) {
      setError(err.message || '解绑失败');
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 280 }} onClick={onClose}/>
      <div style={{
        position: 'fixed', bottom: 68, left: 76, width: 300, zIndex: 290,
        background: 'var(--paper-0)', border: '1px solid var(--paper-3)',
        borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        animation: 'slideUp 0.18s cubic-bezier(.2,.7,.3,1)', fontFamily: 'var(--ff-ui)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 16px', borderBottom: '1px solid var(--paper-3)', background: 'var(--paper-1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="telegram" size={16}/>
            <span style={{ fontFamily: 'var(--ff-serif)', fontWeight: 600, fontSize: 14 }}>Telegram 推送</span>
          </div>
          <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-2)', display: 'flex' }} onClick={onClose}>
            <Icon name="close" size={14}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px' }}>
          {loadingStatus ? (
            <div style={{ color: 'var(--ink-2)', fontSize: 13, fontStyle: 'italic', fontFamily: 'var(--ff-serif)' }}>加载中…</div>

          ) : bound ? (
            /* ── Already bound ── */
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>已绑定 Telegram</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)', marginBottom: 2 }}>推送通知</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>好友申请 · 私信 · @提及</div>
                </div>
                <ToggleSwitch defaultOn={notifyEnabled} onChange={toggleNotify}/>
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--rust)', marginBottom: 10 }}>{error}</div>}
              <button className="btn btn-secondary" style={{ width: '100%', height: 34, fontSize: 13 }} onClick={unbind}>
                解除绑定
              </button>
            </>

          ) : (
            /* ── Not bound ── */
            <>
              <p style={{ fontSize: 12.5, color: 'var(--ink-1)', margin: '0 0 14px', lineHeight: 1.6 }}>
                填入你的 Telegram Bot Token 和 Chat ID，点击测试连接，bot 会向你发送一条确认消息。
              </p>

              <label className="form-label">Bot Token</label>
              <input
                className="form-input"
                style={{ marginBottom: 10, fontFamily: 'var(--ff-mono)', fontSize: 12 }}
                placeholder="123456789:AABBccDDee..."
                value={botToken}
                onChange={e => { setBotToken(e.target.value); setError(''); }}
                autoComplete="off"
                spellCheck={false}
              />

              <label className="form-label">Chat ID</label>
              <input
                className="form-input"
                style={{ marginBottom: 4, fontFamily: 'var(--ff-mono)', fontSize: 12 }}
                placeholder="你的 Telegram 用户 ID，如 123456789"
                value={chatId}
                onChange={e => { setChatId(e.target.value); setError(''); }}
                autoComplete="off"
              />
              <div className="form-hint" style={{ marginBottom: 14 }}>
                不知道 Chat ID？在 Telegram 搜索 <b>@userinfobot</b>，发送任意消息即可获取。
              </div>

              {error && (
                <div style={{
                  padding: '8px 12px', borderRadius: 7, marginBottom: 12,
                  background: 'rgba(181,88,58,0.08)', border: '1px solid rgba(181,88,58,0.25)',
                  color: 'var(--rust)', fontSize: 12.5,
                }}>
                  {error}
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ width: '100%', height: 36, fontSize: 13 }}
                onClick={connect}
                disabled={loading}
              >
                {loading ? '连接中…' : '测试并绑定'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { TweaksPanel, DMView, FriendsView, TelegramPanel });
