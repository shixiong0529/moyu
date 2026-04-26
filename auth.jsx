/* Auth screen: login/register — split-panel full-page design */

const { useState: useStateAuth } = React;

function AuthScreen({ onSuccess }) {
  const [mode, setMode] = useStateAuth('login');
  const [username, setUsername] = useStateAuth('');
  const [displayName, setDisplayName] = useStateAuth('');
  const [password, setPassword] = useStateAuth('');
  const [error, setError] = useStateAuth('');
  const [loading, setLoading] = useStateAuth(false);

  const isRegister = mode === 'register';
  const canSubmit = username.trim() && password && (!isRegister || displayName.trim());

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading || !canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const path = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister
        ? { username: username.trim(), display_name: displayName.trim(), password }
        : { username: username.trim(), password };
      const result = await API.post(path, body);
      API.setToken(result.access_token, result.refresh_token);
      onSuccess(result.user);
    } catch (err) {
      setError(err.message || '请检查输入后重试');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
  }

  const accentVars = {
    '--accent': '#8a5a2b',
    '--accent-soft': '#c79968',
    '--accent-ink': '#5c3a14',
  };

  return (
    <div className="app theme-light density-default auth-page" style={accentVars}>
      <div className="auth-card">

        {/* ── Left brand panel ── */}
        <div className="auth-brand">
          <div>
            <div className="auth-brand-name">Biscord</div>
            <div className="auth-brand-tagline">
              找到你的角落，<br/>遇见有趣的人和话题。
            </div>
          </div>
          <div className="auth-brand-foot">Hearth Community · 2024</div>
        </div>

        {/* ── Right form panel ── */}
        <div className="auth-form-area">
          <p className="auth-form-title">
            {isRegister ? '创建账号' : '欢迎回来'}
          </p>
          <p className="auth-form-subtitle">
            {isRegister ? '加入 Hearth，认识有趣的人。' : '继续你的 Hearth 之旅。'}
          </p>

          {/* Tab switcher */}
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
              type="button"
            >登录</button>
            <button
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode('register')}
              type="button"
            >注册</button>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="form-label">用户名 Username</label>
            <input
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="demo1"
              autoFocus
              autoComplete="username"
            />
            <div className="form-hint">3–32 位，仅字母、数字和下划线</div>

            {isRegister && (
              <div style={{ marginTop: 18 }}>
                <label className="form-label">显示名 Display name</label>
                <input
                  className="form-input"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="苏沐"
                  autoComplete="nickname"
                />
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <label className="form-label">密码 Password</label>
              <input
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isRegister ? '至少 6 位' : 'demo1234'}
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>

            {error && (
              <div style={{
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid rgba(181, 88, 58, 0.3)',
                background: 'rgba(181, 88, 58, 0.07)',
                color: 'var(--rust)',
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || !canSubmit}
              style={{ width: '100%', marginTop: 24, height: 42, fontSize: 15, borderRadius: 8 }}
            >
              {loading ? '请稍候…' : isRegister ? '创建账号' : '登录'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

Object.assign(window, { AuthScreen });
