/* Keep contact usable when hosted email is not configured. No request is sent
 * by this fallback: customers review the text and send it in their own app. */
(() => {
  // Carry the visitor's chosen service into the form, while retaining their details.
  const drafted = new WeakSet();
  function clearDraft(form) {
    if (!form || !drafted.has(form)) return;
    form.querySelector('[role="status"]')?.replaceChildren();
    drafted.delete(form);
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-contact-service]');
    if (!link) return;
    const form = document.querySelector('#lead-form');
    const service = form?.querySelector('#l-service');
    if (!service || !Array.from(service.options).some(option => option.value === link.dataset.contactService)) return;
    service.value = link.dataset.contactService;
    clearDraft(form);
  });
  for (const type of ['input', 'change']) {
    document.addEventListener(type, event => clearDraft(event.target.closest('#lead-form, #res-lead')));
  }
  // Default to a usable draft while delivery is unknown or the health request fails.
  let unavailable = true;
  const explanation = 'Prepare your request, then review and send it from your messaging app, or call (954) 508-0246. Nothing is sent automatically.';
  function labelForms() {
    for (const form of document.querySelectorAll('#lead-form, #res-lead')) {
      const label = form.querySelector('button[type="submit"] .btn-label');
      const title = unavailable ? 'Prepare text to Nino' : 'Send request to Nino';
      if (label && label.textContent !== title) label.textContent = title;
      if (!unavailable) { form.querySelector('.delivery-note')?.remove(); continue; }
      if (!form.querySelector('.delivery-note')) {
        const note = document.createElement('p');
        note.className = 'delivery-note res-fine';
        note.textContent = explanation;
        form.prepend(note);
      }
    }
  }
  labelForms();
  const out = document.querySelector('#est-out');
  if (out) new MutationObserver(labelForms).observe(out, { childList: true, subtree: true });
  fetch('/api/health', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => {
    if (data?.contactDelivery !== true) return;
    unavailable = false;
    labelForms();
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
      value('l-email') && `Email: ${value('l-email')}`,
      value('l-city') && `City: ${value('l-city')}`, value('l-service'), value('l-msg'),
      value('l-source') && `Found via: ${value('l-source')}`,
      form.id === 'res-lead' && form.dataset.estimateRef && `Estimate reference: ${form.dataset.estimateRef}`,
      form.id === 'res-lead' && document.querySelector('#city')?.value.trim() && `City: ${document.querySelector('#city').value.trim()}`,
      form.id === 'res-lead' && document.querySelector('#desc')?.value.trim(),
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
    drafted.add(form);
  }, true);
})();
