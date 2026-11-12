/* =====================================================================
   منطق البوابات (طالب، معلم، ولي أمر): دوال خالصة على كائن البيانات D.
   في الوضع السحابي تقابلها دوال SQL بالأسماء نفسها تقريبًا (…_dashboard).
   مصدر بيانات واحد: كل البوابات تقرأ sub_attendance و subStats نفسها.
   ===================================================================== */
import { riyadhNow, toMin, addDays, uid, fmtNum } from './utils.js';
import { subStats, subStatus, sessionOn, sessionsBetween, planName, SECTIONS } from './qudurat.js';

export const ROLE_TXT = { owner:'مالك النظام', admin:'مدير', registrar:'مسجّل', teacher:'معلم', student:'طالب', guardian:'ولي أمر' };
export const normPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('966') ? '0' + d.slice(3) : d.startsWith('5') && d.length === 9 ? '0' + d : d; };

/* الأدوار المرتبطة برقم الجوال (الوضع التجريبي). في السحابة: user_roles + روابط موثّقة */
export function rolesOfPhone(D, phone){
  const ph = normPhone(phone), roles = [];
  if((D.teachers || []).some(t => t.active !== false && normPhone(t.phone) === ph)) roles.push('teacher');
  if(D.trainees.some(t => normPhone(t.phone) === ph && (D.subscriptions || []).some(s => s.trainee_id === t.id))) roles.push('student');
  if((D.guardian_links || []).some(l => l.status === 'verified' && normPhone(l.guardian_phone) === ph)) roles.push('guardian');
  return roles;
}

/* مؤشر الواجبات: المستحقة حتى الآن فقط، ولا يُعرض 0٪ عند عدم وجود مستحقات (3-أ-4) */
export function homeworkIndicator(D, trainee, sub, n = riyadhNow()){
  const due = (D.assignments || []).filter(a => a.section === sub.section && (!a.subject || (sub.subjects || []).includes(a.subject)) && a.publish_date <= n.date && a.due_date <= n.date && (!sub.start_date || a.due_date >= sub.start_date));
  const subs = (D.submissions || []).filter(x => x.trainee_id === trainee.id);
  const done = due.filter(a => subs.some(x => x.assignment_id === a.id && ['submitted', 'graded'].includes(x.status)));
  const open = (D.assignments || []).filter(a => a.section === sub.section && (!a.subject || (sub.subjects || []).includes(a.subject)) && a.publish_date <= n.date && a.due_date > n.date && !subs.some(x => x.assignment_id === a.id && ['submitted', 'graded'].includes(x.status)));
  // نجاح الأداء لكل واجب مستحق: المصحَّح بدرجته، والمسلَّم بانتظار التصحيح كاملًا، والمطلوب إعادته نصفًا، وغير المسلَّم صفرًا
  const quality = due.map(a => { const x = subs.find(y => y.assignment_id === a.id); if(!x) return 0;
    if(x.status === 'graded') return x.score == null ? 1 : Math.max(0, Math.min(1, x.score / (a.max_score || 10)));
    return x.status === 'submitted' ? 1 : x.status === 'needs_revision' ? 0.5 : 0; });
  return { due:due.length, done:done.length, pct: due.length ? Math.round(done.length / due.length * 100) : null, pending:open.length,
    success: due.length ? Math.round(quality.reduce((t, q) => t + q, 0) / due.length * 100) : null };
}

