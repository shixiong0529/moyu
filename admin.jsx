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

// ─── Hooks ───────────────────────────────────────────────────────
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
// 统一操作反馈：成功/失败分别染色，避免用户误把报错当成功
function useFlash() {
  const [flash, setFlash] = React.useState(null); // { text, ok }
  const ok = text => setFlash({ text, ok: true });
  const err = text => setFlash({ text: typeof text === 'string' ? text : text.message, ok: false });
  const clear = () => setFlash(null);
  return [flash, ok, err, clear];
}

// ─── UI primitives ─────────────────────────────────────────────────
function Spinner() {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-2)', fontSize: 14 }}>加载中…</div>;
}
function Err({ msg }) {
  return <div className="adm-flash error" style={{ marginBottom: 0 }}>错误：{msg}</div>;
}
function Badge({ label, tone }) {
  return <span className={`adm-badge${tone ? ' ' + tone : ''}`}>{label}</span>;
}
function Btn({ onClick, children, danger, ghost, small, active, disabled, type, title }) {
  const cls = ['adm-btn', danger && 'danger', ghost && 'ghost', small && 'small', active && 'active'].filter(Boolean).join(' ');
  return <button type={type || 'button'} onClick={onClick} disabled={disabled} className={cls} title={title}>{children}</button>;
}
function Input({ value, onChange, placeholder, onKeyDown, type, style }) {
  return <input type={type || 'text'} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown}
    className="adm-input" style={{ flex: 1, ...style }} />;
}
function Field({ label, hint, children }) {
  return (
    <div className="adm-field">
      <label>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
function StatCard({ label, value }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-value">{String(value)}</div>
      <div className="adm-stat-label">{label}</div>
    </div>
  );
}
function DetailGrid({ children }) {
  return <div className="adm-detail-grid">{children}</div>;
}
function DetailCell({ label, value }) {
  return (
    <div className="adm-detail-cell">
      <div className="adm-detail-label">{label}</div>
      <div className="adm-detail-value">{value === undefined || value === null || value === '' ? '-' : value}</div>
    </div>
  );
}
function Flash({ flash }) {
  if (!flash) return null;
  return <div className={`adm-flash ${flash.ok ? 'ok' : 'error'}`}>{flash.text}</div>;
}
function Panel({ title, hint, children, style }) {
  return (
    <div className="adm-panel" style={style}>
      {title && <div className="adm-panel-title">{title}</div>}
      {hint && <div className="adm-panel-hint">{hint}</div>}
      {children}
    </div>
  );
}
function Table({ cols, rows, onRowClick }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>{cols.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className={onRowClick ? 'clickable' : ''} onClick={() => onRowClick && onRowClick(row)}>
              {cols.map(c => <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} className="adm-table-empty">暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function SearchBar({ value, onChange, onSearch, placeholder }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 20, maxWidth: 420 }}>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || '搜索…'}
        onKeyDown={e => e.key === 'Enter' && onSearch(value)} />
      <Btn onClick={() => onSearch(value)}>搜索</Btn>
    </div>
  );
}
function FilterPills({ options, value, onChange }) {
  return (
    <div className="adm-filter-row">
      {options.map(([v, label]) => (
        <Btn key={v} small ghost active={value === v} onClick={() => onChange(v)}>{label}</Btn>
      ))}
    </div>
  );
}
// 简单翻页：后端返回数组无总数，满页(=PAGE_SIZE)即认为可能还有下一页
function Pager({ page, setPage, count, loading }) {
  const hasPrev = page > 0;
  const hasNext = count >= PAGE_SIZE;
  if (!hasPrev && !hasNext) return null;
  return (
    <div className="adm-pager">
      <Btn small ghost disabled={!hasPrev || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>← 上一页</Btn>
      <span className="adm-pager-info">第 {page + 1} 页</span>
      <Btn small ghost disabled={!hasNext || loading} onClick={() => setPage(p => p + 1)}>下一页 →</Btn>
    </div>
  );
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '-'; }
function fmtTime(d) { return d ? new Date(d).toLocaleString('zh-CN') : '-'; }

// ─── Page shell: 统一每个页面的标题栏 / 宽度 / 间距 ───────────────
function Page({ title, subtitle, back, actions, children }) {
  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div className="adm-title-row">
          {back && <Btn small ghost onClick={back}>← 返回</Btn>}
          <div>
            <h1 className="adm-title">{title}</h1>
            {subtitle && <div className="adm-subtitle">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="adm-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

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
    <div className="adm-login-wrap">
      <form onSubmit={handleSubmit} className="adm-login-card">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div className="adm-brand-mark" style={{ width: 40, height: 40, fontSize: 18, borderRadius: 12 }}>摸</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-0)' }}>摸鱼社区 · 管理后台</div>
        </div>
        {error && <div className="adm-flash error">{error}</div>}
        <Field label="用户名">
          <input className="adm-input" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
        </Field>
        <Field label="密码">
          <input className="adm-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </Field>
        <button type="submit" disabled={loading} className="adm-btn" style={{ width: '100%', marginTop: 6, padding: '10px 18px' }}>
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', icon: '📊', label: '概览' },
  { id: 'users', icon: '👤', label: '用户管理' },
  { id: 'servers', icon: '🏠', label: '服务器管理' },
  { id: 'bots', icon: '🤖', label: '机器人' },
  { id: 'reports', icon: '🚨', label: '举报队列' },
  { id: 'invites', icon: '🔗', label: '邀请码' },
  { id: 'join-requests', icon: '📋', label: '加入申请' },
  { id: 'audit-logs', icon: '📜', label: '操作日志' },
];

function AdminSidebar({ page, onNav, onLogout, adminUser }) {
  const initial = (adminUser?.display_name || adminUser?.username || '?').slice(0, 1).toUpperCase();
  return (
    <div className="adm-sidebar">
      <div className="adm-brand">
        <div className="adm-brand-mark">摸</div>
        <div>
          <div className="adm-brand-title">管理后台</div>
          <div className="adm-brand-sub">摸鱼社区</div>
        </div>
      </div>
      <nav className="adm-nav">
        {NAV.map(n => (
          <div key={n.id} className={`adm-nav-item${page === n.id ? ' active' : ''}`} onClick={() => onNav(n.id)}>
            <span className="adm-nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}
      </nav>
      <div className="adm-sidebar-footer">
        <div className="adm-avatar">{initial}</div>
        <div className="adm-sidebar-footer-name" style={{ flex: 1 }}>{adminUser?.display_name}</div>
        <button className="adm-logout-btn" title="退出登录" onClick={onLogout}>⎋</button>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────
function DashboardPage() {
  const { loading, data, error } = useAsync(() => api.get('/api/admin/stats'), []);
  return (
    <Page title="概览" subtitle="平台核心数据一览">
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <div className="adm-stat-grid">
          <StatCard label="注册用户" value={data.total_users.toLocaleString()} />
          <StatCard label="服务器" value={data.total_servers.toLocaleString()} />
          <StatCard label="频道" value={data.total_channels.toLocaleString()} />
          <StatCard label="消息数" value={data.total_messages.toLocaleString()} />
          <StatCard label="今日新增" value={data.new_users_today.toLocaleString()} />
          <StatCard label="待处理举报" value={data.pending_reports.toLocaleString()} />
        </div>
      )}
    </Page>
  );
}

// ─── Users ───────────────────────────────────────────────────────
function UsersPage({ onNav }) {
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/users?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`), [search, page]);
  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{r.id}</span> },
    { key: 'username', label: '用户名', render: r => <span style={{ color: 'var(--ink-2)' }}>@{r.username}</span> },
    { key: 'display_name', label: '显示名', render: r => <span style={{ fontWeight: 600 }}>{r.display_name}</span> },
    { key: 'status', label: '在线', render: r => <Badge label={r.status} tone={r.status === 'online' ? 'ok' : undefined} /> },
    { key: 'flags', label: '标记', render: r => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        {r.is_admin ? <Badge label="管理员" tone="accent" /> : null}
        {r.is_banned ? <Badge label="封禁" tone="danger" /> : null}
      </span>
    ) },
    { key: 'created_at', label: '注册', render: r => <span style={{ color: 'var(--ink-2)' }}>{fmtDate(r.created_at)}</span> },
  ];
  return (
    <Page title="用户管理" subtitle="搜索、封禁、授权与移除用户">
      <SearchBar value={q} onChange={setQ} onSearch={v => { setSearch(v); setPage(0); }} placeholder="搜索用户名 / 显示名" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} onRowClick={r => onNav('user-detail', { userId: r.id })} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </Page>
  );
}

function UserDetailPage({ userId, onBack }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: user, error } = useAsync(() => api.get(`/api/admin/users/${userId}`), [userId, rev]);
  const [banReason, setBanReason] = React.useState('');
  const [flash, showOk, showErr] = useFlash();

  async function act(fn) {
    try { await fn(); showOk('操作成功'); setRev(r => r + 1); }
    catch (e) { showErr(e); }
  }

  if (loading) return <Page title="用户详情" back={onBack}><Spinner /></Page>;
  if (error) return <Page title="用户详情" back={onBack}><Err msg={error} /></Page>;
  return (
    <Page title={user.display_name} subtitle={`@${user.username}`} back={onBack}>
      <Flash flash={flash} />
      <DetailGrid>
        <DetailCell label="ID" value={user.id} />
        <DetailCell label="状态" value={user.status} />
        <DetailCell label="管理员" value={user.is_admin ? '是' : '否'} />
        <DetailCell label="封禁" value={user.is_banned ? `是：${user.banned_reason}` : '否'} />
        <DetailCell label="注册时间" value={fmtTime(user.created_at)} />
      </DetailGrid>

      <Panel title="账号操作" style={{ marginTop: 20, maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="封禁原因（必填）" />
          <Btn danger onClick={() => { if (!banReason.trim()) { showErr('请填写封禁原因'); return; } act(() => api.post(`/api/admin/users/${userId}/ban`, { reason: banReason })); }}>封禁</Btn>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn ghost onClick={() => act(() => api.post(`/api/admin/users/${userId}/unban`))}>解封</Btn>
          <Btn ghost onClick={() => act(() => api.patch(`/api/admin/users/${userId}/admin`, { is_admin: !user.is_admin }))}>
            {user.is_admin ? '撤销管理员' : '提升为管理员'}
          </Btn>
        </div>
      </Panel>

      <Panel title="危险操作" style={{ marginTop: 16, maxWidth: 640 }}>
        <Btn danger onClick={async () => {
          if (!confirm(`确认永久删除用户「${user.username}」？\n此操作不可撤销：其消息、私信、好友关系将被永久删除，其创建的服务器将被删除。`)) return;
          try { await api.del(`/api/admin/users/${userId}`); onBack(); }
          catch (e) { showErr(e); }
        }}>永久删除用户</Btn>
      </Panel>
    </Page>
  );
}

// ─── Servers ─────────────────────────────────────────────────────
function ServersPage({ onNav }) {
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/servers?q=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`), [search, page]);
  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{r.id}</span> },
    { key: 'name', label: '名称', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'member_count', label: '成员数' },
    { key: 'join_policy', label: '加入策略', render: r => <Badge label={r.join_policy} /> },
    { key: 'is_recommended', label: '推荐', render: r => r.is_recommended ? <Badge label="推荐" tone="accent" /> : <span style={{ color: 'var(--ink-2)' }}>—</span> },
    { key: 'auto_join', label: '默认加入', render: r => r.auto_join ? <Badge label="是" tone="ok" /> : <span style={{ color: 'var(--ink-2)' }}>否</span> },
    { key: 'join_order', label: '排序', render: r => r.join_order === 999 || r.join_order == null ? <span style={{ color: 'var(--ink-2)' }}>—</span> : r.join_order },
    { key: 'created_at', label: '创建', render: r => <span style={{ color: 'var(--ink-2)' }}>{fmtDate(r.created_at)}</span> },
  ];
  return (
    <Page title="服务器管理" subtitle="搜索、推荐设置与频道治理">
      <SearchBar value={q} onChange={setQ} onSearch={v => { setSearch(v); setPage(0); }} placeholder="搜索服务器名" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} onRowClick={r => onNav('server-detail', { serverId: r.id })} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </Page>
  );
}

