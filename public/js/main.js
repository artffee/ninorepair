/* ══════════════════════════════════════════════════════════════════════════════
   NinoRepair — site behaviour
   Header state, mobile nav, scroll reveals, the photo estimator (/api/estimate)
   and the contact form (/api/lead). No dependencies.
   ══════════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const PHONE      = '(954) 508-0246';
  const PHONE_HREF = 'tel:+19545080246';

  /* Reveals hide themselves only once we know JS is running, so a failed script
     leaves a fully readable page instead of a blank one. */
  document.documentElement.classList.add('js');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Header ─────────────────────────────────────────────────────────────────── */

  const hdr = $('#hdr');
  const onScroll = () => hdr.classList.toggle('is-stuck', window.scrollY > 12);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Mobile nav ─────────────────────────────────────────────────────────────── */

  const burger = $('#burger');
  const mobnav = $('#mobnav');

  const setNav = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    mobnav.hidden = !open;
  };

  burger.addEventListener('click', () =>
    setNav(burger.getAttribute('aria-expanded') !== 'true'),
  );
  mobnav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setNav(false);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobnav.hidden === false) setNav(false);
  });
  // A resize past the breakpoint would otherwise leave the panel stranded open.
  addEventListener('resize', () => {
    if (innerWidth > 900) setNav(false);
  });

  /* ── Scroll reveals ─────────────────────────────────────────────────────────── */

  const revealed = $$('.rv');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealed.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    );
    revealed.forEach((el) => io.observe(el));
  }

  const yr = $('#yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* ── Helpers ────────────────────────────────────────────────────────────────── */

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);

  const money = (n) =>
    `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

  const busy = (btn, on) => {
    btn.classList.toggle('is-busy', on);
    btn.disabled = on;
  };

  const list = (items) =>
    (Array.isArray(items) ? items : [])
      .filter((s) => String(s || '').trim())
      .map((s) => `<li>${esc(s)}</li>`)
      .join('');

  const block = (title, items, variant = '') =>
    list(items)
      ? `<div class="res-block">
           <h4>${esc(title)}</h4>
           <ul class="res-list ${variant}">${list(items)}</ul>
         </div>`
      : '';

  /* ══════════ PHOTO ESTIMATOR ══════════ */

  const form   = $('#est-form');
  const drop   = $('#drop');
  const input  = $('#files');
  const thumbs = $('#thumbs');
  const out    = $('#est-out');
  const go     = $('#est-go');

  const MAX_FILES = 5;
  const MAX_BYTES = 8 * 1024 * 1024;
  const OK_TYPES  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  /** Files live here rather than in the input, so individual ones can be removed. */
  let picked = [];

  const paintThumbs = () => {
    thumbs.innerHTML = '';

    picked.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const cell = document.createElement('div');
      cell.className = 'thumb';
      cell.innerHTML =
        `<img src="${url}" alt="${esc(file.name)}" />` +
        `<button type="button" class="thumb-x" aria-label="Remove ${esc(file.name)}">×</button>`;

      cell.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
      cell.querySelector('.thumb-x').addEventListener('click', () => {
        picked.splice(i, 1);
        paintThumbs();
      });

      thumbs.appendChild(cell);
    });

    drop.querySelector('.drop-t').innerHTML = picked.length
      ? `${picked.length} photo${picked.length > 1 ? 's' : ''} ready <span>· add more</span>`
      : 'Drop photos here <span>or click to browse</span>';
  };

  const addFiles = (fileList) => {
    const rejected = [];

    Array.from(fileList).forEach((file) => {
      if (picked.length >= MAX_FILES) return;
      if (!OK_TYPES.includes(file.type)) return rejected.push(`${file.name} — not a JPG, PNG, WEBP or GIF`);
      if (file.size > MAX_BYTES) return rejected.push(`${file.name} — over 8MB`);
      // Same photo picked twice in two trips through the file dialog.
      if (picked.some((p) => p.name === file.name && p.size === file.size)) return;
      picked.push(file);
    });

    paintThumbs();
    if (rejected.length) showError(`Skipped: ${rejected.join(' · ')}`);
  };

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((type) =>
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add('is-over');
    }),
  );
  ['dragleave', 'drop'].forEach((type) =>
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
    }),
  );
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });
  // Without this, dropping a photo anywhere else navigates away from the page.
  ['dragover', 'drop'].forEach((type) =>
    addEventListener(type, (e) => {
      if (!e.target.closest('#drop')) e.preventDefault();
    }),
  );

  function showWorking() {
    out.innerHTML =
      `<div class="est-work">
         <div class="est-work-bar"></div>
         <p class="est-work-t">Reading the photos</p>
         <p class="est-work-s">Sizing the damage · checking Broward rates</p>
       </div>`;
  }

  function showError(message) {
    out.innerHTML =
      `<div class="est-err">
         <p>${esc(message)}</p>
         <a class="btn btn-amber" href="${PHONE_HREF}">Text Nino instead · ${PHONE}</a>
       </div>`;
  }

  const BUCKETS = {
    handyman: { label: 'We handle it',   cls: '' },
    licensed: { label: 'Licensed trade', cls: 'is-licensed' },
    inspect:  { label: 'Needs a look',   cls: 'is-inspect' },
  };

  function render(est) {
    const bucket = BUCKETS[est.bucket] || BUCKETS.handyman;
    const priced = est.bucket === 'handyman' && Number(est.priceHigh) > 0;

    const priceRow = priced
      ? `<div class="res-price">
           <b>${money(est.priceLow)}–${money(est.priceHigh)}</b>
           <em>ballpark</em>
           <div class="res-hours">
             <span class="mono">On site</span>
             <b>${esc(est.estimatedHours || '—')}</b>
           </div>
         </div>`
      : `<div class="res-notice ${est.bucket === 'inspect' ? 'is-inspect' : ''}">
           ${est.bucket === 'inspect'
             ? 'We are not putting a number on this from a photo. It needs eyes on it first — that is the honest answer, not a stall.'
             : 'This one needs a Florida-licensed trade. Nino brings in a licensed partner, project-manages the job, and does all the surrounding work — patch, texture, paint-back.'}
         </div>`;

    const items = (Array.isArray(est.lineItems) ? est.lineItems : [])
      .map(
        (li) =>
          `<li><i>${esc(li.label)}</i><s></s><b>${money(li.low)}–${money(li.high)}</b></li>`,
      )
      .join('');

    out.innerHTML =
      `<article class="res">
         <div class="res-hd">
           <span class="res-badge ${bucket.cls}">${esc(bucket.label)}</span>
           <span class="res-conf is-${esc(est.confidence || 'medium')}">
             ${esc(est.confidence || 'medium')} confidence
           </span>
         </div>

         <h3 class="res-title">${esc(est.jobTitle || 'Your job')}</h3>
         ${priceRow}
         ${est.summary ? `<p class="res-summary">${esc(est.summary)}</p>` : ''}

         ${items
           ? `<div class="res-block"><h4>Line items</h4><ul class="res-items">${items}</ul></div>`
           : ''}

         ${block('What we see', est.observations)}
         ${block('Scope of work', est.scope)}
         ${block('Watch-outs', est.watchOuts, 'is-warn')}
         ${block('Photos that would tighten this', est.photoTips, 'is-tip')}

         ${est.confidenceReason
           ? `<div class="res-block"><h4>Why that confidence</h4>
                <p class="res-fine">${esc(est.confidenceReason)}</p></div>`
           : ''}

         <div class="res-cta">
           <a class="btn btn-amber" href="${PHONE_HREF}">Text these photos to Nino</a>
           <a class="btn btn-outline" href="#contact">Book the visit</a>
         </div>
         <p class="res-fine">
           Ballpark from photos only. Final price is confirmed on site before any work starts.
         </p>
       </article>`;

    out.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const description = $('#desc').value.trim();
    if (!picked.length && !description) {
      showError('Add at least one photo, or tell us what is going on in a line or two.');
      return;
    }

    const body = new FormData();
    picked.forEach((file) => body.append('photos', file, file.name));
    body.append('description', description);
    body.append('city', $('#city').value.trim());
    body.append('propertyType', $('#ptype').value);
    body.append('urgency', $('#urgency').value);

    busy(go, true);
    showWorking();

    try {
      const res = await fetch('/api/estimate', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.estimate) {
        showError(data.error || `Something went wrong reading that. Text the photos to ${PHONE}.`);
        return;
      }
      render(data.estimate);
    } catch {
      showError(`Could not reach the estimator — check your connection, or just text the photos to ${PHONE}.`);
    } finally {
      busy(go, false);
    }
  });

  /* ══════════ CONTACT FORM ══════════ */

  const lead    = $('#lead-form');
  const leadGo  = $('#lead-go');
  const leadMsg = $('#lead-msg');

  const say = (text, kind) => {
    leadMsg.textContent = text;
    leadMsg.className = `form-msg${kind ? ` is-${kind}` : ''}`;
  };

  lead.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      name:    $('#l-name').value.trim(),
      phone:   $('#l-phone').value.trim(),
      email:   $('#l-email').value.trim(),
      city:    $('#l-city').value.trim(),
      service: $('#l-service').value,
      message: $('#l-msg').value.trim(),
      website: $('#l-website').value,
    };

    // Flag the two required fields rather than relying on the message alone.
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

      if (!res.ok || !data.ok) {
        say(data.error || `That did not go through. Call or text ${PHONE}.`, 'bad');
        return;
      }

      lead.reset();
      say(`Got it — Nino will text you back within the hour during working hours. Anything urgent, call ${PHONE}.`, 'ok');
    } catch {
      say(`Could not reach the server. Call or text ${PHONE} and it is handled.`, 'bad');
    } finally {
      busy(leadGo, false);
    }
  });
})();
