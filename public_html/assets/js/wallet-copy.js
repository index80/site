/* INDEX:80 wallet copy buttons (About → donations, Registry → Registry wallet).
   Any <button data-copy-target="ID"> copies the text of element #ID.
   External script, no inline handlers: the page needs no 'unsafe-inline'
   under the site Content-Security-Policy (see public_html/_headers). */
(function () {
  var buttons = document.querySelectorAll('button[data-copy-target]');
  Array.prototype.forEach.call(buttons, function (btn) {
    var addrEl = document.getElementById(btn.getAttribute('data-copy-target'));
    if (!addrEl) return;
    btn.addEventListener('click', function () {
      var address = addrEl.textContent.trim();
      var original = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', original);
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
  });
})();
