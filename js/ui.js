/* Detalles de interfaz: selector anual/mensual */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var btns = document.querySelectorAll('.toggle [data-period]');
    function set(period) {
      btns.forEach(function (b) {
        var on = b.getAttribute('data-period') === period;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('.plan--pro [data-show]').forEach(function (el) {
        el.hidden = el.getAttribute('data-show') !== period;
      });
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-period')); }); });

    // Navegador interno de TikTok, Instagram o Facebook: suele bloquear las descargas
    var ua = navigator.userAgent || '';
    var app = /musical_ly|BytedanceWebview|TikTok|trill/i.test(ua) ? 'TikTok'
      : /Instagram/i.test(ua) ? 'Instagram'
      : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua) ? 'Facebook' : null;
    var box = document.getElementById('inapp');
    if (app && box) {
      box.hidden = false;
      document.getElementById('inappName').textContent = app;
      document.documentElement.classList.add('in-app');
      try { document.dispatchEvent(new CustomEvent('ke:track', { detail: { name: 'navegador-interno-' + app.toLowerCase() } })); } catch (e) {}
      var url = location.href.split('#')[0];
      if (/Android/i.test(ua)) {
        var open = document.getElementById('inappOpen');
        open.href = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
        open.hidden = false;
      }
      document.getElementById('inappCopy').addEventListener('click', function () {
        var btn = this;
        function done() { btn.textContent = 'Link copiado'; setTimeout(function () { btn.textContent = 'Copiar link'; }, 2500); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
        function fallback() {
          var t = document.createElement('textarea'); t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
          document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) {} t.remove();
        }
      });
      // Al intentar descargar dentro de la app, recordamos abrirla en el navegador
      document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('#dlXlsx, #dlCsv');
        if (!b) return;
        var note = document.getElementById('inappDl');
        if (!note) {
          note = document.createElement('p'); note.id = 'inappDl'; note.className = 'notice notice--warn';
          note.textContent = 'Si la descarga no empieza, es porque ' + app + ' la bloquea. Abre esta página en tu navegador (toca ··· y luego Abrir en el navegador) y vuelve a convertir tu extracto.';
          var head = document.querySelector('.res-head'); if (head) head.insertAdjacentElement('afterend', note);
        }
      }, true);
    }

    // Barra fija en celular: aparece cuando la herramienta y el CTA final no estan a la vista
    var bar = document.getElementById('mbar');
    if (bar && 'IntersectionObserver' in window) {
      var visible = {};
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { visible[e.target.id || e.target.className] = e.isIntersecting; });
        var any = Object.keys(visible).some(function (k) { return visible[k]; });
        bar.classList.toggle('is-on', !any);
      });
      ['convertir'].forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
      var fin = document.querySelector('.final'); if (fin) io.observe(fin);
      var foot = document.querySelector('.foot'); if (foot) io.observe(foot);
    }
  });
})();
