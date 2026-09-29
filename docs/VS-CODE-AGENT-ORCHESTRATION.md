# VS Code Multi-Agent Orchestration

هذه الحزمة تضيف فريق Custom Agents لمشروع KAYANSTOR/AI. لا تحتوي أي API keys.

## بنية الوكلاء

- AI Orchestrator: المدير الرئيسي
- Architect: التخطيط المعماري
- Researcher: الاستكشاف
- Database: Supabase/Postgres
- Backend: APIs/services
- Frontend: UI/UX
- Integration: الدمج والتحقق
- Reviewer: مراجعة مستقلة

## المبدأ

يستلم Orchestrator الطلب الكبير، يقرأ الحالة الفعلية للمستودع والخطة، يبني Task Graph، ثم يفوض المهام المستقلة بالتوازي. المهام ذات dependencies تنتظر اكتمال ما تعتمد عليه.

## أمان Git

لا تجعل وكيلين يكتبان نفس الملف في الوقت نفسه. استخدم ownership واضحًا للملفات. استخدم worktrees/branches فقط عندما تكون مهمة كبيرة مستقلة ويكون ذلك مقصودًا.

## إعداد الموديلات

في VS Code استخدم:

`Ctrl+Shift+P` → `Chat: Manage Language Models` → `Add Models` → `Custom Endpoint`

أضف مجموعتين:

### CodeCraft

- API type: Chat Completions
- Base URL: `https://codecraftapi.com/v1`
- Key: خزنه في VS Code Secret/Input وليس في المستودع
- Model ID: `claude-opus-4.8` أو ID فعلي يظهر من `GET /v1/models`
- Display name المقترح: `CodeCraft - Claude Opus 4.8`

### OpenRouter

- API type: Chat Completions
- Base URL: `https://openrouter.ai/api/v1`
- Key: خزنه في VS Code Secret/Input وليس في المستودع
- Models مقترحة:
  - `anthropic/claude-opus-4.8` → `OpenRouter - Claude Opus 4.8`
  - `openai/gpt-5.5` → `OpenRouter - GPT-5.5`
  - `anthropic/claude-sonnet-4.6` → `OpenRouter - Claude Sonnet 4.6`

إذا كان موديل CodeCraft مختلفًا في حسابك، استبدل الـID والاسم فقط؛ لا تغيّر بنية الوكلاء.

## تشغيل الوكلاء

1. افتح المشروع في VS Code.
2. في Chat اختر Session Target المحلي/Local Agent عند توفره.
3. اختر `AI Orchestrator` من Agents.
4. أعطه المهمة الكبيرة.
5. راقب التفويض للـsubagents.
6. بعد التنفيذ اترك Integration ثم Reviewer يمران على النتيجة.

## أول اختبار

استخدم مهمة تحليلية لا تعدل الملفات:

`اقرأ PLAN.md وROADMAP.md، حدد المرحلة التالية غير المكتملة، وقسمها إلى مهام مستقلة. استخدم الوكلاء المتخصصين للاستطلاع فقط، ولا تعدل أي ملف.`

بعد نجاح التقسيم انتقل إلى مهمة تنفيذ متوسطة.
