// api.js — Section 4.2/4.9/4.10/6.1/12 client. Loaded as a plain script
// (no bundler in this prototype), before app.js. Exposes window.ApiClient.
//
// Section 6.1 — "the frontend holds the access token in memory (a JS
// variable in the Vue app state, not localStorage) and the refresh token
// in an httpOnly, Secure, SameSite=Strict cookie." accessToken below is
// exactly that in-memory variable; the refresh cookie is set/sent by the
// browser automatically via credentials: 'include', never read or written
// by this code.
(function () {
  // Prototype-scope local dev default (Section 21.2 formalizes real
  // deployment config in PHASE 14) — same origin as the backend today.
  const API_BASE = (window.WORKSETU_API_BASE || "http://localhost:4000") + "/api/v1";
  const SOCKET_URL = window.WORKSETU_API_BASE || "http://localhost:4000";

  let accessToken = null;
  let refreshInFlight = null;
  let onSessionExpired = null;
  let socket = null;

  class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  function setAccessToken(token) {
    accessToken = token;
  }
  function getAccessToken() {
    return accessToken;
  }
  function clearAccessToken() {
    accessToken = null;
  }
  function onExpired(handler) {
    onSessionExpired = handler;
  }

  // Section 6.4 — rotate the access token using the httpOnly refresh
  // cookie. Deduplicated so concurrent 401s don't fire multiple refreshes.
  async function refreshSession() {
    if (!refreshInFlight) {
      refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include"
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("REFRESH_FAILED");
          const body = await res.json();
          setAccessToken(body.token);
          return body.token;
        })
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return refreshInFlight;
  }

  // Section 4.8 — every non-2xx response carries { error: { code, message, requestId } }.
  async function parseErrorEnvelope(res) {
    try {
      const body = await res.json();
      return new ApiError(res.status, body?.error?.code || "UNKNOWN_ERROR", body?.error?.message || "Something went wrong");
    } catch {
      return new ApiError(res.status, "UNKNOWN_ERROR", "Something went wrong");
    }
  }

  // Section 4.9 — pass idempotencyKey for the six named routes (and any
  // other authenticated mutation, per the PHASE 4 precedent).
  async function request(method, path, { body, idempotencyKey, params, isRetry } = {}) {
    let url = `${API_BASE}${path}`;
    if (params) {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
      const qsString = qs.toString();
      if (qsString) url += `?${qsString}`;
    }

    const headers = { "Content-Type": "application/json" };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (res.status === 401 && !isRetry && accessToken !== null) {
      try {
        await refreshSession();
        return request(method, path, { body, idempotencyKey, params, isRetry: true });
      } catch {
        clearAccessToken();
        if (onSessionExpired) onSessionExpired();
        throw new ApiError(401, "SESSION_EXPIRED", "Your session has expired, please log in again");
      }
    }

    if (!res.ok) throw await parseErrorEnvelope(res);
    if (res.status === 204) return null;
    return res.json();
  }

  // Section 16 — multipart upload, separate from the JSON path above
  // since it must not set Content-Type itself (the browser sets the
  // multipart boundary).
  async function uploadFile(path, file, fields = {}) {
    const form = new FormData();
    form.append("file", file);
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));

    const headers = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const res = await fetch(`${API_BASE}${path}`, { method: "POST", credentials: "include", headers, body: form });
    if (!res.ok) throw await parseErrorEnvelope(res);
    return res.json();
  }

  function idempotencyKey() {
    return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  }

  // Section 12.2 — Socket.io authenticates at handshake via auth.token,
  // the same access token used for HTTP. Reconnects automatically
  // (Section 12.5); callers use onSocketEvent for dispatch:update /
  // notification:new / worker:location / connect / disconnect.
  function connectSocket() {
    if (socket) socket.disconnect();
    socket = io(SOCKET_URL, { auth: { token: accessToken }, transports: ["websocket", "polling"] });
    return socket;
  }
  function disconnectSocket() {
    if (socket) socket.disconnect();
    socket = null;
  }
  function onSocketEvent(event, handler) {
    if (socket) socket.on(event, handler);
  }
  function offSocketEvent(event, handler) {
    if (socket) socket.off(event, handler);
  }
  function isSocketConnected() {
    return !!(socket && socket.connected);
  }

  window.ApiClient = {
    request,
    uploadFile,
    idempotencyKey,
    setAccessToken,
    getAccessToken,
    clearAccessToken,
    onExpired,
    refreshSession,
    connectSocket,
    disconnectSocket,
    onSocketEvent,
    offSocketEvent,
    isSocketConnected,
    ApiError
  };
})();
