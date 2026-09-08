(() => {
  const zh = {
    skip: "跳至内容", home: "首页", live: "实时卡片", limits: "使用限制", badge: "付费模式预览 · 不扣款", title: "让你的用量卡片及时更新。", lede: "Pro 让近期用量更快显示在卡片上。提示词和代码仍留在你的设备上。", compare: "选择更新频率", feature: "功能", preview: "预览版", upload: "客户端上传", hour: "每 60 分钟", five: "每 5 分钟", refresh: "网页数据更新", devices: "设备槽位", history: "历史日期的数据更新", daily: "每 UTC 日一次", cost: "价格", free: "免费", nocharge: "预览期间不扣款，正式价格待定。", cadence: "以上为更新窗口，不保证数据在该时间内到达。数据采集取决于客户端集成，缓存和 GitHub 图片代理也可能增加延迟。", checkout: "预览支付流程", view: "查看公开卡片", grant: "预览权限通过邀请开放。运行 tokensburned plan 可查看当前权限和到期时间。", pace: "看看一小时内的区别", simulation: "仅在本地演示。拖动滑块不会发送请求。", elapsed: "从整点起经过的分钟数", lastSync: "最近可用的上传窗口", liveNote: "仅查看账号所有者已选择公开的数据。更新遵循账号的套餐周期，切到后台标签页后暂停。", github: "GitHub 用户名", load: "加载公开卡片", stop: "停止更新", idle: "尚未加载卡片。", privacy: "隐私边界不变", privacyNote: "仅上传汇总用量元数据。支付预览不收集支付信息，不创建订阅，不公开你的卡片，也不会开通 Pro。", readLimits: "查看所有使用限制", checkoutTitle: "付费渠道入口预览", checkoutNote: "支付服务商尚未配置。本地演示展示订单确认步骤，不收集银行卡信息，不生成真实订单，也不改变套餐。", plan: "套餐", due: "当前应付", zero: "0 · 仅演示", simulate: "模拟确认", close: "关闭", complete: "模拟完成。没有扣款，也没有开通套餐。预览权限需由运营端授予。"
  };
  const english = Object.fromEntries([...document.querySelectorAll('[data-copy]')].map(el => [el.dataset.copy, el.textContent]));
  let language = 'en';
  try { language = localStorage.getItem('tokensburned-language') || navigator.language; document.documentElement.dataset.theme = localStorage.getItem('tokensburned-theme') === 'light' ? 'light' : 'dark'; } catch { language = navigator.language; }
  language = (new URLSearchParams(location.search).get('lang') || language).startsWith('zh') ? 'zh-CN' : 'en';
  const select = document.querySelector('#plan-language');
  const dialog = document.querySelector('#checkout-dialog');
  const status = document.querySelector('#checkout-status');
  const confirm = document.querySelector('#simulate-payment');
  function render() {
    document.documentElement.lang = language; select.value = language;
    document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = language === 'zh-CN' ? zh[el.dataset.copy] : english[el.dataset.copy]; });
    document.title = language === 'zh-CN' ? '套餐与付费预览 · TokensBurned' : 'Plans & payment preview · TokensBurned';
    status.textContent = ''; confirm.disabled = false;
  }
  select.addEventListener('change', () => { language = select.value; try { localStorage.setItem('tokensburned-language', language); } catch {} render(); });
  document.querySelector('#plan-theme').addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('tokensburned-theme', theme); } catch {} });
  document.querySelector('#open-checkout').addEventListener('click', () => { status.textContent = ''; confirm.disabled = false; dialog.showModal(); });
  document.querySelector('#close-checkout').addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => { status.textContent = language === 'zh-CN' ? zh.complete : 'Simulation complete. No charge and no plan activation. Preview access must be granted by the operator.'; confirm.disabled = true; });
  const slider = document.querySelector('#pace-minute');
  slider.addEventListener('input', () => { const minute = Number(slider.value); document.querySelector('#pace-value').value = `${minute} min`; for (const [id, interval] of [['free-minute', 60], ['pro-minute', 5]]) { const last = Math.floor(minute / interval) * interval; document.getElementById(id).textContent = `${last === 60 ? '01' : '00'}:${String(last % 60).padStart(2, '0')}`; } });
  render();
})();
