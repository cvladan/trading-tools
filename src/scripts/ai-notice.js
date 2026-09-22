(() => {
  const prefix = 'trading-tools-ai-notice';
  let show = true;
  try {
    if (localStorage.getItem(`${prefix}-dismissed`) === '1') show = false;
    else {
      let session = sessionStorage.getItem(prefix);
      if (!session) {
        const stored = Number(localStorage.getItem(`${prefix}-visits`));
        const visits = Math.min(4, (Number.isInteger(stored) && stored >= 0 ? stored : 0) + 1);
        session = visits <= 3 ? 'show' : 'hide';
        sessionStorage.setItem(prefix, session);
        localStorage.setItem(`${prefix}-visits`, String(visits));
      }
      show = session === 'show';
    }
  } catch {}
  if (show) document.documentElement.dataset.aiNotice = 'show';
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-dismiss-ai-notice]')) return;
    delete document.documentElement.dataset.aiNotice;
    try { localStorage.setItem(`${prefix}-dismissed`, '1'); } catch {}
    try { sessionStorage.setItem(prefix, 'hide'); } catch {}
  });
})();
