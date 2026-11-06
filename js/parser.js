/* Kibian Extractos - lector de extractos bancarios.
   Todo corre en el navegador: el PDF nunca sale del equipo del usuario. */
(function (root) {
  'use strict';

  // ---------- utilidades ----------
  function parseMoney(str) {
    // "$-26,000.00" -> -26000 ; "$879.34" -> 879.34
    if (str == null) return null;
    var s = String(str).replace(/\s/g, '').replace(/\$/g, '');
    var neg = /^-|^\(.*\)$|-$/.test(s);
    s = s.replace(/[()\-]/g, '').replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var n = Math.round(parseFloat(s) * 100) / 100;
    return neg ? -n : n;
  }
  var MONEY_RE = /^\$\s?-?[\d,]+\.\d{2}$/;
  var DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  function toISO(d) { var m = DATE_RE.exec(d); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; }
  function cents(n) { return Math.round(n * 100); }

  // Agrupa los fragmentos de texto de una pagina en lineas (por coordenada Y)
  function groupLines(items) {
    var rows = [];
    items.forEach(function (it) {
      var str = (it.str || '').trim();
      if (!str) return;
      var x = it.transform[4], y = it.transform[5];
      var row = null;
      for (var i = 0; i < rows.length; i++) { if (Math.abs(rows[i].y - y) <= 2.5) { row = rows[i]; break; } }
      if (!row) { row = { y: y, cells: [] }; rows.push(row); }
      row.cells.push({ x: x, str: str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    rows.forEach(function (r) { r.cells.sort(function (a, b) { return a.x - b.x; }); r.text = r.cells.map(function (c) { return c.str; }).join(' '); });
    return rows;
  }

  // ---------- bancos soportados ----------
  var BANKS = [];

  BANKS.push({
    id: 'nequi',
    name: 'Nequi',
    country: 'CO',
    detect: function (fullText) {
      return /NEQUI S\.A\./i.test(fullText) && /Fecha del movimiento/i.test(fullText);
    },
    parse: function (pages, fullText) {
      var out = { movements: [], summary: {}, period: null, warnings: [] };
      var per = /per[ií]odo de:\s*(\d{4})\/(\d{2})\/(\d{2})\s*a\s*(\d{4})\/(\d{2})\/(\d{2})/i.exec(fullText);
      if (per) out.period = { from: per[1] + '-' + per[2] + '-' + per[3], to: per[4] + '-' + per[5] + '-' + per[6] };

      var labels = { 'Saldo anterior': 'opening', 'Saldo actual': 'closing', 'Total abonos': 'credits', 'Total cargos': 'debits' };

      pages.forEach(function (rows) {
        rows.forEach(function (r) {
          var c = r.cells;
          // Fila de movimiento: fecha | descripcion | valor | saldo
          if (c.length >= 4 && DATE_RE.test(c[0].str) && MONEY_RE.test(c[c.length - 1].str) && MONEY_RE.test(c[c.length - 2].str)) {
            var desc = c.slice(1, c.length - 2).map(function (x) { return x.str; }).join(' ').replace(/\s+/g, ' ').trim();
            out.movements.push({
              date: toISO(c[0].str),
              description: desc,
              amount: parseMoney(c[c.length - 2].str),
              balance: parseMoney(c[c.length - 1].str)
            });
            return;
          }
          // Filas del resumen: "Saldo anterior $0.14 Saldo promedio $2,037.90"
          for (var i = 0; i < c.length - 1; i++) {
            var key = labels[c[i].str];
            if (key && MONEY_RE.test(c[i + 1].str) && out.summary[key] == null) out.summary[key] = parseMoney(c[i + 1].str);
          }
        });
      });

      // Nequi lista del mas reciente al mas antiguo: lo dejamos en orden cronologico
      out.movements.reverse();
      return out;
    }
  });

  // ---------- verificacion de saldos ----------
  function verify(result) {
    var mv = result.movements, s = result.summary, issues = [];
    var opening = s.opening;
    if (opening == null && mv.length) opening = Math.round((mv[0].balance - mv[0].amount) * 100) / 100;
    var prev = opening;
    mv.forEach(function (m, i) {
      if (prev != null && cents(prev + m.amount) !== cents(m.balance)) {
        issues.push('Fila ' + (i + 1) + ' (' + m.date + '): el saldo no cuadra con el movimiento.');
      }
      prev = m.balance;
    });
    var credits = 0, debits = 0;
    mv.forEach(function (m) { if (m.amount >= 0) credits += m.amount; else debits += -m.amount; });
    credits = Math.round(credits * 100) / 100; debits = Math.round(debits * 100) / 100;
    if (s.credits != null && cents(s.credits) !== cents(credits)) issues.push('El total de abonos no coincide con el resumen del banco.');
    if (s.debits != null && cents(s.debits) !== cents(debits)) issues.push('El total de cargos no coincide con el resumen del banco.');
    if (s.closing != null && mv.length && cents(s.closing) !== cents(mv[mv.length - 1].balance)) issues.push('El saldo final no coincide con el resumen del banco.');
    return { ok: issues.length === 0 && mv.length > 0, issues: issues, opening: opening, credits: credits, debits: debits, closing: mv.length ? mv[mv.length - 1].balance : opening };
  }

  // ---------- categorizacion (Pro) ----------
  var CATEGORY_RULES = [
    [/intereses/i, 'Intereses'],
    [/pago credito|cuota|prestamo|préstamo/i, 'Pago de créditos'],
    [/retiro/i, 'Retiros en efectivo'],
    [/recarga/i, 'Recargas'],
    [/compra pse|pse/i, 'Pagos PSE'],
    [/compra/i, 'Compras'],
    [/claro|movistar|tigo|wom|etb|epm|enel|vanti|gas|agua|energ|internet|netflix|spotify/i, 'Servicios y suscripciones'],
    [/recibi|recibí|pago recibido|^de /i, 'Transferencias recibidas'],
    [/envio|envío|^para |transferencia/i, 'Transferencias enviadas'],
    [/comision|comisión|cuota de manejo|gmf|4x1000|4 x 1000/i, 'Comisiones e impuestos']
  ];
  function categorize(desc, amount) {
    for (var i = 0; i < CATEGORY_RULES.length; i++) if (CATEGORY_RULES[i][0].test(desc)) return CATEGORY_RULES[i][1];
    return amount >= 0 ? 'Otros ingresos' : 'Otros gastos';
  }

  // ---------- punto de entrada ----------
  async function readStatement(pdfjsLib, data, password) {
    var task = pdfjsLib.getDocument({ data: data, password: password || undefined, isEvalSupported: false });
    var doc = await task.promise;
    var pages = [], fullText = '';
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var tc = await page.getTextContent();
      var rows = groupLines(tc.items);
      pages.push(rows);
      fullText += rows.map(function (r) { return r.text; }).join('\n') + '\n';
    }
    var bank = null;
    for (var i = 0; i < BANKS.length; i++) if (BANKS[i].detect(fullText)) { bank = BANKS[i]; break; }
    if (!bank) {
      var err = new Error(fullText.trim().length < 20 ? 'SCANNED' : 'UNSUPPORTED');
      throw err;
    }
    var result = bank.parse(pages, fullText);
    result.bank = { id: bank.id, name: bank.name };
    result.pages = doc.numPages;
    result.check = verify(result);
    result.movements.forEach(function (m) { m.category = categorize(m.description, m.amount); });
    return result;
  }

  var api = { readStatement: readStatement, parseMoney: parseMoney, verify: verify, categorize: categorize, banks: BANKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KibianParser = api;
})(this);