function ServerDetailPage({ serverId, onBack }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: server, error } = useAsync(() => api.get(`/api/admin/servers/${serverId}`), [serverId, rev]);
  const { data: channels } = useAsync(() => api.get(`/api/admin/servers/${serverId}/channels`), [serverId, rev]);
  const [flash, showOk, showErr] = useFlash();

  async function act(fn, afterFn) {
    try { await fn(); showOk('操作成功'); if (afterFn) afterFn(); else setRev(r => r + 1); }
    catch (e) { showErr(e); }
  }

  if (loading) return <Page title="服务器详情" back={onBack}><Spinner /></Page>;
  if (error) return <Page title="服务器详情" back={onBack}><Err msg={error} /></Page>;
  return (
    <Page title={server.name} back={onBack}>
      <Flash flash={flash} />
      <DetailGrid>
        <DetailCell label="成员数" value={server.member_count} />
        <DetailCell label="加入策略" value={{ open: '自由加入', approval: '需要审核', closed: '禁止加入' }[server.join_policy] || server.join_policy} />
        <DetailCell label="推荐" value={server.is_recommended ? '是' : '否'} />
        <DetailCell label="创建时间" value={fmtTime(server.created_at)} />
        <DetailCell label="创建人" value={server.owner_display_name ? `${server.owner_display_name}（@${server.owner_username}）` : `已删除用户（ID: ${server.owner_id}）`} />
        <DetailCell label="管理员" value={server.mods && server.mods.length > 0 ? server.mods.join('、') : '无'} />
        <DetailCell label="新用户默认加入" value={server.auto_join ? '是' : '否'} />
        <DetailCell label="默认加入顺序" value={server.join_order === 999 ? '未设置' : server.join_order} />
      </DetailGrid>

      <Panel title="服务器设置" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Btn ghost onClick={() => act(() => api.patch(`/api/admin/servers/${serverId}/recommended`))}>
            {server.is_recommended ? '取消推荐' : '设为推荐'}
          </Btn>
          <Btn ghost active={server.auto_join} onClick={() => act(() => api.patch(`/api/admin/servers/${serverId}/admin-settings`, { auto_join: !server.auto_join }))}>
            {server.auto_join ? '✓ 新用户默认加入' : '设为新用户默认加入'}
          </Btn>
          <Btn danger onClick={() => { if (!confirm('确认强制删除该服务器？此操作不可撤销。')) return; act(() => api.del(`/api/admin/servers/${serverId}`), onBack); }}>
            强制删除
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>新用户加入顺序（数字越小越靠前）：</span>
          <input type="number" defaultValue={server.join_order} id={`join-order-${serverId}`} className="adm-input" style={{ width: 90 }} />
          <Btn small onClick={() => {
            const val = parseInt(document.getElementById(`join-order-${serverId}`).value);
            if (!isNaN(val)) act(() => api.patch(`/api/admin/servers/${serverId}/admin-settings`, { join_order: val }));
          }}>保存</Btn>
        </div>
      </Panel>

      <div style={{ margin: '24px 0 12px', fontWeight: 700, fontSize: 15 }}>频道列表</div>
      <Table
        cols={[
          { key: 'name', label: '频道名', render: r => <span style={{ fontWeight: 600 }}>#{r.name}</span> },
          { key: 'kind', label: '类型', render: r => <Badge label={r.kind} /> },
          { key: 'actions', label: '', render: r => (
            <Btn small danger onClick={e => { e.stopPropagation(); if (!confirm(`删除频道「${r.name}」？`)) return; act(() => api.del(`/api/admin/channels/${r.id}`)); }}>删除</Btn>
          )},
        ]}
        rows={channels || []}
      />
    </Page>
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
  const statusTone = { pending: 'accent', resolved: 'ok', dismissed: 'danger' };
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'target_type', label: '类型', render: r => <Badge label={r.target_type} /> },
    { key: 'reason', label: '原因', render: r => <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.reason}</span> },
    { key: 'status', label: '状态', render: r => <Badge label={r.status} tone={statusTone[r.status]} /> },
    { key: 'created_at', label: '时间', render: r => <span style={{ color: 'var(--ink-2)' }}>{fmtDate(r.created_at)}</span> },
  ];
  return (
    <Page title="举报队列" subtitle="处置被举报的消息 / 用户 / 服务器">
      <FilterPills
        options={[['pending', '待处理'], ['resolved', '已处理'], ['dismissed', '已驳回'], ['', '全部']]}
        value={statusFilter}
        onChange={v => { setStatusFilter(v); setPage(0); }}
      />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} onRowClick={r => onNav('report-detail', { reportId: r.id })} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </Page>
  );
}

