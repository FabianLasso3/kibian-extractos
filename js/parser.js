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

  // DaviPlata (Banco Davivienda): fecha "dd / mm", valor con signo al final, sin saldo por fila
  var MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  var DP_DATE = /^(\d{1,2})\s*\/\s*(\d{1,2})$/;
  var DP_VALUE = /^\$\s?[\d,]+\.\d{2}\s?[+-]$/;
  function dpMoney(str) {
    var t = String(str).replace(/\s/g, '');
    var sign = t.slice(-1) === '-' ? -1 : 1;
    var n = parseMoney(t.slice(0, -1));
    return n == null ? null : (n === 0 ? 0 : sign * n);
  }
  BANKS.push({
    id: 'daviplata',
    name: 'DaviPlata',
    country: 'CO',
    detect: function (fullText) {
      return /DAVIPLATA/i.test(fullText) && /Clase de movimiento/i.test(fullText) && /Informe del mes/i.test(fullText);
    },
    parse: function (pages, fullText) {
      var out = { movements: [], summary: {}, period: null, warnings: [], balanceComputed: true };
      var inf = /Informe del mes:\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s*\/\s*(\d{4})/i.exec(fullText);
      var year = inf ? +inf[2] : new Date().getFullYear();
      var month = inf ? MONTHS[inf[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] : null;
      if (month) {
        var last = new Date(Date.UTC(year, month, 0)).getUTCDate();
        var mm = String(month).padStart(2, '0');
        out.period = { from: year + '-' + mm + '-01', to: year + '-' + mm + '-' + String(last).padStart(2, '0') };
      }
      var labels = { 'Saldo anterior': 'opening', 'Nuevo saldo': 'closing', 'Más créditos': 'credits', 'Menos débitos': 'debits' };
      var rows = [];
      pages.forEach(function (prows) {
        prows.forEach(function (r) {
          var c = r.cells;
          // Resumen: "Saldo anterior ... $0.14"
          for (var i = 0; i < c.length - 1; i++) {
            var key = labels[c[i].str.trim()];
            if (key && out.summary[key] == null && MONEY_RE.test(c[i + 1].str.replace(/\s/g, ''))) out.summary[key] = parseMoney(c[i + 1].str);
          }
          // Movimiento: fecha | valor | autorizacion | destino | clase de movimiento
          var dateCell = c.find(function (x) { return DP_DATE.test(x.str.trim()); });
          var valCell = c.find(function (x) { return DP_VALUE.test(x.str.replace(/\s/g, '')); });
          if (!dateCell || !valCell || valCell.x < dateCell.x) return;
          var dm = DP_DATE.exec(dateCell.str.trim());
          var day = +dm[1], mon = +dm[2];
          var y = (month && mon > month) ? year - 1 : year; // extractos que cruzan de diciembre a enero
          var after = c.filter(function (x) { return x.x > valCell.x + 1 && x !== valCell; });
          var auth = '', dest = [], desc = [];
          after.forEach(function (x) {
            if (!auth && /^\d{3,}$/.test(x.str.trim()) && x.x < valCell.x + 140) { auth = x.str.trim(); return; }
            if (x.x < 360) dest.push(x.str.trim()); else desc.push(x.str.trim());
          });
          var d = desc.join(' ').replace(/\s+/g, ' ').trim();
          var de = dest.join(' ').replace(/\s+/g, ' ').trim();
          rows.push({
            date: y + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
            description: (d || 'Movimiento') + (de ? ' · ' + de : ''),
            amount: dpMoney(valCell.str),
            reference: auth
          });
        });
      });
      // Orden cronologico estable. DaviPlata no trae saldo por fila: lo calculamos.
      rows = rows.map(function (r, i) { r._i = i; return r; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a._i - b._i; });
      // Si dentro de un mismo dia el orden del banco deja el saldo en negativo, ponemos primero las entradas
      var opening = out.summary.opening != null ? out.summary.opening : 0;
      var byDay = [], cur = null;
      rows.forEach(function (r) { if (!cur || cur.date !== r.date) { cur = { date: r.date, list: [] }; byDay.push(cur); } cur.list.push(r); });
      var bal = opening;
      byDay.forEach(function (g) {
        var b = bal, neg = false;
        g.list.forEach(function (r) { b = Math.round((b + r.amount) * 100) / 100; if (b < -0.001) neg = true; });
        if (neg) g.list.sort(function (a, b2) { return (b2.amount >= 0) - (a.amount >= 0) || a._i - b2._i; });
        g.list.forEach(function (r) { bal = Math.round((bal + r.amount) * 100) / 100; r.balance = bal; delete r._i; out.movements.push(r); });
      });
      return out;
    }
  });

  // Bancolombia (cuenta de ahorros o corriente): fecha "d/mm", valor con "-" adelante, saldo por fila
  var BC_DATE = /^(\d{1,2})\/(\d{1,2})$/;
  var BC_MONEY = /^-?(\d{1,3}(,\d{3})*)?\.\d{2}$/;
  function bcMoney(str) { return parseMoney(String(str).replace(/\s/g, '').replace(/^(-?)\./, '$10.')); }
  BANKS.push({
    id: 'bancolombia',
    name: 'Bancolombia',
    country: 'CO',
    detect: function (fullText) {
      return /ESTADO DE CUENTA/.test(fullText) && /DESDE:/.test(fullText) && /HASTA:/.test(fullText) &&
        /SALDO ANTERIOR/.test(fullText) && /TOTAL ABONOS/.test(fullText) && /DCTO\./.test(fullText);
    },
    parse: function (pages, fullText) {
      var out = { movements: [], summary: {}, period: null, warnings: [] };
      var d1 = /DESDE:\s*(\d{4})\/(\d{2})\/(\d{2})/.exec(fullText);
      var d2 = /HASTA:\s*(\d{4})\/(\d{2})\/(\d{2})/.exec(fullText);
      if (d1 && d2) out.period = { from: d1[1] + '-' + d1[2] + '-' + d1[3], to: d2[1] + '-' + d2[2] + '-' + d2[3] };
      var endYear = d2 ? +d2[1] : new Date().getFullYear(), endMonth = d2 ? +d2[2] : 12;
      var labels = { 'SALDO ANTERIOR': 'opening', 'SALDO ACTUAL': 'closing', 'TOTAL ABONOS': 'credits', 'TOTAL CARGOS': 'debits' };
      var ended = false;
      pages.forEach(function (prows) {
        prows.forEach(function (r) {
          if (ended) return;
          var c = r.cells;
          if (/FIN ESTADO/.test(r.text)) { ended = true; return; }
          // Resumen (columna izquierda): "SALDO ANTERIOR  $  582,130.33"
          for (var i = 0; i < c.length; i++) {
            var key = labels[c[i].str.trim()];
            if (!key || out.summary[key] != null) continue;
            var v = c.find(function (x) { return x.x > c[i].x && x.x < c[i].x + 260 && BC_MONEY.test(x.str.replace(/\s/g, '')); });
            if (v) out.summary[key] = bcMoney(v.str);
          }
          // Movimiento: fecha | descripcion | sucursal | dcto. | valor | saldo
          if (c.length < 3 || !BC_DATE.test(c[0].str.trim())) return;
          var last = c[c.length - 1], prev = c[c.length - 2];
          if (!BC_MONEY.test(last.str.replace(/\s/g, '')) || !BC_MONEY.test(prev.str.replace(/\s/g, ''))) return;
          var dm = BC_DATE.exec(c[0].str.trim());
          var day = +dm[1], mon = +dm[2];
          if (mon < 1 || mon > 12 || day < 1 || day > 31) return;
          var y = mon > endMonth ? endYear - 1 : endYear; // periodos que cruzan de diciembre a enero
          var mid = c.slice(1, c.length - 2), desc = [], suc = [], doc = [];
          mid.forEach(function (x) {
            if (x.x < 262) desc.push(x.str); else if (x.x < 345) suc.push(x.str); else doc.push(x.str);
          });
          var d = desc.join(' ').replace(/\s+/g, ' ').trim();
          var s = suc.join(' ').replace(/\s+/g, ' ').trim();
          out.movements.push({
            date: y + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
            description: (d || 'Movimiento') + (s ? ' · ' + s : ''),
            amount: bcMoney(prev.str),
            balance: bcMoney(last.str),
            reference: doc.join(' ').trim()
          });
        });
      });
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
    [/\bGMF\b|4x1000|4 x 1000|comisi|cuota de manejo|\bIVA\b|cobro total|cobro o devoluci|impto|retefuente/i, 'Comisiones e impuestos'],
    [/intereses/i, 'Intereses'],
    [/pago de prov|pago de nomina|pago de nómina|pago interbanc|abono|consignaci/i, 'Transferencias recibidas'],
    [/pago credito|cuota|prestamo|préstamo/i, 'Pago de créditos'],
    [/retiro/i, 'Retiros en efectivo'],
    [/recarga/i, 'Recargas'],
    [/compra pse|pse/i, 'Pagos PSE'],
    [/compra/i, 'Compras'],
    [/claro|movistar|tigo|wom|etb|epm|enel|vanti|gas|agua|energ|internet|netflix|spotify/i, 'Servicios y suscripciones'],
    [/recibi|recibí|pago recibido|^de |recibio plata|recibió plata/i, 'Transferencias recibidas'],
    [/envio|envío|^para |transferencia|pasaste plata|enviaste/i, 'Transferencias enviadas'],
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
