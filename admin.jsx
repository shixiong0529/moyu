// ─── Constants ──────────────────────────────────────────────────
const BASE = '';
const TOKEN_KEY = 'hearth-admin-token';
const REFRESH_KEY = 'hearth-admin-refresh';
const PAGE_SIZE = 50;

// ─── API client ─────────────────────────────────────────────────
const api = {
  _token: () => localStorage.getItem(TOKEN_KEY),
  async _refresh() {
    const rt = localStorage.getItem(REFRESH_KEY);
    if (!rt) return false;
    try {
      const res = await fetch(BASE + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
      return true;
    } catch { return false; }
  },
  _logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    window.location.reload();
  },
  async _req(method, path, body, retry = true) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(api._token() ? { Authorization: `Bearer ${api._token()}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      if (path.startsWith('/api/auth/')) {
        // 登录/刷新失败：抛错交给调用方展示，不触发登出/刷新
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }
      // access token 过期时先尝试用 refresh token 续期并重试，失败才登出
      if (retry && await api._refresh()) {
        return api._req(method, path, body, false);
      }
      api._logout();
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }
    return res.status === 204 ? null : res.json();
  },
  get: (path) => api._req('GET', path),
  post: (path, body) => api._req('POST', path, body),
  patch: (path, body) => api._req('PATCH', path, body),
  del: (path) => api._req('DELETE', path),
};

// ─── Hook ────────────────────────────────────────────────────────
function useAsync(fn, deps = []) {
  const [state, setState] = React.useState({ loading: true, data: null, error: null });
  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    fn().then(data => { if (!cancelled) setState({ loading: false, data, error: null }); })
       .catch(e => { if (!cancelled) setState({ loading: false, data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, deps);
  return state;
}

// ─── UI helpers ──────────────────────────────────────────────────
function Spinner() {
  return React.createElement('div', { style: { padding: 32, textAlign: 'center', color: 'var(--ink-2)' } }, '加载中…');
}
function Err({ msg }) {
  return React.createElement('div', { style: { padding: 16, color: '#e06c75' } }, '错误：' + msg);
}
function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 14, fontWeight: 600,
      background: color || 'var(--paper-2)',
      color: color ? '#fff' : 'var(--ink-1)',
    }}>{label}</span>
  );
}
function Btn({ onClick, children, danger, small, disabled, type }) {
  return (
    <button type={type || 'button'} onClick={onClick} disabled={disabled} style={{
      padding: small ? '4px 10px' : '7px 16px', fontSize: small ? 14 : 17,
      borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      background: danger ? '#e06c75' : 'var(--accent)', color: 'var(--accent-ink, #fff)',
      opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}
function Input({ value, onChange, placeholder, onKeyDown, type }) {
  return (
    <input type={type || 'text'} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown}
      style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 17, boxSizing: 'border-box' }} />
  );
}
function Card({ label, value }) {
  return (
    <div style={{ background: 'var(--paper-1)', borderRadius: 10, padding: '20px 16px', border: '1px solid var(--paper-2)' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{String(value)}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
function InfoRow({ label, value }) {
  return (
    <div style={{ background: 'var(--paper-1)', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{label}</div>
      <div style={{ fontSize: 16, marginTop: 4 }}>{String(value ?? '-')}</div>
    </div>
  );
}
function Flash({ msg }) {
  if (!msg) return null;
  return <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, fontSize: 13 }}>{msg}</div>;
}
function Table({ cols, rows, onRowClick }) {
  return (
    <table style={{ width: 'auto', borderCollapse: 'collapse', fontSize: 16 }}>
      <thead>
        <tr>{cols.map(c => (
          <th key={c.key} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--paper-2)', color: 'var(--ink-2)', fontWeight: 600 }}>{c.label}</th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id ?? i} onClick={() => onRowClick && onRowClick(row)}
            style={{ cursor: onRowClick ? 'pointer' : 'default', borderBottom: '1px solid var(--paper-2)' }}
            onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'var(--paper-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
            {cols.map(c => (
              <td key={c.key} style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-2)' }}>暂无数据</td></tr>
        )}
      </tbody>
    </table>
  );
}
function SearchBar({ value, onChange, onSearch, placeholder }) {
  return (
    <div style={{ display: 'inline-flex', gap: 8, marginBottom: 16 }}>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || '搜索…'}
        onKeyDown={e => e.key === 'Enter' && onSearch(value)}
        style={{ width: 300, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 17 }} />
      <Btn onClick={() => onSearch(value)}>搜索</Btn>
    </div>
  );
}
function BackBtn({ onClick }) {
  return <div style={{ marginBottom: 16 }}><Btn small onClick={onClick}>← 返回</Btn></div>;
}
// 简单翻页：后端返回数组无总数，满页(=PAGE_SIZE)即认为可能还有下一页
function Pager({ page, setPage, count, loading }) {
  const hasPrev = page > 0;
  const hasNext = count >= PAGE_SIZE;
  if (!hasPrev && !hasNext) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
      <Btn small disabled={!hasPrev || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>← 上一页</Btn>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>第 {page + 1} 页</span>
      <Btn small disabled={!hasNext || loading} onClick={() => setPage(p => p + 1)}>下一页 →</Btn>
    </div>
  );
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '-'; }
function fmtTime(d) { return d ? new Date(d).toLocaleString('zh-CN') : '-'; }

// ─── Login ───────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await api.post('/api/auth/login', { username, password });
      localStorage.setItem(TOKEN_KEY, res.access_token);
      localStorage.setItem(REFRESH_KEY, res.refresh_token);
      const me = await api.get('/api/users/me');
      if (!me.is_admin) {
        localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY);
        setError('该账号没有管理员权限');
        return;
      }
      onLogin(me);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-0)' }}>
      <form onSubmit={handleSubmit} style={{ width: 320, background: 'var(--paper-1)', borderRadius: 12, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,.2)' }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 20, color: 'var(--ink-0)', textAlign: 'center' }}>摸鱼社区 · 管理后台</h2>
        {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, color: '#e06c75', fontSize: 13 }}>{error}</div>}
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>用户名</span>
          <input value={username} onChange={e => setUsername(e.target.value)} required
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 17, boxSizing: 'border-box' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>密码</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 17, boxSizing: 'border-box' }} />
        </label>
        <div style={{ textAlign: 'center' }}>
          <Btn type="submit" disabled={loading}>{loading ? '登录中…' : '登录'}</Btn>
        </div>
      </form>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: '📊 概览' },
  { id: 'users', label: '👤 用户管理' },
  { id: 'servers', label: '🏠 服务器管理' },
  { id: 'bots', label: '🤖 机器人' },
  { id: 'reports', label: '🚨 举报队列' },
  { id: 'invites', label: '🔗 邀请码' },
  { id: 'join-requests', label: '📋 加入申请' },
  { id: 'audit-logs', label: '📜 操作日志' },
];

function AdminSidebar({ page, onNav, onLogout, adminUser }) {
  return (
    <div style={{ width: 200, background: 'var(--paper-1)', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--paper-2)', flexShrink: 0 }}>
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--paper-2)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-0)' }}>管理后台</div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 2 }}>{adminUser?.display_name}</div>
      </div>
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map(n => (
          <div key={n.id} onClick={() => onNav(n.id)}
            style={{
              padding: '9px 16px', cursor: 'pointer', fontSize: 15,
              color: page === n.id ? 'var(--accent)' : 'var(--ink-1)',
              background: page === n.id ? 'var(--paper-2)' : 'transparent',
              borderLeft: page === n.id ? '3px solid var(--accent)' : '3px solid transparent',
            }}>{n.label}</div>
        ))}
      </nav>
      <div style={{ padding: 16, borderTop: '1px solid var(--paper-2)' }}>
        <Btn small danger onClick={onLogout}>退出登录</Btn>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────
function DashboardPage() {
  const { loading, data, error } = useAsync(() => api.get('/api/admin/stats'), []);
  if (loading) return <Spinner />;
  if (error) return <Err msg={error} />;
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18 }}>概览</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        <Card label="注册用户" value={data.total_users.toLocaleString()} />
        <Card label="服务器" value={data.total_servers.toLocaleString()} />
        <Card label="频道" value={data.total_channels.toLocaleString()} />
        <Card label="消息数" value={data.total_messages.toLocaleString()} />
        <Card label="今日新增" value={data.new_users_today.toLocaleString()} />
        <Card label="待处理举报" value={data.pending_reports.toLocaleString()} />
      </div>
    </div>
  );
}

// ─── Users ───────────────────────────────────────────────────────
function UsersPage({ onNav }) {
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/users?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`), [search, page]);
  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.id}</span> },
    { key: 'username', label: '用户名' },
    { key: 'display_name', label: '显示名' },
    { key: 'status', label: '在线', render: r => <Badge label={r.status} /> },
    { key: 'flags', label: '标记', render: r => <span>{r.is_admin ? <Badge label="管理员" color="var(--accent-soft,#3d7)" /> : null}{r.is_banned ? <Badge label="封禁" color="#e06c7540" /> : null}</span> },
    { key: 'created_at', label: '注册', render: r => fmtDate(r.created_at) },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>用户管理</h2>
      <SearchBar value={q} onChange={setQ} onSearch={v => { setSearch(v); setPage(0); }} placeholder="搜索用户名 / 显示名" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} onRowClick={r => onNav('user-detail', { userId: r.id })} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </div>
  );
}

