/* التصاميم التعريفية لباقات القدرات والتحصيلي ونموذجا المقارنة — صور المركز الرسمية (src/assets/plans) */
const ART = import.meta.glob('./assets/plans/*.webp', { eager:true, query:'?url', import:'default' });
const art = n => ART[`./assets/plans/${n}.webp`] || '';
export const planPoster = tier => art(tier);
export const COMPARE_ART = { in_person:art('compare-in_person'), remote:art('compare-remote') };