function ReportDetailPage({ reportId, onBack, onNav }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: report, error } = useAsync(() => api.get(`/api/admin/reports/${reportId}`), [reportId, rev]);
  const [note, setNote] = React.useState('');
  const [banReason, setBanReason] = React.useState('');
  const [flash, showOk, showErr] = useFlash();
  const [busy, setBusy] = React.useState(false);

  async function act(action) {
    setBusy(true);
    try { await api.post(`/api/admin/reports/${reportId}/${action}`, { note }); showOk('操作成功'); setRev(r => r + 1); }
    catch (e) { showErr(e); }
    finally { setBusy(false); }
  }

  // 对被举报对象采取处置，成功后把该举报标记为已处理（闭环）
  async function takeAction(doIt, autoNote) {
    setBusy(true);
    try {
      await doIt();
      await api.post(`/api/admin/reports/${reportId}/resolve`, { note: note || autoNote });
      showOk('已处置并标记为已处理');
      setRev(r => r + 1);
    } catch (e) { showErr(e); }
    finally { setBusy(false); }
  }

  if (loading) return <Page title="举报详情" back={onBack}><Spinner /></Page>;
  if (error) return <Page title="举报详情" back={onBack}><Err msg={error} /></Page>;
  const t = report.target_type, tid = report.target_id;
  const statusTone = { pending: 'accent', resolved: 'ok', dismissed: 'danger' };
  return (
    <Page title={`举报详情 #${report.id}`} back={onBack}>
      <Flash flash={flash} />
      <DetailGrid>
        <DetailCell label="举报类型" value={<Badge label={t} />} />
        <DetailCell label="目标 ID" value={tid} />
        <DetailCell label="状态" value={<Badge label={report.status} tone={statusTone[report.status]} />} />
        <DetailCell label="原因" value={report.reason} />
        {report.content_snapshot && <DetailCell label="内容快照" value={report.content_snapshot} />}
        {report.resolution_note && <DetailCell label="处理备注" value={report.resolution_note} />}
      </DetailGrid>

      {report.status === 'pending' && (
        <>
          <Panel title="处置被举报对象" style={{ marginTop: 20, maxWidth: 640 }}>
            {t === 'message' && (
              <Btn danger disabled={busy} onClick={() => { if (!confirm('删除这条被举报的消息？')) return; takeAction(() => api.del(`/api/messages/${tid}`), '已删除被举报消息'); }}>
                删除该消息并标记已处理
              </Btn>
            )}
            {t === 'user' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="封禁原因（必填）" />
                  <Btn danger disabled={busy} onClick={() => { if (!banReason.trim()) { showErr('请填写封禁原因'); return; } if (!confirm('封禁被举报用户？')) return; takeAction(() => api.post(`/api/admin/users/${tid}/ban`, { reason: banReason }), '已封禁被举报用户'); }}>封禁该用户并标记已处理</Btn>
                </div>
                <div><Btn small ghost onClick={() => onNav && onNav('user-detail', { userId: tid })}>查看该用户 →</Btn></div>
              </div>
            )}
            {t === 'server' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn danger disabled={busy} onClick={() => { if (!confirm('强制删除被举报服务器？不可撤销。')) return; takeAction(() => api.del(`/api/admin/servers/${tid}`), '已删除被举报服务器'); }}>删除该服务器并标记已处理</Btn>
                <Btn small ghost onClick={() => onNav && onNav('server-detail', { serverId: tid })}>查看该服务器 →</Btn>
              </div>
            )}
          </Panel>
          <Panel title="其他处理" style={{ marginTop: 16, maxWidth: 640 }}>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="处理备注（可选）" style={{ marginBottom: 10, display: 'block', width: '100%' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn ghost disabled={busy} onClick={() => act('resolve')}>仅标记已处理</Btn>
              <Btn danger disabled={busy} onClick={() => act('dismiss')}>驳回举报</Btn>
            </div>
          </Panel>
        </>
      )}
    </Page>
  );
}

