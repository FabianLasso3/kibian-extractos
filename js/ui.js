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
    function ev(name) { try { document.dispatchEvent(new CustomEvent('ke:track', { detail: { name: name } })); } catch (e) {} }
    if (app && box) {
      box.hidden = false;
      document.getElementById('inappName').textContent = app;
      document.documentElement.classList.add('in-app');
      ev('navegador-interno-' + app.toLowerCase());
      var clean = location.origin + location.pathname;
      var url = clean + '?utm_source=link-enviado&utm_campaign=' + app.toLowerCase();
      var isIOS = /iPhone|iPad|iPod/i.test(ua), isAndroid = /Android/i.test(ua);

      // Abrir en Chrome (Android) o Safari (iPhone)
      var open = document.getElementById('inappOpen');
      if (isAndroid) {
        open.href = 'intent://' + clean.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(clean) + ';end';
        document.getElementById('inappOpenTxt').textContent = 'Abrir en Chrome';
        open.hidden = false;
      } else if (isIOS) {
        open.href = 'x-safari-' + clean;
        document.getElementById('inappOpenTxt').textContent = 'Abrir en Safari';
        open.hidden = false;
      }
      open.addEventListener('click', function () {
        ev(isIOS ? 'abrir-safari' : 'abrir-chrome');
        // Si la app no deja salir, mostramos la otra forma
        setTimeout(function () {
          if (document.visibilityState === 'visible') {
            var tip = document.getElementById('inappManual');
            if (!tip) {
              tip = document.createElement('p'); tip.id = 'inappManual'; tip.className = 'inapp__tip';
              tip.textContent = 'Si no se abrió, toca ··· arriba a la derecha y elige "Abrir en el navegador", o envíate el link.';
              box.appendChild(tip);
            }
          }
        }, 1500);
      });

      // Enviarse el link para despues
      var msg = 'Kibian Extractos: convierte tu extracto de Nequi, DaviPlata o Bancolombia a Excel, gratis: ' + url;
      document.getElementById('sendWa').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
      document.getElementById('sendMail').href = 'mailto:?subject=' + encodeURIComponent('Link de Kibian Extractos') + '&body=' + encodeURIComponent(msg);
      document.getElementById('inappSend').addEventListener('click', function () {
        ev('enviame-el-link');
        if (navigator.share) {
          navigator.share({ title: 'Kibian Extractos', text: 'Convierte tu extracto a Excel, gratis', url: url })
            .then(function () { ev('enviame-el-link-compartido'); })
            .catch(function () { document.getElementById('inappSendBox').hidden = false; });
        } else {
          document.getElementById('inappSendBox').hidden = false;
        }
      });
      document.getElementById('sendWa').addEventListener('click', function () { ev('enviame-el-link-whatsapp'); });
      document.getElementById('sendMail').addEventListener('click', function () { ev('enviame-el-link-correo'); });
      document.getElementById('inappCopy').addEventListener('click', function () {
        var label = this.querySelector('span');
        ev('enviame-el-link-copiado');
        function done() { label.textContent = 'Link copiado'; setTimeout(function () { label.textContent = 'Copiar link'; }, 2500); }
        function fallback() {
          var t = document.createElement('textarea'); t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
          document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) {} t.remove();
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
      });

      // Al intentar descargar dentro de la app, recordamos abrirla en el navegador
      document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('#dlXlsx, #dlCsv');
        if (!b) return;
        ev('descarga-intentada-en-' + app.toLowerCase());
        if (!document.getElementById('inappDl')) {
          var note = document.createElement('p'); note.id = 'inappDl'; note.className = 'notice notice--warn';
          note.textContent = 'Si la descarga no empieza, es porque ' + app + ' la bloquea. Abre esta página en tu navegador (toca ··· y luego "Abrir en el navegador") y vuelve a convertir tu extracto.';
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