/* لوحة الطالب: لكل اشتراك ثلاث بطاقات مستقلة (حضور، واجبات، مؤقت زمني) + التقويم + سجل الأيام */
export function studentDashboard(D, trainee, n = riyadhNow()){
  const subs = (D.subscriptions || []).filter(s => s.trainee_id === trainee.id && s.status !== 'cancelled');
  return { trainee:{ id:trainee.id, full_name:trainee.full_name, first_name:trainee.full_name.split(' ')[0], gender:trainee.gender },
    items: subs.map(s => {
      const st = subStats(D, s, n), plan = st.plan;
      const upcoming = []; for(let d = n.date, i = 0; i < 60 && upcoming.length < 6; i++, d = addDays(d, 1)){ const ses = sessionOn(D, s.section, d); if(ses && (d > n.date || toMin(n.hm) < toMin(ses.end)) && (!st.end || d <= st.end)) upcoming.push(ses); }
      const log = s.start_date ? sessionsBetween(D, s.section, s.start_date, n.date).filter(x => x.date < n.date || toMin(n.hm) >= toMin(x.end) || st.att.some(a => a.att_date === x.date))
        .map(x => { const a = st.att.find(y => y.att_date === x.date); return { date:x.date, status: a ? a.status : 'غائب', time: a ? a.time.slice(0, 5) : null, manual: !!a?.manual }; }).reverse() : [];
      const teachers = (D.teachers || []).filter(t => t.active !== false && t.section === s.section && (t.subjects || []).some(x => (s.subjects || []).includes(x))).map(t => ({ id:t.id, name:t.full_name, subjects:t.subjects }));
      return { id:s.id, ref:s.ref, plan:planName(plan), tier:plan?.tier, section:SECTIONS[s.section], subjects:s.subjects || [], status:st.status, start_date:s.start_date, end_date:st.end || null,
        attendance:{ rate:st.rate, attended:st.attended, late:st.late, absent:st.absent, held:st.held, total:st.total, remaining:st.remaining },
        homework: homeworkIndicator(D, trainee, s, n),
        time:{ pct: s.start_date ? st.timePct : null, daysLeft:st.daysLeft,
          reach: s.start_date && st.total ? Math.round(Math.min(1, (st.score + st.remaining) / st.total) * 100) : null },
        upcoming, log, teachers, last: st.lastAtt, threshold: D.settings?.cert_threshold ?? 75 };
    }),
    notifications: (D.notifications || []).filter(x => x.trainee_id === trainee.id && x.to === 'student').slice(-20).reverse() };
}

