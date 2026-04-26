/* Auth screen — full-bg landscape + bottom bar */

const { useState: useStateAuth } = React;

function AuthScreen({ onSuccess }) {
  const [username, setUsername] = useStateAuth('');
  const [password, setPassword] = useStateAuth('');
  const [error, setError] = useStateAuth('');
  const [loading, setLoading] = useStateAuth(false);

  // Register panel
  const [regOpen, setRegOpen] = useStateAuth(false);
  const [regUsername, setRegUsername] = useStateAuth('');
  const [regDisplayName, setRegDisplayName] = useStateAuth('');
  const [regPassword, setRegPassword] = useStateAuth('');
  const [regError, setRegError] = useStateAuth('');
  const [regLoading, setRegLoading] = useStateAuth(false);

  const canLogin = username.trim() && password;
  const canReg = regUsername.trim() && regDisplayName.trim() && regPassword;

  async function handleLogin(e) {
    e.preventDefault();
    if (loading || !canLogin) return;
    setLoading(true);
    setError('');
    try {
      const result = await API.post('/api/auth/login', { username: username.trim(), password });
      API.setToken(result.access_token, result.refresh_token);
      onSuccess(result.user);
    } catch (err) {
      setError(err.message || '用户名或密码错误');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (regLoading || !canReg) return;
    setRegLoading(true);
    setRegError('');
    try {
      const result = await API.post('/api/auth/register', {
        username: regUsername.trim(),
        display_name: regDisplayName.trim(),
        password: regPassword,
      });
      API.setToken(result.access_token, result.refresh_token);
      onSuccess(result.user);
    } catch (err) {
      setRegError(err.message || '注册失败，请检查输入');
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className="auth-page">
      {/* Full-screen background */}
      <div className="auth-bg"/>

      {/* Top-left logo */}
      <div className="auth-top-logo">Biscord</div>

      {/* Bottom bar */}
      <div className="auth-bottom-bar">
        {/* Login section */}
        <form className="auth-bar-login" onSubmit={handleLogin}>
          <div className="auth-bar-fields">
            <div className="auth-bar-field">
              <label className="auth-bar-label">用户名</label>
              <input
                className="auth-bar-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="demo1"
                autoComplete="username"
              />
            </div>
            <div className="auth-bar-field">
              <label className="auth-bar-label">密码</label>
              <input
                className="auth-bar-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              className="auth-bar-btn login"
              type="submit"
              disabled={loading || !canLogin}
            >
              {loading ? '登录中…' : '登录'}
            </button>
          </div>
          {error && <div className="auth-bar-error">{error}</div>}
        </form>

        {/* Divider */}
        <div className="auth-bar-divider"/>

        {/* Register section */}
        <div className="auth-bar-reg-wrap">
          {!regOpen ? (
            <div className="auth-bar-reg-cta">
              <div className="auth-bar-reg-text">
                <div className="auth-bar-reg-title">还没有账号？</div>
                <div className="auth-bar-reg-sub">加入 Biscord，认识有趣的人。</div>
              </div>
              <button className="auth-bar-btn register" onClick={() => setRegOpen(true)} type="button">
                免费注册
              </button>
            </div>
          ) : (
            <form className="auth-bar-reg-form" onSubmit={handleRegister}>
              <div className="auth-bar-fields">
                <div className="auth-bar-field">
                  <label className="auth-bar-label">用户名</label>
                  <input
                    className="auth-bar-input"
                    value={regUsername}
                    onChange={e => setRegUsername(e.target.value)}
                    placeholder="唯一标识符"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
                <div className="auth-bar-field">
                  <label className="auth-bar-label">显示名</label>
                  <input
                    className="auth-bar-input"
                    value={regDisplayName}
                    onChange={e => setRegDisplayName(e.target.value)}
                    placeholder="苏沐"
                    autoComplete="nickname"
                  />
                </div>
                <div className="auth-bar-field">
                  <label className="auth-bar-label">密码</label>
                  <input
                    className="auth-bar-input"
                    type="password"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="至少 6 位"
                    autoComplete="new-password"
                  />
                </div>
                <button
                  className="auth-bar-btn login"
                  type="submit"
                  disabled={regLoading || !canReg}
                >
                  {regLoading ? '注册中…' : '创建账号'}
                </button>
                <button
                  className="auth-bar-btn ghost"
                  type="button"
                  onClick={() => { setRegOpen(false); setRegError(''); }}
                >
                  取消
                </button>
              </div>
              {regError && <div className="auth-bar-error">{regError}</div>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AuthScreen });
