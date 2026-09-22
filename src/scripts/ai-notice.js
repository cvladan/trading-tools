(() => {
  const prefix = 'trading-tools-ai-notice';
  let show = true;
  try {
    if (localStorage.getItem(`${prefix}-dismissed`) === '1') show = false;
    else {
      const stored = Number(localStorage.getItem(`${prefix}-pages`));
      const pages = Math.min(6, (Number.isInteger(stored) && stored >= 0 ? stored : 0) + 1);
      localStorage.setItem(`${prefix}-pages`, String(pages));
      show = pages <= 5;
    }
  } catch {}
  if (show) document.documentElement.dataset.aiNotice = 'show';
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-dismiss-ai-notice]')) return;
    delete document.documentElement.dataset.aiNotice;
    try { localStorage.setItem(`${prefix}-dismissed`, '1'); } catch {}
  });
})();
