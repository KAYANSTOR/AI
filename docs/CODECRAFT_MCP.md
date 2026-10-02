# CodeCraft MCP for Antigravity

## الهدف

ربط CodeCraft API بـ Antigravity كخادم MCP محلي حتى يستطيع وكيل التطوير استخدام نماذج CodeCraft في كتابة الكود، تصحيح الأخطاء، إعادة الهيكلة، شرح الكود، إنشاء الاختبارات، ومراجعة الكود.

CodeCraft API متوافق مع OpenAI، والعنوان الأساسي هو:
`https://codecraftapi.com/v1`

كما يدعم tool calling وstreaming وvision بحسب النموذج.

## الأمان

المتغير المطلوب:
`CODECRAFT_API_KEY`

لا يتم تخزين المفتاح في المستودع أو `.agents/mcp_config.json`.

**تنبيه أمني:** كان ملف workspace يحتوي سابقًا مفتاح API فعليًا؛ تمت إزالة السر من النسخة الحالية. أي مفتاح سبق نشره في GitHub يجب إلغاؤه وإنشاء مفتاح جديد.

## إعداد Antigravity

Antigravity يدعم خوادم MCP المحلية عبر stdio، وملف workspace هو:
`.agents/mcp_config.json`

المحتوى:

```json
{
  "mcpServers": {
    "codecraft-api": {
      "command": "node",
      "args": ["index.js"]
    }
  }
}
```

بعد ضبط `CODECRAFT_API_KEY` في بيئة نظام التشغيل التي يبدأ منها Antigravity، أعد تحميل MCP Servers من الواجهة.

## التشغيل

من جذر المستودع:

```bash
npm ci
npm test
```

`npm test` يتحقق من صياغة JavaScript فقط ولا يرسل طلبًا إلى CodeCraft.

لتشغيل الخادم يدويًا:

```bash
npm start
```

## الأدوات

الخادم يعرّف:

- `codecraft_list_models`
- `codecraft_chat`
- `codecraft_code_assist`
- `codecraft_model_info`

الأداة `codecraft_code_assist` مخصصة مباشرة لمهام:
`write`, `debug`, `refactor`, `explain`, `test`, `review`, `complete`.

## اختيار النموذج

قائمة النماذج يجب قراءتها من `GET /v1/models` بدل الاعتماد على اسم ثابت طويل الأجل.

لمهمات الوكلاء التي تحتاج تنفيذ أدوات اختر نموذجًا يعلن capability=`tools`.
للتصحيح والتحليل العميق اختر capability=`reasoning`.
لفحص الصور وواجهات المستخدم اختر capability=`vision`.

المراجع الرسمية:
- https://codecraftapi.com/docs
- https://codecraftapi.com/docs/models
- https://codecraftapi.com/docs/coding-agents
- https://antigravity.google/docs/mcp