/* لوحة المعلم: طلاب قسمه ومقرراته فقط، وكشف اليوم، وتنبيه ما قبل النهاية */
export function teacherDashboard(D, teacher, n = riyadhNow()){
  const remind = D.settings?.remind_minutes ?? 30;
  const subs = (D.subscriptions || []).filter(s => s.section === teacher.section && ['pending', 'active'].includes(subStatus(s, n.date)) && (s.subjects || []).some(x => (teacher.subjects || []).includes(x)));
  const ses = sessionOn(D, teacher.section, n.date);
  const phase = !ses ? 'none' : toMin(n.hm) < toMin(ses.start) ? 'before' : toMin(n.hm) <= toMin(ses.end) ? 'live' : 'after';
  const rows = subs.map(s => { const t = D.trainees.find(x => x.id === s.trainee_id), st = subStats(D, s, n), a = st.att.find(x => x.att_date === n.date);
    return { sub_id:s.id, trainee_id:t.id, name:t.full_name, plan:planName(st.plan), today: a ? a.status : phase === 'none' ? 'لا جلسة' : phase === 'after' ? 'غائب' : 'لم يسجل بعد', time:a?.time?.slice(0, 5) || null,
      rate:st.rate, attended:st.attended, absent:st.absent, consec:st.consec, started:!!s.start_date, has_guardian:(D.guardian_links || []).some(l => l.status === 'verified' && l.trainee_id === t.id) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const missing = rows.filter(r => r.today === 'لم يسجل بعد');
  const reminder = phase === 'live' && toMin(n.hm) >= toMin(ses.end) - remind && missing.length > 0;
  return { teacher:{ id:teacher.id, name:teacher.full_name, section:SECTIONS[teacher.section], subjects:teacher.subjects }, session:ses, phase, remind, reminder, missing, rows,
    updated_at:new Date().toISOString(), sent:(D.notifications || []).filter(x => x.sender === 'teacher:' + teacher.id && (x.date || x.at.slice(0, 10)) === n.date) };
}

/* ولي الأمر: الأبناء المرتبطون بعلاقة موثّقة فقط */
export function guardianDashboard(D, phone, n = riyadhNow()){
  const links = (D.guardian_links || []).filter(l => l.status === 'verified' && normPhone(l.guardian_phone) === normPhone(phone));
  return { children: links.map(l => { const t = D.trainees.find(x => x.id === l.trainee_id); if(!t) return null;
    const dash = studentDashboard(D, t, n);
    return { link_id:l.id, relation:l.relation, ...dash, notifications:(D.notifications || []).filter(x => x.trainee_id === t.id && x.to === 'guardian').slice(-20).reverse() }; }).filter(Boolean) };
}

/* قوالب رسائل المعلم إلى ولي الأمر (يختار المعلم القالب ويضيف ملاحظته) */
export const NOTIFY_TPL = {
  absence:'نفيدكم بغياب {الاسم} عن جلسة اليوم ({التاريخ}). نأمل الحرص على الحضور.',
  late:'نفيدكم بتأخر {الاسم} عن جلسة اليوم ({التاريخ}).',
  reminder:'تذكير: جلسة اليوم مستمرة حتى {النهاية}، ولم يُسجَّل حضورك بعد. إن كنت حاضرًا فامسح باركود الحضور، وإن تعذّر حضورك فأبلغ المعلم بعذرك.',
  homework:'نفيدكم بأن لدى {الاسم} واجبًا لم يُسلَّم بعد.',
  general:'',
};
export function makeNotification(D, { sender, to, trainee_id, kind, note, n = riyadhNow() }){
  const t = D.trainees.find(x => x.id === trainee_id), ses = sessionOn(D, (D.subscriptions || []).find(s => s.trainee_id === trainee_id)?.section, n.date);
  const text = [String(NOTIFY_TPL[kind] || '').replace('{الاسم}', t?.full_name.split(' ')[0] || '').replace('{التاريخ}', n.date).replace('{النهاية}', ses?.end || ''), (note || '').trim()].filter(Boolean).join(' ');
  return { id:uid(), at:new Date().toISOString(), date:n.date, sender, to, trainee_id, kind, text, read_at:null };
}

/* مؤشر الأداء العام (عداد): متوسط المحاور المتاحة من ثلاثة.
   الحضور = نسبة الحضور (التأخر بوزنه)، الواجبات = نسبة النجاح في المستحق، المؤقت = أعلى نسبة حضور نهائية ما زالت ممكنة
   (الحضور المحقق + الجلسات المتبقية ÷ كل جلسات الباقة) فيقيس ما استُثمر من المدة وما تبقى منها.
   المناطق: أحمر دون 50، أصفر حتى حد الشهادة، أخضر من حد الشهادة فأعلى. */
export const GAUGE_RED = 50;
export function progressGauge(it){
  const thr = it.threshold ?? 75;
  const axes = [
    { key:'attendance', label:'الحضور', value: it.attendance.held ? (it.attendance.rate ?? 0) : null,
      detail: it.attendance.held ? `${fmtNum(it.attendance.attended)} من ${fmtNum(it.attendance.held)} جلسة` : 'لا جلسات منعقدة بعد' },
    { key:'homework', label:'الواجبات', value: it.homework.success,
      detail: it.homework.due ? `${fmtNum(it.homework.done)} من ${fmtNum(it.homework.due)} واجبًا مستحقًا` : 'لا واجبات مستحقة بعد' },
    { key:'time', label:'المؤقت الزمني', value: it.time.reach,
      detail: it.time.reach == null ? 'يبدأ من أول حضور' : `${fmtNum(it.time.daysLeft)} يومًا متبقية من الباقة` }
  ];
  const got = axes.filter(a => a.value != null);
  const score = got.length ? Math.round(got.reduce((t, a) => t + a.value, 0) / got.length) : null;
  const zone = score == null ? null : score < GAUGE_RED ? 'red' : score < thr ? 'yellow' : 'green';
  const label = { red:'يحتاج متابعة عاجلة', yellow:'تقدّم متوسط — يحتاج متابعة', green:'تقدّم جيد' }[zone] || 'يبدأ القياس من أول يوم حضور';
  return { score, zone, label, thr, axes };
}
