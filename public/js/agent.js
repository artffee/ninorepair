/* ══════════════════════════════════════════════════════════════════════════════
   NinoRepair — assistant widget
   Streams /api/chat (Server-Sent Events) into the panel. History lives in
   sessionStorage so a scroll-away and back does not lose the thread, and is
   capped below the server's 30-message limit.
   ══════════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const fab   = $('#chat-fab');
  const panel = $('#chat');
  const log   = $('#chat-log');
  const form  = $('#chat-form');
  const input = $('#chat-txt');
  const send  = $('#chat-send');
  const sug   = $('#chat-sug');
  const close = $('#chat-x');

  const PHONE      = '(954) 508-0246';
  const PHONE_HREF = 'tel:+19545080246';
  const STORE_KEY  = 'nino.chat.v1';
  const MAX_TURNS  = 24;

  const GREETING =
    "Hey — I'm Nino's digital front desk. Tell me what needs fixing and I'll give you a " +
    'ballpark on the spot. Photos get you a tighter number: use the estimator on ' +
    `this page, or text them to **${PHONE}**.`;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** [{ role: 'user' | 'assistant', content: string }] — exactly the API shape. */
  let history = [];
  let streaming = false;

  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(saved)) history = saved.slice(-MAX_TURNS);
  } catch {
    history = [];
  }

  const persist = () => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-MAX_TURNS)));
    } catch {
      /* Private mode or a full quota — the thread just won't survive a reload. */
    }
  };

  /* ── Rendering ──────────────────────────────────────────────────────────────── */

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);

  /**
   * The system prompt asks for short markdown — a line of text plus a tight
   * bullet list. That is all this handles, deliberately: escape everything
   * first, then re-introduce the handful of marks we actually expect.
   */
  function md(src) {
    const inline = (s) =>
      esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
        // [label](https://…) — http(s), mailto and tel only.
        .replace(
          /\[([^\]]+)\]\(((?:https?:|mailto:|tel:)[^)\s]+)\)/g,
          '<a href="$2" rel="noopener">$1</a>',
        )
        // Bare shop phone number, however the model spaces it.
        .replace(
          /\(?954\)?[\s.-]?508[\s.-]?0246/g,
          `<a href="${PHONE_HREF}">${PHONE}</a>`,
        );

    const html = [];
    let bullets = null;

    const flush = () => {
      if (bullets) {
        html.push(`<ul>${bullets.join('')}</ul>`);
        bullets = null;
      }
    };

    String(src).split('\n').forEach((raw) => {
      const line = raw.trim();
      if (!line) return flush();

      const bullet = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
      if (bullet) {
        (bullets ||= []).push(`<li>${inline(bullet[1])}</li>`);
        return;
      }

      flush();
      html.push(`<p>${inline(line.replace(/^#{1,6}\s*/, ''))}</p>`);
    });

    flush();
    return html.join('');
  }

  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60;

  const scroll = (force) => {
    if (force || atBottom()) log.scrollTop = log.scrollHeight;
  };

  function bubble(role, text, { error = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = `msg msg-${role === 'user' ? 'me' : 'bot'}${error ? ' msg-err' : ''}`;

    const body = document.createElement('div');
    body.className = 'msg-body';
    body.innerHTML = role === 'user' ? `<p>${esc(text)}</p>` : md(text);
    wrap.appendChild(body);

    if (role !== 'user') {
      const tag = document.createElement('p');
      tag.className = 'msg-tag';
      tag.textContent = error ? 'Assistant · offline' : 'NinoRepair assistant';
      wrap.appendChild(tag);
    }

    log.appendChild(wrap);
    scroll(true);
    return body;
  }

  function typing() {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-bot';
    wrap.innerHTML = '<div class="msg-body typing"><i></i><i></i><i></i></div>';
    log.appendChild(wrap);
    scroll(true);
    return wrap;
  }

  function paintHistory() {
    log.innerHTML = '';
    if (!history.length) {
      bubble('assistant', GREETING);
      return;
    }
    history.forEach((m) => bubble(m.role, m.content));
  }

  /* ── Open / close ───────────────────────────────────────────────────────────── */

  let painted = false;

  function setOpen(open) {
    fab.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;

    if (!open) return;
    if (!painted) {
      paintHistory();
      painted = true;
    }
    scroll(true);
    if (matchMedia('(min-width: 620px)').matches) input.focus();
  }

  fab.addEventListener('click', () => setOpen(fab.getAttribute('aria-expanded') !== 'true'));
  close.addEventListener('click', () => {
    setOpen(false);
    fab.focus();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      fab.focus();
    }
  });

  sug.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) ask(btn.textContent.trim());
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });

  /* ── Streaming ──────────────────────────────────────────────────────────────── */

  async function ask(text) {
    const question = String(text || '').trim().slice(0, 1000);
    if (!question || streaming) return;

    streaming = true;
    input.value = '';
    send.disabled = true;
    sug.hidden = true;

    bubble('user', question);
    history.push({ role: 'user', content: question });
    persist();

    const dots = typing();
    let body = null;
    let answer = '';

    const fail = (message) => {
      dots.remove();
      if (body) {
        body.parentElement.classList.add('msg-err');
        body.innerHTML = md(answer + `\n\n${message}`);
      } else {
        bubble('assistant', message, { error: true });
      }
      // A failed turn is dropped so the next question isn't sent with a
      // dangling user message the model never answered.
      history = history.filter((m, i) => !(i === history.length - 1 && m.role === 'user'));
      persist();
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-MAX_TURNS) }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        fail(data.error || `The assistant is offline. Call or text Nino at ${PHONE}.`);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // SSE frames are separated by a blank line and can split across chunks.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
          let event = 'message';
          let data = '';

          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;

          let payload;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }

          if (event === 'delta' && payload.text) {
            if (!body) {
              dots.remove();
              body = bubble('assistant', '');
            }
            answer += payload.text;
            body.innerHTML = md(answer);
            scroll(false);
          } else if (event === 'error') {
            fail(payload.message || `Something went wrong. Text Nino at ${PHONE}.`);
            return;
          }
        }
      }

      if (!answer.trim()) {
        fail(`No answer came back on that one. Text Nino at ${PHONE} — he'll reply himself.`);
        return;
      }

      dots.remove();
      history.push({ role: 'assistant', content: answer });
      history = history.slice(-MAX_TURNS);
      persist();
    } catch {
      fail(`Lost the connection. Call or text Nino at ${PHONE}.`);
    } finally {
      streaming = false;
      send.disabled = false;
      dots.remove();
      if (!reduceMotion) scroll(false);
    }
  }
})();
