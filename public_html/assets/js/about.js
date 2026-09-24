/* INDEX:80 /about/ page: donation-address copy button.
   Moved out of an inline <script> block so the page needs no
   'unsafe-inline' under the site Content-Security-Policy (see
   public_html/_headers). Loaded at the end of <body>, where the inline
   block was, so the button and address already exist. */
(function () {
  var btn = document.getElementById('copy-address-btn');
  var addrEl = document.getElementById('donation-address');
  if (!btn || !addrEl) return;
  btn.addEventListener('click', function () {
    var address = addrEl.textContent.trim();
    var original = btn.textContent;
    var done = function (label) {
      btn.textContent = label;
      setTimeout(function () { btn.textContent = original; }, 1500);
    };
    var fallbackSelectCopy = function () {
      try {
        var range = document.createRange();
        range.selectNodeContents(addrEl);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        var ok = document.execCommand('copy');
        sel.removeAllRanges();
        done(ok ? 'COPIED ✓' : 'SELECTED — PRESS ⌘/CTRL+C');
      } catch (e) {
        done('SELECTED — PRESS ⌘/CTRL+C');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(address).then(function () { done('COPIED ✓'); }).catch(fallbackSelectCopy);
    } else {
      fallbackSelectCopy();
    }
  });
})();
