/* Grupo Tesela · app del organigrama e inversiones · 2026-11 */
(() => {
'use strict';
const CFG = window.GT_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const TABLES = ['empresas', 'socios', 'activos', 'movimientos', 'documentos', 'pendientes', 'decisiones', 'parametros'];
const DB = { empresas: [], socios: [], activos: [], movimientos: [], documentos: [], pendientes: [], decisiones: [], parametros: [] };
const state = { session: null, editor: false, tab: 'organigrama', sel: null, selType: null, queue: [], lastSync: null, sortCol: {}, installPrompt: null };
const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- formato ----------
const fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtEur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 });
const fmtInt = new Intl.NumberFormat('es-ES');
const num = (v) => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
const eur = (v, d2) => { const n = num(v); return n == null ? '—' : (d2 === true ? fmtEur2 : fmtEur).format(n); };
const pct = (v) => { const n = num(v); return n == null || !isFinite(n) ? '—' : fmtPct.format(n); };
const txt = (v) => (v == null || v === '') ? '—' : String(v);
const fdate = (v) => { if (!v) return '—'; const d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? String(v) : d.toLocaleDateString('es-ES'); };
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const evClass = (e) => ({ 'Acreditado': 'ev-acreditado', 'Parcial': 'ev-parcial', 'Contradicción': 'ev-contradiccion', 'Sin datos': 'ev-sindatos' }[e] || 'ev-sindatos');
const toast = (m, ms = 2600) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, ms); };

// ---------- datos: carga, caché y cola offline ----------
const CACHE_KEY = 'gt.cache.v1', QUEUE_KEY = 'gt.queue.v1';
function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), DB })); } catch (e) {} }
function loadCache() { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.DB) { Object.assign(DB, c.DB); state.lastSync = c.at; return true; } } catch (e) {} return false; }
function loadQueue() { try { state.queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { state.queue = []; } }
function saveQueue() { localStorage.setItem(QUEUE_KEY, JSON.stringify(state.queue)); updateStatus(); }
async function fetchAll() {
  const results = await Promise.all(TABLES.map((t) => sb.from(t).select('*').order(t === 'parametros' ? 'clave' : 'id')));
  const err = results.find((r) => r.error); if (err) throw err.error;
  TABLES.forEach((t, i) => { DB[t] = results[i].data || []; });
  DB.movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  state.lastSync = new Date().toISOString(); saveCache();
}
async function reload(silent) {
  try { await fetchAll(); if (!silent) toast('Datos actualizados desde Supabase'); }
  catch (e) { console.warn(e); if (!loadCache()) toast('Sin conexión y sin copia local'); else if (!silent) toast('Sin conexión: mostrando la última copia guardada'); }
  renderAll();
}
function applyLocal(table, op, id, data) {
  const rows = DB[table]; const key = table === 'parametros' ? 'clave' : 'id';
  const i = rows.findIndex((r) => String(r[key]) === String(id));
  if (op === 'delete') { if (i >= 0) rows.splice(i, 1); }
  else if (i >= 0) Object.assign(rows[i], data); else rows.push(Object.assign({ [key]: id }, data));
  saveCache();
}
async function pushOne(q) {
  const key = q.table === 'parametros' ? 'clave' : 'id';
  if (q.op === 'delete') { const { error } = await sb.from(q.table).delete().eq(key, q.id); if (error) throw error; return; }
  const { data, error } = await sb.from(q.table).upsert(Object.assign({ [key]: q.id }, q.data), { onConflict: key }).select();
  if (error) throw error;
  if (data && data[0]) applyLocal(q.table, 'upsert', data[0][key], data[0]);
}
async function flushQueue() {
  if (!state.queue.length || !navigator.onLine || !state.editor) return;
  const pending = state.queue.slice(); state.queue = []; saveQueue();
  for (const q of pending) { try { await pushOne(q); } catch (e) { console.warn(e); state.queue.push(q); } }
  saveQueue(); if (!state.queue.length) toast('Cambios pendientes enviados');
}
async function save(table, id, data, op = 'upsert') {
  if (!state.editor) { toast('Solo Israel puede editar (pulsa Entrar)'); return false; }
  applyLocal(table, op, id, data); renderAll();
  const q = { table, op, id, data, at: Date.now() };
  if (!navigator.onLine) { state.queue.push(q); saveQueue(); toast('Guardado en el dispositivo; se enviará al reconectar'); return true; }
  try { await pushOne(q); renderAll(); toast('Guardado'); return true; }
  catch (e) { console.warn(e); if (/row-level security|permission|JWT/i.test(e.message || '')) { toast('Supabase ha rechazado el cambio: ' + e.message, 5000); await reload(true); return false; } state.queue.push(q); saveQueue(); toast('Sin conexión con Supabase; cambio en cola'); return true; }
}
async function insertRow(table, data) {
  if (!state.editor) { toast('Solo Israel puede editar'); return null; }
  if (!navigator.onLine) { toast('Para crear registros nuevos hace falta conexión'); return null; }
  const { data: rows, error } = await sb.from(table).insert(data).select();
  if (error) { toast('Error: ' + error.message, 5000); return null; }
  DB[table].push(rows[0]); saveCache(); renderAll(); return rows[0];
}

// ---------- sesión ----------
async function initAuth() {
  const { data } = await sb.auth.getSession(); setSession(data.session);
  sb.auth.onAuthStateChange((_e, s) => { setSession(s); flushQueue(); });
}
function setSession(s) { state.session = s; state.editor = !!(s && s.user && s.user.email && s.user.email.toLowerCase() === CFG.EDITOR_EMAIL); updateStatus(); renderAll(); }
async function login() {
  if (state.session) { await sb.auth.signOut(); toast('Sesión cerrada'); return; }
  const email = prompt('Correo para entrar (recibirás un enlace):', CFG.EDITOR_EMAIL); if (!email) return;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  toast(error ? 'Error: ' + error.message : 'Revisa tu correo y abre el enlace para entrar', 6000);
}
function updateStatus() {
  const net = $('#net'); net.textContent = navigator.onLine ? 'En línea' : 'Sin conexión'; net.className = 'chip ' + (navigator.onLine ? 'on' : 'off');
  $('#sync').textContent = state.lastSync ? 'Sinc. ' + new Date(state.lastSync).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sin datos';
  $('#btn-login').textContent = state.session ? (state.editor ? 'Israel · salir' : 'Salir') : 'Entrar';
  $$('[data-editor]').forEach((b) => { b.hidden = !state.editor; });
  $('#queue-info').textContent = state.queue.length ? state.queue.length + ' cambio(s) pendientes de enviar' : '';
}

// ---------- cálculos ----------
const byId = (t, id) => DB[t].find((r) => String(r.id) === String(id));
function efectiva(e, hops = 0) { if (!e || hops > 12) return null; if (!e.matriz || !byId('empresas', e.matriz)) return 1; const p = num(e.participacion_grupo); const up = efectiva(byId('empresas', e.matriz), hops + 1); return p == null || up == null ? null : p * up; }
const movsDe = (id) => DB.movimientos.filter((m) => m.activo_id === id);
function realDe(a) {
  const ms = movsDe(a.id).filter((m) => m.cash !== false);
  const salidas = -ms.filter((m) => num(m.importe) < 0).reduce((s, m) => s + num(m.importe), 0);
  const entradas = ms.filter((m) => num(m.importe) > 0).reduce((s, m) => s + num(m.importe), 0);
  return { salidas, entradas, neto: entradas - salidas, n: ms.length, ultimo: ms.length ? ms[ms.length - 1].fecha : null };
}
function xirr(flows) { // flows: [{fecha, importe}]
  const fs = flows.filter((f) => num(f.importe)).map((f) => ({ t: new Date(f.fecha), v: num(f.importe) })).sort((a, b) => a.t - b.t);
  if (fs.length < 2 || !fs.some((f) => f.v < 0) || !fs.some((f) => f.v > 0)) return null;
  const t0 = fs[0].t; const yrs = (t) => (t - t0) / (365.25 * 86400000);
  const f = (r) => fs.reduce((s, x) => s + x.v / Math.pow(1 + r, yrs(x.t)), 0);
  let lo = -0.99, hi = 10; if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; if (hi - lo < 1e-7) break; }
  return (lo + hi) / 2;
}
function modelo(a) {
  const inv = num(a.inversion_total), fin = num(a.financiacion) || 0, eq = inv != null ? inv - fin : null;
  const ing = num(a.ingreso_anual_modelo), yv = num(a.yield_venta);
  const capital = num(a.capital_grupo_modelo) ?? num(a.inversion_grupo);
  // Ámbito del cálculo: «total» (toda la operación, como en la hoja INVERSIONES) o «grupo» (solo la parte del grupo)
  let valor = null, resultado = null, roeInv = null, roeEq = null, beneficio = null, ambito = null;
  if (ing != null && yv) { ambito = 'total'; valor = ing / yv; }
  else if (a.base_venta === 'total' && num(a.venta_potencial) != null) { ambito = 'total'; valor = num(a.venta_potencial); }
  else if (a.base_venta === 'grupo' && num(a.venta_potencial) != null) { ambito = 'grupo'; }
  if (ambito === 'total' && valor != null && inv != null) {
    resultado = valor - inv; roeInv = inv ? resultado / inv : null; roeEq = eq ? resultado / eq : null;
    beneficio = roeEq != null && capital != null ? roeEq * capital : null;
  } else if (ambito === 'grupo' && capital) {
    beneficio = num(a.venta_potencial) - capital; resultado = beneficio; roeInv = roeEq = beneficio / capital;
  }
  const d = a.fecha && a.salida_prevista ? days(a.fecha, a.salida_prevista) : null, anios = d != null ? d / 365 : null;
  const tirSimple = roeEq != null && anios ? roeEq / anios : null;
  const roiAnual = roeEq != null && anios ? Math.pow(1 + roeEq, 1 / anios) - 1 : null;
  const rentasAnio = ing != null && eq && capital != null ? ing * capital / eq : null;
  const real = realDe(a);
  const flows = movsDe(a.id).filter((m) => m.cash !== false).map((m) => ({ fecha: m.fecha, importe: num(m.importe) }));
  const cerrada = /cerrada|devuelto/i.test(a.estado || '');
  const tirReal = cerrada ? xirr(flows) : null;
  const prevFlows = (!cerrada && a.salida_prevista && (a.base_venta === 'grupo' ? num(a.venta_potencial) : (capital != null && beneficio != null ? capital + beneficio : null)) != null)
    ? flows.concat([{ fecha: a.salida_prevista, importe: a.base_venta === 'grupo' ? num(a.venta_potencial) : capital + beneficio }]) : null;
  const tirPrev = prevFlows ? xirr(prevFlows) : null;
  return { inv, fin, eq, ing, yv, valor, resultado, roeInv, roeEq, palanca: roeEq != null && roeInv ? roeEq / roeInv : null, capital, beneficio, dias: d, anios, tirSimple, roiAnual, rentasAnio, real, tirReal, tirPrev, cerrada, ambito, yieldCost: ing != null && inv ? ing / inv : null };
}
function kpis() {
  const A = DB.activos.filter((a) => a.visible !== false);
  const sum = (f) => A.reduce((s, a) => s + (num(f(a)) || 0), 0);
  const realInv = DB.movimientos.filter((m) => m.cash !== false && num(m.importe) < 0).reduce((s, m) => s - num(m.importe), 0);
  const realRec = DB.movimientos.filter((m) => m.cash !== false && num(m.importe) > 0).reduce((s, m) => s + num(m.importe), 0);
  return { sociedades: DB.empresas.filter((e) => e.visible !== false).length, activos: A.length, inversion: sum((a) => a.inversion_grupo), recuperado: sum((a) => a.recuperado), realInv, realRec, renta: sum((a) => a.renta_mensual), rentaPrev: sum((a) => a.renta_prevista), p0: A.filter((a) => a.prioridad === 'P0').length, ventaGrupo: A.filter((a) => a.base_venta === 'grupo').reduce((s, a) => s + (num(a.venta_potencial) || 0), 0) };
}

