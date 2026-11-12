(() => {
  // Keep previews/local development and privacy opt-outs out of production counts.
  if (!['ninorepair.com', 'www.ninorepair.com'].includes(location.hostname) ||
      navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  window.va('beforeSend', event => {
    // Count pages without sending query strings, fragments, or form contents.
    const url = new URL(event.url);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.href };
  });

  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
})();
