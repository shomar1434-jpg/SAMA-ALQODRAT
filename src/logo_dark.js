/* نسخ الوضع الليلي من الشعارات الرسمية: النصوص الرمادية الداكنة مفتوحة اللون والألوان كما هي (الشعارات شفافة الخلفية) */
export const LOGOS_DARK = {
  tvtc: new URL('./assets/logos/tvtc_dark.webp', import.meta.url).href,
  nelc: new URL('./assets/logos/nelc_dark.webp', import.meta.url).href,
  sama: new URL('./assets/logos/sama_dark.webp', import.meta.url).href,
};
/* صورتان: الفاتحة تظهر في الوضع النهاري والليلية في الوضع الليلي */
export const logoPair = (light, k, alt) => `<img class="lg-l" src="${light}" alt="${alt}"><img class="lg-d" src="${LOGOS_DARK[k]}" alt="" aria-hidden="true">`;
