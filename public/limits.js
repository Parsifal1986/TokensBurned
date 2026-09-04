(() => {
  const languages = Object.keys(TOKENSBURNED_LIMITS_LOCALES);
  const select = document.querySelector('#language-select');
  const toggle = document.querySelector('[data-theme-toggle]');
  const normalize = (value) => languages.find((lang) => lang.toLowerCase() === String(value).toLowerCase())
    || languages.find((lang) => lang.split('-')[0] === String(value).split('-')[0]) || 'en';
  let savedLanguage, savedTheme;
  try {
    savedLanguage = localStorage.getItem('tokensburned-language');
    savedTheme = localStorage.getItem('tokensburned-theme');
  } catch { /* preferences are optional */ }
  let language = normalize(new URLSearchParams(location.search).get('lang') || savedLanguage || navigator.language);
  let theme = savedTheme === 'light' ? 'light' : 'dark';
  const t = (key) => TOKENSBURNED_LIMITS_LOCALES[language]?.[key]
    ?? TOKENSBURNED_LOCALES[language]?.[key] ?? TOKENSBURNED_LIMITS_LOCALES.en[key] ?? TOKENSBURNED_LOCALES.en[key];
  function render() {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    select.value = language;
    document.title = t('metaTitle');
    document.querySelector('meta[name="description"]').content = t('metaDescription');
    document.querySelector('meta[property="og:title"]').content = t('metaTitle');
    document.querySelector('meta[property="og:description"]').content = t('metaDescription');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
    toggle.textContent = t(theme === 'dark' ? 'themeLight' : 'themeDark');
    toggle.setAttribute('aria-label', t(theme === 'dark' ? 'switchLight' : 'switchDark'));
    document.querySelectorAll('a[href*="index.html"]').forEach((el) => {
      const url = new URL(el.href);
      if (language === 'en') url.searchParams.delete('lang'); else url.searchParams.set('lang', language);
      el.href = `${url.pathname}${url.search}${url.hash}`;
    });
  }
  select.addEventListener('change', () => {
    language = normalize(select.value);
    try { localStorage.setItem('tokensburned-language', language); } catch { /* optional */ }
    const url = new URL(location.href);
    if (language === 'en') url.searchParams.delete('lang'); else url.searchParams.set('lang', language);
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    render();
  });
  toggle.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('tokensburned-theme', theme); } catch { /* optional */ }
    render();
  });
  render();
})();
