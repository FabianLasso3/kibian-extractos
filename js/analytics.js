/* Kibian Extractos - medicion de interaccion con GoatCounter.
   Solo se envian nombres de eventos (por ejemplo "descarga-excel").
   Nunca se envia informacion de los extractos ni datos personales. */
(function () {
  'use strict';
  var queue = [];

  function send(ev) {
    try {
      window.goatcounter.count({ path: ev.name, title: ev.title || ev.name, event: true });
    } catch (e) { /* sin conexion o bloqueado: se ignora */ }
  }
  function ready() { return window.goatcounter && typeof window.goatcounter.count === 'function'; }
  function flush() { while (queue.length) send(queue.shift()); }

  function track(name, title) {
    if (!name) return;
    var ev = { name: String(name).toLowerCase().replace(/[^a-z0-9\-]+/g, '-').slice(0, 60), title: title };
    if (ready()) send(ev); else queue.push(ev);
  }
  window.keTrack = track;

  // Espera a que cargue count.js para enviar lo pendiente
  var tries = 0;
  var wait = setInterval(function () {
    if (ready()) { flush(); clearInterval(wait); }
    else if (++tries > 40) clearInterval(wait);
  }, 500);

  // Eventos enviados desde app.js y ui.js
  document.addEventListener('ke:track', function (e) { track(e.detail && e.detail.name, e.detail && e.detail.title); });

  // Clics en botones y enlaces importantes
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('a, button') : null;
    if (!el) return;
    var t = el.getAttribute('data-track');
    if (t) return track(t);
    if (el.hasAttribute('data-checkout')) return track(el.getAttribute('data-checkout') === 'checkoutPass' ? 'checkout-pase' : 'checkout-anual');
    var href = el.getAttribute('href') || '';
    if (href === '#convertir') {
      var where = el.closest('.nav') ? 'nav' : el.closest('.mbar') ? 'barra-movil' : el.closest('.final') ? 'final' : 'seccion';
      return track('cta-convertir-' + where);
    }
    if (href === '#precios') return track('ver-planes');
    if (el.classList.contains('road__item')) return track('voto-' + (el.textContent || '').trim().split(/\s+/).slice(0, 3).join('-'));
    if (el.hasAttribute('data-mail')) return track('correo-' + (el.closest('.road') ? 'voto' : 'contacto'));
  }, true);

  // Ayuda de Nequi y preguntas frecuentes
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || d.tagName !== 'DETAILS' || !d.open) return;
    if (d.id === 'helpNequi') return track('ayuda-nequi');
    if (d.closest('.faq')) {
      var list = Array.prototype.slice.call(document.querySelectorAll('.faq details'));
      track('faq-' + (list.indexOf(d) + 1), (d.querySelector('summary') || {}).textContent);
    }
  }, true);

  // Hasta donde baja la gente
  var marks = [['precios', 'vio-precios'], ['faq', 'vio-faq']];
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        marks.forEach(function (m) { if (en.target.id === m[0]) track(m[1]); });
        io.unobserve(en.target);
      });
    }, { threshold: 0.25 });
    document.addEventListener('DOMContentLoaded', function () {
      marks.forEach(function (m) { var el = document.getElementById(m[0]); if (el) io.observe(el); });
    });
  }
})();
