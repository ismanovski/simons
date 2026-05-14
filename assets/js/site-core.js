(function () {
  const KEYS = {
    consent: 'sb_cookie_consent_v1',
    users: 'sb_users',
    currentUserId: 'sb_current_user_id',
    analyticsVisits: 'sb_analytics_visits',
    analyticsEvents: 'sb_analytics_events'
  };

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // no-op
    }
  }

  function uid(prefix = 'ID') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function toDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function daysSince(iso) {
    const d = toDate(iso);
    if (!d) return Number.POSITIVE_INFINITY;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  }

  /* ---------------- Cookie Consent ---------------- */
  function getConsent() {
    return safeRead(KEYS.consent, null);
  }

  function setConsent(mode) {
    safeWrite(KEYS.consent, {
      mode,
      setAt: nowIso(),
      version: 1
    });
  }

  function ensureCookieBanner() {
    if (getConsent()) return;

    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.innerHTML = `
      <div class="cookie-banner-content">
        <p><strong>Cookies & lokale Daten</strong><br>Wir verwenden lokale Speicher (Warenkorb, Login, Analyse), um die Website und Bestellungen zu ermöglichen.</p>
        <div class="cookie-banner-actions">
          <button type="button" class="btn btn-secondary" data-cookie="necessary">Nur notwendige</button>
          <button type="button" class="btn btn-primary" data-cookie="all">Alle akzeptieren</button>
        </div>
      </div>`;

    banner.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-cookie]');
      if (!btn) return;
      setConsent(btn.dataset.cookie);
      banner.remove();
      trackEvent('cookie_consent_set', { mode: btn.dataset.cookie });
    });

    document.body.appendChild(banner);
  }

  /* ---------------- Auth ---------------- */
  function getUsers() {
    return safeRead(KEYS.users, []);
  }

  function saveUsers(users) {
    safeWrite(KEYS.users, users);
  }

  function getCurrentUser() {
    const id = localStorage.getItem(KEYS.currentUserId);
    if (!id) return null;
    return getUsers().find(u => u.id === id) || null;
  }

  function setCurrentUser(userId) {
    if (!userId) {
      localStorage.removeItem(KEYS.currentUserId);
      return;
    }
    localStorage.setItem(KEYS.currentUserId, userId);
  }

  function registerUser(payload) {
    const users = getUsers();
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) {
      return { ok: false, message: 'E-Mail fehlt.' };
    }
    if (users.some(u => u.email === email)) {
      return { ok: false, message: 'E-Mail ist bereits registriert.' };
    }

    const user = {
      id: uid('USER'),
      firstName: String(payload.firstName || '').trim(),
      lastName: String(payload.lastName || '').trim(),
      email,
      phone: String(payload.phone || '').trim(),
      password: String(payload.password || ''),
      newsletterConsent: !!payload.newsletterConsent,
      createdAt: nowIso(),
      lastLoginAt: nowIso(),
      lastActiveAt: nowIso()
    };

    users.push(user);
    saveUsers(users);
    setCurrentUser(user.id);
    trackEvent('auth_register_success', { email: user.email });
    return { ok: true, user };
  }

  function loginUser(emailInput, passwordInput) {
    const email = String(emailInput || '').trim().toLowerCase();
    const password = String(passwordInput || '');
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      trackEvent('auth_login_failed', { email });
      return { ok: false, message: 'Ungültige E-Mail oder Passwort.' };
    }

    user.lastLoginAt = nowIso();
    user.lastActiveAt = nowIso();
    saveUsers(users);
    setCurrentUser(user.id);
    trackEvent('auth_login_success', { email: user.email });
    return { ok: true, user };
  }

  function logoutUser() {
    const user = getCurrentUser();
    setCurrentUser(null);
    trackEvent('auth_logout', { email: user?.email || null });
  }

  function updateCurrentUser(patch) {
    const user = getCurrentUser();
    if (!user) return null;
    const users = getUsers();
    const index = users.findIndex(u => u.id === user.id);
    if (index < 0) return null;
    users[index] = {
      ...users[index],
      ...patch,
      lastActiveAt: nowIso()
    };
    saveUsers(users);
    return users[index];
  }

  /* ---------------- Analytics ---------------- */
  const visitId = uid('VISIT');
  const visitStartedAt = Date.now();
  let lastInteraction = Date.now();
  let activeSeconds = 0;
  let inactiveSeconds = 0;

  const activeTick = setInterval(() => {
    const visible = document.visibilityState === 'visible';
    if (!visible) {
      inactiveSeconds += 1;
      return;
    }
    const idleMs = Date.now() - lastInteraction;
    if (idleMs <= 30000) {
      activeSeconds += 1;
    } else {
      inactiveSeconds += 1;
    }
  }, 1000);

  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, () => {
      lastInteraction = Date.now();
      const user = getCurrentUser();
      if (user) {
        updateCurrentUser({ lastActiveAt: nowIso() });
      }
    }, { passive: true });
  });

  function trackEvent(type, payload = {}) {
    const user = getCurrentUser();
    const events = safeRead(KEYS.analyticsEvents, []);
    events.push({
      id: uid('EVT'),
      type,
      at: nowIso(),
      page: location.pathname,
      title: document.title,
      visitId,
      userId: user?.id || null,
      userEmail: payload.email || user?.email || null,
      payload
    });
    safeWrite(KEYS.analyticsEvents, events.slice(-3000));
  }

  function finalizeVisit() {
    clearInterval(activeTick);
    const visits = safeRead(KEYS.analyticsVisits, []);
    const durationSec = Math.max(1, Math.round((Date.now() - visitStartedAt) / 1000));
    visits.push({
      id: visitId,
      page: location.pathname,
      title: document.title,
      startedAt: new Date(visitStartedAt).toISOString(),
      endedAt: nowIso(),
      durationSec,
      activeSec: activeSeconds,
      inactiveSec: inactiveSeconds
    });
    safeWrite(KEYS.analyticsVisits, visits.slice(-3000));
  }

  window.addEventListener('beforeunload', finalizeVisit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      trackEvent('page_hidden');
    }
  });

  trackEvent('page_view');
  ensureCookieBanner();

  function getAudience(segment = 'all') {
    const users = getUsers();
    const events = safeRead(KEYS.analyticsEvents, []);

    const byEmail = new Map();
    users.forEach(u => byEmail.set(u.email, u));

    const orderStarted = new Set();
    const orderDone = new Set();
    const resStarted = new Set();
    const resDone = new Set();

    events.forEach(e => {
      const email = (e.userEmail || '').toLowerCase();
      if (!email) return;
      if (e.type === 'shop_checkout_opened') orderStarted.add(email);
      if (e.type === 'shop_order_submitted') orderDone.add(email);
      if (e.type === 'reservation_started') resStarted.add(email);
      if (e.type === 'reservation_submitted') resDone.add(email);
    });

    switch (segment) {
      case 'registered':
        return users;
      case 'active7':
        return users.filter(u => daysSince(u.lastActiveAt || u.lastLoginAt || u.createdAt) <= 7);
      case 'inactive14':
        return users.filter(u => daysSince(u.lastActiveAt || u.lastLoginAt || u.createdAt) > 14);
      case 'newsletter':
        return users.filter(u => !!u.newsletterConsent);
      case 'orderAbandoners':
        return users.filter(u => orderStarted.has(u.email) && !orderDone.has(u.email));
      case 'reservationAbandoners':
        return users.filter(u => resStarted.has(u.email) && !resDone.has(u.email));
      default:
        return users;
    }
  }

  window.SBPlatform = {
    keys: KEYS,
    getConsent,
    setConsent,
    trackEvent,
    getUsers,
    getCurrentUser,
    registerUser,
    loginUser,
    logoutUser,
    updateCurrentUser,
    getAudience,
    getAnalytics: () => ({
      visits: safeRead(KEYS.analyticsVisits, []),
      events: safeRead(KEYS.analyticsEvents, [])
    })
  };
})();
