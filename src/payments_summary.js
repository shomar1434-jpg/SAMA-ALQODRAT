/* =====================================================================
   «ملخص جميع المدفوعات» (الخطوة AX، البند 11 من وثيقة «طلبات نهائية»): كشف موحد لكل المتدربين
   في كل الباقات والبرامج من طلبات الشراء (السجل المالي الواحد)؛ لا يُعدّ الطلب والفاتورة والإيصال ثلاث دفعات.
   المدفوع = المعتمد فقط (paid_amount بعد الاسترداد)، والمتبقي = أقصى(0، الإجمالي − المدفوع)، والأقساط من installmentsOf.
   الإبلاغات غير المؤكدة تظهر تنبيهًا ولا تدخل المدفوع. التسجيلات بلا طلب شراء تظهر موسومة ولا تدخل الإجماليات.
   ===================================================================== */
import { $, esc, fmtNum, matchPerson, scopeSelect } from './utils.js';
import { ic, emptyBox } from './views2_head.js';
import { docShell, printDocs, exportCSV } from './print.js';
import { installmentsOf, orderRemaining } from './order_logic.js';

export const SVC_TXT = { qudurat:'القدرات', qudurat_tahsili:'القدرات والتحصيلي', program:'البرامج التدريبية' };
export const PST_TXT = { paid:'مسدد بالكامل', partial:'سداد جزئي', unpaid:'غير مسدد', cancelled:'ملغى', no_order:'بلا طلب شراء' };
export const PST_TONE = { paid:'ok', partial:'warn', unpaid:'bad', cancelled:'g', no_order:'info' };
const r2 = v => Math.round((+v || 0) * 100) / 100;

/* صف لكل طلب شراء غير مرفوض، ثم صف لكل اشتراك أو تسجيل قائم بلا طلب */
export function paymentRows(D){
  const plans = D.plans || [], progs = D.programs || [], subs = D.subscriptions || [], tr = id => (D.trainees || []).find(t => t.id === id);
  const rows = [], seenSub = new Set(), seenEnr = new Set();
  for(const o of (D.orders || []).filter(x => x.approval !== 'rejected')){
    const s = o.subscription_id && subs.find(x => x.id === o.subscription_id), pl = s && plans.find(p => p.id === s.plan_id);
    const enr = (o.enrollment_ids || []).map(id => (D.enrollments || []).find(e => e.id === id)).filter(Boolean), cohort = enr[0] && (D.cohorts || []).find(c => c.id === enr[0].cohort_id);
    const prog = cohort && progs.find(p => p.id === cohort.program_id);
    if(s) seenSub.add(s.id); enr.forEach(e => seenEnr.add(e.id));
    const total = r2(o.total), paid = r2(o.paid_amount), ins = installmentsOf(o, pl);
    const st = o.cancelled_at ? 'cancelled' : total > 0 && paid >= total - 0.005 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    rows.push({ key:o.id, order:o, t:tr(o.trainee_id), type:o.kind === 'plan' ? (pl?.program === 'qudurat_tahsili' ? 'qudurat_tahsili' : 'qudurat') : 'program',
      item:pl ? pl.id : prog ? prog.id : '', item_name:pl ? pl.name : (prog?.name || o.title), cohort:cohort ? cohort.number : null,
      total, paid, remaining:orderRemaining(o), ins, status:st, claimed:o.payment === 'claimed' && o.claim ? r2(o.claim.amount) : 0, date:(o.created_at || '').slice(0, 10) });
  }
  for(const s of subs.filter(x => x.status !== 'cancelled' && !seenSub.has(x.id))){ const pl = plans.find(p => p.id === s.plan_id);
    rows.push({ key:'s' + s.id, order:null, t:tr(s.trainee_id), type:pl?.program === 'qudurat_tahsili' ? 'qudurat_tahsili' : 'qudurat', item:pl?.id || '', item_name:pl?.name || '',
      total:r2(+pl?.reg_fee + (+pl?.installments || 0) * (+pl?.installment_amount || 0)), paid:0, remaining:0, ins:null, status:'no_order', claimed:0, date:(s.created_at || '').slice(0, 10) }); }
  for(const e of (D.enrollments || []).filter(x => x.status !== 'ملغى' && !seenEnr.has(x.id))){ const c = (D.cohorts || []).find(x => x.id === e.cohort_id), p = c && progs.find(x => x.id === c.program_id);
    rows.push({ key:'e' + e.id, order:null, t:tr(e.trainee_id), type:'program', item:p?.id || '', item_name:p?.name || '', cohort:c?.number ?? null,
      total:r2(p?.price), paid:0, remaining:0, ins:null, status:'no_order', claimed:0, date:(e.created_at || '').slice(0, 10) }); }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || (a.t?.full_name || '').localeCompare(b.t?.full_name || '', 'ar'));
}
export function filterRows(rows, f){
  return rows.filter(r => (f.type === 'all' || r.type === f.type) && (!f.item || r.item === f.item) && (f.st === 'all' || r.status === f.st)
    && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to) && matchPerson(f.sc || 'all', f.q || '', r.t, r.item_name, r.order?.number));
}
/* الإجماليات: الطلبات فقط (لا التسجيلات بلا طلب)، والملغى بلا متبقٍ */
export function rowTotals(list){
  const ord = list.filter(r => r.order);
  return { due:r2(ord.reduce((a, r) => a + (r.status === 'cancelled' ? r.paid : r.total), 0)), paid:r2(ord.reduce((a, r) => a + r.paid, 0)),
    remaining:r2(ord.reduce((a, r) => a + r.remaining, 0)), count:ord.length, noOrder:list.length - ord.length,
    claimed:r2(ord.reduce((a, r) => a + r.claimed, 0)), claimedN:ord.filter(r => r.claimed).length };
}
export const insCell = r => r.ins ? `${fmtNum(r.ins.paidN)} من ${fmtNum(r.ins.n)}` : 'لا ينطبق';

