/* API client: HTTP auth, token refresh, and WebSocket realtime */

(function () {
  const API_BASE = window.API_BASE || (window.location.protocol.startsWith('http') ? window.location.origin : 'http://localhost:8000');
  const WS_BASE = API_BASE.replace(/^http/, 'ws');
  const ACCESS_KEY = 'biscord-access-token';
  const REFRESH_KEY = 'biscord-refresh-token';

  let activeSocket = null;
  let activeSocketConfig = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let manualDisconnect = false;
  let dmSocket = null;
  let dmSocketConfig = null;
  let dmReconnectTimer = null;
  let dmReconnectAttempt = 0;
  let dmManualDisconnect = false;

  function getToken() {
    return localStorage.getItem(ACCESS_KEY);
  }

  function getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY);
  }

  function setToken(access, refresh) {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  }

  function clearToken() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  function buildUrl(path) {
    if (/^https?:\/\//.test(path)) return path;
    return API_BASE + path;
  }

  function parseInviteCode(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';

    const hearthMatch = raw.match(/^hearth:\/\/invite\/([^/?#]+)/i);
    if (hearthMatch) return decodeURIComponent(hearthMatch[1]);

    try {
      const url = new URL(raw);
      return (
        url.searchParams.get('invite') ||
        url.pathname.split('/').filter(Boolean).pop() ||
        ''
      ).trim();
    } catch {}

    if (/^[\w.-]+\/.+/.test(raw)) {
      try {
        const url = new URL(`https://${raw}`);
        return (
          url.searchParams.get('invite') ||
          url.pathname.split('/').filter(Boolean).pop() ||
          ''
        ).trim();
      } catch {}
    }

    return raw.replace(/^invite:/i, '').trim();
  }

  function inviteWebUrl(code) {
    if (!code) return '';
    const base = window.location.protocol.startsWith('http')
      ? window.location.origin
      : API_BASE;
    return `${base}/?invite=${encodeURIComponent(code)}`;
  }

  function assetUrl(path) {
    if (!path || /^https?:\/\//.test(path)) return path;
    if (path.startsWith('/')) return API_BASE + path;
    return path;
  }

  async function parseResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data?.detail || '请求失败，请稍后重试';
      const error = new Error(Array.isArray(message) ? message.map(item => item.msg).join('；') : message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error('登录已过期，请重新登录');

    const response = await fetch(buildUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await parseResponse(response);
    setToken(data.access_token, refreshToken);
    return data.access_token;
  }

  async function request(method, path, body, retry = true) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(buildUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && retry && path !== '/api/auth/refresh') {
      try {
        await refreshAccessToken();
        return request(method, path, body, false);
      } catch (error) {
        clearToken();
        window.dispatchEvent(new CustomEvent('biscord:auth-expired'));
        throw error;
      }
    }

    return parseResponse(response);
  }

  async function upload(file, retry = true) {
    const form = new FormData();
    form.append('file', file);
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(buildUrl('/api/upload'), {
      method: 'POST',
      headers,
      body: form,
    });

    if (response.status === 401 && retry) {
      try {
        await refreshAccessToken();
        return upload(file, false);
      } catch (error) {
        clearToken();
        window.dispatchEvent(new CustomEvent('biscord:auth-expired'));
        throw error;
      }
    }

    return parseResponse(response);
  }

  function wsUrl(path) {
    return WS_BASE + path;
  }

  function normalizeHandlers(handlers = {}) {
    return {
      onMessage: handlers.onMessage || (() => {}),
      onEdit: handlers.onEdit || (() => {}),
      onDelete: handlers.onDelete || (() => {}),
      onReaction: handlers.onReaction || (() => {}),
      onTyping: handlers.onTyping || (() => {}),
      onDM: handlers.onDM || (() => {}),
      onFriend: handlers.onFriend || (() => {}),
      onOpen: handlers.onOpen || (() => {}),
      onError: handlers.onError || (() => {}),
    };
  }

  function handleSocketEvent(event, handlers) {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload.type === 'auth.ok') handlers.onOpen(payload.data);
    if (payload.type === 'message.new') handlers.onMessage(payload.data);
    if (payload.type === 'message.edit') handlers.onEdit(payload.data);
    if (payload.type === 'message.delete') handlers.onDelete(payload.data);
    if (payload.type === 'reaction.update') handlers.onReaction(payload.data);
    if (payload.type === 'typing.start') handlers.onTyping({ ...payload.data, typing: true });
    if (payload.type === 'typing.stop') handlers.onTyping({ ...payload.data, typing: false });
    if (payload.type === 'dm.new') handlers.onDM(payload.data);
    if (payload.type && payload.type.startsWith('friend.')) handlers.onFriend(payload);
    if (payload.type === 'error') handlers.onError(payload);
  }

  function scheduleReconnect() {
    if (manualDisconnect || !activeSocketConfig || reconnectAttempt >= 5) return;
    const delay = Math.min(1000 * (2 ** reconnectAttempt), 12000);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      openSocket(activeSocketConfig);
    }, delay);
  }

  function openSocket(config) {
    const token = getToken();
    if (!token) return null;

    if (activeSocket) activeSocket.close();
    const handlers = normalizeHandlers(config.handlers);
    const socket = new WebSocket(wsUrl(config.path));
    activeSocket = socket;
    activeSocketConfig = config;
    manualDisconnect = false;

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      socket.send(JSON.stringify({ type: 'auth', token }));
    });
    socket.addEventListener('message', event => handleSocketEvent(event, handlers));
    socket.addEventListener('close', scheduleReconnect);
    socket.addEventListener('error', () => handlers.onError({ type: 'error', detail: 'websocket error' }));
    return socket;
  }

  function scheduleDMReconnect() {
    if (dmManualDisconnect || !dmSocketConfig || dmReconnectAttempt >= 5) return;
    const delay = Math.min(1000 * (2 ** dmReconnectAttempt), 12000);
    dmReconnectAttempt += 1;
    dmReconnectTimer = window.setTimeout(() => {
      openDMSocket(dmSocketConfig);
    }, delay);
  }

  function openDMSocket(config) {
    const token = getToken();
    if (!token) return null;

    if (dmSocket) dmSocket.close();
    const handlers = normalizeHandlers(config.handlers);
    const socket = new WebSocket(wsUrl(config.path));
    dmSocket = socket;
    dmSocketConfig = config;
    dmManualDisconnect = false;

    socket.addEventListener('open', () => {
      dmReconnectAttempt = 0;
      socket.send(JSON.stringify({ type: 'auth', token }));
    });
    socket.addEventListener('message', event => handleSocketEvent(event, handlers));
    socket.addEventListener('close', scheduleDMReconnect);
    socket.addEventListener('error', () => handlers.onError({ type: 'error', detail: 'websocket error' }));
    return socket;
  }

  function connectChannel(channelId, handlers) {
    disconnectChannel();
    return openSocket({ path: `/ws/channel/${channelId}`, handlers });
  }

  function connectDM(handlers) {
    disconnectDM();
    return openDMSocket({ path: '/ws/dm', handlers });
  }

  function disconnectChannel() {
    manualDisconnect = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    activeSocketConfig = null;
    if (activeSocket) activeSocket.close();
    activeSocket = null;
  }

  function disconnectDM() {
    dmManualDisconnect = true;
    if (dmReconnectTimer) window.clearTimeout(dmReconnectTimer);
    dmReconnectTimer = null;
    dmSocketConfig = null;
    if (dmSocket) dmSocket.close();
    dmSocket = null;
  }

  function disconnect() {
    disconnectChannel();
    disconnectDM();
  }

  function sendTyping(typing) {
    if (activeSocket?.readyState === WebSocket.OPEN) {
      activeSocket.send(JSON.stringify({ type: 'typing', typing: Boolean(typing) }));
    }
  }

  window.API = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),
    upload,
    connectChannel,
    connectDM,
    disconnectChannel,
    disconnectDM,
    disconnect,
    sendTyping,
    parseInviteCode,
    inviteWebUrl,
    assetUrl,
    getToken,
    setToken,
    clearToken,
    isLoggedIn,
  };
})();
