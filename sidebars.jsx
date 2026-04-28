/* Sidebar components: server rail, channel sidebar, user card, member sidebar */

const { useState } = React;

const THEME_COLORS = [
  { key: 'white',    color: '#ffffff', name: '纯白'  },
  { key: 'slate',    color: '#f0f2f5', name: '石板灰' },
  { key: 'light',    color: '#faf7f1', name: '暖纸'  },
  { key: 'dark',     color: '#313338', name: '深色'  },
  { key: 'forest',   color: '#1e2921', name: '苔绿'  },
  { key: 'midnight', color: '#0d0f11', name: '午夜'  },
];

function Avatar({ color, label, size = 36, kind, status, onClick, url }) {
  return (
    <div
      className={`${url ? '' : (color || '')} ${kind === 'bot' ? 'bot-avatar' : ''}`}
      style={{ width: size, height: size, borderRadius: '50%', position: 'relative', cursor: onClick ? 'pointer' : 'default', flexShrink: 0 }}
      onClick={onClick}
    >
      {url ? (
        <img src={API.assetUrl(url)} alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '50%' }} />
      ) : (
        <div className="avatar-label" style={{ fontSize: size * 0.42 }}>{label}</div>
      )}
      {status && <span className={`status-dot ${status}`} />}
    </div>
  );
}