// ─── Invites ─────────────────────────────────────────────────────
function InvitesPage() {
  const [serverId, setServerId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [flash, showOk, showErr] = useFlash();
  const [rev, setRev] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const url = `/api/admin/invites?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${search ? `&server_id=${search}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [search, rev, page]);

  async function doRevoke(code) {
    if (!confirm(`撤销邀请码 ${code}？`)) return;
    try { await api.del(`/api/admin/invites/${code}`); showOk(`已撤销 ${code}`); setRev(r => r + 1); }
    catch (e) { showErr(e); }
  }

  const cols = [
    { key: 'code', label: '邀请码', render: r => <span style={{ fontFamily: 'var(--ff-mono, monospace)' }}>{r.code}</span> },
    { key: 'server_id', label: '服务器 ID' },
    { key: 'uses', label: '已用' },
    { key: 'max_uses', label: '上限', render: r => r.max_uses ?? '无限' },
    { key: 'expires_at', label: '过期', render: r => r.expires_at ? fmtDate(r.expires_at) : '永不' },
    { key: 'actions', label: '', render: r => <Btn small danger onClick={e => { e.stopPropagation(); doRevoke(r.code); }}>撤销</Btn> },
  ];
  return (
    <Page title="邀请码管理" subtitle="按服务器筛选并撤销邀请码">
      <Flash flash={flash} />
      <SearchBar value={serverId} onChange={setServerId} onSearch={v => { setSearch(v); setPage(0); }} placeholder="按服务器 ID 筛选（留空显示全部）" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </Page>
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
    { key: 'status', label: '状态', render: r => <Badge label={r.status} tone={r.status === 'pending' ? 'accent' : r.status === 'approved' ? 'ok' : undefined} /> },
    { key: 'note', label: '申请理由', render: r => r.note || '-' },
    { key: 'created_at', label: '时间', render: r => <span style={{ color: 'var(--ink-2)' }}>{fmtDate(r.created_at)}</span> },
  ];
  return (
    <Page title="加入申请" subtitle="查看各服务器的加入审核记录">
      <SearchBar value={serverId} onChange={setServerId} onSearch={v => { setSearch(v); setPage(0); }} placeholder="按服务器 ID 筛选（留空显示全部）" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </Page>
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
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{r.id}</span> },
    { key: 'admin_id', label: '管理员 ID' },
    { key: 'action', label: '操作', render: r => <Badge label={r.action} /> },
    { key: 'target_type', label: '对象类型' },
    { key: 'target_id', label: '对象 ID' },
    { key: 'created_at', label: '时间', render: r => <span style={{ color: 'var(--ink-2)' }}>{fmtTime(r.created_at)}</span> },
  ];
  return (
    <Page
      title="操作日志"
      subtitle="所有管理员的敏感操作审计记录"
      actions={
        <select value={action} onChange={e => { setAction(e.target.value); setPage(0); }} className="adm-select" style={{ width: 220 }}>
          <option value="">全部操作</option>
          {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      }
    >
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <>
          <Table cols={cols} rows={data || []} />
          <Pager page={page} setPage={setPage} count={(data || []).length} loading={loading} />
        </>
      )}
    </Page>
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
    <div className="adm-shell">
      <AdminSidebar page={nav.page} onNav={goTo} onLogout={logout} adminUser={adminUser} />
      <main className="adm-main">{renderPage()}</main>
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

