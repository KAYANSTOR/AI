# FrontDesk AI

منصة SaaS لموظف AI للشركات عبر Phone + SMS + WhatsApp + Instagram.

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
- /api/sms/webhook
- /api/cron/outbox

## الوثائق
- docs/PLAN.md
- docs/AI_AGENT_RUNTIME_SPEC.md
- docs/DB_CONTRACT.md
- docs/CHANNELS.md
- docs/ADR/

## تطوير
    cd apps/web
    npm ci
    npm run lint
    npm run build
