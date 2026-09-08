(() => {
  const form = document.querySelector('#live-form');
  const input = document.querySelector('#live-name');
  const image = document.querySelector('#live-image');
  const status = document.querySelector('#live-status');
  const start = document.querySelector('#live-start');
  const stop = document.querySelector('#live-stop');
  let timer, controller, objectUrl, activeName, due = 0, failures = 0, generation = 0;
  const message = (en, zh) => document.documentElement.lang === 'zh-CN' ? zh : en;
  function schedule() {
    clearTimeout(timer);
    if (activeName && !document.hidden) timer = setTimeout(refresh, Math.max(0, due - Date.now()));
  }
  async function refresh() {
    if (!activeName || document.hidden || controller || Date.now() < due) return;
    const current = generation;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15_000);
    // No query cache-busting, browser credentials, localStorage identity, or device tokens.
    let delay = 3_600_000;
    try {
      const response = await fetch(`https://api.tokensburned.com/v1/cards/u/${activeName}.svg`, {
        credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (!response.ok) {
        const retry = Number(response.headers.get('Retry-After'));
        delay = Math.max(300_000, Math.min(86_400_000, Number.isFinite(retry) ? retry * 1000 : 0));
        throw new Error('unavailable');
      }
      const seconds = Number(response.headers.get('X-TokensBurned-Refresh-After'));
      delay = seconds === 300 ? 300_000 : 3_600_000;
      if (!response.headers.get('Content-Type')?.includes('image/svg+xml')) throw new Error('invalid-type');
      const blob = await response.blob();
      if (blob.size > 256 * 1024) throw new Error('too-large');
      if (current !== generation) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob); image.src = objectUrl; image.hidden = false; failures = 0;
      status.textContent = message(`Updated. Next check in ${delay / 60_000} minutes. Private or unpublished cards show a placeholder.`, `已更新，${delay / 60_000} 分钟后再次检查。私密或未发布的卡片显示占位图。`);
    } catch {
      if (current !== generation) return;
      failures = Math.min(5, failures + 1);
      delay = Math.max(delay, Math.min(3_600_000, 300_000 * 2 ** (failures - 1)));
      status.textContent = message('Card unavailable. Automatic checks will retry with backoff.', '暂时无法加载卡片，将延后自动重试。');
    } finally {
      clearTimeout(timeout); controller = null;
      if (current === generation) { due = Date.now() + delay; schedule(); }
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    // A running viewer cannot be resubmitted to bypass its timer.
    if (activeName || Date.now() < due || !form.reportValidity()) return;
    activeName = input.value.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(activeName)) { activeName = null; return; }
    start.disabled = true; input.disabled = true; stop.disabled = false; generation += 1; refresh();
  });
  stop.addEventListener('click', () => {
    generation += 1; activeName = null; clearTimeout(timer); controller?.abort(); stop.disabled = true;
    status.textContent = message('Updates stopped. Reload this page to view another account.', '已停止更新。刷新页面可查看其他账号。');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else schedule(); });
  window.addEventListener('pagehide', () => { clearTimeout(timer); controller?.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
})();
