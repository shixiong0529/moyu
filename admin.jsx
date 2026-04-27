// ─── Constants ──────────────────────────────────────────────────
const BASE = '';
const TOKEN_KEY = 'hearth-admin-token';
const REFRESH_KEY = 'hearth-admin-refresh';

// ─── API client ─────────────────────────────────────────────────
const api = {
  _token: () => localStorage.getItem(TOKEN_KEY),
  async _req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this._token() ? { Authorization: `Bearer ${this._token()}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      window.location.reload();
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
      fontSize: 13, fontWeight: 600,
      background: color || 'var(--paper-2)', color: 'var(--ink-1)',
    }}>{label}</span>
  );
}
function Btn({ onClick, children, danger, small, disabled, type }) {
  return (
    <button type={type || 'button'} onClick={onClick} disabled={disabled} style={{
      padding: small ? '4px 10px' : '7px 16px', fontSize: small ? 13 : 15,
      borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      background: danger ? '#e06c75' : 'var(--accent)', color: 'var(--accent-ink, #fff)',
      opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}
function Input({ value, onChange, placeholder, onKeyDown, type }) {
  return (
    <input type={type || 'text'} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown}
      style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 15, boxSizing: 'border-box' }} />
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
      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</div>
      <div style={{ fontSize: 15, marginTop: 4 }}>{String(value ?? '-')}</div>
    </div>
  );
}
function Flash({ msg }) {
  if (!msg) return null;
  return <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, fontSize: 13 }}>{msg}</div>;
}
function Table({ cols, rows, onRowClick }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
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
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || '搜索…'}
        onKeyDown={e => e.key === 'Enter' && onSearch(value)} />
      <Btn onClick={() => onSearch(value)}>搜索</Btn>
    </div>
  );
}
function BackBtn({ onClick }) {
  return <div style={{ marginBottom: 16 }}><Btn small onClick={onClick}>← 返回</Btn></div>;
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-0)' }}>
      <form onSubmit={handleSubmit} style={{ width: 320, background: 'var(--paper-1)', borderRadius: 12, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,.2)' }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 20, color: 'var(--ink-0)' }}>摸鱼社区 · 管理后台</h2>
        {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--paper-2)', borderRadius: 6, color: '#e06c75', fontSize: 13 }}>{error}</div>}
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>用户名</span>
          <input value={username} onChange={e => setUsername(e.target.value)} required
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 15, boxSizing: 'border-box' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>密码</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 15, boxSizing: 'border-box' }} />
        </label>
        <Btn type="submit" disabled={loading}>{loading ? '登录中…' : '登录'}</Btn>
      </form>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: '📊 概览' },
  { id: 'users', label: '👤 用户管理' },
  { id: 'servers', label: '🏠 服务器管理' },
  { id: 'reports', label: '🚨 举报队列' },
  { id: 'invites', label: '🔗 邀请码' },
  { id: 'join-requests', label: '📋 加入申请' },
  { id: 'audit-logs', label: '📜 操作日志' },
];

function AdminSidebar({ page, onNav, onLogout, adminUser }) {
  return (
    <div style={{ width: 200, background: 'var(--paper-1)', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--paper-2)', flexShrink: 0 }}>
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--paper-2)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-0)' }}>管理后台</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>{adminUser?.display_name}</div>
      </div>
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map(n => (
          <div key={n.id} onClick={() => onNav(n.id)}
            style={{
              padding: '9px 16px', cursor: 'pointer', fontSize: 14,
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
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/users?q=${encodeURIComponent(search)}&limit=100`), [search]);
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
      <SearchBar value={q} onChange={setQ} onSearch={setSearch} placeholder="搜索用户名 / 显示名" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <Table cols={cols} rows={data || []} onRowClick={r => onNav('user-detail', { userId: r.id })} />
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
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
          <Btn danger onClick={() => {
            if (!confirm(`确认永久删除用户「${user.username}」？此操作不可撤销，用户的消息将被软删除，所属服务器将被删除。`)) return;
            act(() => api.del(`/api/admin/users/${userId}`), onBack);
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
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/servers?q=${encodeURIComponent(search)}&limit=100`), [search]);
  const cols = [
    { key: 'id', label: 'ID', render: r => <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.id}</span> },
    { key: 'name', label: '名称' },
    { key: 'member_count', label: '成员数' },
    { key: 'join_policy', label: '加入策略', render: r => <Badge label={r.join_policy} /> },
    { key: 'is_recommended', label: '推荐', render: r => r.is_recommended ? <Badge label="推荐" color="var(--accent-soft,#3d7)" /> : null },
    { key: 'created_at', label: '创建', render: r => fmtDate(r.created_at) },
  ];
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>服务器管理</h2>
      <SearchBar value={q} onChange={setQ} onSearch={setSearch} placeholder="搜索服务器名" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <Table cols={cols} rows={data || []} onRowClick={r => onNav('server-detail', { serverId: r.id })} />
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
  }}

  if (loading) return <Spinner />;
  if (error) return <Err msg={error} />;
  return (
    <div style={{ padding: 24 }}>
      <BackBtn onClick={onBack} />
      <h2 style={{ margin: '0 0 20px' }}>{server.name}</h2>
      <Flash msg={msg} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <InfoRow label="成员数" value={server.member_count} />
        <InfoRow label="加入策略" value={server.join_policy} />
        <InfoRow label="推荐" value={server.is_recommended ? '是' : '否'} />
        <InfoRow label="创建时间" value={fmtTime(server.created_at)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <Btn onClick={() => act(() => api.patch(`/api/admin/servers/${serverId}/recommended`))}>
          {server.is_recommended ? '取消推荐' : '设为推荐'}
        </Btn>
        <Btn danger onClick={() => { if (!confirm('确认强制删除该服务器？此操作不可撤销。')) return; act(() => api.del(`/api/admin/servers/${serverId}`), onBack); }}>
          强制删除
        </Btn>
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
  const { loading, data, error } = useAsync(
    () => api.get(`/api/admin/reports?status_filter=${statusFilter}&limit=100`),
    [statusFilter]
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
          <Btn key={s} small onClick={() => setStatusFilter(s)}
            style={{ opacity: statusFilter === s ? 1 : 0.6 }}>{label}</Btn>
        ))}
      </div>
      {loading ? <Spinner /> : error ? <Err msg={error} /> : (
        <Table cols={cols} rows={data || []} onRowClick={r => onNav('report-detail', { reportId: r.id })} />
      )}
    </div>
  );
}

function ReportDetailPage({ reportId, onBack }) {
  const [rev, setRev] = React.useState(0);
  const { loading, data: report, error } = useAsync(() => api.get(`/api/admin/reports/${reportId}`), [reportId, rev]);
  const [note, setNote] = React.useState('');
  const [msg, setMsg] = React.useState('');

  async function act(action) {
    try { await api.post(`/api/admin/reports/${reportId}/${action}`, { note }); setMsg('操作成功'); setRev(r => r + 1); }
    catch (e) { setMsg(e.message); }
  }

  if (loading) return <Spinner />;
  if (error) return <Err msg={error} />;
  return (
    <div style={{ padding: 24 }}>
      <BackBtn onClick={onBack} />
      <h2 style={{ margin: '0 0 20px' }}>举报详情 #{report.id}</h2>
      <Flash msg={msg} />
      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <InfoRow label="举报类型" value={report.target_type} />
        <InfoRow label="目标 ID" value={report.target_id} />
        <InfoRow label="状态" value={report.status} />
        <InfoRow label="原因" value={report.reason} />
        {report.content_snapshot && <InfoRow label="内容快照" value={report.content_snapshot} />}
        {report.resolution_note && <InfoRow label="处理备注" value={report.resolution_note} />}
      </div>
      {report.status === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="处理备注（可选）" />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => act('resolve')}>标记已处理</Btn>
            <Btn danger onClick={() => act('dismiss')}>驳回举报</Btn>
          </div>
        </div>
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
  const url = `/api/admin/invites?limit=100${search ? `&server_id=${search}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [search, rev]);

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
      <SearchBar value={serverId} onChange={setServerId} onSearch={setSearch} placeholder="按服务器 ID 筛选（留空显示全部）" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : <Table cols={cols} rows={data || []} />}
    </div>
  );
}

// ─── Join Requests ────────────────────────────────────────────────
function JoinRequestsPage() {
  const [serverId, setServerId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const url = `/api/admin/join-requests?limit=100${search ? `&server_id=${search}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [search]);
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
      <SearchBar value={serverId} onChange={setServerId} onSearch={setSearch} placeholder="按服务器 ID 筛选（留空显示全部）" />
      {loading ? <Spinner /> : error ? <Err msg={error} /> : <Table cols={cols} rows={data || []} />}
    </div>
  );
}

// ─── Audit Logs ──────────────────────────────────────────────────
const AUDIT_ACTIONS = ['ban_user','unban_user','grant_admin','revoke_admin','delete_server','toggle_recommended','delete_channel','delete_channel_group','resolve_report','dismiss_report','revoke_invite'];

function AuditLogPage() {
  const [action, setAction] = React.useState('');
  const url = `/api/admin/audit-logs?limit=100${action ? `&action=${action}` : ''}`;
  const { loading, data, error } = useAsync(() => api.get(url), [action]);
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
        <select value={action} onChange={e => setAction(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--paper-2)', background: 'var(--paper-0)', color: 'var(--ink-0)', fontSize: 14 }}>
          <option value="">全部操作</option>
          {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {loading ? <Spinner /> : error ? <Err msg={error} /> : <Table cols={cols} rows={data || []} />}
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
      case 'report-detail': return <ReportDetailPage reportId={params.reportId} onBack={() => goTo('reports')} />;
      case 'invites':       return <InvitesPage />;
      case 'join-requests': return <JoinRequestsPage />;
      case 'audit-logs':    return <AuditLogPage />;
      default:              return <DashboardPage />;
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--paper-0)', color: 'var(--ink-0)' }}>
      <AdminSidebar page={nav.page} onNav={goTo} onLogout={logout} adminUser={adminUser} />
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>{renderPage()}</main>
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
    <div className="app theme-forest density-default" style={{ height: '100vh', overflow: 'hidden', fontSize: 15 }}>
      {adminUser ? <AdminShell adminUser={adminUser} /> : <AdminLogin onLogin={setAdminUser} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AdminApp />);