function ServerRail({
  activeServer,
  onSelect,
  onAdd,
  onInvite,
  onReviewRequests,
  onCreateChannel,
  onServerSettings,
  onDeleteServer,
  onLeave,
  servers = SERVERS,
  theme,
  onSetTheme,
}) {
  const [menu, setMenu] = useState(null);
  const [localServers, setLocalServers] = React.useState(servers);
  const [dragId, setDragId] = React.useState(null);

  React.useEffect(() => { setLocalServers(servers); }, [servers]);

  function startDrag(e, id) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
  }

  function moveDrag(id) {
    if (!dragId || dragId === id) return;
    setLocalServers(prev => {
      const from = prev.findIndex(s => s.id === dragId);
      const to = prev.findIndex(s => s.id === id);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function endDrag() {
    if (!dragId) return;
    setDragId(null);
    const ids = localServers.filter(s => !s.kind && s.id !== 'divider' && s.id !== 'divider2').map(s => s.id);
    API.patch('/api/servers/reorder', { order: ids }).catch(() => {});
  }

  return (
    <div className="server-rail">
      <div className="server-rail-scroll">
      {localServers.map((s, i) => {
        if (s.id === 'divider' || s.id === 'divider2') return <div key={i} className="server-divider" />;
        const active = activeServer === s.id;
        const isDraggable = !s.kind;
        const isDragging = dragId === s.id;
        return (
          <div key={s.id} className={`server-pill ${active ? 'active' : ''}`}
               style={{ opacity: isDragging ? 0.5 : 1, cursor: isDraggable ? (dragId ? 'grabbing' : 'grab') : 'pointer', transition: 'transform 0.12s' }}
               onPointerDown={isDraggable ? e => startDrag(e, s.id) : undefined}
               onPointerEnter={isDraggable ? () => moveDrag(s.id) : undefined}
               onPointerUp={isDraggable ? endDrag : undefined}
               onPointerCancel={isDraggable ? endDrag : undefined}
               onClick={() => {
                 if (dragId) return;
                 if (s.kind === 'add') return onAdd();
                 onSelect(s.id);
               }}
               onContextMenu={(e) => {
                 if (s.kind) return;
                 e.preventDefault();
                 setMenu({ x: e.clientX, y: e.clientY, server: s });
               }}>
            <div className="indicator" />
            {s.kind === 'dm' && (
              <div className="server-icon dm" title="私信">
                <Icon name="feather" size={22} />
              </div>
            )}
            {s.kind === 'add' && (
              <div className="server-icon add" title="新建或加入服务器"><Icon name="plus" size={20} /></div>
            )}
            {!s.kind && (
              <div
                className={`server-icon ${s.color || ''}`}
                title={s.name}
                style={s.icon_url ? { backgroundImage: `url("${API.assetUrl(s.icon_url)}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
              >
                {s.icon_url ? (
                  <img
                    src={API.assetUrl(s.icon_url)}
                    alt={s.name}
                    className="server-logo-img"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <span style={{ color: 'rgba(255,247,235,0.95)', fontFamily: 'var(--ff-serif)' }}>{s.short || s.short_name}</span>
                )}
              </div>
            )}
            {(s.unread > 0 || s.pending_join_requests > 0) && (
              <span style={{
                position: 'absolute', right: 10, bottom: 2,
                minWidth: 18, height: 18, padding: '0 5px',
                background: 'var(--rust)', color: '#fff',
                borderRadius: 9, fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--ff-mono)',
                border: '2px solid var(--paper-2)',
              }}>{s.pending_join_requests || s.unread}</span>
            )}
            <span className="tooltip">{s.name}</span>
          </div>
        );
      })}
      {menu && (
        <>
          <div className="server-menu-backdrop" onClick={() => setMenu(null)}/>
          <div className="server-context-menu" style={{ left: menu.x, top: menu.y }}>
            <button onClick={() => { onInvite?.(menu.server); setMenu(null); }}>邀请成员</button>
            {menu.server.role === 'founder' && (
              <>
                <button onClick={() => { onReviewRequests?.(menu.server); setMenu(null); }}>
                  审核申请{menu.server.pending_join_requests ? `（${menu.server.pending_join_requests}）` : ''}
                </button>
                <div style={{ height: 1, background: 'var(--paper-3)', margin: '4px 0' }}/>
                <button onClick={() => { onCreateChannel?.(menu.server); setMenu(null); }}>创建频道</button>
                <button onClick={() => { onServerSettings?.(menu.server); setMenu(null); }}>服务器设置</button>
              </>
            )}
            <div style={{ height: 1, background: 'var(--paper-3)', margin: '4px 0' }}/>
            {menu.server.role === 'founder' ? (
              <button className="danger" onClick={() => { onDeleteServer?.(menu.server); setMenu(null); }}>删除服务器</button>
            ) : (
              <button className="danger" onClick={() => { onLeave?.(menu.server); setMenu(null); }}>退出服务器</button>
            )}
          </div>
        </>
      )}
      </div>
      <div className="server-rail-bottom">
        <div className="server-divider" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {THEME_COLORS.map(({ key, color, name }) => (
            <button
              key={key}
              title={name}
              onClick={() => onSetTheme?.(key)}
              style={{
                width: 22, height: 22,
                borderRadius: '50%',
                background: color,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                boxSizing: 'border-box',
                boxShadow: theme === key
                  ? `0 0 0 2px var(--rail-bg), 0 0 0 4px var(--ink-0)`
                  : `0 0 0 1.5px rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.15)`,
                transform: theme === key ? 'scale(1.1)' : 'scale(1)',
                transition: 'box-shadow 0.15s ease, transform 0.15s ease',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChannelGlyph({ kind }) {
  if (kind === 'voice') return <Icon name="voice-channel" size={14} />;
  if (kind === 'announce') return <Icon name="announce" size={14} />;
  return <Icon name="hash" size={14} />;
}

function ChannelSidebar({ server, activeChannel, onSelectChannel, onOpenCreate }) {
  const groups = CHANNELS[server.id] || [];
  return (
    <div className="channel-sidebar">
      <div className="sidebar-header">
        <span>{server.name}</span>
        <Icon name="chevron-down" size={14} />
      </div>
      <div className="sidebar-scroll">
        {groups.map((g, gi) => (
          <React.Fragment key={gi}>
            <div className="section-label">
              <span>{g.group}</span>
              <span className="plus"><Icon name="plus" size={14}/></span>
            </div>
            {g.items.map(ch => (
              <ChannelRow
                key={ch.id}
                ch={ch}
                active={activeChannel?.id === ch.id}
                onClick={() => onSelectChannel(ch)}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ChannelRow({ ch, active, onClick }) {
  if (ch.kind === 'voice') {
    return (
      <>
        <div className={`channel-item ${active ? 'active' : ''}`} onClick={onClick}>
          <span className="glyph"><ChannelGlyph kind={ch.kind}/></span>
          <span className="name">{ch.name}</span>
        </div>
        {ch.members && ch.members.length > 0 && (
          <div style={{ paddingLeft: 30, marginBottom: 4 }}>
            {ch.members.map(m => (
              <div key={m} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 6px', borderRadius: 4,
                fontSize: 12.5, color: 'var(--ink-1)',
              }}>
                <div className={`av-${m==='wen'?4:5}`} style={{
                  width: 20, height: 20, borderRadius: '50%',
                }}/>
                <span>{m === 'wen' ? '沈温言' : '江予白'}</span>
                <Icon name="mic" size={11} />
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
      {ch.unread && !ch.mentions && !active && <span className="unread-dot" />}
    </div>
  );
}

function DMSidebar({ activeDM, onSelect }) {
  return (
    <div className="channel-sidebar">
      <div className="sidebar-header" style={{ cursor: 'default' }}>
        <span>Direct Messages</span>
        <Icon name="plus" size={14}/>
      </div>
      <div className="sidebar-scroll">
        <div className="channel-item">
          <span className="glyph"><Icon name="users" size={14}/></span>
          <span className="name">Friends</span>
        </div>
        <div className="channel-item">
          <span className="glyph"><Icon name="inbox" size={14}/></span>
          <span className="name">Inbox</span>
          <span className="badge">3</span>
        </div>
        <div className="section-label">
          <span>Direct · 7</span>
          <span className="plus"><Icon name="plus" size={14}/></span>
        </div>
        {DM_LIST.map(dm => (
          <div key={dm.id}
               className={`dm-item ${activeDM?.id === dm.id ? 'active' : ''}`}
               onClick={() => onSelect(dm)}>
            <div className={`avatar ${dm.color}`} style={{ position: 'relative' }}>
              <span className={`status-dot ${dm.status}`} />
            </div>
            <div className="name">
              <div>{dm.name}</div>
              {dm.preview && (
                <div style={{
                  fontSize: 11, color: 'var(--ink-2)',
                  fontStyle: dm.preview === 'typing...' ? 'italic' : 'normal',
                  marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
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

function UserCard({ user, onOpenSettings, onOpenProfile, onOpenTelegram, muted, deafened, onToggleMute, onToggleDeafen }) {
  const color = user.color || 'av-6';
  const label = (user.name || '?').slice(0, 1).toUpperCase();
  const status = user.status || 'online';

  return (
    <div className="user-card">
      <div className="avatar" onClick={onOpenProfile}>
        {user.avatar_url ? (
          <img src={API.assetUrl(user.avatar_url)} alt={user.name}
            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <>
            <div className={`${color}`} style={{ width: 32, height: 32, borderRadius: '50%' }}/>
            <div className="avatar-label" style={{ position: 'absolute', inset: 0, fontSize: 13 }}>{label}</div>
          </>
        )}
        <span className={`status-dot ${status}`} />
      </div>
      <div className="info" onClick={onOpenProfile}>
        <div className="name">{user.name}</div>
        <div className="handle">{user.handle}</div>
      </div>
      <div className="actions">
        <button className="icon-btn" onClick={onOpenTelegram} title="Telegram 推送">
          <Icon name="telegram" size={16}/>
        </button>
        <button className={`icon-btn ${muted ? 'off' : ''}`} onClick={onToggleMute} title={muted ? 'Unmute' : 'Mute'}>
          <Icon name={muted ? 'mic-off' : 'mic'} size={16}/>
        </button>
        <button className={`icon-btn ${deafened ? 'off' : ''}`} onClick={onToggleDeafen} title={deafened ? 'Undeafen' : 'Deafen'}>
          <Icon name={deafened ? 'headphones-off' : 'headphones'} size={16}/>
        </button>
        <button className="icon-btn" onClick={onOpenSettings} title="Settings">
          <Icon name="settings" size={16}/>
        </button>
      </div>
    </div>
  );
}

function MemberSidebar({ members, onOpenMember }) {
  const list = members?.length ? members : MEMBERS;
  return (
    <div className="member-sidebar">
      {list.map(group => (
        <div key={group.key}>
          <div className="member-group-label">
            <span>{group.group}</span>
            <span className="count">— {group.items.length}</span>
          </div>
          {group.items.map(m => (
            <div
              key={m.id}
              className={`member-item ${m.status === 'offline' ? 'offline' : ''}`}
              onClick={(e) => onOpenMember(m, e)}
            >
              <div className={`avatar ${m.avatar_url ? '' : m.color}`} style={{ position: 'relative' }}>
                {m.avatar_url
                  ? <img src={API.assetUrl(m.avatar_url)} alt={m.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                  : null}
                <span className={`status-dot ${m.status}`} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={`name ${m.role ? 'role-'+m.role : ''}`}>{m.name}</div>
                {m.activity && (
                  <div className="activity">{m.activity}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { ServerRail, ChannelSidebar, DMSidebar, UserCard, MemberSidebar, Avatar, ChannelGlyph });
