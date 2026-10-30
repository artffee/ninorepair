/* Keep contact usable when hosted email is not configured. No request is sent
 * by this fallback: customers review the text and send it in their own app. */
(() => {
  let unavailable = false;
  const explanation = 'Online sending is unavailable. Prepare a text below, then send it from your messaging app, or call (954) 508-0246.';
  function labelForms() {
    for (const form of document.querySelectorAll('#lead-form, #res-lead')) {
      const label = form.querySelector('button[type="submit"] .btn-label');
      if (label && label.textContent !== 'Prepare text to Nino') label.textContent = 'Prepare text to Nino';
      if (!form.querySelector('.delivery-note')) {
        const note = document.createElement('p');
        note.className = 'delivery-note res-fine';
        note.textContent = explanation;
        form.prepend(note);
      }
    }
  }
  fetch('/api/health', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => {
    if (data?.contactDelivery !== false) return;
    unavailable = true;
    labelForms();
    const out = document.querySelector('#est-out');
    if (out) new MutationObserver(labelForms).observe(out, { childList: true, subtree: true });
  }).catch(() => {});
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!unavailable || !form.matches('#lead-form, #res-lead')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = id => form.querySelector('#' + id)?.value.trim() || '';
    const name = value('l-name') || value('rl-name');
    const phone = value('l-phone') || value('rl-phone');
    const status = form.querySelector('[role="status"]');
    if (!name || phone.replace(/\D/g, '').length < 7) {
      status.textContent = 'Please add your name and a phone number.';
      return;
    }
    if (value('l-website')) return;
    const message = [ 'Hi Nino, I would like help with a repair.', `Name: ${name}`, `Phone: ${phone}`,
      value('l-city') && `City: ${value('l-city')}`, value('l-service'), value('l-msg'),
      form.id === 'res-lead' && document.querySelector('.res-title')?.textContent,
      form.id === 'res-lead' && document.querySelector('.res-price')?.textContent.trim()
    ].filter(Boolean).join('\n');
    status.replaceChildren();
    const note = document.createElement('p');
    note.textContent = 'Not sent yet. Open the text message and tap Send. If your device cannot send texts, call Nino and use the details below.';
    const link = document.createElement('a');
    link.className = 'btn btn-amber';
    link.href = 'sms:+19545080246?body=' + encodeURIComponent(message);
    link.textContent = 'Open text message';
    const details = document.createElement('textarea');
    details.readOnly = true;
    details.rows = 5;
    details.setAttribute('aria-label', 'Your request — select and copy if needed');
    details.style.cssText = 'display:block;width:100%;max-width:100%;margin-top:12px';
    details.value = message;
    status.append(note, link, details);
  }, true);
})();
