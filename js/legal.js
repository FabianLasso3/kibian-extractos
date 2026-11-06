/* Rellena los datos de configuracion en las paginas legales */
(function () {
  'use strict';
  var CFG = window.KIBIAN_CONFIG;
  document.querySelectorAll('[data-cfg]').forEach(function (el) {
    var k = el.getAttribute('data-cfg');
    if (CFG[k] != null) el.textContent = CFG[k];
  });
  document.querySelectorAll('[data-mail]').forEach(function (a) {
    var subject = a.getAttribute('data-mail');
    a.href = 'mailto:' + CFG.contactEmail + (subject ? '?subject=' + encodeURIComponent(subject) : '');
    if (!a.textContent.trim()) a.textContent = CFG.contactEmail;
  });
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();
