import { LOGOS } from './logos.js';
import { uid } from './utils.js';

/* شركاء النجاح كما في شريط «نفخر بثقة شركائنا» بالموقع الرسمي smaalgodrat.com. الشعارات من روابطها الأصلية،
   والاسم يُكتب حيث يُقرأ من الشعار، وإلا «شريك نجاح» لتعدّله الإدارة. */
const IBB = 'https://i.ibb.co/';
export const SITE_PARTNERS = [
  ['RZ58jgZ/Whats-App-Image-2026-07-20-at-17-59-22-9.jpg', 'p01.jpg','شريك نجاح'],
  ['nNmYnNgc/Whats-App-Image-2026-07-20-at-17-59-22-10.jpg', 'p02.jpg','مطورون'],
  ['C3JVZBM8/Whats-App-Image-2026-07-21-at-10-52-34.jpg', 'p03.jpg','ذكاء أب','Thakaa Up'],
  ['5xCVXptC/Whats-App-Image-2026-07-20-at-17-59-20-4.jpg', 'p04.jpg','السبيعي الخيرية'],
  ['rKn4MzZM/Whats-App-Image-2026-07-20-at-17-59-20-5.jpg', 'p05.jpg','شريك نجاح'],
  ['xSGqMscM/Whats-App-Image-2026-07-20-at-17-59-21-8.jpg', 'p06.jpg','جمعية دعم التعليم (تعلّم)',"Ta'alum"],
  ['xKd4R5bh/Whats-App-Image-2026-07-20-at-17-59-21-12.jpg', 'p07.jpg','جمعية التنمية الأهلية'],
  ['4RFpDDcG/Whats-App-Image-2026-07-20-at-17-59-21-13.jpg', 'p08.jpg','جمعية البر الخيرية بجازان'],
  ['84bwb7Ks/Whats-App-Image-2026-07-20-at-17-59-21-15.jpg', 'p09.jpg','جمعية التنمية الأهلية'],
  ['sdGgjFmM/Whats-App-Image-2026-07-20-at-17-59-21-17.jpg', 'p10.jpg','شريك نجاح'],
  ['Q7wGt2Pc/Whats-App-Image-2026-07-20-at-17-59-21-20.jpg', 'p11.jpg','شريك نجاح'],
  ['GfFvwHkb/Whats-App-Image-2026-07-20-at-17-59-22-1.jpg', 'p12.jpg','تماسك — جمعية التنمية الأسرية بصبيا'],
  ['35bygKG1/Whats-App-Image-2026-07-20-at-17-59-22-2.jpg', 'p13.jpg','جمعية كحلا للخدمات الإنسانية'],
  ['gZK97Sh2/Whats-App-Image-2026-07-20-at-17-59-22-3.jpg', 'p14.jpg','شريك نجاح'],
  ['d4Yh74DW/Whats-App-Image-2026-07-20-at-17-59-22-5.jpg', 'p15.jpg','جمعية عطاء الشبابية']
];
/* local: خريطة اسم الملف ← رابطه بعد البناء (من src/assets/partners/). بدونها (كبذور SQL) يُستخدم الرابط الأصلي. */
export const defaultPartners = (local = {}) => [
  {id:uid(), name:'المؤسسة العامة للتدريب التقني والمهني', name_en:'Technical and Vocational Training Corporation', type:'جهة اعتماد', logo:LOGOS.tvtc,
   description:'الجهة التي تعتمد البرامج التدريبية في المركز، ويحمل كل برنامج في دليلنا رقم اعتماد صادرًا عنها.', website:'https://www.tvtc.gov.sa', since:'', order:1, active:true},
  {id:uid(), name:'المركز الوطني للتعليم الإلكتروني', name_en:'National eLearning Center', type:'جهة اعتماد', logo:LOGOS.nelc,
   description:'من جهات الاعتماد الظاهرة في دليل برامج المركز.', website:'https://nelc.gov.sa', since:'', order:2, active:true},
  ...SITE_PARTNERS.map(([u, file, name, name_en], i) => ({id:uid(), name, name_en:name_en||'', type:'شريك نجاح', logo:(local[file]||IBB+u), description:'', website:'', since:'', order:i+3, active:true}))
];