function PresetPicker({ preset, onPick }) {
  return (
    <div className="adm-chip-row">
      {LLM_PRESETS.map((p, i) => (
        <div key={i} className={`adm-chip${preset === i ? ' on' : ''}`} onClick={() => onPick(i)}>{p.label}</div>
      ))}
    </div>
  );
}

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
    <div className="adm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-modal" style={{ width: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="adm-modal-title">新建机器人</div>
        <form onSubmit={submit}>
          <Field label="备注名"><input className="adm-input" value={form.name} onChange={set('name')} placeholder="如：摸鱼助手" /></Field>
          <Field label="用户名（英文+数字+下划线）"><input className="adm-input" value={form.username} onChange={set('username')} placeholder="moyu_bot" /></Field>
          <Field label="密码"><input className="adm-input" type="password" value={form.password} onChange={set('password')} placeholder="至少6位" /></Field>
          <Field label="显示名（聊天中显示）"><input className="adm-input" value={form.display_name} onChange={set('display_name')} placeholder="摸鱼助手" /></Field>
          <Field label="大模型预设"><PresetPicker preset={preset} onPick={applyPreset} /></Field>
          <Field label="API Key"><input className="adm-input" value={form.llm_api_key} onChange={set('llm_api_key')} placeholder="sk-..." /></Field>
          <Field label="Base URL"><input className="adm-input" value={form.llm_base_url} onChange={set('llm_base_url')} /></Field>
          <Field label="模型名"><input className="adm-input" value={form.llm_model} onChange={set('llm_model')} /></Field>
          <Field label="System Prompt">
            <textarea className="adm-textarea" value={form.system_prompt} onChange={set('system_prompt')} rows={3} />
          </Field>
          {err && <Err msg={err} />}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <Btn ghost onClick={onClose}>取消</Btn>
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
  const [flash, showOk, showErr] = useFlash();

  async function toggle(bot) {
    setToggling(t => ({ ...t, [bot.id]: true }));
    try {
      await api.post(`/api/admin/bots/${bot.id}/${bot.is_active ? 'stop' : 'start'}`);
      setRev(r => r + 1);
    } catch (e) { showErr(e); }
    finally { setToggling(t => ({ ...t, [bot.id]: false })); }
  }

  const cols = [
    { key: 'name', label: '名称', render: r => <span style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 700 }} onClick={() => onNav('bot-detail', { botId: r.id })}>{r.name}</span> },
    { key: 'username', label: '用户名', render: r => <span style={{ color: 'var(--ink-2)' }}>@{r.username}</span> },
    { key: 'display_name', label: '显示名' },
    { key: 'llm_model', label: '模型', render: r => <span style={{ color: 'var(--ink-2)' }}>{r.llm_model}</span> },
    { key: 'is_active', label: '状态', render: r => <Badge label={r.is_active ? '运行中' : '已停止'} tone={r.is_active ? 'ok' : undefined} /> },
    { key: 'actions', label: '', render: r => (
      <Btn small danger={r.is_active} disabled={toggling[r.id]} onClick={e => { e.stopPropagation(); toggle(r); }}>
        {toggling[r.id] ? '…' : r.is_active ? '停止' : '启动'}
      </Btn>
    ) },
  ];

  return (
    <Page title="机器人管理" subtitle="配置 AI 机器人并管理其运行状态"
      actions={<Btn onClick={() => setShowCreate(true)}>+ 新建机器人</Btn>}>
      <Flash flash={flash} />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <Table cols={cols} rows={bots || []} />
      )}
      {showCreate && (
        <BotCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setRev(r => r + 1); }}
        />
      )}
    </Page>
  );
}

