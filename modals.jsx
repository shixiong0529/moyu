/* Modals: Create/Join server, Profile card popover, Settings page */

const { useState: useStateM, useEffect: useEffectM } = React;

function makeServerShortName(value) {
  return String(value || '').trim().slice(0, 4).toUpperCase();
}

function Modal({ title, subtitle, children, onClose, footer, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={wide ? { width: 560 } : {}} onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative' }}>
          <div className="modal-head">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={16}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

function CreateServerModal({ onClose, onCreated }) {
  const [step, setStep] = useStateM('choose'); // choose | create | join
  const [name, setName] = useStateM('');
  const [shortName, setShortName] = useStateM('');
  const [shortTouched, setShortTouched] = useStateM(false);
  const [logoFile, setLogoFile] = useStateM(null);
  const [logoPreview, setLogoPreview] = useStateM('');
  const [invite, setInvite] = useStateM('');
  const [recommendedServers, setRecommendedServers] = useStateM([]);
  const [selectedRecommendedIds, setSelectedRecommendedIds] = useStateM([]);
  const [recommendedLoading, setRecommendedLoading] = useStateM(false);
  const [error, setError] = useStateM('');
  const [statusText, setStatusText] = useStateM('');
  const [loading, setLoading] = useStateM(false);

  useEffectM(function loadRecommendedServers() {
    if (step !== 'join') return;
    let cancelled = false;

    async function fetchRecommendedServers() {
      setRecommendedLoading(true);
      try {
        const servers = await API.get('/api/servers/recommended');
        if (!cancelled) setRecommendedServers(servers);
      } catch {
        if (!cancelled) setRecommendedServers([]);
      } finally {
        if (!cancelled) setRecommendedLoading(false);
      }
    }

    fetchRecommendedServers();
    return function cancelRecommendedServers() {
      cancelled = true;
    };
  }, [step]);

  const createServer = async () => {
    const cleanName = name.trim();
    const cleanShort = makeServerShortName(shortName || cleanName);
    if (!cleanName || !cleanShort || loading) return;
    setLoading(true);
    setError('');
    setStatusText('');
    try {
      let iconUrl = '';
      if (logoFile) {
        const uploaded = await API.upload(logoFile);
        iconUrl = uploaded.url;
      }
      const server = await API.post('/api/servers', {
        name: cleanName,
        short_name: cleanShort,
        color: 'av-6',
        icon_url: iconUrl || null,
      });
      setStatusText('创建成功，正在进入服务器...');
      await onCreated?.(server);
      onClose();
    } catch (err) {
      setError(err.message || '创建失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const confirmJoinServer = async () => {
    const rawInvite = invite.trim();
    const code = API.parseInviteCode(rawInvite);
    const selectedServers = recommendedServers.filter(server => (
      selectedRecommendedIds.includes(server.id) &&
      server.request_status !== 'pending' &&
      server.request_status !== 'member'
    ));
    if ((!code && selectedServers.length === 0) || loading) {
      if (!code && selectedServers.length === 0) setError('没有提交任何信息');
      return;
    }
    setLoading(true);
    setError('');
    setStatusText('');
    try {
      let joinedServer = null;
      const pendingIds = [];

      for (const server of selectedServers) {
        const result = await API.post(`/api/servers/${server.id}/join-requests`, {});
        if (result.status === 'pending') pendingIds.push(server.id);
        if (result.status === 'member' && result.server && !joinedServer) {
          joinedServer = result.server;
        }
      }

      if (pendingIds.length > 0) {
        setRecommendedServers(prev => prev.map(item => (
          pendingIds.includes(item.id) ? { ...item, request_status: 'pending' } : item
        )));
        setSelectedRecommendedIds(prev => prev.filter(id => !pendingIds.includes(id)));
      }

      if (code) {
        joinedServer = await API.post('/api/servers/join', { code });
      }

      if (joinedServer) {
        setStatusText(pendingIds.length > 0
          ? `已提交 ${pendingIds.length} 个加入申请；已加入邀请服务器，正在进入...`
          : '已加入，正在进入服务器...');
        await onCreated?.(joinedServer);
        onClose();
        return;
      }

      setStatusText(`已提交 ${pendingIds.length} 个加入申请，请等待管理员审核。`);
    } catch (err) {
      setError(err.message || '提交失败，请检查邀请链接或稍后重试');
    } finally {
      setLoading(false);
    }
  };
  const handleNameChange = (value) => {
    setName(value);
    if (!shortTouched) setShortName(makeServerShortName(value));
  };

  const handleShortNameChange = (value) => {
    setShortTouched(true);
    setShortName(makeServerShortName(value));
  };

  const handleLogoChange = (file) => {
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const toggleRecommendedServer = (server) => {
    if (!server?.id || loading || server.request_status === 'pending' || server.request_status === 'member') return;
    setError('');
    setStatusText('');
    setSelectedRecommendedIds(prev => (
      prev.includes(server.id)
        ? prev.filter(id => id !== server.id)
        : [...prev, server.id]
    ));
  };
  if (step === 'choose') {
    return (
      <Modal
        title="新建或加入服务器"
        subtitle="创建自己的服务器，或通过邀请加入朋友的空间。"
        onClose={onClose}
      >
        <div
          className="choice-card"
          onClick={() => setStep('create')}
        >
          <div className="icon"><Icon name="feather" size={22}/></div>
          <div className="text">
            <div className="label">创建服务器</div>
            <div className="sub">建立新的讨论空间，频道和成员由你管理。</div>
          </div>
          <div className="arrow"><Icon name="chevron-right" size={16}/></div>
        </div>
        <div
          className="choice-card"
          onClick={() => setStep('join')}
        >
          <div className="icon"><Icon name="users" size={22}/></div>
          <div className="text">
            <div className="label">加入服务器</div>
            <div className="sub">粘贴邀请链接，或向推荐服务器提交申请。</div>
          </div>
          <div className="arrow"><Icon name="chevron-right" size={16}/></div>
        </div>
      </Modal>
    );
  }

  if (step === 'create') {
    return (
      <Modal
        title="创建服务器"
        subtitle="先设置名称、图标和左侧列表中的缩写。"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setStep('choose')}>返回</button>
            <button className="btn btn-primary" disabled={!name.trim() || loading} onClick={createServer}>
              {loading ? '创建中...' : '创建'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <label className="logo-upload-wrap" style={{ borderRadius: 22 }} title="点击上传服务器图标">
            <div className="av-6" style={{
              width: 88, height: 88, borderRadius: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,247,235,0.95)', fontFamily: 'var(--ff-serif)', fontSize: 26, fontWeight: 700,
              overflow: 'hidden',
            }}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              ) : (
                makeServerShortName(shortName || name) || '?'
              )}
            </div>
            <div className="logo-upload-overlay">
              <Icon name="camera" size={20}/>
              <span>上传图片</span>
            </div>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoChange(e.target.files?.[0])}/>
          </label>
        </div>
        <div className="form-hint" style={{ textAlign: 'center', marginBottom: 16 }}>
          点击图标上传服务器 Logo · jpg / png / gif / webp · 最大 5MB
        </div>

        <label className="form-label" style={{ marginTop: 16 }}>服务器名称</label>
        <input className="form-input" placeholder="e.g. 午夜读书会" value={name} maxLength={64} onChange={e => handleNameChange(e.target.value)} autoFocus/>
        <div className="form-hint">最多 64 个字符。</div>

        <label className="form-label" style={{ marginTop: 16 }}>服务器缩写</label>
        <input className="form-input" placeholder="1-4 个字符" value={shortName} maxLength={4} onChange={e => handleShortNameChange(e.target.value)}/>
        <div className="form-hint">显示在左侧服务器图标中。</div>

        {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
        {statusText && <div className="form-hint" style={{ color: 'var(--accent)' }}>{statusText}</div>}

      </Modal>
    );
  }

  // join
  return (
      <Modal
      title="加入服务器"
      subtitle="输入邀请链接，或向推荐服务器提交加入申请。"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => setStep('choose')}>返回</button>
          <button className="btn btn-primary" disabled={loading} onClick={confirmJoinServer}>
            {loading ? '处理中...' : '确定'}
          </button>
        </>
      }
    >
      <label className="form-label">邀请链接或邀请码</label>
      <input className="form-input" placeholder="hearth.space/invite/..." value={invite} onChange={e => setInvite(e.target.value)} autoFocus/>
      <div className="form-hint">支持完整邀请链接、hearth://invite/邀请码 或纯邀请码。</div>
      {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
      {statusText && <div className="form-hint" style={{ color: 'var(--accent)' }}>{statusText}</div>}

      <label className="form-label" style={{ marginTop: 20 }}>推荐服务器</label>
      <div style={{ display: 'grid', gap: 8 }}>
        {recommendedLoading && <div className="form-hint">正在加载推荐服务器...</div>}
        {!recommendedLoading && recommendedServers.length === 0 && (
          <div className="form-hint">暂无推荐服务器。</div>
        )}
        {recommendedServers.map(server => {
          const selected = selectedRecommendedIds.includes(server.id);
          return (
          <div key={server.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 10,
            border: selected ? '1px solid var(--accent)' : '1px solid var(--paper-3)',
            background: selected ? 'rgba(152, 91, 39, 0.08)' : 'var(--paper-1)',
            borderRadius: 8,
          }}>
            <div className={server.color || 'av-1'} style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--ff-serif)', fontWeight: 700 }}>
              {server.icon_url ? <img src={API.assetUrl(server.icon_url)} alt={server.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : server.short_name}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--ff-serif)', fontWeight: 700, fontSize: 14 }}>{server.name}</div>
              <div style={{ color: 'var(--ink-2)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {server.description || '这个服务器正在等待新朋友。'} · {server.member_count || 0} 位成员
              </div>
            </div>
            <button
              className={selected ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ height: 30, padding: '0 12px', fontSize: 12 }}
              disabled={loading || server.request_status === 'pending' || server.request_status === 'member'}
              onClick={() => toggleRecommendedServer(server)}
            >
              {server.request_status === 'member' ? '已加入' : server.request_status === 'pending' ? '待审核' : selected ? '已选择' : '选择'}
            </button>
          </div>
          );
        })}
      </div>
    </Modal>
  );
}

