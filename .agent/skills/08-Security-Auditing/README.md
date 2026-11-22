# Security & Auditing

مجموعة مستقلة لمهارات مراجعة الأمان، تحليل الثغرات، الفحص الساكن، تقييم سلسلة التوريد، وتصنيف النتائج. استخدم هذه المهارات على مستودعات تملك تصريحاً واضحاً لفحصها فقط.

## Cloudflare

- `cloudflare/security-audit`: تدقيق أمني متعدد المراحل يبدأ بالاستطلاع وتغطية سطح الهجوم وينتهي بتجميع النتائج والتحقق منها.
- المصدر: [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill)

## Trail of Bits

- `agentic-actions-auditor`: مراجعة مخاطر أفعال الوكلاء والتكاملات.
- `audit-context-building`: بناء سياق تدقيق قابل للتتبع قبل التحليل.
- `codeql`: إرشادات استخدام CodeQL للتحليل الساكن.
- `semgrep`: إرشادات الفحص بقواعد Semgrep.
- `cvss-scoring`: تقدير شدة الثغرات باستخدام CVSS.
- `differential-review`: مراجعة الفروقات والتغييرات الحساسة.
- `entry-point-analyzer`: تحديد نقاط الدخول ومسارات الهجوم.
- `supply-chain-risk-auditor`: مراجعة مخاطر سلسلة توريد البرمجيات.
- `variant-analysis`: البحث عن نسخ أو أنماط مشابهة للثغرة.
- `vulnerability-triage-brocards`: فرز الثغرات وتلخيصها والتحقق من أولويتها.
- `zeroize-audit`: مراجعة التعامل مع البيانات الحساسة ومحوها.
- المصدر: [trailofbits/skills](https://github.com/trailofbits/skills)

## wshobson/agents

- `attack-tree-construction`: بناء أشجار تهديد منظمة.
- `sast-configuration`: تهيئة الفحص الساكن داخل دورة التطوير.
- `security-requirement-extraction`: استخراج متطلبات الأمان من المواصفات.
- `stride-analysis-patterns`: تحليل التهديدات باستخدام STRIDE.
- المصدر: [wshobson/agents](https://github.com/wshobson/agents)

## Kayan Soft Security Audit

- `security-audit-27`: تدقيق أمني شامل لتطبيقات الويب عبر 27 فحصاً في ست مجموعات، مع تقرير `SECURITY_AUDIT_REPORT.md` واشتراط موافقة المستخدم قبل الإصلاح.
- المصدر: مواصفة المستخدم المرفقة.

## قواعد الاستخدام الآمن

ابدأ دائماً بفحص قراءة فقط، وحدد نطاق الملفات والبيئة المسموح بها، ولا تنفذ استغلالاً أو اختباراً نشطاً خارج نظام مصرح به. تعامل مع النتائج كفرضيات تحتاج إلى تحقق يدوي، ولا تضع الأسرار أو مخرجات تحتوي على بيانات حساسة في Git. اطلب موافقة المستخدم قبل تعديل الكود أو ملفات إعداد CI/CD أو تنفيذ إصلاحات تلقائية.
