// Page-side helper (v2) for the annotation workflow.
// Inject once per origin into localStorage, then re-eval after each navigation:
//   localStorage.setItem('__A_SRC', src); eval(src);
//   if (!window.A) eval(localStorage.__A_SRC);
// Remove when the drama is done: localStorage.removeItem('__A_SRC').
// v2 changes over v1:
//   - poll() everywhere instead of fixed sleeps (menu open, tag commit, save toast)
//   - option position cache in localStorage (name -> scrollTop) shared across episodes
//   - resumable task queue in localStorage (__A_Q) survives navigation
//   - mont() seeks in ascending time order with rVFC/seeked race + timeout fallback
//   - roster cache (__A_ROLES) to skip reopening the role panel every episode
//   - tagFast consumes queue in big batches (~16 rows), returns compact results only
(function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const poll = async (fn, timeout = 1500, step = 30) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = fn(); } catch (e) {}
      if (v) return v;
      if (Date.now() - t0 >= timeout) return null;
      await sleep(step);
    }
  };
  const cs = el => ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']
    .forEach(t => el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, view: window })));
  const rows = () => [...document.querySelectorAll('.subtitle-item')];
  const P = x => { const m = x.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; };
  const v0 = () => document.querySelector('video');
  const seek = t => new Promise(res => {
    const v = v0(); if (!v) return res(false);
    let done = false;
    const fin = ok => { if (done) return; done = true; v.removeEventListener('seeked', h); res(ok); };
    const h = () => fin(true);
    v.addEventListener('seeked', h);
    try { v.currentTime = t; } catch (e) { fin(false); }
    setTimeout(() => fin(false), 1500);
  });
  // Resolve when a fresh frame is actually presented (rVFC), falling back to a short delay.
  const frame = () => new Promise(res => {
    const v = v0(); if (!v) return res(false);
    if (v.requestVideoFrameCallback) {
      let ok = false;
      v.requestVideoFrameCallback(() => { ok = true; res(true); });
      setTimeout(() => { if (!ok) res(false); }, 350);
    } else setTimeout(() => res(true), 90);
  });
  const menu = () => [...document.querySelectorAll('.n-base-select-menu')].filter(m => getComputedStyle(m).display !== 'none' && m.offsetParent !== null).pop();
  const closeM = async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); await poll(() => !menu(), 250, 25); };
  const waitMenu = () => poll(menu, 800, 25);

  // --- option position cache (per origin, shared across episodes) -------------
  const CACHE_KEY = '__A_OPTCACHE';
  const loadCache = () => { try { return JSON.parse(localStorage[CACHE_KEY] || '{}'); } catch (e) { return {}; } };
  const saveCache = c => { try { localStorage[CACHE_KEY] = JSON.stringify(c); } catch (e) {} };

  const jumpTo = (list, pos) => { list.scrollTop = pos; };
  const findOpt = (m, name) => [...m.querySelectorAll('.n-base-select-option')].find(o => (o.innerText || '').trim() === name);

  // Menu must already be open. Click `name` using the position cache when possible.
  const pick = async (name, cache) => {
    const m = await waitMenu();
    if (!m) return 'nomenu';
    const l = m.querySelector('.n-virtual-list');
    let pos = cache[name];
    if (pos != null) {
      if (l) jumpTo(l, pos);
      if (!findOpt(m, name)) pos = null;                    // stale cache entry
    }
    if (pos == null) {                                      // full scan, remember hit offset
      for (let p = 0; p <= 2100 && pos == null; p += 200) {
        if (l) jumpTo(l, p);
        await sleep(35);
        const o = findOpt(m, name);
        if (o) pos = p;
      }
    }
    if (pos == null) return 'miss:' + name;
    const o = await poll(() => findOpt(m, name), 300, 25);
    if (!o) return 'miss:' + name;
    cs(o);
    await poll(() => ![...m.querySelectorAll('.n-base-select-option')].includes(o), 400, 25);
    if (cache[name] !== pos) { cache[name] = pos; saveCache(cache); }
    return 'ok';
  };

  // --- resumable queue ---------------------------------------------------------
  const Q_KEY = '__A_Q';
  const qLoad = () => { try { return JSON.parse(localStorage[Q_KEY] || '[]'); } catch (e) { return []; } };
  const qSave = q => { try { localStorage[Q_KEY] = JSON.stringify(q); } catch (e) {} };

  // tasks: [[rowNo, name], ...] -> appended to persisted queue, then consumed in batches.
  const tagFast = async (tasks, batch = 16) => {
    const q = qLoad();
    if (Array.isArray(tasks) && tasks.length) q.push(...tasks);
    qSave(q);
    const cache = loadCache();
    const rs = rows();
    const out = [];
    while (q.length && out.length < batch) {
      const [i, n] = q[0];
      if (!rs[i - 1]) { out.push(i + ':norow'); q.shift(); qSave(q); continue; }
      await closeM();
      cs(rs[i - 1].querySelector('.n-base-selection'));
      const r = await pick(n, cache);
      out.push(i + ':' + r);
      q.shift();
      qSave(q);
    }
    const seqA = seq();
    return { out: out.join(' '), remain: q.length,
      empty: seqA.filter(x => x.endsWith(':')).length,
      multi: seqA.filter(x => x.split(':')[1].includes(',')).length };
  };

  // Kept for compatibility: plain one-shot tag (no queue).
  const tag = async ts => {
    const r = await tagFast(ts, Infinity);
    return r.out;
  };

  const seq = () => rows().map((r, i) => (i + 1) + ':' + [...r.querySelectorAll('.n-base-selection-tag-wrapper')].map(t => t.innerText.trim()).join(','));
  const verify = exp => {
    const a = seq(); const bad = [];
    exp.forEach((n, i) => { if (a[i] !== (i + 1) + ':' + n) bad.push((i + 1) + '>' + a[i]); });
    return { count: a.length, empty: a.filter(x => x.endsWith(':')).length, bad: bad.slice(0, 12) };
  };

  // --- save / wait helpers (poll-based) ----------------------------------------
  const save = async () => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '保存' && x.offsetParent !== null);
    if (!b) return 'nosave';
    b.click();
    const toast = await poll(() => {
      const el = document.querySelector('.n-message, [class*=message]');
      return el && /保存成功/.test(el.innerText || '') ? 'toast' : null;
    }, 5000, 100);
    await sleep(600);
    const a = seq();
    return { saved: a.length, empty: a.filter(x => x.endsWith(':')).length, toast: toast || 'notseen' };
  };

  // Wait until subtitle rows exist and count is stable (after nav/reload).
  const waitRows = async (timeout = 8000) => {
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < timeout) {
      const rs = rows();
      if (rs.length && rs.length === n) return rs.length;
      n = rs.length;
      await sleep(250);
    }
    return rows().length;
  };

  // --- roster cache -------------------------------------------------------------
  const R_KEY = '__A_ROLES';
  const rolesCache = () => { try { return JSON.parse(localStorage[R_KEY] || '[]'); } catch (e) { return []; } };
  const roles = () => [...document.querySelectorAll('.list-role-item')].filter(e => e.offsetParent !== null)
    .map(e => { const n = e.querySelector('.role-item-name-text'); return n ? n.innerText.trim() : ''; }).filter(Boolean);
  // Diff desired bare names vs cached roster; returns names to create (no UI open).
  const rolesDiff = names => names.filter(n => !rolesCache().some(r => r.split('-')[1] === n));

  const openRoles = async () => {
    if (roles().length) return roles().length;               // panel already open
    const rl = [...document.querySelectorAll('.app-action-chip')].find(e => (e.innerText || '').trim() === '角色列表' && e.offsetParent !== null);
    if (rl) { cs(rl); await poll(() => roles().length, 1200, 60); }
    const r = roles();
    if (r.length) { try { localStorage[R_KEY] = JSON.stringify(r); } catch (e) {} }
    return r.length;
  };

  // Call once per episode after waitRows; skips opening the panel when cache is valid.
  const rosterSync = async () => {
    const cached = rolesCache();
    if (cached.length) return { cached: cached.length };
    await openRoles();
    return { cached: rolesCache().length || roles().length };
  };

  const mont = async o => {
    const v = v0(); if (!v) return 'novideo';
    document.getElementById('__mont')?.remove();
    const rr = rows(); const S = o.S || 190, cols = o.cols || 4, t = o.t ?? 0.6;
    const crop = o.crop || [0, 150, 1080, 1080];
    const cells = [];
    for (const i of o.rows) {
      const ins = [...rr[i - 1].querySelectorAll('input')];
      const a = P(ins[0].value), b = P(ins[1].value);
      cells.push({ i, t: a + (b - a) * t });
      if (o.two) cells.push({ i, t: a + (b - a) * Math.min(t + 0.3, 0.9) });
    }
    cells.sort((a, b) => a.t - b.t);                         // ascending seek = fewer HLS re-buffers
    const card = document.createElement('div');
    card.id = '__mont';
    card.style.cssText = 'position:fixed;left:0;top:' + (o.top == null ? -150 : o.top) + 'px;z-index:2147483646;transform-origin:top left;transform:scale(' + (o.scale || 0.72) + ');background:#111;color:#fff;font:12px monospace;';
    const cv = document.createElement('canvas');
    cv.width = S * cols; cv.height = S * Math.ceil(cells.length / cols);
    const ctx = cv.getContext('2d');
    v.pause();
    let n = 0, stale = 0;
    for (const c of cells) {
      const ok = await seek(c.t);
      if (!ok) stale++;
      await frame();
      const col = n % cols, row = Math.floor(n / cols), x = col * S, y = row * S;
      ctx.drawImage(v, crop[0], crop[1], crop[2], crop[3], x, y, S, S * crop[3] / crop[2]);
      ctx.fillStyle = '#000a'; ctx.fillRect(x, y, S, 16);
      ctx.fillStyle = '#0f0'; ctx.fillText('#' + c.i + ' t' + c.t.toFixed(1), x + 3, y + 12);
      n++;
    }
    card.appendChild(cv); document.documentElement.appendChild(card);
    return { cells: n, seekTimeouts: stale };
  };

  const avatar = async o => {
    const v = v0(); if (!v) return 'novideo';
    await seek(o.t); await frame();
    const S = o.s || 900;
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    cv.getContext('2d').drawImage(v, o.x, o.y, S, S, 0, 0, S, S);
    let img = document.getElementById('__avatar');
    if (!img) { img = document.createElement('img'); img.id = '__avatar'; img.alt = 'avatar-candidate'; document.documentElement.appendChild(img); }
    img.style.cssText = 'position:fixed;left:0;top:0;width:540px;height:540px;z-index:2147483647;display:block;';
    img.src = cv.toDataURL('image/jpeg', 0.9);
    await sleep(350);
    document.getElementById('__mont')?.remove();
    return img.naturalWidth + 'x' + img.naturalHeight;
  };

  const hideAvatar = () => { const i = document.getElementById('__avatar'); if (i) i.style.display = 'none'; };

  const showInput = async () => {
    hideAvatar();
    const add = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && (b.innerText || '').trim() === '添加角色');
    if (!add) return 'noadd';
    cs(add);
    const m = await poll(() => [...document.querySelectorAll('.n-modal')].find(x => (x.innerText || '').includes('添加角色') && x.offsetParent !== null), 1500, 50);
    if (!m) return 'nomodal';
    const inp = m.querySelector('input[type=file]');
    inp.style.cssText = 'display:block!important;position:fixed;left:8px;top:8px;width:120px;height:24px;opacity:1;z-index:2147483647;border:2px solid #f00;background:#fff;';
    inp.removeAttribute('hidden');
    return 'ready';
  };

  const setV = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };

  const addRole = async o => {
    const m = await poll(() => [...document.querySelectorAll('.n-modal')].find(x => (x.innerText || '').includes('添加角色') && x.offsetParent !== null), 1500, 50);
    if (!m) return 'nomodal';
    const n = m.querySelector('input[placeholder="请输入 角色名称"]');
    setV(n, o.name); await sleep(150);
    for (const l of [o.sex, o.age]) { const el = [...m.querySelectorAll('label')].find(x => x.innerText.trim() === l); if (el) { cs(el); await sleep(100); } }
    const ck = [...m.querySelectorAll('label.n-radio-button--checked')].map(x => x.innerText.trim());
    if (o.go !== false) {
      const ok = [...m.querySelectorAll('button')].find(b => b.innerText.trim() === '确定');
      cs(ok);
      // Modal may stay open (duplicate-name toast) — wait for close OR roster growth.
      const before = roles().length;
      await poll(() => {
        const mm = [...document.querySelectorAll('.n-modal')].find(x => (x.innerText || '').includes('添加角色') && x.offsetParent !== null);
        return !mm || roles().length > before ? 'done' : null;
      }, 2500, 60);
      // Refresh roster cache with the new role.
      const rc = rolesCache(); rc.push(o.sex + '-' + o.name + '-' + o.age);
      try { localStorage[R_KEY] = JSON.stringify(rc); } catch (e) {}
    }
    return ck.join(',') + ' roles:' + (roles().length || rolesCache().length);
  };

  const clear = () => {
    ['__A_SRC', Q_KEY, CACHE_KEY, R_KEY].forEach(k => localStorage.removeItem(k));
    delete window.A;
    return 'cleared';
  };

  window.A = { tag, tagFast, seq, verify, save, waitRows, rosterSync, openRoles, roles, rolesDiff,
    rolesCache, mont, avatar, showInput, addRole, hideAvatar, s: sleep, q: qLoad, clear };
  return 'helper-ok-v2';
})();