function CreateChannelModal({ server, groups = [], initialGroup, onClose, onCreated }) {
  const [name, setName] = useStateM('');
  const [kind, setKind] = useStateM('text');
  const [groupId, setGroupId] = useStateM(initialGroup?.id || groups[0]?.id || '');
  const [groupName, setGroupName] = useStateM('');
  const [error, setError] = useStateM('');
  const [loading, setLoading] = useStateM(false);

  const createChannel = async () => {
    const cleanName = name.trim().replace(/^#/, '');
    if (!cleanName || loading || !server?.id) return;
    setLoading(true);
    setError('');
    try {
      const payload = {
        name: cleanName,
        kind,
        group_id: groupId === 'new' ? null : Number(groupId),
        group_name: groupId === 'new' ? (groupName.trim() || '新分组') : null,
      };
      const channel = await API.post(`/api/servers/${server.id}/channels`, payload);
      onCreated(channel);
      onClose();
    } catch (err) {
      setError(err.message || '创建频道失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="创建频道"
      subtitle={server?.name ? `在 ${server.name} 中新增频道` : ''}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={!name.trim() || loading} onClick={createChannel}>
            {loading ? '创建中...' : '创建'}
          </button>
        </>
      }
    >
      <label className="form-label">频道名称</label>
      <input className="form-input" placeholder="例如：读书讨论" value={name} onChange={e => setName(e.target.value)} autoFocus/>

      <label className="form-label" style={{ marginTop: 16 }}>频道类型</label>
      <select className="form-input" value={kind} onChange={e => setKind(e.target.value)}>
        <option value="text">文字频道</option>
        <option value="announce">公告频道</option>
        <option value="voice">语音频道</option>
      </select>

      <label className="form-label" style={{ marginTop: 16 }}>频道分组</label>
      <select className="form-input" value={groupId} onChange={e => setGroupId(e.target.value)}>
        {groups.map(group => <option key={group.id} value={group.id}>{group.group}</option>)}
        <option value="new">新建分组</option>
      </select>
      {groupId === 'new' && (
        <input className="form-input" style={{ marginTop: 10 }} placeholder="新分组名称" value={groupName} onChange={e => setGroupName(e.target.value)}/>
      )}
      {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
    </Modal>
  );
}

function CreateGroupModal({ server, onClose, onCreated }) {
  const [name, setName] = useStateM('');
  const [error, setError] = useStateM('');
  const [loading, setLoading] = useStateM(false);

  const createGroup = async () => {
    const cleanName = name.trim();
    if (!cleanName || loading || !server?.id) return;
    setLoading(true);
    setError('');
    try {
      const group = await API.post(`/api/servers/${server.id}/channel-groups`, { name: cleanName });
      await onCreated?.(group);
      onClose();
    } catch (err) {
      setError(err.message || '创建分组失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="创建分组"
      subtitle="分组用于在频道列表中归类频道。"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>返回</button>
          <button className="btn btn-primary" disabled={!name.trim() || loading} onClick={createGroup}>
            {loading ? '创建中...' : '创建'}
          </button>
        </>
      }
    >
      <label className="form-label">分组名称</label>
      <input
        className="form-input"
        placeholder="如：阅读中 · Reading"
        value={name}
        maxLength={64}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            createGroup();
          }
        }}
        autoFocus
      />
      {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
    </Modal>
  );
}

function ServerSettingsModal({ server, onClose, onUpdated, onDeleted }) {
  const [section, setSection] = useStateM(server?._dangerOpen ? 'danger' : 'overview');
  const [name, setName] = useStateM(server?.name || '');
  const [shortName, setShortName] = useStateM(server?.short_name || server?.short || '');
  const [color, setColor] = useStateM(server?.color || 'av-1');
  const [iconUrl, setIconUrl] = useStateM(server?.icon_url || '');
  const [description, setDescription] = useStateM('');
  const [logoFile, setLogoFile] = useStateM(null);
  const [logoPreview, setLogoPreview] = useStateM('');
  const [deleteConfirm, setDeleteConfirm] = useStateM('');
  const [deleteOpen, setDeleteOpen] = useStateM(Boolean(server?._dangerOpen));
  const [error, setError] = useStateM('');
  const [loading, setLoading] = useStateM(false);
  const [deleteLoading, setDeleteLoading] = useStateM(false);

  useEffectM(function loadServerSettingsDetail() {
    if (!server?.id) return;
    let cancelled = false;
    API.get(`/api/servers/${server.id}`)
      .then(detail => {
        if (cancelled) return;
        setName(detail.name || '');
        setShortName(detail.short_name || '');
        setColor(detail.color || 'av-1');
        setIconUrl(detail.icon_url || detail.logo_url || '');
        setDescription(detail.description || '');
      })
      .catch(() => {});
    return function cancelLoadServerSettingsDetail() {
      cancelled = true;
    };
  }, [server?.id]);

  useEffectM(function cleanupLogoPreview() {
    return function revokeLogoPreview() {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const isFounder = server?.role === 'founder';
  const canSave = name.trim() && shortName.trim() && !loading;
  const avatarColors = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6', 'av-7', 'av-8'];

  const handleLogoChange = (file) => {
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setError('');
  };

  const saveChanges = async () => {
    if (!canSave || !server?.id) return;
    setLoading(true);
    setError('');
    try {
      let nextIconUrl = iconUrl || null;
      if (logoFile) {
        const uploaded = await API.upload(logoFile);
        nextIconUrl = uploaded.url;
      }
      const updated = await API.patch(`/api/servers/${server.id}`, {
        name: name.trim(),
        short_name: shortName.trim().slice(0, 4),
        color,
        icon_url: nextIconUrl,
        description: description.trim() || null,
      });
      await onUpdated?.(updated);
    } catch (err) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const deleteServer = async () => {
    if (!server?.id || deleteConfirm !== name || deleteLoading) return;
    setDeleteLoading(true);
    setError('');
    try {
      await API.del(`/api/servers/${server.id}`);
      await onDeleted?.(server);
    } catch (err) {
      setError(err.message || '删除服务器失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Modal title="服务器设置" subtitle={server?.name || ''} onClose={onClose} wide>
      <div style={{ display: 'flex', minHeight: 420, margin: '-18px -24px -20px' }}>
        <div style={{
          width: 160,
          flex: '0 0 160px',
          padding: '18px 12px',
          background: 'var(--paper-1)',
          borderRight: '1px solid var(--paper-3)',
        }}>
          <button
            className={`settings-nav-btn ${section === 'overview' ? 'active' : ''}`}
            style={{
              width: '100%', height: 34, border: 0, borderRadius: 6, textAlign: 'left',
              padding: '0 10px', marginBottom: 6, cursor: 'pointer',
              background: section === 'overview' ? 'var(--paper-2)' : 'transparent',
              color: 'var(--ink-1)',
            }}
            onClick={() => setSection('overview')}
          >
            概览
          </button>
          {isFounder && (
            <button
              className={`settings-nav-btn ${section === 'danger' ? 'active' : ''}`}
              style={{
                width: '100%', height: 34, border: 0, borderRadius: 6, textAlign: 'left',
                padding: '0 10px', cursor: 'pointer',
                background: section === 'danger' ? 'var(--paper-2)' : 'transparent',
                color: 'var(--rust)',
              }}
              onClick={() => setSection('danger')}
            >
              危险操作
            </button>
          )}
        </div>

        <div style={{ flex: 1, padding: '22px 24px', overflowY: 'auto' }}>
          {section === 'overview' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <label className="logo-upload-wrap" style={{ borderRadius: 22 }} title="点击上传服务器图标">
                  <div className={color} style={{
                    width: 88, height: 88, borderRadius: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(255,247,235,0.95)', fontFamily: 'var(--ff-serif)', fontSize: 26, fontWeight: 700,
                    overflow: 'hidden',
                  }}>
                    {logoPreview || iconUrl ? (
                      <img src={logoPreview || API.assetUrl(iconUrl)} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                    ) : (
                      shortName || '?'
                    )}
                  </div>
                  <div className="logo-upload-overlay">
                    <Icon name="camera" size={20}/>
                    <span>上传图片</span>
                  </div>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoChange(e.target.files?.[0])}/>
                </label>
              </div>

              <label className="form-label">服务器名称</label>
              <input className="form-input" value={name} maxLength={64} onChange={e => setName(e.target.value)} />

              <label className="form-label" style={{ marginTop: 14 }}>服务器缩写</label>
              <input className="form-input" value={shortName} maxLength={4} onChange={e => setShortName(e.target.value.toUpperCase().slice(0, 4))} />

              <label className="form-label" style={{ marginTop: 14 }}>服务器颜色</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {avatarColors.map(item => (
                  <button
                    key={item}
                    className={item}
                    title={item}
                    onClick={() => setColor(item)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                      border: color === item ? '2px solid var(--ink-0)' : '2px solid var(--paper-0)',
                      boxShadow: color === item ? '0 0 0 2px var(--accent)' : 'none',
                    }}
                  />
                ))}
              </div>

              <label className="form-label" style={{ marginTop: 14 }}>服务器描述</label>
              <textarea
                className="form-input"
                style={{ minHeight: 86, padding: 12, lineHeight: 1.5, resize: 'vertical' }}
                value={description}
                maxLength={256}
                onChange={e => setDescription(e.target.value)}
                placeholder="简单介绍这个服务器..."
              />

              {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button className="btn btn-ghost" onClick={onClose}>取消</button>
                <button className="btn btn-primary" disabled={!canSave} onClick={saveChanges}>
                  {loading ? '保存中...' : '保存更改'}
                </button>
              </div>
            </>
          )}

          {section === 'danger' && isFounder && (
            <>
              <div style={{
                border: '1px solid rgba(181,88,58,0.35)',
                background: 'rgba(181,88,58,0.07)',
                borderRadius: 8,
                padding: 16,
              }}>
                <div style={{ fontFamily: 'var(--ff-serif)', fontWeight: 700, fontSize: 16, color: 'var(--rust)' }}>
                  删除服务器
                </div>
                <p style={{ color: 'var(--ink-1)', fontSize: 13, lineHeight: 1.6, margin: '8px 0 14px' }}>
                  此操作不可撤销。删除后所有频道、消息和成员资料将永久丢失。
                </p>
                {!deleteOpen ? (
                  <button className="btn btn-secondary" onClick={() => setDeleteOpen(true)}>删除服务器</button>
                ) : (
                  <>
                    <label className="form-label">请输入服务器名称「{name}」以确认删除</label>
                    <input
                      className="form-input"
                      value={deleteConfirm}
                      onChange={e => setDeleteConfirm(e.target.value)}
                      placeholder={name}
                    />
                    {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                      <button className="btn btn-ghost" onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); }}>取消</button>
                      <button
                        className="btn btn-primary"
                        disabled={deleteConfirm !== name || deleteLoading}
                        onClick={deleteServer}
                        style={{ background: deleteConfirm === name ? 'var(--rust)' : undefined }}
                      >
                        {deleteLoading ? '删除中...' : '确认删除'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function InviteModal({ server, onClose }) {
  const [invite, setInvite] = useStateM(null);
  const [copied, setCopied] = useStateM(false);
  const [error, setError] = useStateM('');
  const link = invite?.web_url || API.inviteWebUrl(invite?.code);

  const generateInvite = async () => {
    if (!server?.id) return;
    setError('');
    try {
      const result = await API.post(`/api/servers/${server.id}/invite`, {});
      setInvite(result);
      setCopied(false);
    } catch (err) {
      setError(err.message || '生成邀请失败');
    }
  };

  React.useEffect(() => {
    generateInvite();
  }, [server?.id]);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError('复制失败，请手动复制链接');
    }
  };

  return (
    <Modal
      title="邀请成员"
      subtitle={server?.name || ''}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={generateInvite}>重新生成</button>
          <button className="btn btn-primary" disabled={!link} onClick={copyLink}>{copied ? '已复制！' : '复制链接'}</button>
        </>
      }
    >
      <label className="form-label">邀请链接</label>
      <input className="form-input" value={link || '正在生成...'} readOnly onFocus={e => e.target.select()}/>
      <div className="form-hint">邀请码：{invite?.code || '...'} · 协议链接：{invite?.url || '...'}</div>
      {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
    </Modal>
  );
}

function JoinRequestsModal({ server, onClose, onChanged }) {
  const [requests, setRequests] = useStateM([]);
  const [loading, setLoading] = useStateM(true);
  const [error, setError] = useStateM('');

  const loadRequests = async () => {
    if (!server?.id) return;
    setLoading(true);
    setError('');
    try {
      const items = await API.get(`/api/servers/${server.id}/join-requests`);
      setRequests(items);
    } catch (err) {
      setError(err.message || '加载加入申请失败');
    } finally {
      setLoading(false);
    }
  };

  useEffectM(function loadJoinRequests() {
    loadRequests();
  }, [server?.id]);

  const decide = async (request, action) => {
    try {
      await API.post(`/api/servers/${server.id}/join-requests/${request.id}/${action}`, {});
      setRequests(prev => prev.filter(item => item.id !== request.id));
      onChanged?.();
    } catch (err) {
      setError(err.message || '处理申请失败');
    }
  };

  return (
    <Modal
      title="加入申请"
      subtitle={server?.name || ''}
      onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>关闭</button>}
    >
      {loading && <div className="form-hint">正在加载申请...</div>}
      {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
      {!loading && requests.length === 0 && (
        <div className="form-hint">当前没有待审核的加入申请。</div>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {requests.map(request => {
          const user = request.user || {};
          return (
            <div key={request.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              border: '1px solid var(--paper-3)',
              background: 'var(--paper-1)',
              borderRadius: 8,
            }}>
              <div className={user.avatar_color || 'av-1'} style={{ width: 38, height: 38, borderRadius: '50%' }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--ff-serif)', fontWeight: 700 }}>{user.display_name || user.username || '未知用户'}</div>
                <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>@{user.username || 'user'} · {request.note || '没有附加说明'}</div>
              </div>
              <button className="btn btn-secondary" style={{ height: 30, padding: '0 12px' }} onClick={() => decide(request, 'reject')}>拒绝</button>
              <button className="btn btn-primary" style={{ height: 30, padding: '0 12px' }} onClick={() => decide(request, 'approve')}>通过</button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function FriendRequestsModal({ onClose, onChanged }) {
  const [username, setUsername] = useStateM('');
  const [requests, setRequests] = useStateM([]);
  const [friends, setFriends] = useStateM([]);
  const [error, setError] = useStateM('');
  const [statusText, setStatusText] = useStateM('');
  const [loading, setLoading] = useStateM(false);

  const loadData = async () => {
    setError('');
    try {
      const [requestItems, friendItems] = await Promise.all([
        API.get('/api/friends/requests'),
        API.get('/api/friends'),
      ]);
      setRequests(requestItems);
      setFriends(friendItems);
      onChanged?.();
    } catch (err) {
      setError(err.message || '加载好友申请失败');
    }
  };

  useEffectM(function loadFriendRequests() {
    loadData();
  }, []);

  const sendRequest = async () => {
    const cleanUsername = username.trim();
    if (!cleanUsername || loading) return;
    setLoading(true);
    setError('');
    setStatusText('');
    try {
      await API.post('/api/friends/requests', { username: cleanUsername });
      setUsername('');
      setStatusText('好友申请已发送。');
      await loadData();
    } catch (err) {
      setError(err.message || '发送好友申请失败');
    } finally {
      setLoading(false);
    }
  };

  const decide = async (request, action) => {
    setError('');
    try {
      await API.post(`/api/friends/requests/${request.id}/${action}`, {});
      setStatusText(action === 'approve' ? '已通过好友申请。' : '已拒绝好友申请。');
      await loadData();
    } catch (err) {
      setError(err.message || '处理好友申请失败');
    }
  };

  const incoming = requests.filter(item => item.direction === 'incoming' && item.status === 'pending');
  const outgoing = requests.filter(item => item.direction === 'outgoing' && item.status === 'pending');
  const decided = requests.filter(item => item.status !== 'pending');

  return (
    <Modal
      title="添加好友"
      subtitle="通过用户名添加好友，对方通过后会出现在好友列表中。"
      onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>关闭</button>}
      wide
    >
      <label className="form-label">通过用户名添加好友</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="输入用户名，例如 demo8" value={username} onChange={e => setUsername(e.target.value)} autoFocus/>
        <button className="btn btn-primary" disabled={!username.trim() || loading} onClick={sendRequest}>发送申请</button>
      </div>
      {error && <div className="form-hint" style={{ color: 'var(--rust)' }}>{error}</div>}
      {statusText && <div className="form-hint" style={{ color: 'var(--accent)' }}>{statusText}</div>}

      <label className="form-label" style={{ marginTop: 20 }}>收到的申请</label>
      {incoming.length === 0 && <div className="form-hint">暂无待处理的好友申请。</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {incoming.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--paper-3)', borderRadius: 8, background: 'var(--paper-1)' }}>
            <div className={item.user.avatar_color || 'av-1'} style={{ width: 34, height: 34, borderRadius: '50%' }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{item.user.display_name}</div>
              <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>@{item.user.username}</div>
            </div>
            <button className="btn btn-secondary" style={{ height: 30, padding: '0 12px' }} onClick={() => decide(item, 'reject')}>拒绝</button>
            <button className="btn btn-primary" style={{ height: 30, padding: '0 12px' }} onClick={() => decide(item, 'approve')}>通过</button>
          </div>
        ))}
      </div>

      <label className="form-label" style={{ marginTop: 20 }}>发出的申请</label>
      {outgoing.length === 0 && <div className="form-hint">暂无等待对方处理的申请。</div>}
      {outgoing.map(item => (
        <div key={item.id} className="form-hint">已发送给 {item.user.display_name}（@{item.user.username}），等待对方处理。</div>
      ))}

      <label className="form-label" style={{ marginTop: 20 }}>我的好友</label>
      {friends.length === 0 && <div className="form-hint">好友列表为空。</div>}
      {friends.map(friend => (
        <div key={friend.id} className="form-hint">{friend.display_name}（@{friend.username}）</div>
      ))}

      {decided.length > 0 && (
        <>
          <label className="form-label" style={{ marginTop: 20 }}>最近反馈</label>
          {decided.slice(0, 5).map(item => (
            <div key={item.id} className="form-hint">
              {item.direction === 'outgoing' ? `你发给 ${item.user.display_name} 的申请` : `${item.user.display_name} 的申请`}
              {item.status === 'approved' ? ' 已通过。' : ' 已拒绝。'}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

/* Profile card popover, positioned by caller */
function ProfileCard({ member, position, onClose, onOpenDM }) {
  const style = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 340),
    top: Math.max(20, Math.min(position.y, window.innerHeight - 420)),
    zIndex: 220,
  };
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 210 }} onClick={onClose}/>
      <div style={style} className="profile-card" onClick={e => e.stopPropagation()}>
        <div className="profile-banner" style={{
          background: member.role === 'founder'
            ? 'linear-gradient(120deg, var(--rust), var(--amber))'
            : member.role === 'editor'
            ? 'linear-gradient(120deg, var(--plum), var(--accent))'
            : 'linear-gradient(120deg, var(--accent), var(--amber))'
        }}/>
        <div className="profile-head">
          <div className={`avatar ${member.color}`}>
            <span className={`status-dot ${member.status || 'online'}`}/>
          </div>
          <button className="btn btn-secondary" onClick={() => { onOpenDM(member); onClose(); }}>Message</button>
        </div>
        <div className="profile-body">
          <div className={`name ${member.role ? 'role-'+member.role : ''}`}>{member.name}</div>
          <div className="handle">@{member.id ? member.id.replace('u-', '') : 'member'} · {member.role || 'Member'}</div>

          <div className="profile-section">
            <div className="label">About · 关于</div>
            <div className="content">
              {member.role === 'founder' && '每周五主持读书会。相信慢慢读一本书比快速读十本更靠近文学。'}
              {member.role === 'editor' && '负责本月共读的整理。最近在做《漂流教室》的注解合集。'}
              {member.role === 'bot' && '小小图书管理员。type /find <keyword> to search within pinned notes.'}
              {member.role === 'mod' && '社区小管家 · 有事 @ 我。'}
              {!member.role && '潜水中，偶尔冒泡。'}
            </div>
          </div>

          <div className="profile-section">
            <div className="label">Roles · 身份</div>
            <div className="profile-roles">
              {member.role && (
                <span className="profile-role">
                  <span className="dot" style={{ background: `var(--${member.role === 'founder' ? 'rust' : member.role === 'editor' ? 'plum' : member.role === 'bot' ? 'sage' : 'teal'})` }}/>
                  {member.role}
                </span>
              )}
              <span className="profile-role">
                <span className="dot" style={{ background: 'var(--sage)' }}/>
                reader
              </span>
              {member.role !== 'bot' && (
                <span className="profile-role">
                  <span className="dot" style={{ background: 'var(--amber)' }}/>
                  2025 class
                </span>
              )}
            </div>
          </div>

          <div className="profile-note">
            Click to add a private note about {member.name}…
          </div>
        </div>
      </div>
    </>
  );
}

/* Settings */
function Settings({ onClose, theme, setTheme, accent, setAccent, density, setDensity, user, onLogout }) {
  const [section, setSection] = useStateM('appearance');

  // ── Telegram state ─────────────────────────────────────────────────────────
  const { useEffect: useEffectTg } = React;
  const [tgBound, setTgBound] = useStateM(false);
  const [tgEnabled, setTgEnabled] = useStateM(false);
  const [tgBotToken, setTgBotToken] = useStateM('');
  const [tgChatId, setTgChatId] = useStateM('');
  const [tgLoading, setTgLoading] = useStateM(false);
  const [tgError, setTgError] = useStateM('');

  useEffectTg(() => {
    if (section !== 'notifications') return;
    API.get('/api/telegram/status').then(s => {
      setTgBound(s.bound);
      setTgEnabled(s.notify_enabled);
    }).catch(() => {});
  }, [section]);

  async function connectTelegram() {
    const token = tgBotToken.trim();
    const cid = parseInt(tgChatId.trim(), 10);
    if (!token) { setTgError('请填写 Bot Token'); return; }
    if (!cid) { setTgError('请填写有效的 Chat ID（纯数字）'); return; }
    setTgLoading(true); setTgError('');
    try {
      await API.post('/api/telegram/connect', { bot_token: token, chat_id: cid });
      setTgBound(true); setTgEnabled(true);
      setTgBotToken(''); setTgChatId('');
    } catch (err) {
      setTgError(err.message || '连接失败，请检查 Bot Token 和 Chat ID');
    } finally {
      setTgLoading(false);
    }
  }

  async function toggleTgNotify(val) {
    try {
      await API.patch('/api/telegram/notify', { enabled: val });
      setTgEnabled(val);
    } catch (err) {
      setTgError(err.message || '操作失败');
    }
  }

  async function unbindTelegram() {
    if (!confirm('确定要解除 Telegram 绑定吗？')) return;
    try {
      await API.del('/api/telegram/bind');
      setTgBound(false); setTgEnabled(false);
    } catch (err) {
      setTgError(err.message || '解绑失败');
    }
  }

  const ACCENTS = [
    { id: 'wood', color: '#8a5a2b', name: 'Wood' },
    { id: 'rust', color: '#b5583a', name: 'Rust' },
    { id: 'sage', color: '#6b7e5e', name: 'Sage' },
    { id: 'amber', color: '#c9933e', name: 'Amber' },
    { id: 'plum', color: '#7a4a5c', name: 'Plum' },
    { id: 'teal', color: '#4e7472', name: 'Teal' },
  ];

  return (
    <div className="settings-root">
      <div className="settings-sidebar">
        <div className="group-label">User</div>
        <a className={section === 'account' ? 'active' : ''} onClick={() => setSection('account')}>My account</a>
        <a className={section === 'profile' ? 'active' : ''} onClick={() => setSection('profile')}>Profile</a>
        <a>Privacy & safety</a>

        <div className="group-label">App</div>
        <a className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}>Appearance</a>
        <a className={section === 'accessibility' ? 'active' : ''} onClick={() => setSection('accessibility')}>Accessibility</a>
        <a>Voice & video</a>

        <div className="group-label">通知</div>
        <a className={section === 'notifications' ? 'active' : ''} onClick={() => setSection('notifications')}>Telegram 推送</a>
        <a>Keybinds</a>
        <a>Language</a>

        <div className="group-label">Help</div>
        <a>What's new</a>
        <a onClick={onLogout}>Log out</a>
      </div>

      <div className="settings-main">
        {section === 'appearance' && (
          <>
            <h1>Appearance</h1>

            <div className="settings-section">
              <div className="settings-row">
                <div className="label-block">
                  <div className="title">Theme · 主题</div>
                  <div className="desc">选择你喜欢的界面风格。</div>
                </div>
              </div>
              <div className="theme-cards">
                {[
                  { id: 'light',    name: 'Paper · 暖纸',    bg: '#faf7f1', fg: '#2a1f14', a: '#8a5a2b' },
                  { id: 'white',    name: 'White · 纯白',    bg: '#ffffff', fg: '#1a1a1c', a: '#6b8fe8' },
                  { id: 'slate',    name: 'Slate · 石板灰',  bg: '#f0f2f5', fg: '#1c1f28', a: '#8a5a2b' },
                  { id: 'dark',     name: 'Lamp · 暖夜',     bg: '#1c1612', fg: '#f3e9d7', a: '#d4a06a' },
                  { id: 'midnight', name: 'Midnight · 午夜', bg: '#0e1117', fg: '#e4eaf6', a: '#6b8fe8' },
                  { id: 'forest',   name: 'Forest · 苔绿',   bg: '#0c1410', fg: '#d4eecc', a: '#6ec460' },
                ].map(t => (
                  <div key={t.id}
                       className={`theme-card ${theme === t.id ? 'active' : ''}`}
                       onClick={() => setTheme(t.id)}>
                    <div className="swatch">
                      <div style={{ background: t.bg }}/>
                      <div style={{ background: t.fg, maxWidth: 8 }}/>
                      <div style={{ background: t.a, maxWidth: 8 }}/>
                      <div style={{ background: t.bg }}/>
                    </div>
                    <div style={{ fontFamily: 'var(--ff-serif)', fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-row">
                <div className="label-block">
                  <div className="title">Accent · 主题色</div>
                  <div className="desc">Tints highlights, mentions, and the sending button.</div>
                </div>
              </div>
              <div className="accent-swatches">
                {ACCENTS.map(a => (
                  <div key={a.id}
                       className={`accent-swatch ${accent === a.id ? 'active' : ''}`}
                       style={{ background: a.color }}
                       title={a.name}
                       onClick={() => setAccent(a.id)}/>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-row">
                <div className="label-block">
                  <div className="title">Density · 密度</div>
                  <div className="desc">How much room messages get to breathe.</div>
                </div>
              </div>
              <div className="density-cards">
                {[
                  { id: 'compact', name: 'Compact', desc: '适合重度阅读', lines: 8 },
                  { id: 'default', name: 'Default', desc: '推荐', lines: 6 },
                  { id: 'cozy', name: 'Cozy', desc: '更多留白', lines: 4 },
                ].map(d => (
                  <div key={d.id}
                       className={`density-card ${density === d.id ? 'active' : ''}`}
                       onClick={() => setDensity(d.id)}>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div style={{ color: 'var(--ink-2)', fontSize: 11.5, fontStyle: 'italic', fontFamily: 'var(--ff-serif)' }}>{d.desc}</div>
                    <div className="preview-lines">
                      {Array.from({ length: d.lines }).map((_, i) => (
                        <div key={i} style={{ width: `${60 + (i%3)*15}%` }}/>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {section === 'account' && (
          <>
            <h1>My account</h1>
            <div className="settings-section">
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div className={`${user.color || 'av-6'}`} style={{ width: 80, height: 80, borderRadius: '50%' }}/>
                <div>
                  <div style={{ fontFamily: 'var(--ff-serif)', fontSize: 22, fontWeight: 600 }}>{user.name}</div>
                  <div style={{ fontFamily: 'var(--ff-mono)', fontSize: 13, color: 'var(--ink-2)' }}>{user.handle}</div>
                </div>
              </div>
            </div>
            {[
              ['Display name', user.name],
              ['Username', user.handle],
              ['Email', 'you@hearth.space'],
              ['Phone', '—'],
            ].map(([k, v]) => (
              <div className="settings-row" key={k}>
                <div className="label-block">
                  <div className="title" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>{k}</div>
                  <div style={{ fontSize: 15, marginTop: 4, fontFamily: 'var(--ff-serif)' }}>{v}</div>
                </div>
                <button className="btn btn-secondary">Edit</button>
              </div>
            ))}
          </>
        )}

        {section === 'profile' && (
          <>
            <h1>Profile</h1>
            <p style={{ color: 'var(--ink-2)', fontFamily: 'var(--ff-serif)', fontStyle: 'italic', marginTop: -16, marginBottom: 20 }}>
              How others see you in rooms.
            </p>
            <div className="settings-section">
              <label className="form-label">About · 自我介绍</label>
              <textarea className="form-input" style={{ height: 80, padding: 12, lineHeight: 1.5, fontFamily: 'var(--ff-serif)', fontStyle: 'italic' }}
                defaultValue="工作日在做事，晚上读闲书。"/>
            </div>
            <div className="settings-section">
              <label className="form-label">Pronouns</label>
              <input className="form-input" defaultValue="她/她" style={{ width: 200 }}/>
            </div>
          </>
        )}

        {section === 'accessibility' && (
          <>
            <h1>Accessibility</h1>
            {[
              { t: 'Reduce motion', d: 'Dims transitions and animated emojis.' },
              { t: 'Larger message text', d: 'Adds 2pt to chat messages only.' },
              { t: 'Always show timestamps', d: 'Shows the minute on every line.' },
              { t: 'Dim images until clicked', d: 'Shows a soft placeholder; click to reveal.' },
            ].map((r, i) => (
              <div className="settings-row" key={i}>
                <div className="label-block">
                  <div className="title">{r.t}</div>
                  <div className="desc">{r.d}</div>
                </div>
                <ToggleSwitch defaultOn={i === 2}/>
              </div>
            ))}
          </>
        )}

        {section === 'notifications' && (
          <>
            <h1>Telegram 推送</h1>
            <p style={{ fontFamily: 'var(--ff-serif)', fontStyle: 'italic', color: 'var(--ink-2)', marginTop: -16, marginBottom: 24 }}>
              绑定 Telegram 后，即使不在线也能收到好友申请、私信和 @提及 通知。
            </p>

            {!tgBound ? (
              <>
                <div className="settings-section">
                  <label className="form-label">Bot Token</label>
                  <input
                    className="form-input"
                    style={{ fontFamily: 'var(--ff-mono)', fontSize: 13 }}
                    placeholder="从 @BotFather 获取，如 123456789:AABBcc..."
                    value={tgBotToken}
                    onChange={e => { setTgBotToken(e.target.value); setTgError(''); }}
                    autoComplete="off" spellCheck={false}
                  />
                </div>
                <div className="settings-section">
                  <label className="form-label">Chat ID</label>
                  <input
                    className="form-input"
                    style={{ fontFamily: 'var(--ff-mono)', fontSize: 13 }}
                    placeholder="你的 Telegram 用户 ID，如 123456789"
                    value={tgChatId}
                    onChange={e => { setTgChatId(e.target.value); setTgError(''); }}
                    autoComplete="off"
                  />
                  <div className="form-hint">不知道 Chat ID？在 Telegram 搜索 @userinfobot，发送任意消息即可获取。</div>
                </div>
                {tgError && (
                  <div style={{ padding: '8px 12px', borderRadius: 7, marginBottom: 12, background: 'rgba(181,88,58,0.08)', border: '1px solid rgba(181,88,58,0.25)', color: 'var(--rust)', fontSize: 13 }}>
                    {tgError}
                  </div>
                )}
                <div className="settings-section">
                  <button className="btn btn-primary" onClick={connectTelegram} disabled={tgLoading}>
                    {tgLoading ? '连接中…' : '测试并绑定'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="settings-section">
                  <div className="settings-row">
                    <div className="label-block">
                      <div className="title">已绑定 Telegram ✓</div>
                      <div className="desc">你的账号已和 Telegram 关联，可在下方管理通知。</div>
                    </div>
                    <button className="btn btn-secondary" onClick={unbindTelegram}>解除绑定</button>
                  </div>
                </div>
                <div className="settings-section">
                  <div className="settings-row">
                    <div className="label-block">
                      <div className="title">推送通知</div>
                      <div className="desc">开启后收到好友申请、私信、@提及 时推送到 Telegram。</div>
                    </div>
                    <ToggleSwitch defaultOn={tgEnabled} onChange={toggleTgNotify}/>
                  </div>
                </div>
                {tgError && <div style={{ color: 'var(--rust)', fontSize: 13 }}>{tgError}</div>}
              </>
            )}
          </>
        )}
      </div>

      <button className="close-corner" onClick={onClose}>
        <Icon name="close" size={18}/>
        <span className="hint">ESC</span>
      </button>
    </div>
  );
}

function ToggleSwitch({ defaultOn = false, onChange }) {
  const [on, setOn] = useStateM(defaultOn);
  return (
    <div className={`toggle ${on ? 'on' : ''}`} onClick={() => { setOn(!on); onChange?.(!on); }}/>
  );
}

Object.assign(window, {
  Modal,
  CreateServerModal,
  CreateChannelModal,
  CreateGroupModal,
  ServerSettingsModal,
  InviteModal,
  JoinRequestsModal,
  FriendRequestsModal,
  ProfileCard,
  Settings,
  ToggleSwitch,
});
