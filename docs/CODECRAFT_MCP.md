# CodeCraft MCP for Antigravity

## الهدف

ربط CodeCraft API بـ Antigravity كخادم MCP محلي حتى يستطيع وكيل التطوير استخدام نماذج CodeCraft في كتابة الكود، تصحيح الأخطاء، إعادة الهيكلة، شرح الكود، إنشاء الاختبارات، ومراجعة الكود.

CodeCraft API متوافق مع OpenAI ويستخدم العنوان الأساسي:
`https://codecraftapi.com/v1`
كما يدعم tool calling وstreaming وvision بحسب النموذج. citeturn529253search1turn529253search5

## الأمان

المتغير المطلوب:
`CODECRAFT_API_KEY`

لا يتم تخزين المفتاح في المستودع أو `.agents/mcp_config.json`.

**تنبيه:** كان ملف workspace يحتوي سابقًا مفتاح API فعليًا؛ تمت إزالة السر من النسخة الحالية. أي مفتاح سبق نشره في GitHub يجب إلغاؤه وإنشاء مفتاح جديد، لأن CodeCraft يوصي بعدم وضع المفاتيح في المصدر أو ملفات الإعداد القابلة للمشاركة. citeturn427661search8turn529253search3

## إعداد Antigravity

Antigravity يدعم خوادم MCP المحلية عبر stdio، وملف workspace هو:
`.agents/mcp_config.json`

المحتوى الحالي في المستودع:

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

يمكن إدارة MCP من واجهة Antigravity عبر MCP Servers ثم Manage MCP Servers، أو استخدام ملف الإعداد مباشرة. citeturn848347search0turn848347search4

## التشغيل

من جذر المستودع:

```bash
npm ci
npm test
npm start
```

`npm test` يتحقق من صياغة JavaScript فقط، ولا يرسل طلبًا إلى CodeCraft.

## أدوات MCP

- `codecraft_list_models`
- `codecraft_chat`
- `codecraft_code_assist`
- `codecraft_model_info`

الأداة `codecraft_code_assist` مخصصة مباشرة لمهام write/debug/refactor/explain/test/review/complete.

## اختيار النموذج

قائمة النماذج تتغير؛ افحص `GET /v1/models` بدل الاعتماد على اسم ثابت طويل الأجل. لمهام الوكلاء التي تحتاج أدوات ابحث عن capability=`tools`، وللتصحيح والتحليل العميق استخدم `reasoning`، ولتحليل الصور وواجهات المستخدم استخدم `vision`. citeturn529253search6turn529253search2