let sF = null;
const sf = () => sF || (sF = { type:'all', item:'', st:'all', from:'', to:'', q:'', sc:'all' });
const sar = v => `${fmtNum(v)} ريال`;

export function summaryHtml(D){
  const f = sf(), all = paymentRows(D), list = filterRows(all, f), t = rowTotals(list);
  const items = [...new Map(all.filter(r => f.type === 'all' || r.type === f.type).filter(r => r.item).map(r => [r.item, r.item_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  return `<div class="grid g4" style="margin-bottom:14px" id="psCards">${[['إجمالي المستحق', sar(t.due), 'info'], ['المدفوع المعتمد', sar(t.paid), 'ok'], ['إجمالي المتبقي', sar(t.remaining), 'bad'], ['الطلبات', fmtNum(t.count), 'g']].map(([k, v, c]) => `<div class="card pad ostat"><span class="hint"><span class="pill dot ${c}" aria-hidden="true" style="padding:0;background:none"></span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>
    ${t.claimed ? `<p class="alert t-warn" style="margin:0 0 12px"><span class="aic">${ic('alert')}</span><span>${fmtNum(t.claimedN)} تحويلًا مبلَّغًا بقيمة ${sar(t.claimed)} قيد المطابقة؛ لا تدخل المدفوع المعتمد حتى يُؤكَّد استلامها.</span></p>` : ''}
    ${t.noOrder ? `<p class="alert t-info" style="margin:0 0 12px"><span class="aic">${ic('alert')}</span><span>${fmtNum(t.noOrder)} اشتراكًا أو تسجيلًا بلا طلب شراء؛ يظهر بسعره ولا يدخل الإجماليات حتى يُنشأ طلبه.</span></p>` : ''}
    <div class="filters">
      <div class="field" style="margin:0"><label for="ps-t">نوع الخدمة</label><select class="inp" id="ps-t">${[['all', 'الكل'], ...Object.entries(SVC_TXT)].map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="ps-i">الباقة أو البرنامج</label><select class="inp" id="ps-i"><option value="">الكل</option>${items.map(([id, n]) => `<option value="${id}" ${f.item === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="ps-s">حالة السداد</label><select class="inp" id="ps-s">${[['all', 'الكل'], ...Object.entries(PST_TXT)].map(([k, v]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="ps-a">من</label><input class="inp" type="date" id="ps-a" value="${f.from}"></div>
      <div class="field" style="margin:0"><label for="ps-b">إلى</label><input class="inp" type="date" id="ps-b" value="${f.to}"></div>
      <div class="field" style="margin:0;flex:1;min-width:200px"><label for="ps-q">المتدرب</label><input class="inp" id="ps-q" type="search" placeholder="الاسم أو الهوية أو الجوال أو رقم الطلب" value="${esc(f.q)}"></div>${scopeSelect('ps-sc', f.sc)}
      <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><button class="btn sm" id="psP" ${list.length ? '' : 'disabled'}>${ic('form')} طباعة الكشف</button><button class="btn sm" id="psC" ${list.length ? '' : 'disabled'}>${ic('copy')} تصدير CSV</button></div></div>
    ${list.length ? `<div class="card rv"><div class="tblwrap"><table class="tb" id="psT"><thead><tr><th>المتدرب</th><th>الخدمة</th><th>الباقة أو البرنامج</th><th>المستحق</th><th>المدفوع المعتمد</th><th>المتبقي</th><th>الأقساط المدفوعة</th><th>حالة السداد</th></tr></thead><tbody>${list.map(r => `<tr>
        <td>${esc(r.t?.full_name || '—')}<div class="hint num" dir="ltr">${esc(r.t?.phone || '')}</div></td><td>${SVC_TXT[r.type]}</td><td>${esc(r.item_name)}${r.cohort ? `<div class="hint">الدفعة ${fmtNum(r.cohort)}</div>` : ''}${r.order ? `<div class="hint num" dir="ltr">${esc(r.order.number)}</div>` : ''}</td>
        <td class="num">${fmtNum(r.total)}</td><td class="num"><b>${fmtNum(r.paid)}</b>${r.claimed ? `<div class="hint">مبلَّغ ${fmtNum(r.claimed)}</div>` : ''}</td><td class="num">${r.order ? fmtNum(r.remaining) : '—'}</td>
        <td class="num" data-ins>${insCell(r)}</td><td><span class="pill dot ${PST_TONE[r.status]}">${PST_TXT[r.status]}</span></td></tr>`).join('')}</tbody></table></div></div>`
      : emptyBox(all.length ? 'لا نتائج بهذه التصفية' : 'لا توجد طلبات أو اشتراكات بعد')}`;
}
const fLabel = f => [f.type !== 'all' ? SVC_TXT[f.type] : 'كل الخدمات', f.st !== 'all' ? PST_TXT[f.st] : '', f.from || f.to ? `${f.from || '…'} → ${f.to || '…'}` : ''].filter(Boolean).join(' · ');
export function summaryDoc(D, f = sf()){
  const list = filterRows(paymentRows(D), f), t = rowTotals(list);
  return docShell({ docNo:`PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, title:'ملخص جميع المدفوعات', sub:fLabel(f), land:true,
    stats:[['إجمالي المستحق', fmtNum(t.due)], ['المدفوع المعتمد', fmtNum(t.paid), 'ok'], ['إجمالي المتبقي', fmtNum(t.remaining)], ['الطلبات', fmtNum(t.count)]],
    body:`<table class="inv-t"><thead><tr><th>المتدرب</th><th>الخدمة</th><th>الباقة أو البرنامج</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th>الأقساط</th><th>الحالة</th></tr></thead><tbody>${list.map(r => `<tr><td>${esc(r.t?.full_name || '')}</td><td>${SVC_TXT[r.type]}</td><td>${esc(r.item_name)}</td><td>${fmtNum(r.total)}</td><td>${fmtNum(r.paid)}</td><td>${r.order ? fmtNum(r.remaining) : '—'}</td><td>${insCell(r)}</td><td>${PST_TXT[r.status]}</td></tr>`).join('')}</tbody></table>`,
    note:`المدفوع المعتمد فقط بعد الاسترداد؛ التحويلات المبلَّغة غير المؤكدة (${fmtNum(t.claimed)} ريال) لا تدخله، والتسجيلات بلا طلب شراء (${fmtNum(t.noOrder)}) لا تدخل الإجماليات. مستند داخلي وليس فاتورة ضريبية.` });
}
const csv = list => [['المتدرب', 'السجل المدني', 'الجوال', 'نوع الخدمة', 'الباقة أو البرنامج', 'الدفعة', 'رقم الطلب', 'تاريخ الطلب', 'المستحق', 'المدفوع المعتمد', 'المتبقي', 'الأقساط المدفوعة', 'إجمالي الأقساط', 'مبلَّغ غير مؤكد', 'حالة السداد'],
  ...list.map(r => [r.t?.full_name || '', r.t?.national_id || '', r.t?.phone || '', SVC_TXT[r.type], r.item_name, r.cohort ?? '', r.order?.number || '', r.date, r.total, r.paid, r.order ? r.remaining : '', r.ins ? r.ins.paidN : 'لا ينطبق', r.ins ? r.ins.n : '', r.claimed || '', PST_TXT[r.status]])];
export function bindSummary(D, redraw){
  const f = sf(), set = (k, v) => { f[k] = v; if(k === 'type') f.item = ''; redraw(); };
  $('#ps-t').onchange = e => set('type', e.target.value); $('#ps-i').onchange = e => set('item', e.target.value); $('#ps-s').onchange = e => set('st', e.target.value);
  $('#ps-a').onchange = e => set('from', e.target.value); $('#ps-b').onchange = e => set('to', e.target.value); $('#ps-sc').onchange = e => set('sc', e.target.value);
  let qT; $('#ps-q').oninput = e => { f.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => { redraw(); const el = $('#ps-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 300); };
  $('#psP')?.addEventListener('click', () => printDocs([summaryDoc(D, f)], 'ملخص جميع المدفوعات'));
  $('#psC')?.addEventListener('click', () => exportCSV(`مدفوعات-${new Date().toISOString().slice(0, 10)}`, csv(filterRows(paymentRows(D), f))));
}
