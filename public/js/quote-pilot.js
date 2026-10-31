(() => {
  const button = document.getElementById('quote-pilot-link');
  if (!button || !window.IntersectionObserver || !window.crypto?.getRandomValues ||
      navigator.globalPrivacyControl || navigator.doNotTrack === '1' || navigator.webdriver ||
      !['ninorepair.com', 'www.ninorepair.com'].includes(location.hostname) ||
      Date.now() >= Date.parse('2026-11-29T05:00:00Z')) return;

  const labels = { A: 'Contact us', B: 'Request a repair quote' };
  const fallback = { title: button.textContent, url: button.href };
  let busy = false;
  let inView = false;
  const observer = new IntersectionObserver(entries => {
    inView = entries[0].intersectionRatio >= 0.5;
    if (inView) enroll();
  }, { threshold: 0.5 });
  observer.observe(button);
  document.addEventListener('visibilitychange', () => { if (inView) enroll(); });

  async function enroll() {
    if (busy || document.visibilityState !== 'visible') return;
    busy = true;
    try {
      const key = 'nino:tv-quote-2026-11';
      let visit = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!visit || !/^[0-9a-f]{16}$/.test(visit.ref) || !(Date.now() < visit.until)) {
        const ref = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
        visit = { ref, until: Date.now() + 30 * 60 * 1000 };
        sessionStorage.setItem(key, JSON.stringify(visit));
      }
      const arm = parseInt(visit.ref[0], 16) < 8 ? 'A' : 'B';
      button.textContent = labels[arm];
      button.href = fallback.url + encodeURIComponent('\nRef: NR-' + visit.ref.toUpperCase());
      const res = await fetch('/api/quote-pilot', {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: visit.ref }), keepalive: true,
      });
      if (!res.ok || (await res.json()).arm !== arm) throw new Error('Measurement unavailable');
    } catch {
      button.textContent = fallback.title;
      button.href = fallback.url;
    } finally { observer.disconnect(); }
  }
})();
