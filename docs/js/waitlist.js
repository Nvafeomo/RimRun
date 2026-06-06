(function () {
  const form = document.getElementById('waitlist-form');
  if (!form) return;

  const statusEl = document.getElementById('form-status');
  const config = window.RIMRUN_SITE || {};
  const endpoint = (config.formEndpoint || '').trim();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!endpoint) {
      showStatus(
        'Email signup is not configured yet. See docs/LANDING_SETUP.md or email ' +
          (config.supportEmail || 'rimrun.support@gmail.com') +
          '.',
        false,
      );
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    showStatus('Submitting…', true);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.email.value.trim(),
          pre_release_updates: form.pre_release.checked,
          release_waitlist: form.release_waitlist.checked,
          _subject: 'RimRun waitlist signup',
        }),
      });

      if (res.ok) {
        form.reset();
        showStatus("You're on the list. We'll be in touch!", true);
      } else {
        const data = await res.json().catch(function () {
          return {};
        });
        showStatus(data.error || 'Something went wrong. Try again or email us.', false);
      }
    } catch {
      showStatus('Network error. Check your connection and try again.', false);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  function showStatus(message, ok) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'form-status ' + (ok ? 'ok' : 'err');
  }
})();
