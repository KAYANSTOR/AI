# FrontDesk AI

منصة SaaS لموظف استقبال AI للشركات عبر WhatsApp، مع دعم الهاتف كخيار لاحق.

## نطاق الإصدار المركّز

المنتج يركز على مسار واحد واضح: ربط WhatsApp، تجهيز موظف الذكاء الاصطناعي، استقبال المحادثات، إدارة العملاء، حجز المواعيد، والتحويل إلى موظف بشري.

SMS وInstagram والحملات والأتمتة المتقدمة والتقارير الموسعة ليست جزءًا من تجربة الإصدار الأول، حتى لو بقيت بعض المسارات الخلفية متوافقة مؤقتًا.

## القرارات المعتمدة
- Voice: Vapi فقط؛ Retell تاريخي وغير معتمد.
- Phone: صاحب الشركة يحتفظ برقمه الحالي ويحوّل المكالمات إلى Vapi.
- SMS: قناة سحابية مستقلة عن call forwarding؛ لا ندّعي التحكم بسيم شخصية دون دعم من مزود الاتصالات.
- AI: Agent Runtime موحد؛ LLM يفكر ويقترح، والـbackend يحكم وينفذ.
- Tenancy: exact channel binding فقط؛ لا fallback إلى أول Organization.
- Business Types: configuration + capabilities + workflows، وليست تطبيقات منفصلة.

## المسارات
- /api/vapi/webhook
- /api/whatsapp/webhook
- /api/instagram/webhook
- /api/cron/outbox — authentication and external scheduling: docs/OUTBOX_CRON.md

## الوثائق
- docs/PRODUCT_SCOPE_AR.md — نطاق المنتج المركّز بالعربية
- docs/DELIVERY_HANDOFF_AR.md — حالة التسليم والاختبارات والقيود
- docs/PLAN.md
- docs/OUTBOX_CRON.md
- docs/AI_AGENT_RUNTIME_SPEC.md
- docs/DB_CONTRACT.md
- docs/CHANNELS.md
- docs/ADR/
- docs/CODECRAFT_MCP.md

## تطوير
    cd apps/web
    npm ci
    npm run lint
    npm run build

## CodeCraft MCP for Antigravity

هذا المستودع يتضمن خادم MCP محليًا باسم `codecraft-api` لاستخدام نماذج CodeCraft في مهام كتابة الكود، تصحيح الأخطاء، إعادة الهيكلة، مراجعة الكود، وإنشاء الاختبارات.

شغّل `npm ci` في جذر المستودع، ثم اضبط `CODECRAFT_API_KEY` في بيئة نظام التشغيل التي يبدأ منها Antigravity. لا تضع المفتاح في Git أو داخل `.agents/mcp_config.json`.

بعد ذلك يقرأ Antigravity ملف `.agents/mcp_config.json` ويشغّل الخادم محليًا عبر stdio.
