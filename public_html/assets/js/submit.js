/* INDEX:80 /submit/ page: Turnstile widget + submission form.
   Moved out of inline <script> blocks so the page needs no 'unsafe-inline'
   under the site Content-Security-Policy (see public_html/_headers).
   Loaded synchronously in <head>, before Turnstile's api.js, because
   api.js calls window.onloadTurnstileCallback as soon as it loads. */

// Must match TURNSTILE_ACTION in functions/api/submit.js — the server
// refuses tokens minted for any other action.
window.onloadTurnstileCallback = function () {
  window.turnstileWidgetId = turnstile.render('#turnstile-widget', {
    sitekey: '0x4AAAAAAEuOH5Vil_dW0Pwz',
    action: 'submit-project'
  });
};

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('submit-form').addEventListener('submit', async function (event) {
    event.preventDefault();

    var form = event.target;
    var resultEl = document.getElementById('submit-result');
    var submitBtn = form.querySelector('button[type="submit"]');

    function showResult(message, isError) {
      resultEl.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = isError ? 'Something went wrong.' : 'Thanks!';
      resultEl.appendChild(strong);
      resultEl.appendChild(document.createTextNode(' ' + message));
      resultEl.classList.toggle('is-error', !!isError);
      resultEl.classList.toggle('is-success', !isError);
      resultEl.hidden = false;
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    var hasTurnstile = window.turnstile && window.turnstileWidgetId !== undefined && window.turnstileWidgetId !== null;
    var turnstileToken = hasTurnstile ? turnstile.getResponse(window.turnstileWidgetId) : '';

    if (!turnstileToken) {
      showResult('Please complete the verification check above, then try again.', true);
      return;
    }

    var payload = {
      name: document.getElementById('f-name').value,
      url: document.getElementById('f-url').value,
      description: document.getElementById('f-desc').value,
      category: document.getElementById('f-category').value,
      social_url: document.getElementById('f-social').value,
      discord_url: document.getElementById('f-discord').value,
      github_url: document.getElementById('f-github').value,
      established: document.getElementById('f-established').value,
      submitter_name: document.getElementById('f-submitter-name').value,
      submitter_email: document.getElementById('f-email').value,
      notes: document.getElementById('f-notes').value,
      turnstileToken: turnstileToken
    };

    submitBtn.disabled = true;

    try {
      var res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });

      if (res.ok && data.ok) {
        showResult(data.message || 'Your submission has been received.', false);
        form.reset();
        document.getElementById('f-url').value = 'https://';
      } else {
        showResult(data.error || 'Please try again.', true);
      }
    } catch (err) {
      showResult('Network error — please check your connection and try again.', true);
    } finally {
      submitBtn.disabled = false;
      if (hasTurnstile) {
        turnstile.reset(window.turnstileWidgetId);
      }
    }
  });

  document.getElementById('f-url').addEventListener('focus', function () {
    var field = this;
    if (field.value === 'https://') {
      setTimeout(function () {
        var pos = field.value.length;
        field.setSelectionRange(pos, pos);
      }, 0);
    }
  });
});