function UserDetailPage({ userId, onBack }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: user, error } = useAsync(() => api.get(`/api/admin/users/${userId}`), [userId, rev]);
  const [banReason, setBanReason] = React.useState('');
  const [msg, setMsg] = React.useState('');

  async function act(fn, afterFn) {
    try { await fn(); setMsg('操作成功'); if (afterFn) afterFn(); else setRev(r => r + 1); }
    catch (e) { setMsg(e.message); }
  }

  if (loading) return <Spinner />;
  if (error) return <Err msg={error} />;
  return (
    <div style={{ padding: 24 }}>
      <BackBtn onClick={onBack} />
      <h2 style={{ margin: '0 0 20px' }}>{user.display_name} <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>@{user.username}</span></h2>
      <Flash msg={msg} />
      <div style={{ display: 'inline-grid', gridTemplateColumns: 'auto auto', gap: 12, marginBottom: 24 }}>
        <InfoRow label="ID" value={user.id} />
        <InfoRow label="状态" value={user.status} />
        <InfoRow label="管理员" value={user.is_admin ? '是' : '否'} />
        <InfoRow label="封禁" value={user.is_banned ? `是：${user.banned_reason}` : '否'} />
        <InfoRow label="注册时间" value={fmtTime(user.created_at)} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="封禁原因（必填）" />
          <Btn danger onClick={() => { if (!banReason.trim()) { setMsg('请填写封禁原因'); return; } act(() => api.post(`/api/admin/users/${userId}/ban`, { reason: banReason })); }}>封禁</Btn>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={() => act(() => api.post(`/api/admin/users/${userId}/unban`))}>解封</Btn>
          <Btn onClick={() => act(() => api.patch(`/api/admin/users/${userId}/admin`, { is_admin: !user.is_admin }))}>
            {user.is_admin ? '撤销管理员' : '提升为管理员'}
          </Btn>
        </div>
        <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--paper-2)' }}>
          <Btn danger onClick={async () => {
            if (!confirm(`确认永久删除用户「${user.username}」？\n此操作不可撤销：其消息、私信、好友关系将被永久删除，其创建的服务器将被删除。`)) return;
            try { await api.del(`/api/admin/users/${userId}`); onBack(); }
            catch (e) { setMsg(e.message); }
          }}>永久删除用户</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Servers ─────────────────────────────────────────────────────
