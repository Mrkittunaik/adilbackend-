const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; // also blocks CSV formula injection
module.exports = (rows, cols) => [cols.map(c => cell(c.label)).join(','), ...rows.map(r => cols.map(c => cell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\r\n');
