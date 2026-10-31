// Page-side helper for the annotation workflow.
// Inject once per origin into localStorage, then re-eval after each navigation:
//   localStorage.setItem('__A_SRC', src); eval(src);
//   if (!window.A) eval(localStorage.__A_SRC);
// Remove when the drama is done: localStorage.removeItem('__A_SRC').
(function () {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const cs = el => ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']
    .forEach(t => el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, view: window })));
  const rows = () => [...document.querySelectorAll('.subtitle-item')];
  const P = x => { const m = x.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; };
  const seek = t => new Promise(res => { const v = document.querySelector('video'); const h = () => { v.removeEventListener('seeked', h); res(); }; v.addEventListener('seeked', h); v.currentTime = t; });
  const menu = () => [...document.querySelectorAll('.n-base-select-menu')].filter(m => getComputedStyle(m).display !== 'none' && m.offsetParent !== null).pop();
  const closeM = async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); await s(80); };

  const pick = async n => {
    const m = menu(); if (!m) return 'nomenu';
    const l = m.querySelector('.n-virtual-list');
    const o = () => [...m.querySelectorAll('.n-base-select-option')];
    let f = null;
    for (let p = 0; p <= 2100 && !f; p += 200) { if (l) l.scrollTop = p; await s(35); f = o().find(e => (e.innerText || '').trim() === n); }
    if (f) { cs(f); await s(150); return 'ok'; }
    return 'miss';
  };

  const tag = async ts => {
    const rs = rows(); const out = [];
    for (const [i, n] of ts) { await closeM(); cs(rs[i - 1].querySelector('.n-base-selection')); await s(220); out.push(i + ':' + await pick(n)); }
    return out.join(' ');
  };

  const seq = () => rows().map((r, i) => (i + 1) + ':' + [...r.querySelectorAll('.n-base-selection-tag-wrapper')].map(t => t.innerText.trim()).join(','));
  const verify = exp => {
    const a = seq(); const bad = [];
    exp.forEach((n, i) => { if (a[i] !== (i + 1) + ':' + n) bad.push((i + 1) + '>' + a[i]); });
    return { count: a.length, empty: a.filter(x => x.endsWith(':')).length, bad: bad.slice(0, 12) };
  };
  const save = async () => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '保存' && x.offsetParent !== null);
    if (!b) return 'nosave';
    b.click(); await s(4000);
    const a = seq();
    return { saved: a.length, empty: a.filter(x => x.endsWith(':')).length };
  };

  const roles = () => [...document.querySelectorAll('.list-role-item')].filter(e => e.offsetParent !== null)
    .map(e => { const n = e.querySelector('.role-item-name-text'); return n ? n.innerText.trim() : ''; });

  const mont = async o => {
    const v = document.querySelector('video');
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
    const card = document.createElement('div');
    card.id = '__mont';
    card.style.cssText = 'position:fixed;left:0;top:' + (o.top == null ? -150 : o.top) + 'px;z-index:2147483646;transform-origin:top left;transform:scale(' + (o.scale || 0.72) + ');background:#111;color:#fff;font:12px monospace;';
    const cv = document.createElement('canvas');
    cv.width = S * cols; cv.height = S * Math.ceil(cells.length / cols);
    const ctx = cv.getContext('2d');
    let n = 0; v.pause();
    for (const c of cells) {
      await seek(c.t); await s(55);
      const col = n % cols, row = Math.floor(n / cols), x = col * S, y = row * S;
      ctx.drawImage(v, crop[0], crop[1], crop[2], crop[3], x, y, S, S * crop[3] / crop[2]);
      ctx.fillStyle = '#000a'; ctx.fillRect(x, y, S, 16);
      ctx.fillStyle = '#0f0'; ctx.fillText('#' + c.i + ' t' + c.t.toFixed(1), x + 3, y + 12);
      n++;
    }
    card.appendChild(cv); document.documentElement.appendChild(card);
    return n;
  };

  const avatar = async o => {
    const v = document.querySelector('video'); if (!v) return 'novideo';
    await seek(o.t); await s(220);
    const S = o.s || 900;
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    cv.getContext('2d').drawImage(v, o.x, o.y, S, S, 0, 0, S, S);
    let img = document.getElementById('__avatar');
    if (!img) { img = document.createElement('img'); img.id = '__avatar'; img.alt = 'avatar-candidate'; document.documentElement.appendChild(img); }
    img.style.cssText = 'position:fixed;left:0;top:0;width:540px;height:540px;z-index:2147483647;display:block;';
    img.src = cv.toDataURL('image/jpeg', 0.9);
    await s(350);
    document.getElementById('__mont')?.remove();
    return img.naturalWidth + 'x' + img.naturalHeight;
  };

  const hideAvatar = () => { const i = document.getElementById('__avatar'); if (i) i.style.display = 'none'; };

  const showInput = async () => {
    hideAvatar();
    const add = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && (b.innerText || '').trim() === '添加角色');
    if (!add) return 'noadd';
    cs(add); await s(800);
    const m = [...document.querySelectorAll('.n-modal')].find(x => (x.innerText || '').includes('添加角色') && x.offsetParent !== null);
    if (!m) return 'nomodal';
    const inp = m.querySelector('input[type=file]');
    inp.style.cssText = 'display:block!important;position:fixed;left:8px;top:8px;width:120px;height:24px;opacity:1;z-index:2147483647;border:2px solid #f00;background:#fff;';
    inp.removeAttribute('hidden');
    return 'ready';
  };

  const setV = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };

  const addRole = async o => {
    await s(1300);
    const m = [...document.querySelectorAll('.n-modal')].find(x => (x.innerText || '').includes('添加角色') && x.offsetParent !== null);
    if (!m) return 'nomodal';
    const n = m.querySelector('input[placeholder="请输入 角色名称"]');
    setV(n, o.name); await s(150);
    for (const l of [o.sex, o.age]) { const el = [...m.querySelectorAll('label')].find(x => x.innerText.trim() === l); if (el) { cs(el); await s(100); } }
    const ck = [...m.querySelectorAll('label.n-radio-button--checked')].map(x => x.innerText.trim());
    if (o.go !== false) { const ok = [...m.querySelectorAll('button')].find(b => b.innerText.trim() === '确定'); cs(ok); await s(1500); }
    return ck.join(',') + ' roles:' + roles().length;
  };

  const openRoles = async () => {
    const rl = [...document.querySelectorAll('.app-action-chip')].find(e => (e.innerText || '').trim() === '角色列表' && e.offsetParent !== null);
    if (rl) { cs(rl); await s(800); }
    return roles().length;
  };

  window.A = { tag, seq, verify, save, roles, mont, avatar, showInput, addRole, openRoles, hideAvatar, s };
  return 'helper-ok';
})();
