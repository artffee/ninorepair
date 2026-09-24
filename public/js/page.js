/* ══════════════════════════════════════════════════════════════════════════════
   NinoRepair — inner pages (services, cities, hosts)
   Header, mobile nav, reveals and the contact form. main.js stays homepage-only
   because its estimator code expects the estimator markup to exist.
   ══════════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const PHONE = '(954) 508-0246';

  document.documentElement.classList.add('js');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hdr = $('#hdr');
  if (hdr) {
    const onScroll = () => hdr.classList.toggle('is-stuck', window.scrollY > 12);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const burger = $('#burger');
  const mobnav = $('#mobnav');
  if (burger && mobnav) {
    const setNav = (open) => { burger.setAttribute('aria-expanded', String(open)); mobnav.hidden = !open; };
    burger.addEventListener('click', () => setNav(burger.getAttribute('aria-expanded') !== 'true'));
    mobnav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mobnav.hidden) setNav(false); });
    addEventListener('resize', () => { if (innerWidth > 900) setNav(false); });
  }

  const revealed = $$('.rv');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealed.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    revealed.forEach((el) => io.observe(el));
  }


  /* ── Honey-do notepad ── */
  const pad = $('.pad');
  if (pad) {
    const items = $$('.pad-item', pad);
    const done = $('.pad-done', pad);
    const check = () => {
      const all = items.every((b) => b.getAttribute('aria-pressed') === 'true');
      pad.classList.toggle('is-done', all);
      done.textContent = all ? 'All done. Handled by Nino.' : '';
    };
    items.forEach((b) => b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      check();
    }));
    // One orchestrated moment: the first item crosses itself off shortly after load.
    if (!reduceMotion && items[0]) {
      setTimeout(() => { if (items[0].getAttribute('aria-pressed') === 'false') { items[0].setAttribute('aria-pressed', 'true'); check(); } }, 1400);
    }
  }

  const yr = $('#yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

  const lead = $('#lead-form');
  if (!lead) return;
  const leadGo = $('#lead-go');
  const leadMsg = $('#lead-msg');
  const busy = (btn, on) => { btn.classList.toggle('is-busy', on); btn.disabled = on; };
  const say = (text, kind) => { leadMsg.textContent = text; leadMsg.className = `form-msg${kind ? ` is-${kind}` : ''}`; };

  lead.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: $('#l-name').value.trim(),
      phone: $('#l-phone').value.trim(),
      email: $('#l-email').value.trim(),
      city: $('#l-city').value.trim(),
      service: $('#l-service').value,
      message: $('#l-msg').value.trim(),
      website: $('#l-website').value,
    };
    const bad = [];
    if (!payload.name) bad.push('#l-name');
    if (payload.phone.replace(/\D/g, '').length < 7) bad.push('#l-phone');
    $$('.contact-form .fld').forEach((f) => f.classList.remove('is-bad'));
    if (bad.length) {
      bad.forEach((sel) => $(sel).closest('.fld').classList.add('is-bad'));
      $(bad[0]).focus();
      say('Name and a phone number Nino can text you back on, please.', 'bad');
      return;
    }
    busy(leadGo, true);
    say('Sending…');
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { say(data.error || `That did not go through. Call or text ${PHONE}.`, 'bad'); return; }
      lead.reset();
      say(`Got it — Nino will text you back within the hour during working hours. Anything urgent, call ${PHONE}.`, 'ok');
    } catch {
      say(`Could not reach the server. Call or text ${PHONE} and it is handled.`, 'bad');
    } finally {
      busy(leadGo, false);
    }
  });
})();
