/* Kibian Extractos - logica de la herramienta */
(function () {
  'use strict';
  var CFG = window.KIBIAN_CONFIG;
  var P = window.KibianParser;
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- almacenamiento seguro ----------
  function store(key, val) {
    try {
      if (val === undefined) { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  // ---------- medicion (GoatCounter, ver analytics.js) ----------
  function track(name, title) {
    try { document.dispatchEvent(new CustomEvent('ke:track', { detail: { name: name, title: title } })); } catch (e) {}
  }
  function bucket(n) { return n <= 25 ? 'hasta-25' : n <= 50 ? '26-50' : n <= 100 ? '51-100' : 'mas-de-100'; }

  // ---------- formato ----------
  var fmtMoney = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(n) { return fmtMoney.format(n); }
  function dateCO(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function monthKey() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

  // ---------- plan gratis ----------
  // Sin contador: el plan gratis convierte sin limite, un extracto a la vez,
  // y el archivo trae hasta CFG.freeRowsPerStatement movimientos por extracto.
  function freeCap() { return CFG.freeRowsPerStatement; }

  // ---------- licencia (Lemon Squeezy) ----------
  function license() { return store('ke_license'); }
  function isPro() {
    var l = license();
    if (!l || !l.valid) return false;
    if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return false; // pase vencido
    return true;
  }

  async function licenseCall(action, payload) {
    var body = new URLSearchParams(payload);
    try {
      var r = await fetch('https://api.lemonsqueezy.com/v1/licenses/' + action, {
        method: 'POST', headers: { Accept: 'application/json' }, body: body
      });
      return await r.json();
    } catch (e) {
      // Si el navegador bloquea la llamada directa (CORS), usamos el puente opcional (Cloudflare Worker)
      if (!CFG.licenseProxy) throw e;
      var r2 = await fetch(CFG.licenseProxy, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: action }, payload))
      });
      return await r2.json();
    }
  }

  function productAllowed(data) {
    var ids = (CFG.lsProductIds || []).map(String).filter(Boolean);
    if (!ids.length || !data || !data.meta) return true;
    return ids.indexOf(String(data.meta.product_id)) !== -1;
  }
  function planFrom(data) {
    var lk = (data && data.license_key) || {};
    var name = ((data && data.meta && (data.meta.product_name + ' ' + data.meta.variant_name)) || '').toLowerCase();
    // El nombre del producto/variante decide el tipo; la fecha de vencimiento solo se usa si no lo dice
    var kind = /anual|year|pro/.test(name) && !/pase|30 d/.test(name) ? 'anual' : (/pase|30 d/.test(name) || lk.expires_at ? 'pase' : 'anual');
    return { expiresAt: kind === 'pase' ? (lk.expires_at || null) : null, kind: kind };
  }

  async function activateLicense(key) {
    var data = await licenseCall('activate', { license_key: key.trim(), instance_name: 'web-' + Math.random().toString(36).slice(2, 8) });
    if (data && data.activated && !productAllowed(data)) return { ok: false, error: 'Esta clave no corresponde a Kibian Extractos.' };
    if (data && data.activated) {
      var plan = planFrom(data);
      store('ke_license', { key: key.trim(), instanceId: data.instance && data.instance.id, valid: true, lastCheck: Date.now(), expiresAt: plan.expiresAt, kind: plan.kind });
      return { ok: true };
    }
    var err = (data && data.error) || '';
    if (/expired/i.test(err)) return { ok: false, error: 'Esta licencia ya venció. Puedes comprar un pase nuevo o pasarte al plan anual.' };
    return { ok: false, error: err || 'No pudimos activar la licencia.' };
  }

  // Se valida contra Lemon Squeezy en cada visita. Si la licencia no es valida o vencio, se apaga.
  // Sin conexion, se respeta la ultima validacion durante unos dias de gracia.
  async function recheckLicense() {
    var l = license();
    if (!l) return;
    try {
      var data = await licenseCall('validate', { license_key: l.key, instance_id: l.instanceId || '' });
      var valid = !!(data && data.valid) && productAllowed(data);
      if (!valid) { store('ke_license', null); }
      else { var plan = planFrom(data); l.valid = true; l.lastCheck = Date.now(); l.expiresAt = plan.expiresAt; l.kind = plan.kind; store('ke_license', l); }
      updatePlanUI();
      if (results.length) render([], '');
    } catch (e) {
      var days = (Date.now() - (l.lastCheck || 0)) / 86400000;
      if (days > CFG.licenseOfflineGraceDays) { l.valid = false; store('ke_license', l); updatePlanUI(); }
    }
  }

  function deactivateLicense() {
    var l = license();
    if (l && l.instanceId) licenseCall('deactivate', { license_key: l.key, instance_id: l.instanceId }).catch(function () {});
    store('ke_license', null);
    updatePlanUI();
  }

  // ---------- interfaz del plan ----------
  function planLabel() {
    var l = license();
    if (l && l.kind === 'pase' && l.expiresAt) return 'Pase activo hasta el ' + dateCO(String(l.expiresAt).slice(0, 10));
    return 'Pro anual activo';
  }
  function updatePlanUI() {
    var pro = isPro();
    document.documentElement.classList.toggle('is-pro', pro);
    var badge = $('#planBadge');
    if (pro) badge.innerHTML = '<span class="dot dot--pro"></span><span>' + esc(planLabel()) + '</span>';
    else badge.innerHTML = '<span class="dot"></span><span>Plan gratis: conversiones ilimitadas, de a un extracto. El archivo trae hasta <strong>' + freeCap() + '</strong> movimientos por extracto.</span>';
    $('#fileInput').multiple = pro;
    $('#dropHint').textContent = pro ? 'Puedes soltar varios extractos a la vez y los unimos en un solo Excel.' : 'Con el Pase o Pro puedes soltar los 12 meses del año y unirlos en un solo Excel.';
    $$('[data-license-active]').forEach(function (el) { el.hidden = !pro; });
    $$('[data-license-inactive]').forEach(function (el) { el.hidden = pro; });
    var l = license();
    if (pro && l) { $('#licenseKeyShown').textContent = l.key.slice(0, 8) + '••••••••'; $('#licensePlanShown').textContent = planLabel(); }
  }

  // ---------- dialogo de clave del PDF ----------
  function askPassword(fileName, wrong) {
    return new Promise(function (resolve) {
      var dlg = $('#pwdDialog');
      $('#pwdFile').textContent = fileName;
      $('#pwdError').hidden = !wrong;
      var input = $('#pwdInput');
      input.value = '';
      dlg.showModal();
      setTimeout(function () { input.focus(); }, 50);
      function done(val) {
        dlg.close();
        $('#pwdForm').removeEventListener('submit', onSubmit);
        $('#pwdCancel').removeEventListener('click', onCancel);
        resolve(val);
      }
      function onSubmit(e) { e.preventDefault(); done(input.value); }
      function onCancel() { done(null); }
      $('#pwdForm').addEventListener('submit', onSubmit);
      $('#pwdCancel').addEventListener('click', onCancel);
    });
  }

  // ---------- procesamiento ----------
  var results = [];

  async function readOne(file) {
    var buf = new Uint8Array(await file.arrayBuffer());
    var password = null, wrong = false;
    for (var attempt = 0; attempt < 6; attempt++) {
      try {
        // pdf.js transfiere el buffer al worker: le pasamos una copia en cada intento
        return await P.readStatement(window.pdfjsLib, buf.slice(), password);
      } catch (e) {
        if (e && e.name === 'PasswordException') {
          wrong = e.code === 2;
          track(wrong ? 'clave-pdf-incorrecta' : 'clave-pdf-pedida');
          password = await askPassword(file.name, wrong);
          if (password === null) throw new Error('CANCELLED');
          continue;
        }
        throw e;
      }
    }
    throw new Error('CANCELLED');
  }

  function errorText(code) {
    return {
      SCANNED: 'Este PDF parece ser una imagen escaneada. Por ahora solo leemos extractos descargados directamente del banco.',
      UNSUPPORTED: 'Todavía no reconocemos este formato. Hoy soportamos extractos de Nequi y estamos sumando más bancos.',
      CANCELLED: 'Cancelaste la apertura del archivo.',
      NOTPDF: 'El archivo no es un PDF.'
    }[code] || 'No pudimos leer este archivo. Verifica que sea el PDF original descargado del banco.';
  }

  async function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    track('archivo-elegido' + (files.length > 1 ? '-varios' : ''));
    var pro = isPro();
    var note = '';
    if (!pro && files.length > 1) {
      files = files.slice(0, 1);
      note = 'En el plan gratis convertimos un extracto a la vez. Con el Pase o Pro procesas varios y los unimos en un solo Excel.';
    }
    setStatus('loading', files.length > 1 ? 'Leyendo ' + files.length + ' extractos en tu navegador...' : 'Leyendo tu extracto en tu navegador...');
    var errors = [], batch = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { errors.push(f.name + ': ' + errorText('NOTPDF')); track('error-no-es-pdf'); continue; }
      try {
        var r = await readOne(f);
        r.fileName = f.name;
        batch.push(r);
        track('conversion-ok-' + r.bank.id + '-' + bucket(r.movements.length), r.check.ok ? 'saldos ok' : 'saldos con diferencias');
        if (!r.check.ok) track('saldos-no-cuadran');
      } catch (e) {
        errors.push(f.name + ': ' + errorText(e && e.message));
        var code = e && e.message; track('error-' + ({ SCANNED: 'escaneado', UNSUPPORTED: 'formato-no-soportado', CANCELLED: 'clave-cancelada' }[code] || 'lectura'));
      }
    }
    updatePlanUI();
    // Si nada del lote se pudo leer, mostramos el error y dejamos intacto el resultado anterior
    if (!batch.length) { setStatus('error', errors.join(' ')); return; }
    results = batch; // cada carga reemplaza a la anterior
    setStatus('idle');
    render(errors, note);
  }

  function setStatus(kind, msg) {
    var el = $('#status');
    el.className = 'status status--' + kind;
    el.hidden = kind === 'idle';
    el.textContent = msg || '';
  }

  function allMovements() {
    var list = [];
    results.forEach(function (r) {
      r.movements.forEach(function (m) { list.push(Object.assign({ bank: r.bank.name, file: r.fileName }, m)); });
    });
    list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return list;
  }

  var icons = {
    ok: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>'
  };

  // Movimientos que van al archivo: en gratis, los primeros N de cada extracto
  function exportMovements() {
    if (isPro()) return allMovements();
    var list = [];
    results.forEach(function (r) {
      r.movements.slice(0, freeCap()).forEach(function (m) { list.push(Object.assign({ bank: r.bank.name, file: r.fileName }, m)); });
    });
    list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return list;
  }
  function hiddenCount() {
    if (isPro()) return 0;
    var n = 0; results.forEach(function (r) { n += Math.max(0, r.movements.length - freeCap()); }); return n;
  }

  function render(errors, note) {
    var pro = isPro();
    var mv = allMovements();
    var hidden = hiddenCount();
    var allOk = results.every(function (r) { return r.check.ok; });
    var credits = 0, debits = 0;
    mv.forEach(function (m) { if (m.amount >= 0) credits += m.amount; else debits -= m.amount; });

    var periods = results.map(function (r) { return r.period ? dateCO(r.period.from) + ' – ' + dateCO(r.period.to) : r.fileName; });
    var head = '<div class="res-head">' +
      '<div><p class="eyebrow">' + esc(results.map(function (r) { return r.bank.name; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ')) + ' · ' + results.length + (results.length === 1 ? ' extracto' : ' extractos') + '</p>' +
      '<h3>' + mv.length + ' movimientos encontrados</h3><p class="muted">' + esc(periods.join(' · ')) + '</p></div>' +
      '<div class="res-actions"><button class="btn btn--primary" id="dlXlsx">' + dlIcon() + ' Descargar Excel</button><button class="btn btn--ghost" id="dlCsv">CSV</button></div></div>';

    var check = allOk
      ? '<div class="check check--ok">' + icons.ok + '<div><strong>Saldos verificados.</strong> Cada movimiento cuadra con el saldo del banco y los totales coinciden con el resumen del extracto.</div></div>'
      : '<div class="check check--warn">' + icons.warn + '<div><strong>Revisa antes de usar.</strong> ' + esc(results.map(function (r) { return r.check.issues.join(' '); }).join(' ')) + '</div></div>';

    var stats = '<div class="stats">' +
      stat('Entradas', money(credits), 'pos') + stat('Salidas', money(debits), 'neg') +
      stat('Saldo final', money(mv.length ? mv[mv.length - 1].balance : 0), '') + '</div>';

    // En gratis solo se muestran los movimientos que van al archivo; el resto queda bloqueado
    var shown = pro ? mv : exportMovements();
    var rows = shown.map(function (m) {
      return '<tr><td>' + dateCO(m.date) + '</td><td class="desc">' + esc(m.description) + '</td>' +
        '<td class="cat">' + (pro ? '<span class="chip">' + esc(m.category) + '</span>' : '<span class="chip chip--locked" title="Disponible con el Pase o Pro">' + lockIcon() + ' Pro</span>') + '</td>' +
        '<td class="num ' + (m.amount < 0 ? 'neg' : 'pos') + '">' + money(m.amount) + '</td><td class="num">' + money(m.balance) + '</td></tr>';
    }).join('');
    if (hidden) {
      var ghost = '';
      for (var g = 0; g < Math.min(hidden, 4); g++) ghost += '<tr class="ghost" aria-hidden="true"><td>00/00/0000</td><td class="desc">Movimiento bloqueado</td><td></td><td class="num">$ 000.000,00</td><td class="num">$ 000.000,00</td></tr>';
      rows += ghost;
    }
    if (hidden) track('tope-gratis-mostrado');
    var lockBox = hidden ? '<div class="lockbox"><div><strong>' + hidden + (hidden === 1 ? ' movimiento más' : ' movimientos más') + ' en tu extracto.</strong> El plan gratis incluye hasta ' + freeCap() + ' por extracto. Desbloquéalos todos con 30 días de acceso por ' + esc(CFG.pricePass) + ' USD, sin renovación automática.</div><a class="btn btn--primary" href="#precios">Ver todos los movimientos</a></div>' : '';
    var table = '<div class="table-wrap' + (hidden ? ' table-wrap--locked' : '') + '"><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + lockBox;

    var extra = '';
    if (note) extra += '<p class="notice">' + esc(note) + (results[0].bank.id === 'ejemplo' ? '' : ' <a href="#precios">Ver planes</a>') + '</p>';
    if (errors.length) extra += '<p class="notice notice--err">' + esc(errors.join(' ')) + '</p>';
    if (!pro && !hidden) extra += '<div class="upsell"><div><strong>Este Excel podría venir ya organizado.</strong><p>Con el Pase o Pro cada movimiento llega categorizado, con formato profesional, resumen por mes y la opción de unir todo el año en un solo archivo.</p></div><a class="btn btn--dark" href="#precios">Ver planes</a></div>';

    var box = $('#results');
    box.innerHTML = head + check + stats + extra + table;
    box.hidden = false;
    $('#dlXlsx').addEventListener('click', function () { exportXlsx().catch(function () { setStatus('error', 'No pudimos generar el Excel. Intenta de nuevo.'); }); });
    $('#dlCsv').addEventListener('click', exportCsv);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function stat(label, val, cls) { return '<div class="stat"><span>' + label + '</span><strong class="' + cls + '">' + val + '</strong></div>'; }
  function dlIcon() { return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg>'; }
  function lockIcon() { return '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z"/></svg>'; }

  // ---------- exportacion ----------
  function baseName() {
    var r = results[0];
    var tag = r.period ? r.period.from.slice(0, 7) : 'extracto';
    if (results.length > 1) tag = results.length + '-extractos';
    return 'kibian-' + r.bank.id + '-' + tag;
  }
  function jsDate(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function siteUrl() { return location.protocol.indexOf('http') === 0 ? location.origin : 'Kibian Extractos'; }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  var C = { ink: 'FF0E2A22', lime: 'FFC8F169', band: 'FFF4F8EE', line: 'FFE3E1D7', green: 'FF1F7A47', red: 'FFC2410C', paper: 'FFF7F6F1' };
  var MONEY = '#,##0.00;[Red]-#,##0.00';

  async function exportXlsx() {
    track('descarga-excel-' + (isPro() ? 'pago' : 'gratis') + (results[0] && results[0].bank.id === 'ejemplo' ? '-ejemplo' : ''));
    var pro = isPro(), mv = exportMovements(), multi = results.length > 1;
    var wb = new window.ExcelJS.Workbook();
    wb.creator = 'Kibian Extractos';
    wb.created = new Date();

    // ----- Movimientos -----
    var ws = wb.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: pro ? 1 : 2 }] });
    var cols = [
      { header: 'Fecha', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Descripción', key: 'desc', width: 42 },
      { header: 'Débito', key: 'deb', width: 15, style: { numFmt: '#,##0.00' } },
      { header: 'Crédito', key: 'cred', width: 15, style: { numFmt: '#,##0.00' } },
      { header: 'Valor', key: 'val', width: 15, style: { numFmt: MONEY } },
      { header: 'Saldo', key: 'bal', width: 16, style: { numFmt: '#,##0.00' } }
    ];
    if (pro) cols.push({ header: 'Categoría', key: 'cat', width: 26 });
    cols.push({ header: 'Banco', key: 'bank', width: 12 });
    if (multi) cols.push({ header: 'Archivo', key: 'file', width: 30 });

    var headerRow = 1;
    if (!pro) {
      // Fila de marca en el plan gratis
      ws.columns = cols.map(function (c) { return { key: c.key, width: c.width, style: c.style }; });
      ws.addRow(['Generado gratis con Kibian Extractos · ' + siteUrl() + (hiddenCount() ? ' · Incluye los primeros ' + freeCap() + ' movimientos de cada extracto' : '')]);
      ws.mergeCells(1, 1, 1, cols.length);
      var wm = ws.getRow(1); wm.font = { italic: true, color: { argb: C.green } }; wm.height = 20;
      ws.addRow(cols.map(function (c) { return c.header; }));
      headerRow = 2;
    } else {
      ws.columns = cols;
    }
    mv.forEach(function (m) {
      var row = { date: jsDate(m.date), desc: m.description, deb: m.amount < 0 ? -m.amount : null, cred: m.amount >= 0 ? m.amount : null, val: m.amount, bal: m.balance, bank: m.bank };
      if (pro) row.cat = m.category;
      if (multi) row.file = m.file;
      ws.addRow(row);
    });
    var lastRow = ws.rowCount;
    var hdr = ws.getRow(headerRow);
    hdr.font = { bold: true, color: { argb: pro ? 'FFFFFFFF' : 'FF0E2A22' } };
    if (pro) {
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } };
      hdr.height = 22;
      hdr.alignment = { vertical: 'middle' };
      for (var r = headerRow + 1; r <= lastRow; r++) {
        var rowObj = ws.getRow(r);
        if ((r - headerRow) % 2 === 0) rowObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.band } };
        rowObj.getCell('cred').font = { color: { argb: C.green } };
        rowObj.getCell('deb').font = { color: { argb: C.red } };
      }
      // Fila de totales con formulas reales
      var sDeb = 0, sCred = 0;
      mv.forEach(function (m) { if (m.amount < 0) sDeb -= m.amount; else sCred += m.amount; });
      var r2 = function (n) { return Math.round(n * 100) / 100; };
      var tot = ws.addRow({ desc: 'Totales', deb: { formula: 'SUM(C' + (headerRow + 1) + ':C' + lastRow + ')', result: r2(sDeb) }, cred: { formula: 'SUM(D' + (headerRow + 1) + ':D' + lastRow + ')', result: r2(sCred) }, val: { formula: 'SUM(E' + (headerRow + 1) + ':E' + lastRow + ')', result: r2(sCred - sDeb) } });
      tot.font = { bold: true };
      tot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lime } };
      tot.border = { top: { style: 'medium', color: { argb: C.ink } } };
    } else {
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paper } };
    }
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: cols.length } };

    // ----- Verificacion -----
    var wv = wb.addWorksheet('Verificación');
    wv.columns = [
      { header: 'Archivo', key: 'f', width: 30 }, { header: 'Banco', key: 'b', width: 10 }, { header: 'Periodo', key: 'p', width: 24 },
      { header: 'Saldo inicial', key: 'o', width: 15, style: { numFmt: '#,##0.00' } }, { header: 'Total entradas', key: 'c', width: 15, style: { numFmt: '#,##0.00' } },
      { header: 'Total salidas', key: 'd', width: 15, style: { numFmt: '#,##0.00' } }, { header: 'Saldo final', key: 'z', width: 15, style: { numFmt: '#,##0.00' } },
      { header: 'Verificación', key: 'v', width: 44 }
    ];
    results.forEach(function (r) {
      var row = wv.addRow({ f: r.fileName, b: r.bank.name, p: r.period ? dateCO(r.period.from) + ' - ' + dateCO(r.period.to) : '', o: r.check.opening, c: r.check.credits, d: r.check.debits, z: r.check.closing, v: r.check.ok ? 'Saldos verificados' : 'Revisar: ' + r.check.issues.join(' ') });
      row.getCell('v').font = { bold: true, color: { argb: r.check.ok ? C.green : C.red } };
    });
    wv.getRow(1).font = { bold: true, color: { argb: pro ? 'FFFFFFFF' : 'FF0E2A22' } };
    wv.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pro ? C.ink : C.paper } };

    // ----- Resumen por mes y categoria (Pase / Pro) -----
    if (pro) {
      var byMonth = {}, cats = {};
      mv.forEach(function (m) {
        var k = m.date.slice(0, 7);
        byMonth[k] = byMonth[k] || {};
        byMonth[k][m.category] = (byMonth[k][m.category] || 0) + m.amount;
        cats[m.category] = 1;
      });
      var catList = Object.keys(cats).sort(), months = Object.keys(byMonth).sort();
      var wsum = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
      wsum.columns = [{ header: 'Categoría', key: 'cat', width: 28 }].concat(months.map(function (mo) { return { header: mo, key: mo, width: 15, style: { numFmt: MONEY } }; })).concat([{ header: 'Total', key: 'tot', width: 16, style: { numFmt: MONEY } }]);
      catList.forEach(function (cat) {
        var row = { cat: cat }, t = 0;
        months.forEach(function (mo) { var v = Math.round((byMonth[mo][cat] || 0) * 100) / 100; row[mo] = v; t += v; });
        row.tot = Math.round(t * 100) / 100;
        wsum.addRow(row);
      });
      var last = wsum.rowCount, nCols = months.length + 2;
      var totals = { cat: 'Total neto' };
      months.concat(['tot']).forEach(function (k, i) {
        var col = wsum.getColumn(i + 2).letter;
        var sum = 0; for (var q = 2; q <= last; q++) sum += Number(wsum.getRow(q).getCell(i + 2).value) || 0;
        totals[k] = { formula: 'SUM(' + col + '2:' + col + last + ')', result: Math.round(sum * 100) / 100 };
      });
      var tr = wsum.addRow(totals);
      tr.font = { bold: true }; tr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lime } };
      var h = wsum.getRow(1);
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } }; h.height = 22;
      for (var rr = 2; rr <= last; rr++) if (rr % 2 === 1) wsum.getRow(rr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.band } };
      wsum.getColumn(nCols).font = { bold: true };
    }

    var buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), baseName() + '.xlsx');
  }

  function exportCsv() {
    track('descarga-csv-' + (isPro() ? 'pago' : 'gratis'));
    var pro = isPro(), mv = exportMovements();
    var head = ['Fecha', 'Descripcion', 'Debito', 'Credito', 'Valor', 'Saldo'];
    if (pro) head.push('Categoria');
    head.push('Banco');
    var lines = [head.join(',')];
    function q(s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    mv.forEach(function (m) {
      var row = [dateCO(m.date), q(m.description), m.amount < 0 ? (-m.amount).toFixed(2) : '', m.amount >= 0 ? m.amount.toFixed(2) : '', m.amount.toFixed(2), m.balance.toFixed(2)];
      if (pro) row.push(q(m.category));
      row.push(q(m.bank));
      lines.push(row.join(','));
    });
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), baseName() + '.csv');
  }

  // ---------- ejemplo con datos ficticios ----------
  function loadDemo() {
    track('ver-ejemplo');
    var raw = [
      ['2026-03-01', 'Recarga desde Bancolombia', 350000],
      ['2026-03-02', 'Pago recibido de TIENDA EL ROBLE', 185000],
      ['2026-03-03', 'COMPRA PSE EN Proveedor Insumos', -240000],
      ['2026-03-05', 'RECIBI POR BRE-B DE: ANDREA MORA', 120000],
      ['2026-03-06', 'CLARO', -68900],
      ['2026-03-08', 'Retiro en corresponsales PTM', -100000],
      ['2026-03-10', 'Pago recibido de CAFE LA ESQUINA', 96500],
      ['2026-03-12', 'COMPRA EN SUPERMERCADO CENTRAL', -154300],
      ['2026-03-15', 'ENVIO CON BRE-B A: JUAN PEREZ', -80000],
      ['2026-03-17', 'Pago de Intereses', 42.18],
      ['2026-03-18', 'RECIBI POR BRE-B DE: LUIS GOMEZ', 210000],
      ['2026-03-20', 'COMPRA PSE EN Servicio Energia', -112450],
      ['2026-03-24', 'Pago recibido de TIENDA EL ROBLE', 143000],
      ['2026-03-27', 'Envio a otros bancos a ARRIENDO LOCAL', -450000],
      ['2026-03-31', 'PAGO CREDITO', -95000]
    ];
    var opening = 215320.5, bal = opening, mv = [];
    raw.forEach(function (r) {
      bal = Math.round((bal + r[2]) * 100) / 100;
      mv.push({ date: r[0], description: r[1], amount: r[2], balance: bal, category: P.categorize(r[1], r[2]) });
    });
    var credits = 0, debits = 0;
    mv.forEach(function (m) { if (m.amount >= 0) credits += m.amount; else debits -= m.amount; });
    var demo = {
      bank: { id: 'ejemplo', name: 'Nequi' }, fileName: 'extracto-de-ejemplo.pdf', pages: 2,
      period: { from: '2026-03-01', to: '2026-03-31' }, movements: mv,
      summary: { opening: opening, closing: bal, credits: Math.round(credits * 100) / 100, debits: Math.round(debits * 100) / 100 }
    };
    demo.check = P.verify(demo);
    results = [demo];
    setStatus('idle');
    render([], 'Estás viendo un extracto de ejemplo con datos ficticios. Suelta el tuyo para convertirlo de verdad.');
  }

  // ---------- eventos ----------
  function initDrop() {
    var zone = $('#dropzone'), input = $('#fileInput');
    zone.addEventListener('click', function (e) { if (e.target.tagName !== 'INPUT') input.click(); });
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { handleFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('is-over'); }); });
    zone.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });
    // evita que soltar un archivo fuera de la zona lo abra en otra pestana
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });
  }

  function initLicense() {
    $('#licenseForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var key = $('#licenseInput').value.trim();
      var msg = $('#licenseMsg');
      if (!key) return;
      msg.className = 'license-msg'; msg.textContent = 'Activando...';
      try {
        var r = await activateLicense(key);
        if (r.ok) { track('licencia-activada-' + ((license() || {}).kind || 'plan')); msg.className = 'license-msg ok'; msg.textContent = 'Listo, ' + planLabel() + ' en este navegador.'; updatePlanUI(); if (results.length) render([], ''); }
        else { track('licencia-error'); msg.className = 'license-msg err'; msg.textContent = r.error; }
      } catch (err) { msg.className = 'license-msg err'; msg.textContent = 'No pudimos conectar para validar la licencia. Intenta de nuevo.'; }
    });
    $('#licenseOut').addEventListener('click', function () { if (confirm('¿Desactivar Pro en este navegador? Podrás activarlo de nuevo con tu clave.')) { deactivateLicense(); if (results.length) render([], ''); } });
  }

  function initConfig() {
    $$('[data-cfg]').forEach(function (el) { var k = el.getAttribute('data-cfg'); if (CFG[k] != null) el.textContent = CFG[k]; });
    $$('[data-checkout]').forEach(function (el) { el.href = CFG[el.getAttribute('data-checkout')]; });
    $$('[data-mail]').forEach(function (el) { el.href = 'mailto:' + CFG.contactEmail + (el.getAttribute('data-mail') ? '?subject=' + encodeURIComponent(el.getAttribute('data-mail')) : ''); });
    $('#year').textContent = new Date().getFullYear();
  }

  function initFaq() {
    $$('.faq details').forEach(function (d) {
      d.addEventListener('toggle', function () { if (d.open) $$('.faq details').forEach(function (o) { if (o !== d) o.open = false; }); });
    });
  }

  function initCalc() {
    var range = $('#calcRange'), out = $('#calcOut'), outH = $('#calcHours');
    function upd() {
      var n = +range.value;
      out.textContent = n;
      var minutes = n * 25; // ~25 min por extracto copiando a mano
      outH.textContent = minutes >= 60 ? (Math.round(minutes / 6) / 10).toString().replace('.', ',') + ' horas' : minutes + ' minutos';
    }
    range.addEventListener('input', upd); upd();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initConfig(); initDrop(); initLicense(); initFaq(); initCalc();
    updatePlanUI(); recheckLicense();
    $('#demoBtn').addEventListener('click', loadDemo);
  });
})();
