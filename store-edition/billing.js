(() => {
  const config = globalThis.SCROLLKEEP_BILLING_CONFIG;
  const DAY = 86400000;
  const STORAGE_KEY = 'scrollkeepBillingV1';
  let queue = Promise.resolve();
  const serialize = (fn) => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  const decode = (value) => {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('激活码格式无效');
    const raw = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(raw + '='.repeat((4 - raw.length % 4) % 4)), (char) => char.charCodeAt(0));
  };
  async function verifyLicense(token) {
    if (typeof token !== 'string' || token.length > 8192) throw new Error('激活码格式无效');
    const parts = token.trim().split('.');
    if (parts.length !== 2) throw new Error('激活码格式无效');
    const key = await crypto.subtle.importKey('jwk', config.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, decode(parts[1]), new TextEncoder().encode(parts[0]));
    if (!valid) throw new Error('激活码签名无效，请检查是否复制完整');
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (payload.product !== 'scrollkeep' || payload.version !== 1 || !payload.licenseId ||
        !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) ||
        payload.issuedAt < 0 || payload.expiresAt <= payload.issuedAt) throw new Error('激活码内容无效');
    if (Boolean(payload.test) !== Boolean(config.testMode)) throw new Error('测试激活码不能用于正式版本，正式激活码也不能用于测试版本');
    return payload;
  }
  async function load() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] || {};
  }
  async function statusFor(state) {
    const now = Math.max(Date.now(), Number.isSafeInteger(state.lastSeen) ? state.lastSeen : 0);
    state.lastSeen = now;
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    let invalidLicense;
    if (state.license) {
      try {
        const license = await verifyLicense(state.license);
        if (license.issuedAt <= now + 300000 && license.expiresAt > now) {
          return { allowed: true, state: 'licensed', expiresAt: license.expiresAt, text: `年度授权有效至 ${new Date(license.expiresAt).toLocaleDateString()}`, testMode: config.testMode };
        }
        invalidLicense = '年度授权已到期，请续费后输入新的激活码';
      } catch (error) { invalidLicense = error.message; }
    }
    const trialStart = state.trialStartedAt;
    if (Number.isSafeInteger(trialStart) && trialStart > 0 && trialStart <= now) {
      const expiresAt = trialStart + config.trialDays * DAY;
      if (now < expiresAt) {
        return { allowed: true, state: 'trial', expiresAt, daysLeft: Math.ceil((expiresAt - now) / DAY), text: `免费试用剩余 ${Math.ceil((expiresAt - now) / DAY)} 天 · 之后 US$1/年`, testMode: config.testMode };
      }
      return { allowed: false, state: 'expired', text: invalidLicense || '14 天免费试用已结束，US$1/年，激活后继续导出', testMode: config.testMode };
    }
    return { allowed: false, state: 'not-started', text: invalidLicense || '免费试用 14 天，之后 US$1/年', testMode: config.testMode };
  }
  const getStatus = () => serialize(async () => statusFor(await load()));
  const startTrial = () => serialize(async () => {
    const state = await load();
    if (!state.trialStartedAt) state.trialStartedAt = Math.max(Date.now(), state.lastSeen || 0);
    return statusFor(state);
  });
  const activate = (token) => serialize(async () => {
    const license = await verifyLicense(token);
    const state = await load();
    const now = Math.max(Date.now(), state.lastSeen || 0);
    if (license.issuedAt > now + 300000) throw new Error('激活码尚未生效，请检查系统时间');
    if (license.expiresAt <= now) throw new Error('年度授权已到期');
    if (state.license) {
      try {
        const old = await verifyLicense(state.license);
        if (old.expiresAt > license.expiresAt) throw new Error('新的激活码有效期更短，已保留当前授权');
      } catch (error) {
        if (error.message.includes('有效期更短')) throw error;
      }
    }
    state.license = token.trim();
    return statusFor(state);
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    const handlers = { GET_BILLING_STATUS: getStatus, START_TRIAL: startTrial, ACTIVATE_LICENSE: () => activate(message.token) };
    if (!handlers[message.type] || sender.tab) return;
    handlers[message.type]().then((result) => respond({ ok: true, ...result }), (error) => respond({ ok: false, error: error.message }));
    return true;
  });
  globalThis.ScrollKeepBilling = { getStatus, startTrial, activate, verifyLicense };
})();
