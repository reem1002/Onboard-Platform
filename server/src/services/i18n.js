/**
 * Arabic versions of the platform's notification and email texts.
 * Notifications are stored in English (one canonical copy) and translated when shown or emailed,
 * so switching language also changes older notifications. Names, codes and numbers pass through as captured.
 */
const RULES = [
  // ── titles
  [/^(.+) graded: (.+)$/, '$1 صُحّحت: $2'],
  [/^(.+) returned for rework$/, 'أُعيدت $1 للتعديل'],
  [/^New submission: (.+)$/, 'تسليم جديد: $1'],
  [/^AI draft ready: (.+)$/, 'مسودة التصحيح جاهزة: $1'],
  [/^Grade manually: (.+)$/, 'صحّح يدويًا: $1'],
  [/^You’ve been enrolled in (.+)$/, 'تم تسجيلك في $1'],
  [/^New course available: (.+)$/, 'دورة جديدة متاحة: $1'],
  [/^You’re now teaching (.+)$/, 'أصبحت مدربًا لدورة $1'],
  [/^A customer hit their seat limit$/, 'وصل أحد العملاء إلى حد المقاعد'],
  [/^Your seat limit is now (.+)$/, 'أصبح حد المقاعد لديك $1'],
  [/^Out of attempts: (.+)$/, 'انتهت المحاولات: $1'],
  [/^Another try: (.+)$/, 'محاولة إضافية: $1'],
  [/^New progress report: (.+)$/, 'تقرير تقدّم جديد: $1'],
  [/^New course question #(\d+)$/, 'سؤال جديد عن الدورة #$1'],
  [/^New support request #(\d+)$/, 'طلب دعم جديد #$1'],
  [/^Reply on #(\d+): (.+)$/, 'رد على #$1: $2'],
  [/^(.+) replied on #(\d+)$/, 'ردّ $1 على #$2'],
  [/^(.+) is past its due date$/, 'تجاوزت $1 موعد استحقاقها'],
  [/^(.+) is past the (.+) due date$/, 'تجاوز $1 موعد استحقاق $2'],
  [/^(.+) is due tomorrow$/, 'موعد $1 غدًا'],
  [/^(.+) is due in 3 days$/, 'موعد $1 بعد 3 أيام'],
  [/^(.+) is due in 2 days$/, 'موعد $1 بعد يومين'],
  [/^(.+) is overdue$/, '$1 متأخرة'],
  [/^(\d+) submissions? waiting more than 2 days$/, '$1 تسليم ينتظر أكثر من يومين'],
  [/^Certificate earned: (.+)$/, 'حصلت على شهادة: $1'],
  [/^(.+) earned the (.+) certificate$/, 'حصل $1 على شهادة $2'],
  [/^Test email from your training platform$/, 'رسالة تجريبية من منصة التدريب'],
  // ── bodies
  [/^Read the feedback and resubmit when ready\.$/, 'اقرأ الملاحظات وأعد التسليم عندما تكون جاهزًا.'],
  [/^(.+) submitted (.+)$/, 'سلّم $1 مهمة $2'],
  [/^(.+) — draft (.+)\/(\d+) \((high|medium|low) confidence\)\. Review and approve\.$/, (m, n, s, max, c) => `${n} — مسودة ${s}/${max} (ثقة ${{ high: 'عالية', medium: 'متوسطة', low: 'منخفضة' }[c]}). راجعها واعتمدها.`],
  [/^(.+)'s file has little or no readable text — open it in the viewer\.$/, 'ملف $1 لا يحتوي نصًا مقروءًا تقريبًا — افتحه في العارض.'],
  [/^(.+)'s submission — the AI draft failed \((.+)\)\.$/, 'تسليم $1 — فشلت مسودة الذكاء الاصطناعي ($2).'],
  [/^You can add employees up to this number\.$/, 'يمكنك إضافة موظفين حتى هذا العدد.'],
  [/^(.+) tried to add an employee \((.+) seats\)\.$/, 'حاولت $1 إضافة موظف ($2 مقعد).'],
  [/^(.+) used all attempts \(best (.+)%\)\. You can allow another try\.$/, 'استنفد $1 كل المحاولات (أفضل نتيجة $2%). يمكنك السماح بمحاولة أخرى.'],
  [/^Your instructor allowed you another attempt at this quiz\.$/, 'سمح لك مدربك بمحاولة أخرى في هذا الاختبار.'],
  [/^(.+) — (\d+(?:\.\d+)?)% complete$/, '$1 — مكتمل بنسبة $2%'],
  [/^(\d+(?:\.\d+)?)% complete$/, 'مكتمل بنسبة $1%'],
  [/^You're (\d+(?:\.\d+)?)% through — finish the remaining items as soon as you can\.$/, 'أنجزت $1% — أكمل العناصر المتبقية في أقرب وقت.'],
  [/^You're (\d+(?:\.\d+)?)% through \((\d+)\/(\d+) items\)\.$/, 'أنجزت $1% ($2 من $3 عناصر).'],
  [/^(.+) — submit it as soon as you can\.$/, '$1 — سلّمها في أقرب وقت.'],
  [/^Employees are waiting for their feedback\.$/, 'الموظفون بانتظار ملاحظاتك.'],
  [/^Congratulations — you completed (.+)\.$/, 'تهانينا — أكملت $1.'],
  [/^Average grade (.+)%$/, 'متوسط الدرجة $1%'],
  [/^If you can read this, notification emails are working\.$/, 'إذا وصلتك هذه الرسالة فإشعارات البريد تعمل.'],
  [/^(.+) — complete by (.+)$/, '$1 — الإنجاز قبل $2'],
];

const UI = {
  hi: (n) => `مرحبًا ${n}،`,
  open: 'افتح في المنصة',
  footer: 'تصلك هذه الرسالة بسبب إعدادات الإشعارات لديك.',
  change: 'غيّرها',
  training: 'التدريب',
};

/** Translate one stored English notification text. Unknown texts (free text such as ticket replies) are returned unchanged. */
function tr(text, lang) {
  if (lang !== 'ar' || !text) return text;
  for (const [re, out] of RULES) {
    if (re.test(text)) return text.replace(re, out);
  }
  return text;
}

module.exports = { tr, UI, RULES };