// ---------- render general ----------
function renderAll() { renderKpis(); renderTabs(); const r = { organigrama: renderOrg, activos: renderActivos, modelo: renderModelo, cartera: renderCartera, cashflow: renderCashflow, documentos: renderDocs, decisiones: renderDecisiones }[state.tab]; if (r) r(); if (state.sel) openPanel(state.selType, state.sel, true); updateStatus(); }
function renderKpis() {
  const k = kpis();
  $('#kpis').innerHTML = [['Sociedades', fmtInt.format(k.sociedades), 'incluida la cabecera'], ['Activos', fmtInt.format(k.activos), 'operaciones en cartera'], ['Inversión del grupo', eur(k.inversion), 'ficha de activos'], ['Salidas reales', eur(k.realInv), 'suma de movimientos'], ['Recuperado', eur(k.realRec), 'entradas reales'], ['Renta real / mes', eur(k.renta), 'prevista ' + eur(k.rentaPrev)], ['Venta potencial (grupo)', eur(k.ventaGrupo), 'base grupo'], ['Activos P0', fmtInt.format(k.p0), 'documentación prioritaria']]
    .map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
}
function renderTabs() { $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === state.tab)); $$('[data-page]').forEach((p) => { p.hidden = p.dataset.page !== state.tab; }); }
function table(el, cols, rows, opts = {}) {
  const key = el.id; const sort = state.sortCol[key];
  let data = rows.slice();
  if (sort) { const c = cols[sort.i]; data.sort((a, b) => { const va = c.v(a), vb = c.v(b); const na = num(va), nb = num(vb); const r = na != null && nb != null ? na - nb : String(va ?? '').localeCompare(String(vb ?? ''), 'es'); return sort.d * r; }); }
  const th = cols.map((c, i) => `<th class="${c.n ? 'n' : ''}" data-i="${i}">${c.h}${sort && sort.i === i ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const tr = data.map((r) => `<tr class="${opts.click ? 'clickable' : ''}" data-id="${esc(opts.id ? opts.id(r) : '')}">` + cols.map((c) => { const v = c.v(r); const s = c.f ? c.f(v, r) : txt(v); const cls = [c.n ? 'n' : '', c.cls ? c.cls(v, r) : ''].join(' '); return `<td class="${cls}">${s}</td>`; }).join('') + '</tr>').join('');
  const tot = opts.total ? '<tr class="total">' + cols.map((c) => `<td class="${c.n ? 'n' : ''}">${c.t ? c.t(data) : ''}</td>`).join('') + '</tr>' : '';
  el.innerHTML = `<thead><tr>${th}</tr></thead><tbody>${tr}${tot}</tbody>`;
  $$('th', el).forEach((h) => h.onclick = () => { const i = +h.dataset.i; const cur = state.sortCol[key]; state.sortCol[key] = cur && cur.i === i ? { i, d: -cur.d } : { i, d: 1 }; renderAll(); });
  if (opts.click) $$('tbody tr[data-id]', el).forEach((r) => r.onclick = () => opts.click(r.dataset.id));
}
const evBadge = (v) => v ? `<span class="badge ${evClass(v)}">${esc(v)}</span>` : '—';
const negBadge = (v) => v ? `<span class="badge ${/rentab/i.test(v) ? 'r' : /rota/i.test(v) ? 'o' : ''}">${esc(v)}</span>` : '—';

// ---------- organigrama ----------
let orgZoom = null, orgSvg = null;
function renderOrg() {
  const box = $('#org'); const W = box.clientWidth || 800, H = box.clientHeight || 600;
  const emp = DB.empresas.filter((e) => e.visible !== false); const ids = new Set(emp.map((e) => e.id));
  const showAct = $('#org-activos').checked;
  box.innerHTML = '';
  if (!emp.length) { box.innerHTML = '<div class="hint" style="padding:20px">Sin datos todavía.</div>'; return; }
  let root; try { root = d3.stratify().id((e) => e.id).parentId((e) => e.matriz && ids.has(e.matriz) ? e.matriz : null)(emp); } catch (e) { box.innerHTML = '<div class="hint" style="padding:20px">Hay más de una sociedad sin matriz.</div>'; return; }
  const actsBy = d3.group(DB.activos.filter((a) => a.visible !== false), (a) => a.empresa_id);
  const colW = 250, boxW = 214, lineH = 15;
  const hOf = (n) => { const na = showAct ? (actsBy.get(n.id) || []).length : 0; return 48 + (na ? na * lineH + 6 : 0); };
  d3.tree().nodeSize([1, colW]).separation((a, b) => (hOf(a) + hOf(b)) / 2 + 14)(root);
  const nodes = root.descendants(), links = root.links();
  orgSvg = d3.select(box).append('svg'); const g = orgSvg.append('g');
  orgZoom = d3.zoom().scaleExtent([0.25, 2.5]).on('zoom', (ev) => g.attr('transform', ev.transform));
  orgSvg.call(orgZoom);
  g.append('g').selectAll('path').data(links).join('path').attr('class', 'link')
    .attr('d', (l) => d3.linkHorizontal().x((d) => d[0]).y((d) => d[1])({ source: [l.source.y + boxW, l.source.x], target: [l.target.y, l.target.x] }));
  const colorFor = (p) => { const n = num(p); return n == null ? 'var(--cna)' : n >= 0.999 ? 'var(--c100)' : n >= 0.5 ? 'var(--c50)' : 'var(--c33)'; };
  const node = g.append('g').selectAll('g').data(nodes).join('g').attr('class', (n) => 'node' + (state.selType === 'empresa' && state.sel === n.id ? ' selected' : '')).attr('data-id', (n) => n.id)
    .attr('transform', (n) => `translate(${n.y},${n.x - hOf(n) / 2})`).style('cursor', 'pointer');
  node.append('rect').attr('class', 'box').attr('width', boxW).attr('height', (n) => hOf(n));
  node.append('rect').attr('width', 5).attr('height', (n) => hOf(n)).attr('rx', 2).attr('fill', (n) => colorFor(n.data.participacion_grupo));
  node.append('text').attr('class', 'name').attr('x', 13).attr('y', 18).text((n) => n.data.nombre).each(function () { trimText(d3.select(this), boxW - 20); });
  node.append('text').attr('class', 'meta').attr('x', 13).attr('y', 33).text((n) => (n.parent ? pct(n.data.participacion_grupo) + ' · efectivo ' + pct(efectiva(n.data)) : 'cabecera') + (n.data.tipo ? ' · ' + n.data.tipo : '')).each(function () { trimText(d3.select(this), boxW - 20); });
  node.each(function (n) { if (!showAct) return; const xs = actsBy.get(n.id) || []; const gg = d3.select(this); xs.forEach((a, i) => { const y = 48 + i * lineH; const ga = gg.append('g').attr('class', 'asset').attr('data-aid', a.id).style('pointer-events', 'all'); ga.append('rect').attr('x', 13).attr('y', y - 2).attr('width', boxW - 20).attr('height', lineH).attr('fill', 'transparent'); ga.append('rect').attr('x', 13).attr('y', y).attr('width', 8).attr('height', 8).attr('rx', 2).attr('class', evClass(a.evidencia)).attr('fill', ({ 'ev-acreditado': '#1f8a4c', 'ev-parcial': '#b7791f', 'ev-contradiccion': '#b23a3a' }[evClass(a.evidencia)] || '#999')); ga.append('text').attr('class', 'asset').attr('x', 26).attr('y', y + 8).text(a.activo + (num(a.inversion_grupo) ? ' · ' + eur(a.inversion_grupo) : '')).each(function () { trimText(d3.select(this), boxW - 32); }); ga.on('click', (ev) => { ev.stopPropagation(); openPanel('activo', a.id); }); }); });
  node.on('click', (ev, n) => { ev.stopPropagation(); openPanel('empresa', n.id); });
  if (state.editor) node.call(d3.drag().filter((ev) => !ev.button).on('start', function () { d3.select(this).raise(); }).on('drag', function (ev, n) { n.dx = (n.dx || 0) + ev.dx; n.dy = (n.dy || 0) + ev.dy; d3.select(this).attr('transform', `translate(${n.y + n.dx},${n.x - hOf(n) / 2 + n.dy})`); const tgt = dropTarget(ev, n); node.classed('drop', (m) => m === tgt); }).on('end', async function (ev, n) { const tgt = dropTarget(ev, n); node.classed('drop', false); n.dx = n.dy = 0; if (tgt && tgt.id !== n.id && !tgt.ancestors().some((x) => x.id === n.id)) { const p = prompt(`Colgar ${n.data.nombre} de ${tgt.data.nombre}. ¿Participación directa (0-100)?`, Math.round((num(n.data.participacion_grupo) || 0) * 100)); if (p !== null) { await save('empresas', n.id, { matriz: tgt.id, participacion_grupo: num(p) != null ? num(p) / 100 : null }); return; } } renderOrg(); }));
  function dropTarget(ev, n) { const [mx, my] = d3.pointer(ev, g.node()); return nodes.find((m) => m !== n && mx >= m.y && mx <= m.y + boxW && my >= m.x - hOf(m) / 2 && my <= m.x + hOf(m) / 2) || null; }
  fitOrg(nodes, hOf, boxW, W, H);
  $('#org-hint').textContent = state.editor ? 'Toca una caja para editarla. Arrastra una sociedad sobre otra para cambiar de quién cuelga.' : 'Toca una caja para ver su ficha. Rueda o pellizca para hacer zoom.';
}
function fitOrg(nodes, hOf, boxW, W, H) { const x0 = d3.min(nodes, (n) => n.y), x1 = d3.max(nodes, (n) => n.y + boxW), y0 = d3.min(nodes, (n) => n.x - hOf(n) / 2), y1 = d3.max(nodes, (n) => n.x + hOf(n) / 2); const k = Math.min(1.2, 0.95 * Math.min(W / (x1 - x0 + 40), H / (y1 - y0 + 40))); const tx = (W - k * (x1 - x0)) / 2 - k * x0, ty = (H - k * (y1 - y0)) / 2 - k * y0; orgSvg.call(orgZoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k)); }
function trimText(sel, maxW) { let t = sel.text(); if (sel.node().getComputedTextLength() <= maxW) return; while (t.length > 2 && sel.node().getComputedTextLength() > maxW) { t = t.slice(0, -1); sel.text(t + '…'); } }

// ---------- activos ----------
function renderActivos() {
  const q = ($('#act-q').value || '').toLowerCase(), emp = $('#act-emp').value, ev = $('#act-ev').value;
  const sel = $('#act-emp'); const cur = sel.value; sel.innerHTML = '<option value="">Todas las sociedades</option>' + DB.empresas.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join(''); sel.value = cur;
  const rows = DB.activos.filter((a) => a.visible !== false && (!emp || a.empresa_id === emp) && (!ev || a.evidencia === ev) && (!q || JSON.stringify(a).toLowerCase().includes(q)));
  table($('#tbl-activos'), [
    { h: 'Activo', v: (a) => a.activo, f: (v, a) => `<span class="main">${esc(v)}</span><span class="sub">${esc(a.tipo_activo || '')}</span>` },
    { h: 'Sociedad', v: (a) => (byId('empresas', a.empresa_id) || {}).nombre },
    { h: 'Negocio', v: (a) => a.tipo_negocio, f: negBadge }, { h: 'Desde', v: (a) => a.fecha, f: fdate },
    { h: 'Precio / coste', n: 1, v: (a) => a.precio_compra, f: eur }, { h: 'Inversión grupo', n: 1, v: (a) => a.inversion_grupo, f: eur },
    { h: 'Recuperado', n: 1, v: (a) => a.recuperado, f: eur }, { h: 'Venta potencial', n: 1, v: (a) => a.venta_potencial, f: (v, a) => eur(v) + (a.base_venta ? `<span class="sub">${a.base_venta}</span>` : '') },
    { h: 'Renta real/mes', n: 1, v: (a) => a.renta_mensual, f: eur }, { h: 'Renta prev./mes', n: 1, v: (a) => a.renta_prevista, f: eur },
    { h: 'Gestión', v: (a) => a.gestion }, { h: 'Estado', v: (a) => a.estado }, { h: 'Evidencia', v: (a) => a.evidencia, f: evBadge }, { h: 'Pri.', v: (a) => a.prioridad },
  ], rows, { id: (a) => a.id, click: (id) => openPanel('activo', id) });
}

// ---------- modelo ----------
function renderModelo() {
  const rows = DB.activos.filter((a) => a.visible !== false).map((a) => ({ a, m: modelo(a) }));
  table($('#tbl-modelo'), [
    { h: 'Activo', v: (r) => r.a.activo, f: (v, r) => `<span class="main">${esc(v)}</span><span class="sub">${esc(r.a.categoria || '')} · ${esc((byId('empresas', r.a.empresa_id) || {}).nombre || '')}</span>` },
    { h: 'Entrada', v: (r) => r.a.fecha, f: fdate }, { h: 'Salida prev.', v: (r) => r.a.salida_prevista, f: fdate },
    { h: 'Inversión total', n: 1, v: (r) => r.m.inv, f: eur }, { h: 'Financiación', n: 1, v: (r) => r.m.fin, f: eur }, { h: 'Equity', n: 1, v: (r) => r.m.eq, f: eur },
    { h: 'Ingreso anual', n: 1, v: (r) => r.m.ing, f: eur }, { h: 'Yield to cost', n: 1, v: (r) => r.m.yieldCost, f: pct }, { h: 'Yield venta', n: 1, v: (r) => r.m.yv, f: pct },
    { h: 'Valor', n: 1, v: (r) => r.m.valor, f: eur }, { h: 'Resultado', n: 1, v: (r) => r.m.resultado, f: (v, r) => eur(v) + (r.m.ambito ? `<span class="sub">${r.m.ambito === 'grupo' ? 'solo grupo' : 'toda la operación'}</span>` : ''), cls: (v) => num(v) > 0 ? 'pos' : num(v) < 0 ? 'neg' : '' },
    { h: 'ROE inv.', n: 1, v: (r) => r.m.roeInv, f: pct }, { h: 'ROE equity', n: 1, v: (r) => r.m.roeEq, f: pct }, { h: 'Palanca', n: 1, v: (r) => r.m.palanca, f: (v) => v == null ? '—' : v.toFixed(2) + '×' },
    { h: 'Capital grupo', n: 1, v: (r) => r.m.capital, f: eur }, { h: 'Beneficio grupo', n: 1, v: (r) => r.m.beneficio, f: eur, cls: (v) => num(v) > 0 ? 'pos' : '' },
    { h: 'Años', n: 1, v: (r) => r.m.anios, f: (v) => v == null ? '—' : v.toFixed(2) }, { h: 'TIR simple', n: 1, v: (r) => r.m.tirSimple, f: pct }, { h: 'ROI anualizado', n: 1, v: (r) => r.m.roiAnual, f: pct },
    { h: 'Rentas/año grupo', n: 1, v: (r) => r.m.rentasAnio, f: eur },
    { h: 'Salidas reales', n: 1, v: (r) => r.m.real.salidas, f: eur }, { h: 'Entradas reales', n: 1, v: (r) => r.m.real.entradas, f: eur },
    { h: 'TIR real (XIRR)', n: 1, v: (r) => r.m.tirReal, f: pct }, { h: 'TIR prevista (XIRR)', n: 1, v: (r) => r.m.tirPrev, f: pct },
  ], rows, { id: (r) => r.a.id, click: (id) => openPanel('activo', id), total: true });
}

// ---------- cartera ----------
function renderCartera() {
  const A = DB.activos.filter((a) => a.visible !== false).map((a) => ({ a, m: modelo(a) }));
  const cats = d3.group(A, (r) => r.a.categoria || 'Sin categoría'); const totEq = d3.sum(A, (r) => r.m.eq || 0);
  table($('#tbl-cat'), [
    { h: 'Categoría', v: (c) => c.k }, { h: 'Nº', n: 1, v: (c) => c.rows.length }, { h: 'Equity', n: 1, v: (c) => d3.sum(c.rows, (r) => r.m.eq || 0), f: eur }, { h: 'Banco', n: 1, v: (c) => d3.sum(c.rows, (r) => r.m.fin || 0), f: eur },
    { h: 'Capital grupo', n: 1, v: (c) => d3.sum(c.rows, (r) => r.m.capital || 0), f: eur }, { h: 'Beneficio grupo', n: 1, v: (c) => d3.sum(c.rows, (r) => r.m.beneficio || 0), f: eur },
    { h: 'ROI s/capital', n: 1, v: (c) => { const cap = d3.sum(c.rows, (r) => r.m.capital || 0); return cap ? d3.sum(c.rows, (r) => r.m.beneficio || 0) / cap : null; }, f: pct },
    { h: 'Peso (equity)', n: 1, v: (c) => totEq ? d3.sum(c.rows, (r) => r.m.eq || 0) / totEq : null, f: pct },
  ], [...cats].map(([k, rows]) => ({ k, rows })), {});
  const um = (DB.parametros.find((p) => p.clave === 'umbrales_riesgo') || {}).valor || {};
  const totBanco = d3.sum(A, (r) => r.m.fin || 0), totInv = d3.sum(A, (r) => r.m.inv || 0), maxCap = d3.max(A, (r) => r.m.capital || 0), totCap = d3.sum(A, (r) => r.m.capital || 0);
  const promEq = d3.sum(A.filter((r) => /promoci/i.test(r.a.categoria || '')), (r) => r.m.capital || 0);
  const t = today(); const venc90 = A.filter((r) => r.a.salida_prevista && !r.m.cerrada && days(t, r.a.salida_prevista) >= 0 && days(t, r.a.salida_prevista) <= (um.vencimiento_dias || 90)).length;
  const vencidos = A.filter((r) => r.a.salida_prevista && !r.m.cerrada && days(t, r.a.salida_prevista) < 0).length;
  const durMed = totCap ? d3.sum(A, (r) => (r.m.capital || 0) * (r.m.dias || 0)) / totCap : null;
  const rois = A.map((r) => r.m.roeEq).filter((v) => v != null);
  const ok = (c) => c ? '<span class="badge r">OK</span>' : '<span class="badge b">Revisar</span>';
  const riesgo = [
    ['Apalancamiento total (banco / equity)', totEq ? totBanco / totEq : null, (v) => v == null ? '—' : v.toFixed(2) + '×', '< ' + (um.apalancamiento_max || 2) + '×', (v) => v == null || v < (um.apalancamiento_max || 2)],
    ['Concentración del mayor activo (capital del grupo)', totCap ? maxCap / totCap : null, pct, '< ' + pct(um.concentracion_max || 0.3), (v) => v == null || v < (um.concentracion_max || 0.3)],
    ['Financiación bancaria sobre inversión total', totInv ? totBanco / totInv : null, pct, '< ' + pct(um.financiacion_sobre_compra_max || 0.6), (v) => v == null || v < (um.financiacion_sobre_compra_max || 0.6)],
    ['Promociones sobre capital del grupo', totCap ? promEq / totCap : null, pct, '< ' + pct(um.promocion_sobre_equity_max || 0.5), (v) => v == null || v < (um.promocion_sobre_equity_max || 0.5)],
    ['Duración media ponderada (días)', durMed, (v) => v == null ? '—' : fmtInt.format(Math.round(v)), '< ' + (um.duracion_max_dias || 730), (v) => v == null || v < (um.duracion_max_dias || 730)],
    ['Activos que vencen en ' + (um.vencimiento_dias || 90) + ' días', venc90, fmtInt.format, 'Info', () => true],
    ['Activos con salida prevista ya vencida', vencidos, fmtInt.format, '0', (v) => v === 0],
    ['ROE equity mínimo', rois.length ? d3.min(rois) : null, pct, '> ' + pct(um.roi_min || 0.1), (v) => v == null || v > (um.roi_min || 0.1)],
    ['ROE equity máximo', rois.length ? d3.max(rois) : null, pct, 'Info', () => true],
    ['Categorías distintas', cats.size, fmtInt.format, '> 5', (v) => v > 5],
  ];
  table($('#tbl-riesgo'), [{ h: 'Métrica', v: (r) => r[0] }, { h: 'Valor', n: 1, v: (r) => r[1], f: (v, r) => r[2](v) }, { h: 'Umbral', v: (r) => r[3] }, { h: 'Estado', v: (r) => r[4](r[1]), f: (v) => ok(v) }], riesgo, {});
  const cal = A.filter((r) => r.a.salida_prevista || r.m.cerrada).map((r) => { const d = r.a.salida_prevista ? days(t, r.a.salida_prevista) : null; const estado = r.m.cerrada ? 'Realizado' : d == null ? '—' : d < 0 ? 'Vencido' : d <= 90 ? 'Inminente' : d <= 365 ? 'Este año' : 'Largo plazo'; const cap = r.m.capital, ben = r.m.beneficio; return { r, estado, cap, ben, total: cap != null && ben != null ? cap + ben : (r.m.cerrada ? r.m.real.entradas : null) }; }).sort((x, y) => String(x.r.a.salida_prevista || '').localeCompare(String(y.r.a.salida_prevista || '')));
  table($('#tbl-cal'), [{ h: 'Activo', v: (c) => c.r.a.activo }, { h: 'Salida prevista', v: (c) => c.r.a.salida_prevista, f: fdate }, { h: 'Capital', n: 1, v: (c) => c.cap, f: eur }, { h: 'Beneficio', n: 1, v: (c) => c.ben, f: eur }, { h: 'Flujo esperado', n: 1, v: (c) => c.total, f: eur }, { h: 'Estado', v: (c) => c.estado, f: (v) => `<span class="badge ${v === 'Vencido' ? 'b' : v === 'Inminente' ? 'o' : v === 'Realizado' ? 'r' : ''}">${v}</span>` }], cal, { id: (c) => c.r.a.id, click: (id) => openPanel('activo', id), total: true });
  renderCurva();
}
function renderCurva() {
  const el = $('#curva'); el.innerHTML = ''; const ms = DB.movimientos.filter((m) => m.cash !== false).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)); if (!ms.length) { el.innerHTML = '<div class="hint">Sin movimientos.</div>'; return; }
  const q = (d) => { const dt = new Date(d); return dt.getFullYear() + ' T' + (Math.floor(dt.getMonth() / 3) + 1); };
  const qs = [...new Set(ms.map((m) => q(m.fecha)))]; let inv = 0, rec = 0; const pts = qs.map((k) => { ms.filter((m) => q(m.fecha) === k).forEach((m) => { const v = num(m.importe); if (v < 0) inv -= v; else rec += v; }); return { k, inv, rec }; });
  const W = el.clientWidth || 500, H = 280, mg = { t: 16, r: 16, b: 40, l: 70 };
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`); const x = d3.scalePoint(qs, [mg.l, W - mg.r]); const y = d3.scaleLinear([0, d3.max(pts, (p) => Math.max(p.inv, p.rec)) * 1.1 || 1], [H - mg.b, mg.t]);
  svg.append('g').attr('transform', `translate(0,${H - mg.b})`).call(d3.axisBottom(x)).selectAll('text').attr('transform', 'rotate(-35)').style('text-anchor', 'end').attr('font-size', 10);
  svg.append('g').attr('transform', `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => fmtInt.format(v / 1000) + ' k')).attr('font-size', 10);
  const line = (f) => d3.line().x((p) => x(p.k)).y((p) => y(f(p)));
  svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', '#2c5a85').attr('stroke-width', 2).attr('d', line((p) => p.inv));
  svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', '#1f8a4c').attr('stroke-width', 2).attr('d', line((p) => p.rec));
  svg.append('text').attr('x', W - mg.r).attr('y', y(pts[pts.length - 1].inv) - 6).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', '#2c5a85').text('Invertido ' + eur(inv));
  svg.append('text').attr('x', W - mg.r).attr('y', y(pts[pts.length - 1].rec) + 14).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', '#1f8a4c').text('Recuperado ' + eur(rec));
}

// ---------- flujo de caja ----------
function renderCashflow() {
  const prev = $('#cf-prev').checked; const A = DB.activos.filter((a) => a.visible !== false);
  const ms = DB.movimientos.filter((m) => m.cash !== false).map((m) => ({ a: m.activo_id, f: m.fecha.slice(0, 7), v: num(m.importe) }));
  if (prev) A.forEach((a) => { const m = modelo(a); if (!m.cerrada && a.salida_prevista) { const v = a.base_venta === 'grupo' ? num(a.venta_potencial) : (m.capital != null && m.beneficio != null ? m.capital + m.beneficio : null); if (v != null) ms.push({ a: a.id, f: a.salida_prevista.slice(0, 7), v, prev: true }); } });
  if (!ms.length) { $('#tbl-cf').innerHTML = ''; return; }
  const months = [...new Set(ms.map((m) => m.f))].sort(); const act = A.filter((a) => ms.some((m) => m.a === a.id));
  const cell = (a, f) => d3.sum(ms.filter((m) => m.a === a.id && m.f === f), (m) => m.v);
  let head = '<tr><th>Activo</th>' + months.map((f) => `<th class="n">${f.slice(5)}/${f.slice(2, 4)}</th>`).join('') + '<th class="n">Total</th></tr>';
  let body = act.map((a) => { const vals = months.map((f) => cell(a, f)); return `<tr class="clickable" data-id="${a.id}"><td class="main">${esc(a.activo)}</td>` + vals.map((v) => `<td class="n ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v ? eur(v) : ''}</td>`).join('') + `<td class="n ${d3.sum(vals) >= 0 ? 'pos' : 'neg'}">${eur(d3.sum(vals))}</td></tr>`; }).join('');
  const totals = months.map((f) => d3.sum(ms.filter((m) => m.f === f), (m) => m.v)); let acc = 0;
  body += '<tr class="total"><td>Total mes</td>' + totals.map((v) => `<td class="n ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v ? eur(v) : ''}</td>`).join('') + `<td class="n">${eur(d3.sum(totals))}</td></tr>`;
  body += '<tr class="total"><td>Acumulado</td>' + totals.map((v) => { acc += v; return `<td class="n ${acc >= 0 ? 'pos' : 'neg'}">${eur(acc)}</td>`; }).join('') + '<td></td></tr>';
  $('#tbl-cf').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  $$('#tbl-cf tr[data-id]').forEach((r) => r.onclick = () => openPanel('activo', r.dataset.id));
}

// ---------- documentos, pendientes, decisiones ----------
function renderDocs() {
  const nombre = (id) => id ? (byId('activos', id) || {}).activo || id : 'Grupo';
  table($('#tbl-pend'), [{ h: 'Hecho', v: (p) => p.hecho, f: (v, p) => `<input type="checkbox" ${v ? 'checked' : ''} data-pend="${p.id}" ${state.editor ? '' : 'disabled'}>` }, { h: 'Operación', v: (p) => nombre(p.activo_id) }, { h: 'Pri.', v: (p) => p.prioridad }, { h: 'Pendiente', v: (p) => p.texto, cls: (v, p) => p.hecho ? 'pend' : '' }], DB.pendientes.slice().sort((a, b) => (a.hecho - b.hecho) || String(a.prioridad || 'Z').localeCompare(String(b.prioridad || 'Z'))), {});
  $$('#tbl-pend input[data-pend]').forEach((c) => c.onchange = () => save('pendientes', +c.dataset.pend, { hecho: c.checked }));
  table($('#tbl-docs'), [{ h: 'Operación', v: (d) => nombre(d.activo_id) }, { h: 'Documento', v: (d) => d.documento, f: (v, d) => d.drive_url ? `<a href="${esc(d.drive_url)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v) }, { h: 'Dónde', v: (d) => d.donde }, { h: 'Fecha', v: (d) => d.fecha_texto }, { h: 'Datos clave', v: (d) => d.datos }, { h: 'Qué falta', v: (d) => d.falta }], DB.documentos, { id: (d) => d.id, click: state.editor ? (id) => openPanel('documento', id) : null });
}
function renderDecisiones() { table($('#tbl-dec'), [{ h: 'Fecha', v: (d) => d.fecha, f: fdate }, { h: 'Tema', v: (d) => d.tema }, { h: 'Decisión', v: (d) => d.decision }], DB.decisiones.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id), {}); }

// ---------- panel / fichas ----------
const F_EMP = [['nombre', 'Nombre corto'], ['razon_social', 'Razón social'], ['cif', 'CIF'], ['matriz', 'Cuelga de', 'empresa'], ['participacion_grupo', '% directo del grupo', 'pct'], ['socio_grupo', 'Socio del grupo'], ['administrador', 'Administrador'], ['tipo', 'Tipo'], ['gestion', 'Gestión', 'sel', ['Propia', 'Terceros', 'Compartida']], ['notas', 'Notas', 'area']];
const F_ACT = [['activo', 'Activo'], ['empresa_id', 'Sociedad titular', 'empresa'], ['marca', 'Marca'], ['tipo_activo', 'Tipo de activo'], ['categoria', 'Categoría', 'sel', ['Trasteros', 'Comercial', 'Industrial', 'Apartamentos', 'Suelo', 'Promoción', 'NPL/Deuda', 'Financiero']], ['tipo_negocio', 'Negocio', 'sel', ['Rentabilidad', 'Rotación']], ['fecha', 'Entrada', 'date'], ['salida_prevista', 'Salida prevista', 'date'],
  ['precio_compra', 'Precio / coste', 'num'], ['inversion_total', 'Inversión total (modelo)', 'num'], ['financiacion', 'Financiación (modelo)', 'num'], ['inversion_grupo', 'Inversión del grupo', 'num'], ['recuperado', 'Recuperado', 'num'], ['venta_potencial', 'Venta potencial', 'num'], ['base_venta', 'Base de la venta', 'sel', ['grupo', 'total']],
  ['renta_mensual', 'Renta real / mes', 'num'], ['renta_prevista', 'Renta prevista / mes', 'num'], ['ingreso_anual_modelo', 'Ingreso anual (modelo)', 'num'], ['yield_venta', 'Yield de venta', 'pct'], ['capital_grupo_modelo', 'Capital del grupo (modelo)', 'num'],
  ['gestion', 'Gestión', 'sel', ['Propia', 'Terceros', 'Compartida']], ['estado', 'Estado'], ['evidencia', 'Evidencia', 'sel', ['Acreditado', 'Parcial', 'Contradicción', 'Sin datos']], ['prioridad', 'Prioridad', 'sel', ['P0', 'P1', 'P2', 'P3']], ['drive_url', 'Carpeta en Drive (enlace)'], ['notas', 'Notas', 'area']];
const F_DOC = [['activo_id', 'Operación', 'activo'], ['documento', 'Documento'], ['donde', 'Dónde está'], ['fecha_texto', 'Fecha'], ['drive_url', 'Enlace en Drive'], ['datos', 'Datos clave', 'area'], ['falta', 'Qué falta', 'area']];
function field(def, val) {
  const [k, label, type, opts] = def; const dis = state.editor ? '' : 'disabled'; const v = val == null ? '' : val;
  let inp;
  if (type === 'area') inp = `<textarea name="${k}" ${dis}>${esc(v)}</textarea>`;
  else if (type === 'sel') inp = `<select name="${k}" ${dis}><option value="">—</option>${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  else if (type === 'empresa') inp = `<select name="${k}" ${dis}><option value="">— ninguna —</option>${DB.empresas.map((e) => `<option value="${e.id}" ${e.id === v ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select>`;
  else if (type === 'activo') inp = `<select name="${k}" ${dis}><option value="">Grupo</option>${DB.activos.map((e) => `<option value="${e.id}" ${e.id === v ? 'selected' : ''}>${esc(e.activo)}</option>`).join('')}</select>`;
  else if (type === 'num') inp = `<input name="${k}" type="number" step="0.01" value="${v}" ${dis}>`;
  else if (type === 'pct') inp = `<input name="${k}" type="number" step="0.01" min="0" max="100" value="${v === '' ? '' : Math.round(Number(v) * 10000) / 100}" ${dis}>`;
  else if (type === 'date') inp = `<input name="${k}" type="date" value="${v ? String(v).slice(0, 10) : ''}" ${dis}>`;
  else inp = `<input name="${k}" type="text" value="${esc(v)}" ${dis}>`;
  return `<label class="${type === 'area' ? 'wide' : ''}">${label}${inp}</label>`;
}
function readForm(form, defs) { const out = {}; defs.forEach(([k, , type]) => { const el = form.elements[k]; if (!el) return; let v = el.value; if (v === '') v = null; else if (type === 'num') v = Number(v); else if (type === 'pct') v = Number(v) / 100; out[k] = v; }); return out; }
function openPanel(type, id, keep) {
  state.sel = id; state.selType = type; const p = $('#panel'); p.hidden = false; const body = $('#panel-body');
  if (type === 'empresa') {
    const e = byId('empresas', id); if (!e) return closePanel();
    $('#panel-title').textContent = e.nombre;
    const acts = DB.activos.filter((a) => a.empresa_id === id), socs = DB.socios.filter((s) => s.empresa_id === id);
    body.innerHTML = `<form class="form" id="f-emp">${F_EMP.map((d) => field(d, e[d[0]])).join('')}</form>
      <div class="row">${state.editor ? '<button class="btn" id="save-emp">Guardar</button><button class="btn ghost" id="del-emp">Ocultar sociedad</button>' : ''}<span class="hint">Efectivo del grupo: <b>${pct(efectiva(e))}</b></span></div>
      <div class="sect"><h4>Socios</h4><ul class="list">${socs.map((s) => `<li><span>${esc(s.socio)}</span><span class="d">${pct(s.participacion)}${s.admin_rol ? ' · ' + esc(s.admin_rol) : ''}</span></li>`).join('') || '<li class="hint">Sin socios registrados</li>'}</ul></div>
      <div class="sect"><h4>Activos</h4><ul class="list">${acts.map((a) => `<li><a href="#" data-open-act="${a.id}">${esc(a.activo)}</a><span class="d">${eur(a.inversion_grupo)} · ${esc(a.evidencia || '')}</span></li>`).join('') || '<li class="hint">Sin activos</li>'}</ul></div>`;
    $$('[data-open-act]', body).forEach((l) => l.onclick = (ev) => { ev.preventDefault(); openPanel('activo', l.dataset.openAct); });
    if (state.editor) { $('#save-emp').onclick = (ev) => { ev.preventDefault(); save('empresas', id, readForm($('#f-emp'), F_EMP)); }; $('#del-emp').onclick = (ev) => { ev.preventDefault(); if (confirm('¿Ocultar esta sociedad del organigrama? (no se borra)')) save('empresas', id, { visible: false }); }; }
  } else if (type === 'activo') {
    const a = byId('activos', id); if (!a) return closePanel();
    $('#panel-title').textContent = a.activo; const m = modelo(a); const ms = movsDe(id); const docs = DB.documentos.filter((d) => d.activo_id === id), pend = DB.pendientes.filter((d) => d.activo_id === id);
    body.innerHTML = `<form class="form" id="f-act">${F_ACT.map((d) => field(d, a[d[0]])).join('')}</form>
      <div class="row">${state.editor ? '<button class="btn" id="save-act">Guardar</button><button class="btn ghost" id="del-act">Ocultar activo</button>' : ''}</div>
      <div class="sect"><h4>Modelo</h4><dl class="kv"><dt>Equity</dt><dd>${eur(m.eq)}</dd><dt>Valor (ingreso / yield)</dt><dd>${eur(m.valor)}</dd><dt>Resultado</dt><dd>${eur(m.resultado)}</dd><dt>ROE inversión / equity</dt><dd>${pct(m.roeInv)} / ${pct(m.roeEq)}</dd><dt>Beneficio del grupo</dt><dd>${eur(m.beneficio)}</dd><dt>TIR simple / ROI anualizado</dt><dd>${pct(m.tirSimple)} / ${pct(m.roiAnual)}</dd><dt>Salidas / entradas reales</dt><dd>${eur(m.real.salidas)} / ${eur(m.real.entradas)}</dd><dt>TIR real / prevista (XIRR)</dt><dd>${pct(m.tirReal)} / ${pct(m.tirPrev)}</dd></dl></div>
      <div class="sect"><h4>Movimientos (${ms.length})</h4><table><thead><tr><th>Fecha</th><th>Tipo</th><th class="n">Importe</th><th>Origen · concepto</th><th>Acred.</th>${state.editor ? '<th></th>' : ''}</tr></thead><tbody>${ms.map((x) => `<tr><td>${fdate(x.fecha)}</td><td>${esc(x.tipo)}</td><td class="n ${num(x.importe) < 0 ? 'neg' : 'pos'}">${eur(x.importe, true)}</td><td>${esc(x.origen || '')}<span class="sub">${esc(x.concepto || '')}${x.cash === false ? ' · sin caja' : ''}</span></td><td>${x.acreditado ? '✔' : ''}</td>${state.editor ? `<td><button class="btn small ghost" data-del-mov="${x.id}">×</button></td>` : ''}</tr>`).join('')}</tbody></table>
        ${state.editor ? `<form class="form" id="f-mov" style="margin-top:8px"><label>Fecha<input name="fecha" type="date" required></label><label>Tipo<select name="tipo"><option>aportacion</option><option>devolucion</option><option>renta</option><option>venta</option><option>gasto</option><option>interes_devengado</option></select></label><label>Importe (negativo = sale)<input name="importe" type="number" step="0.01" required></label><label>Origen<input name="origen"></label><label class="wide">Concepto<input name="concepto"></label><label>Acreditado<select name="acreditado"><option value="false">No</option><option value="true">Sí</option></select></label><label>Con caja<select name="cash"><option value="true">Sí</option><option value="false">No (devengo)</option></select></label><div class="row wide"><button class="btn small" id="add-mov">+ Añadir movimiento</button></div></form>` : ''}</div>
      <div class="sect"><h4>Documentos (${docs.length})</h4><ul class="list">${docs.map((d) => `<li><span>${d.drive_url ? `<a href="${esc(d.drive_url)}" target="_blank" rel="noopener">${esc(d.documento)}</a>` : esc(d.documento)}<span class="sub">${esc(d.datos || '')}</span></span><span class="d">${esc(d.fecha_texto || '')}</span></li>`).join('') || '<li class="hint">Sin documentos</li>'}</ul></div>
      <div class="sect"><h4>Pendientes (${pend.filter((p) => !p.hecho).length})</h4><ul class="list">${pend.map((p) => `<li><span class="${p.hecho ? 'hint' : ''}">${p.hecho ? '✔ ' : ''}${esc(p.texto)}</span></li>`).join('') || '<li class="hint">Nada pendiente</li>'}</ul></div>`;
    if (state.editor) {
      $('#save-act').onclick = (ev) => { ev.preventDefault(); save('activos', id, readForm($('#f-act'), F_ACT)); };
      $('#del-act').onclick = (ev) => { ev.preventDefault(); if (confirm('¿Ocultar este activo? (no se borra)')) save('activos', id, { visible: false }); };
      $('#add-mov').onclick = async (ev) => { ev.preventDefault(); const f = $('#f-mov'); if (!f.reportValidity()) return; await insertRow('movimientos', { activo_id: id, fecha: f.fecha.value, tipo: f.tipo.value, importe: Number(f.importe.value), origen: f.origen.value || null, concepto: f.concepto.value || null, acreditado: f.acreditado.value === 'true', cash: f.cash.value === 'true', fuente: 'app' }); };
      $$('[data-del-mov]', body).forEach((b) => b.onclick = (ev) => { ev.preventDefault(); if (confirm('¿Borrar este movimiento?')) save('movimientos', +b.dataset.delMov, {}, 'delete'); });
    }
  } else if (type === 'documento') {
    const d = byId('documentos', id); if (!d) return closePanel(); $('#panel-title').textContent = 'Documento';
    body.innerHTML = `<form class="form" id="f-doc">${F_DOC.map((x) => field(x, d[x[0]])).join('')}</form><div class="row"><button class="btn" id="save-doc">Guardar</button><button class="btn danger" id="del-doc">Borrar</button></div>`;
    $('#save-doc').onclick = (ev) => { ev.preventDefault(); save('documentos', id, readForm($('#f-doc'), F_DOC)); };
    $('#del-doc').onclick = (ev) => { ev.preventDefault(); if (confirm('¿Borrar el documento?')) { save('documentos', id, {}, 'delete'); closePanel(); } };
  }
  if (!keep) body.scrollTop = 0;
}
function closePanel() { $('#panel').hidden = true; state.sel = null; state.selType = null; if (state.tab === 'organigrama') renderOrg(); }

// ---------- altas ----------
async function newActivo() { const nombre = prompt('Nombre del activo:'); if (!nombre) return; const id = nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) + '_' + Date.now().toString(36); const emp = DB.empresas[0] ? DB.empresas[0].id : null; const row = await insertRow('activos', { id, activo: nombre, empresa_id: emp, evidencia: 'Sin datos', prioridad: 'P2' }); if (row) openPanel('activo', row.id); }
async function newPend() { const t = prompt('Pendiente:'); if (!t) return; await insertRow('pendientes', { texto: t, prioridad: 'P1', activo_id: state.selType === 'activo' ? state.sel : null }); }
async function newDoc() { const t = prompt('Nombre del documento:'); if (!t) return; const row = await insertRow('documentos', { documento: t, activo_id: state.selType === 'activo' ? state.sel : null }); if (row) openPanel('documento', row.id); }
async function newDec() { const t = prompt('Tema:'); if (!t) return; const d = prompt('Decisión:'); if (!d) return; await insertRow('decisiones', { fecha: new Date().toISOString().slice(0, 10), tema: t, decision: d }); }
function exportJson() { const blob = new Blob([JSON.stringify({ exportado: new Date().toISOString(), ...DB }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `grupo_tesela_${new Date().toISOString().slice(0, 10)}.json`; a.click(); }
function share() { const url = location.origin + location.pathname; const text = `Grupo Tesela · organigrama e inversiones: ${url}`; if (navigator.share) navigator.share({ title: 'Grupo Tesela', text, url }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }

// ---------- arranque ----------
function bind() {
  window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (['organigrama', 'activos', 'modelo', 'cartera', 'cashflow', 'documentos', 'decisiones'].includes(t)) { state.tab = t; renderAll(); } });
  window.addEventListener('online', () => { updateStatus(); flushQueue(); reload(true); }); window.addEventListener('offline', updateStatus);
  window.addEventListener('resize', () => { if (state.tab === 'organigrama') renderOrg(); if (state.tab === 'cartera') renderCurva(); });
  $('#btn-login').onclick = login; $('#btn-share').onclick = share; $('#panel-close').onclick = closePanel;
  $('#org-activos').onchange = renderOrg; $('#org-fit').onclick = renderOrg;
  ['#act-q', '#act-emp', '#act-ev'].forEach((s) => $(s).addEventListener('input', renderActivos)); $('#cf-prev').onchange = renderCashflow;
  $('#act-new').onclick = newActivo; $('#pend-new').onclick = newPend; $('#doc-new').onclick = newDoc; $('#dec-new').onclick = newDec; $('#btn-export').onclick = exportJson; $('#btn-reload').onclick = () => reload(false);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; $('#btn-install').hidden = false; });
  $('#btn-install').onclick = async () => { if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; $('#btn-install').hidden = true; };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
(async function main() {
  bind(); loadQueue(); const t = location.hash.slice(1); if (t) state.tab = t; else location.hash = '#organigrama';
  loadCache(); renderAll(); await initAuth(); await reload(true); flushQueue();
})();
})();
