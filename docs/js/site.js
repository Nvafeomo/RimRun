(function () {
  var config = window.RIMRUN_SITE || {};
  var appStore = (config.appStoreUrl || '').trim();
  var playStore = (config.playStoreUrl || '').trim();

  wireStoreButton('app-store-btn', appStore, 'Download on the App Store');
  wireStoreButton('play-store-btn', playStore, 'Get it on Google Play');

  function wireStoreButton(id, url, label) {
    var el = document.getElementById(id);
    if (!el) return;

    if (url) {
      el.href = url;
      el.textContent = label;
      el.removeAttribute('aria-disabled');
    } else {
      el.href = '#support';
      el.textContent = label + ' (coming soon)';
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('btn-muted');
    }
  }
})();