function ServersPage({ onNav }) {
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/servers?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`), [search, page]);
  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.id}</span> },
    { key: 'name', label: '名称' },
    { key: 'member_count', label: '成员数' },
    { key: 'join_policy', label: '加入策略', render: r => <Badge label={r.join_policy} /> },
    { key: 'is_recommended', label: '推荐', render: r => r.is_recommended ? <Badge label="推荐" color="var(--accent-soft,#3d7)" /> : null },
    { key: 'auto_join', label: '默认加入', render: r => r.auto_join ? <Badge label="是" color="var(--accent)" /> : <span style={{ color: 'var(--ink-2)' }}>否</span> },
    { key: 'join_order', label: '排序', render: r => r.join_order === 999 || r.join_order == null ? <span style={{ color: 'var(--ink-2)' }}>—</span> : r.join_order },
    { key: 'created_at', label: '创建', render: r => fmtDate(r.created_at) },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>服务器管理</h2>
      <SearchBar value={q} onChange={setQ} onSearch={v => { setSearch(v); setPage(0); }} placeholder="搜索服务器名" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} onRowClick={r => onNav('server-detail', { serverId: r.id })} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </div>
  );
}

function ServerDetailPage({ serverId, onBack }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: server, error } = useAsync(() => api.get(`/api/admin/servers/${serverId}`), [serverId, rev]);
  const { data: channels } = useAsync(() => api.get(`/api/admin/servers/${serverId}/channels`), [serverId, rev]);
  const [msg, setMsg] = React.useState('');

  async function act(fn, afterFn) {
    try { await fn(); setMsg('操作成功'); if (afterFn) afterFn(); else setRev(r => r + 1); }
    catch (e) { setMsg(e.message); }
  }

  if (loading) return <Spinner />;
  if (error) return <Err msg={error} />;
  return (
    <div style={{ padding: 24 }}>
      <BackBtn onClick={onBack} />
      <h2 style={{ margin: '0 0 20px' }}>{server.name}</h2>
      <Flash msg={msg} />
      <div style={{ display: 'inline-grid', gridTemplateColumns: 'auto auto', gap: 12, marginBottom: 20 }}>
        <InfoRow label="成员数" value={server.member_count} />
        <InfoRow label="加入策略" value={{ open: '自由加入', approval: '需要审核', closed: '禁止加入' }[server.join_policy] || server.join_policy} />
        <InfoRow label="推荐" value={server.is_recommended ? '是' : '否'} />
        <InfoRow label="创建时间" value={fmtTime(server.created_at)} />
        <InfoRow label="创建人" value={server.owner_display_name ? `${server.owner_display_name}（@${server.owner_username}）` : `已删除用户（ID: ${server.owner_id}）`} />
        <InfoRow label="管理员" value={server.mods && server.mods.length > 0 ? server.mods.join('、') : '无'} />
        <InfoRow label="新用户默认加入" value={server.auto_join ? '是' : '否'} />
        <InfoRow label="默认加入顺序" value={server.join_order === 999 ? '未设置' : server.join_order} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Btn onClick={() => act(() => api.patch(`/api/admin/servers/${serverId}/recommended`))}>
          {server.is_recommended ? '取消推荐' : '设为推荐'}
        </Btn>
        <Btn onClick={() => act(() => api.patch(`/api/admin/servers/${serverId}/admin-settings`, { auto_join: !server.auto_join }))}>
          {server.auto_join ? '✓ 新用户默认加入（点击关闭）' : '设为新用户默认加入'}
        </Btn>
        <Btn danger onClick={() => { if (!confirm('确认强制删除该服务器？此操作不可撤销。')) return; act(() => api.del(`/api/admin/servers/${serverId}`), onBack); }}>
          强制删除
        </Btn>
      </div>
      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>新用户加入顺序（数字越小越靠前）：</span>
        <input type="number" defaultValue={server.join_order} id={`join-order-${serverId}`}
          style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 15 }} />
        <Btn small onClick={() => {
          const val = parseInt(document.getElementById(`join-order-${serverId}`).value);
          if (!isNaN(val)) act(() => api.patch(`/api/admin/servers/${serverId}/admin-settings`, { join_order: val }));
        }}>保存</Btn>
      </div>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>频道列表</h3>
      <Table
        cols={[
          { key: 'name', label: '频道名' },
          { key: 'kind', label: '类型', render: r => <Badge label={r.kind} /> },
          { key: 'actions', label: '', render: r => (
            <Btn small danger onClick={e => { e.stopPropagation(); if (!confirm(`删除频道「${r.name}」？`)) return; act(() => api.del(`/api/admin/channels/${r.id}`)); }}>删除</Btn>
          )},
        ]}
        rows={channels || []}
      />
    </div>
  );
}

// ─── Reports ─────────────────────────────────────────────────────
function ReportsPage({ onNav }) {
  const [statusFilter, setStatusFilter] = React.useState('pending');
  const [page, setPage] = React.useState(0);
  const { loading, data, error } = useAsync(
    () => api.get(`/api/admin/reports?status_filter=${statusFilter}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`),
    [statusFilter, page]
  );
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'target_type', label: '类型', render: r => <Badge label={r.target_type} /> },
    { key: 'reason', label: '原因', render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.reason}</span> },
    { key: 'status', label: '状态', render: r => <Badge label={r.status} color={r.status === 'pending' ? 'var(--accent-soft,#3d7)' : undefined} /> },
    { key: 'created_at', label: '时间', render: r => fmtDate(r.created_at) },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>举报队列</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['pending', '待处理'], ['resolved', '已处理'], ['dismissed', '已驳回'], ['', '全部']].map(([s, label]) => (
          <Btn key={s} small onClick={() => { setStatusFilter(s); setPage(0); }}
            style={{ opacity: statusFilter === s ? 1 : 0.6 }}>{label}</Btn>
        ))}
      </div>
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} onRowClick={r => onNav('report-detail', { reportId: r.id })} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </div>
  );
}

function ReportDetailPage({ reportId, onBack, onNav }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: report, error } = useAsync(() => api.get(`/api/admin/reports/${reportId}`), [reportId, rev]);
  const [note, setNote] = React.useState('');
  const [banReason, setBanReason] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function act(action) {
    setBusy(true);
    try { await api.post(`/api/admin/reports/${reportId}/${action}`, { note }); setMsg('操作成功'); setRev(r => r + 1); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  // 对被举报对象采取处置，成功后把该举报标记为已处理（闭环）
  async function takeAction(doIt, autoNote) {
    setBusy(true); setMsg('');
    try {
      await doIt();
      await api.post(`/api/admin/reports/${reportId}/resolve`, { note: note || autoNote });
      setMsg('已处置并标记为已处理');
      setRev(r => r + 1);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (loading) return <Spinner />;
  if (error) return <Err msg={error} />;
  const t = report.target_type, tid = report.target_id;
  return (
    <div style={{ padding: 24 }}>
      <BackBtn onClick={onBack} />
      <h2 style={{ margin: '0 0 20px' }}>举报详情 #{report.id}</h2>
      <Flash msg={msg} />
      <div style={{ display: 'inline-grid', gridTemplateColumns: 'auto auto', gap: 12, marginBottom: 20 }}>
        <InfoRow label="举报类型" value={t} />
        <InfoRow label="目标 ID" value={tid} />
        <InfoRow label="状态" value={report.status} />
        <InfoRow label="原因" value={report.reason} />
        {report.content_snapshot && <InfoRow label="内容快照" value={report.content_snapshot} />}
        {report.resolution_note && <InfoRow label="处理备注" value={report.resolution_note} />}
      </div>
      {report.status === 'pending' && (
        <>
          <div style={{ background: 'var(--paper-1)', border: '1px solid var(--paper-2)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>处置被举报对象</div>
            {t === 'message' && (
              <Btn danger disabled={busy} onClick={() => { if (!confirm('删除这条被举报的消息？')) return; takeAction(() => api.del(`/api/messages/${tid}`), '已删除被举报消息'); }}>
                删除该消息并标记已处理
              </Btn>
            )}
            {t === 'user' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="封禁原因（必填）" />
                  <Btn danger disabled={busy} onClick={() => { if (!banReason.trim()) { setMsg('请填写封禁原因'); return; } if (!confirm('封禁被举报用户？')) return; takeAction(() => api.post(`/api/admin/users/${tid}/ban`, { reason: banReason }), '已封禁被举报用户'); }}>封禁该用户并标记已处理</Btn>
                </div>
                <div><Btn small onClick={() => onNav && onNav('user-detail', { userId: tid })}>查看该用户 →</Btn></div>
              </div>
            )}
            {t === 'server' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn danger disabled={busy} onClick={() => { if (!confirm('强制删除被举报服务器？不可撤销。')) return; takeAction(() => api.del(`/api/admin/servers/${tid}`), '已删除被举报服务器'); }}>删除该服务器并标记已处理</Btn>
                <Btn small onClick={() => onNav && onNav('server-detail', { serverId: tid })}>查看该服务器 →</Btn>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="处理备注（可选）" />
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn disabled={busy} onClick={() => act('resolve')}>仅标记已处理</Btn>
              <Btn danger disabled={busy} onClick={() => act('dismiss')}>驳回举报</Btn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Invites ─────────────────────────────────────────────────────
function InvitesPage() {
  const [serverId, setServerId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const [rev, setRev] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const url = `/api/admin/invites?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${search ? `&server_id=${search}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [search, rev, page]);

  async function doRevoke(code) {
    if (!confirm(`撤销邀请码 ${code}？`)) return;
    try { await api.del(`/api/admin/invites/${code}`); setMsg(`已撤销 ${code}`); setRev(r => r + 1); }
    catch (e) { setMsg(e.message); }
  }

  const cols = [
    { key: 'code', label: '邀请码' },
    { key: 'server_id', label: '服务器 ID' },
    { key: 'uses', label: '已用' },
    { key: 'max_uses', label: '上限', render: r => r.max_uses ?? '无限' },
    { key: 'expires_at', label: '过期', render: r => r.expires_at ? fmtDate(r.expires_at) : '永不' },
    { key: 'actions', label: '', render: r => <Btn small danger onClick={e => { e.stopPropagation(); doRevoke(r.code); }}>撤销</Btn> },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>邀请码管理</h2>
      <Flash msg={msg} />
      <SearchBar value={serverId} onChange={setServerId} onSearch={v => { setSearch(v); setPage(0); }} placeholder="按服务器 ID 筛选（留空显示全部）" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </div>
  );
}

// ─── Join Requests ────────────────────────────────────────────────
function JoinRequestsPage() {
  const [serverId, setServerId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const url = `/api/admin/join-requests?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${search ? `&server_id=${search}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [search, page]);
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'server_id', label: '服务器 ID' },
    { key: 'user_id', label: '用户 ID' },
    { key: 'status', label: '状态', render: r => <Badge label={r.status} /> },
    { key: 'note', label: '申请理由', render: r => r.note || '-' },
    { key: 'created_at', label: '时间', render: r => fmtDate(r.created_at) },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>加入申请</h2>
      <SearchBar value={serverId} onChange={setServerId} onSearch={v => { setSearch(v); setPage(0); }} placeholder="按服务器 ID 筛选（留空显示全部）" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </div>
  );
}

// ─── Audit Logs ──────────────────────────────────────────────────
const AUDIT_ACTIONS = ['ban_user','unban_user','grant_admin','revoke_admin','delete_user','delete_server','toggle_recommended','update_server_settings','delete_channel','delete_channel_group','resolve_report','dismiss_report','revoke_invite','create_bot','update_bot','delete_bot','start_bot','stop_bot'];

function AuditLogPage() {
  const [action, setAction] = React.useState('');
  const [page, setPage] = React.useState(0);
  const url = `/api/admin/audit-logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${action ? `&action=${action}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [action, page]);
  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.id}</span> },
    { key: 'admin_id', label: '管理员 ID' },
    { key: 'action', label: '操作', render: r => <Badge label={r.action} /> },
    { key: 'target_type', label: '对象类型' },
    { key: 'target_id', label: '对象 ID' },
    { key: 'created_at', label: '时间', render: r => fmtTime(r.created_at) },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>操作日志</h2>
      <div style={{ marginBottom: 16 }}>
        <select value={action} onChange={e => { setAction(e.target.value); setPage(0); }}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }}>
          <option value="">全部操作</option>
          {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────
function AdminShell({ adminUser }) {
  const [nav, setNav] = React.useState({ page: 'dashboard', params: {} });
  function goTo(page, params = {}) { setNav({ page, params }); }
  function logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); window.location.reload(); }

  function renderPage() {
    const { page, params } = nav;
    switch (page) {
      case 'dashboard':     return <DashboardPage />;
      case 'users':         return <UsersPage onNav={goTo} />;
      case 'user-detail':   return <UserDetailPage userId={params.userId} onBack={() => goTo('users')} />;
      case 'servers':       return <ServersPage onNav={goTo} />;
      case 'server-detail': return <ServerDetailPage serverId={params.serverId} onBack={() => goTo('servers')} />;
      case 'reports':       return <ReportsPage onNav={goTo} />;
      case 'report-detail': return <ReportDetailPage reportId={params.reportId} onBack={() => goTo('reports')} onNav={goTo} />;
      case 'invites':       return <InvitesPage />;
      case 'join-requests': return <JoinRequestsPage />;
      case 'audit-logs':    return <AuditLogPage />;
      case 'bots':          return <BotsPage onNav={goTo} />;
      case 'bot-detail':    return <BotDetailPage botId={params.botId} onBack={() => goTo('bots')} />;
      default:              return <DashboardPage />;
    }
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--paper-0)', color: 'var(--ink-0)' }}>
      <AdminSidebar page={nav.page} onNav={goTo} onLogout={logout} adminUser={adminUser} />
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>{renderPage()}</main>
    </div>
  );
}

// ─── Bots ────────────────────────────────────────────────────────

const LLM_PRESETS = [
  { label: 'DeepSeek', base_url: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { label: 'Kimi', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { label: '自定义', base_url: '', model: '' },
];

const sectionBox = { background: 'var(--paper-1)', borderRadius: 8, padding: '16px 20px', border: '1px solid var(--paper-2)', marginBottom: 14 };
const fldLabel = { display: 'block', fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 };
const fldRow = { marginBottom: 12 };
const fullInput = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 15, boxSizing: 'border-box' };

function BotCreateModal({ onClose, onCreated }) {
  const [form, setForm] = React.useState({
    name: '', username: '', password: '', display_name: '',
    llm_api_key: '', llm_base_url: 'https://api.deepseek.com', llm_model: 'deepseek-chat',
    system_prompt: '你是摸鱼社区的 AI 助手，风格轻松友好，回答简洁，适当使用中文网络用语。',
  });
  const [preset, setPreset] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }
  function applyPreset(idx) {
    setPreset(idx);
    const p = LLM_PRESETS[idx];
    if (p.base_url) setForm(f => ({ ...f, llm_base_url: p.base_url, llm_model: p.model }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setErr('');
    try { const bot = await api.post('/api/admin/bots', form); onCreated(bot); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--paper-1)', borderRadius: 8, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>新建机器人</div>
        <form onSubmit={submit}>
          <div style={fldRow}><label style={fldLabel}>备注名</label><input style={fullInput} value={form.name} onChange={set('name')} placeholder="如：摸鱼助手" /></div>
          <div style={fldRow}><label style={fldLabel}>用户名（英文+数字+下划线）</label><input style={fullInput} value={form.username} onChange={set('username')} placeholder="moyu_bot" /></div>
          <div style={fldRow}><label style={fldLabel}>密码</label><input style={fullInput} type="password" value={form.password} onChange={set('password')} placeholder="至少6位" /></div>
          <div style={fldRow}><label style={fldLabel}>显示名（聊天中显示）</label><input style={fullInput} value={form.display_name} onChange={set('display_name')} placeholder="摸鱼助手" /></div>
          <div style={fldRow}>
            <label style={fldLabel}>大模型预设</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LLM_PRESETS.map((p, i) => (
                <button type="button" key={i} onClick={() => applyPreset(i)}
                  style={{ padding: '4px 10px', fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: preset === i ? 'var(--accent)' : 'var(--paper-2)',
                    color: preset === i ? 'var(--accent-ink, #fff)' : 'var(--ink-1)' }}>{p.label}</button>
              ))}
            </div>
          </div>
          <div style={fldRow}><label style={fldLabel}>API Key</label><input style={fullInput} value={form.llm_api_key} onChange={set('llm_api_key')} placeholder="sk-..." /></div>
          <div style={fldRow}><label style={fldLabel}>Base URL</label><input style={fullInput} value={form.llm_base_url} onChange={set('llm_base_url')} /></div>
          <div style={fldRow}><label style={fldLabel}>模型名</label><input style={fullInput} value={form.llm_model} onChange={set('llm_model')} /></div>
          <div style={fldRow}><label style={fldLabel}>System Prompt</label>
            <textarea style={{ ...fullInput, resize: 'vertical' }} value={form.system_prompt} onChange={set('system_prompt')} rows={3} />
          </div>
          {err && <Err msg={err} />}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn onClick={onClose}>取消</Btn>
            <Btn type="submit" disabled={saving}>{saving ? '创建中…' : '创建'}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function BotsPage({ onNav }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: bots, error } = useAsync(() => api.get('/api/admin/bots'), [rev]);
  const [showCreate, setShowCreate] = React.useState(false);
  const [toggling, setToggling] = React.useState({});
  const [msg, setMsg] = React.useState('');

  async function toggle(bot) {
    setToggling(t => ({ ...t, [bot.id]: true }));
    try {
      await api.post(`/api/admin/bots/${bot.id}/${bot.is_active ? 'stop' : 'start'}`);
      setRev(r => r + 1);
    } catch (e) { setMsg(e.message); }
    finally { setToggling(t => ({ ...t, [bot.id]: false })); }
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>机器人管理</div>
        <Btn onClick={() => setShowCreate(true)}>+ 新建机器人</Btn>
      </div>
      <Flash msg={msg} />
      {loading && <Spinner />}
      {error && <Err msg={error} />}
      {bots && (
        <div style={{ background: 'var(--paper-1)', borderRadius: 8, border: '1px solid var(--paper-2)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--paper-2)', color: 'var(--ink-2)', fontSize: 13 }}>
                {['名称','用户名','显示名','模型','状态','操作'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bots.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ink-2)' }}>暂无机器人</td></tr>
              )}
              {bots.map(bot => (
                <tr key={bot.id} style={{ borderBottom: '1px solid var(--paper-2)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }} onClick={() => onNav('bot-detail', { botId: bot.id })}>{bot.name}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink-2)', fontSize: 13 }}>@{bot.username}</td>
                  <td style={{ padding: '10px 12px' }}>{bot.display_name}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ink-2)' }}>{bot.llm_model}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge label={bot.is_active ? '运行中' : '已停止'} color={bot.is_active ? '#3a9d5c' : ''} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Btn small danger={bot.is_active} disabled={toggling[bot.id]} onClick={() => toggle(bot)}>
                      {toggling[bot.id] ? '…' : bot.is_active ? '停止' : '启动'}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && (
        <BotCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setRev(r => r + 1); }}
        />
      )}
    </div>
  );
}

function BotDetailPage({ botId, onBack }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: bot, error } = useAsync(() => api.get(`/api/admin/bots/${botId}`), [botId, rev]);
  const { data: allChannels } = useAsync(() => api.get(`/api/admin/bots/${botId}/available-channels`), [botId]);
  const [form, setForm] = React.useState(null);
  const [preset, setPreset] = React.useState(0);
  const [msg, setMsg] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);

  React.useEffect(() => {
    if (bot) {
      setForm({ name: bot.name, display_name: bot.display_name, password: '',
        llm_api_key: '', llm_base_url: bot.llm_base_url, llm_model: bot.llm_model,
        system_prompt: bot.system_prompt, channel_ids: bot.channel_ids || [] });
      const idx = LLM_PRESETS.findIndex(p => p.base_url === bot.llm_base_url);
      setPreset(idx >= 0 ? idx : 3);
    }
  }, [bot]);

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }
  function applyPreset(idx) {
    setPreset(idx);
    const p = LLM_PRESETS[idx];
    if (p.base_url) setForm(f => ({ ...f, llm_base_url: p.base_url, llm_model: p.model }));
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      const patch = { ...form };
      if (!patch.password) delete patch.password;
      if (!patch.llm_api_key) delete patch.llm_api_key;
      await api.patch(`/api/admin/bots/${botId}`, patch);
      setMsg('保存成功');
      setRev(r => r + 1);
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  async function toggleActive() {
    setToggling(true); setMsg('');
    try {
      await api.post(`/api/admin/bots/${botId}/${bot.is_active ? 'stop' : 'start'}`);
      setRev(r => r + 1);
    } catch (e) { setMsg(e.message); }
    finally { setToggling(false); }
  }

  async function deleteBot() {
    if (!confirm(`确认删除机器人「${bot.name}」？此操作将同时删除其用户账号。`)) return;
    try { await api.del(`/api/admin/bots/${botId}`); onBack(); }
    catch (e) { setMsg(e.message); }
  }

  function toggleChannel(chId) {
    setForm(f => {
      const ids = f.channel_ids.includes(chId) ? f.channel_ids.filter(x => x !== chId) : [...f.channel_ids, chId];
      return { ...f, channel_ids: ids };
    });
  }

  if (loading) return <div style={{ padding: 32 }}><Spinner /></div>;
  if (error) return <div style={{ padding: 32 }}><Err msg={error} /></div>;
  if (!form) return null;

  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={onBack} />
        <div style={{ fontSize: 20, fontWeight: 700 }}>{bot.name}</div>
        <Badge label={bot.is_active ? '运行中' : '已停止'} color={bot.is_active ? '#3a9d5c' : ''} />
        <div style={{ marginLeft: 'auto' }}>
          <Btn danger={bot.is_active} disabled={toggling} onClick={toggleActive}>
            {toggling ? '…' : bot.is_active ? '停止服务' : '启动服务'}
          </Btn>
        </div>
      </div>
      <Flash msg={msg} />

      <div style={sectionBox}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>基本信息</div>
        <div style={fldRow}><label style={fldLabel}>备注名</label><input style={fullInput} value={form.name} onChange={set('name')} /></div>
        <div style={{ ...fldRow, fontSize: 14, color: 'var(--ink-2)' }}>用户名：@{bot.username}</div>
        <div style={fldRow}><label style={fldLabel}>显示名</label><input style={fullInput} value={form.display_name} onChange={set('display_name')} /></div>
        <div style={fldRow}><label style={fldLabel}>修改密码（留空则不变）</label><input style={fullInput} type="password" value={form.password} onChange={set('password')} placeholder="留空保持原密码" /></div>
      </div>

      <div style={sectionBox}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>大模型配置</div>
        <div style={fldRow}>
          <label style={fldLabel}>预设</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LLM_PRESETS.map((p, i) => (
              <button type="button" key={i} onClick={() => applyPreset(i)}
                style={{ padding: '4px 10px', fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: preset === i ? 'var(--accent)' : 'var(--paper-2)',
                  color: preset === i ? 'var(--accent-ink, #fff)' : 'var(--ink-1)' }}>{p.label}</button>
            ))}
          </div>
        </div>
        <div style={fldRow}><label style={fldLabel}>API Key（留空则不修改）</label><input style={fullInput} value={form.llm_api_key} onChange={set('llm_api_key')} placeholder="留空保持原 key" /></div>
        <div style={fldRow}><label style={fldLabel}>Base URL</label><input style={fullInput} value={form.llm_base_url} onChange={set('llm_base_url')} /></div>
        <div style={fldRow}><label style={fldLabel}>模型名</label><input style={fullInput} value={form.llm_model} onChange={set('llm_model')} /></div>
        <div style={fldRow}><label style={fldLabel}>System Prompt</label>
          <textarea style={{ ...fullInput, resize: 'vertical' }} value={form.system_prompt} onChange={set('system_prompt')} rows={3} />
        </div>
      </div>

      <div style={sectionBox}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>监听频道</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>留空则自动监听管理员服务器所有文字频道</div>
        {allChannels && allChannels.map(srv => (
          <div key={srv.server_id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 4 }}>{srv.server_name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {srv.channels.map(ch => {
                const selected = form.channel_ids.includes(ch.id);
                return (
                  <div key={ch.id} onClick={() => toggleChannel(ch.id)}
                    style={{ padding: '3px 10px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                      background: selected ? 'var(--accent)' : 'var(--paper-2)',
                      color: selected ? 'var(--accent-ink, #fff)' : 'var(--ink-1)' }}>#{ch.name}</div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <Btn danger onClick={deleteBot}>删除机器人</Btn>
        <Btn disabled={saving} onClick={save}>{saving ? '保存中…' : '保存更改'}</Btn>
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────
function AdminApp() {
  const [adminUser, setAdminUser] = React.useState(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setChecking(false); return; }
    api.get('/api/users/me')
      .then(me => { if (me?.is_admin) setAdminUser(me); else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); } })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); })
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="app theme-forest density-default" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--paper-0)' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="app theme-forest density-default" style={{ width: '100vw', height: '100vh', overflow: 'hidden', fontSize: 17 }}>
      {adminUser ? <AdminShell adminUser={adminUser} /> : <AdminLogin onLogin={setAdminUser} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AdminApp />);