function BotDetailPage({ botId, onBack }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: bot, error } = useAsync(() => api.get(`/api/admin/bots/${botId}`), [botId, rev]);
  const { data: allChannels } = useAsync(() => api.get(`/api/admin/bots/${botId}/available-channels`), [botId]);
  const [form, setForm] = React.useState(null);
  const [preset, setPreset] = React.useState(0);
  const [flash, showOk, showErr] = useFlash();
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
    setSaving(true);
    try {
      const patch = { ...form };
      if (!patch.password) delete patch.password;
      if (!patch.llm_api_key) delete patch.llm_api_key;
      await api.patch(`/api/admin/bots/${botId}`, patch);
      showOk('保存成功');
      setRev(r => r + 1);
    } catch (e) { showErr(e); }
    finally { setSaving(false); }
  }

  async function toggleActive() {
    setToggling(true);
    try {
      await api.post(`/api/admin/bots/${botId}/${bot.is_active ? 'stop' : 'start'}`);
      setRev(r => r + 1);
    } catch (e) { showErr(e); }
    finally { setToggling(false); }
  }

  async function deleteBot() {
    if (!confirm(`确认删除机器人「${bot.name}」？此操作将同时删除其用户账号。`)) return;
    try { await api.del(`/api/admin/bots/${botId}`); onBack(); }
    catch (e) { showErr(e); }
  }

  function toggleChannel(chId) {
    setForm(f => {
      const ids = f.channel_ids.includes(chId) ? f.channel_ids.filter(x => x !== chId) : [...f.channel_ids, chId];
      return { ...f, channel_ids: ids };
    });
  }

  if (loading) return <Page title="机器人详情" back={onBack}><Spinner /></Page>;
  if (error) return <Page title="机器人详情" back={onBack}><Err msg={error} /></Page>;
  if (!form) return null;

  return (
    <Page
      title={bot.name}
      back={onBack}
      actions={
        <>
          <Badge label={bot.is_active ? '运行中' : '已停止'} tone={bot.is_active ? 'ok' : undefined} />
          <Btn danger={bot.is_active} disabled={toggling} onClick={toggleActive}>
            {toggling ? '…' : bot.is_active ? '停止服务' : '启动服务'}
          </Btn>
        </>
      }
    >
      <Flash flash={flash} />
      <div style={{ maxWidth: 680 }}>
        <Panel title="基本信息">
          <Field label="备注名"><input className="adm-input" value={form.name} onChange={set('name')} /></Field>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 13 }}>用户名：@{bot.username}</div>
          <Field label="显示名"><input className="adm-input" value={form.display_name} onChange={set('display_name')} /></Field>
          <Field label="修改密码（留空则不变）"><input className="adm-input" type="password" value={form.password} onChange={set('password')} placeholder="留空保持原密码" /></Field>
        </Panel>

        <Panel title="大模型配置">
          <Field label="预设"><PresetPicker preset={preset} onPick={applyPreset} /></Field>
          <Field label="API Key（留空则不修改）"><input className="adm-input" value={form.llm_api_key} onChange={set('llm_api_key')} placeholder="留空保持原 key" /></Field>
          <Field label="Base URL"><input className="adm-input" value={form.llm_base_url} onChange={set('llm_base_url')} /></Field>
          <Field label="模型名"><input className="adm-input" value={form.llm_model} onChange={set('llm_model')} /></Field>
          <Field label="System Prompt">
            <textarea className="adm-textarea" value={form.system_prompt} onChange={set('system_prompt')} rows={3} />
          </Field>
        </Panel>

        <Panel title="监听频道" hint="留空则自动监听管理员服务器所有文字频道">
          {allChannels && allChannels.map(srv => (
            <div key={srv.server_id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 6 }}>{srv.server_name}</div>
              <div className="adm-chip-row">
                {srv.channels.map(ch => (
                  <div key={ch.id} className={`adm-chip${form.channel_ids.includes(ch.id) ? ' on' : ''}`} onClick={() => toggleChannel(ch.id)}>#{ch.name}</div>
                ))}
              </div>
            </div>
          ))}
        </Panel>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 20 }}>
          <Btn danger onClick={deleteBot}>删除机器人</Btn>
          <Btn disabled={saving} onClick={save}>{saving ? '保存中…' : '保存更改'}</Btn>
        </div>
      </div>
    </Page>
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
    <div className="app theme-forest density-default" style={{ width: '100vw', height: '100vh', overflow: 'hidden', fontSize: 15 }}>
      {adminUser ? <AdminShell adminUser={adminUser} /> : <AdminLogin onLogin={setAdminUser} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AdminApp />);
