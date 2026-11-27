# KAYAN AI — الخطة الهندسية الموحدة (Personal Agent 2.0)
**Target:** main (sole authorized branch) | **Baseline:** e56b7fceb49998945a40650810f72baf8cc06a85 | **Status:** planned, not implemented.
هذه الوثيقة وحدها مصدر الحقيقة للخطة والقرارات المستقبلية؛ تجمع خطة Personal Agent 2.0 مع جميع بوابات الإصلاح المتبقية. Issue #10 سجل متابعة ودليل فقط؛ Issue #7 سجل تاريخي لا خطة نشطة. Goal: functional autonomy comparable to Instinct-style agents, not a claim of measured parity. Preserve current Arabic RTL UI, WhatsApp, business agents, central bot, tenant isolation, billing and existing integrations. No rewrite.

## سجل بوابات الإصلاح والقبول الموحد (جزء من هذه الخطة، وليس خطة أخرى)

الحالة المرجعية: المراجعة السابقة على `e56b7fceb49998945a40650810f72baf8cc06a85`. فحص GitHub الحالي لهذا المرجع أظهر نجاح web وdatabase. نجاح CI لا يعني نجاح اختبارات المتصفح المصادق أو اكتمال التحقق الحي من القنوات. سجلات التدقيق والتنفيذ السابقة في [Issue #7](https://github.com/KAYANSTOR/AI/issues/7) وسجل Git أدلة تاريخية فقط؛ لا تُتبع تعليماتها القديمة أو ترتيب مراحلها. لا تفترض استمرار عطل قديم ولا تعِد تنفيذ إصلاح سبق إثباته. لا تغيّر حسابات أو بيانات إنتاجية لاختبار فرضية. استخدم بيانات وأرقام اختبار افتراضية فقط.

| المعرّف | الأولوية / موضع التحقق | المتطلب المتبقي أو بوابة منع التراجع |
|---|---|---|
| F-001 | P0 / 0A | تحقق من CI وحدود الخطة المجانية 10 يوميًا/40 شهريًا، منع الخامسة في الدقيقة، حدود المدخلات والمخرجات، بصمة الهاتف، الصوت وmedia fixtures الصحيحة، وعدم إضعاف عزل المؤسسة. إصلاح سابق مثبت في CI على مرجعه؛ لا إعادة تنفيذ بلا دليل. |
| F-002 / F-008 | P0 / 0A ثم 7 | تحقق من صلاحيات المواعيد والخدمات والكتالوج والطلبات وCRM والحملات والأدوار والقطاعات على الخادم وRLS؛ لا تجعل إخفاء الواجهة حارسًا أمنيًا. اختبر التزامن وحالات الإيقاف الآمن للحملات. إصلاحات سابقة جزئية مثبتة في CI؛ تحقق حي مطلوب. |
| F-003 | P0 / 0A | التحقق من المالك والمساعد الشخصي وignored_phones قبل أي سجلات أعمال/جهة اتصال/محادثة أو SLA، في النص والصوت والمرفقات وجميع مسارات التخزين؛ فشل التحقق لا يسقط إلى الأعمال. حافظ على الرد الطبيعي للمالك وعزل الجهات الخارجية. إصلاحات سابقة في الكود وCI؛ يلزم تحقق انحدار وE2E افتراضي. |
| F-004 | P0 / 0A و4 | dedupe Telegram بحسب القناة والبوت ومعرف الحدث لا النص؛ اختبار إعادة التسليم والعزل. |
| F-005 | P0 / 0A و4 | توحيد جاهزية البوت المركزي GET/POST/DELETE والربط والإلغاء، ذرية رمز الربط وصلاحيته وعدم تكراره؛ اختبار الوظائف الفعلية للتعليمات والتقارير والتواصل والتدريب ومخرجات الأدوات، لا الربط فقط. |
| F-006 / F-014 | P0 / 0A و7 | حماية صفحة دخول owner console من كشف بيانات الدخول، rate limits، منع ops_auditor من الوصول غير المصرح إلى المحادثات وإيصالات الدفع؛ تحقق من الخادم وسجل التدقيق. |
| F-007 | P0 / 0A و7 | Railway liveness/readiness للويب وDB وworker والبوابة؛ راجع healthcheck المباشر وحالة QR غير المسجلة ومطابقة SHA، cron والقياسات. ضبط healthcheck سابقًا لا يثبت جاهزية HTTP حية. |
| F-009 | P1 / 0A و7 | التمييز بين SQL error والحالة الفارغة في المواعيد والطلبات؛ منع قراءة 1000 رسالة مشتركة من حجب معاينات المحادثات، أحدث رسالة لكل محادثة، ترتيب حاسم وترقيم وبحث صحيحان. |
| F-010 / F-018 | P0 / 7 | تحقق من تباين شريط الجوال الداكن (قياسات 1.35:1 و1.09:1 تاريخية)، تركيز زر إظهار كلمة المرور، WCAG وحالات RTL. |
| F-011 / F-012 / F-019 | P1 / 7 | طي مقارنة مزايا الباقات، اتساق العدادات والنصوص ونقل الباقة المختارة في pricing، رسائل عربية واضحة للهاتف المكرر. |
| F-013 | P0 / 0A و4 | التحقق من webhook signatures قبل الآثار الجانبية، حدود الأحجام، حقول متداخلة ووجهات الوسائط الآمنة، CSP والسجلات وRLS وتهديدات SSRF وحقن الأوامر، مراجعة appsecret_proof قبل تفعيله. |
| F-015 | P1 / 7 | منع طلبات جرس الإشعارات المتكررة، قياس الطلبات والأداء. |
| F-016 / F-017 | P0 / 7 | منع حجب زر الإرسال 390×844 مع safe-area والكيبورد، قابلية تمرير قائمة الزائر 390×375 وEscape وإدارة التركيز. |

- [ ] REC-001 — قبل التوسعة: مراجعة baseline الحالية وCI وRailway، عزل P0، سجل أخطاء ومصفوفة تتبع. معرفات التدقيق الأصلية A-01..07 وB1-01..09 وB2-01..14 وB3-01..08 وB4-01..12 وB5-01..14 وB6-01..24 وB7-01..10 وF-001..019 وUI-001..015 وFIX-001..010 محفوظة كمرجع تاريخي؛ التفاصيل الكاملة لبعض المعرفات غير مستعادة، فلا تُختلق ولا تُعلن مغلقة.
- [ ] REC-002 — التحقق من مسارات واتساب الصوتية والوسائط والحصة والتفعيل: لا تعرض نفاد حصة المنصة للعملاء، لا نجاح حجز زائف، لا قطع آخر كلمة، اتساق الباقات وredirect_uri، الاستئناف والإيقاف، منع revalidatePath أثناء render؛ اختبر onboarding مع عدة قنوات (PGRST116 تاريخي)، اختبار بلا نص، هوية الرد حسب القطاع، طلبات Gemini والنقر المزدوج وبطء التفعيل (16.2s تاريخيًا)، حالات QR المتقادمة، fingerprint لصحة اختبار الرد وصلاحيته 10 دقائق وإعادة فحص الجاهزية عند التفعيل وTOCTOU. لا تفترض أن العيوب القديمة ما زالت حية.
- [ ] REC-003 — القنوات: واتساب Cloud API وCoexistence وQR غير الرسمي أنماط منفصلة، QR opt-in ومخاطره واضحة، لا connected قبل دليل التحقق/اشتراك webhook والبيانات المشفرة والقدرة على إرسال واستقبال، لا fallback لمؤسسة أخرى. تحقق من Messenger وInstagram وTelegram وتسجيل webhook وهوية البوت وملكية القناة والتوكنات وreconnect. لا تعد إدخال القنوات المستبعدة أو تفعيل موصل لمجرد وجوده في الكود. قنوات المراسلة هي نطاق المنتج؛ الصوت داخل واتساب محفوظ. تفضيل OAuth وAPI الرسمية؛ لا تعديل حسابات حقيقية أو إزالة اشتراك إنتاجي أو ترقية SDK عمياء.
- [ ] REC-004 — Meta وإجراءات المالك: راجع التطبيق والبيئة وWABA من مصدر فعلي إن أمكن، Callback/Verify Token واشتراك التطبيق والصلاحيات وv4/v5 وApp Review وTech Provider وAccess Verification، روابط الشروط والخصوصية وحذف البيانات والدعم وبريد التطبيق، قالب UTILITY المعتمد ووسيلة الدفع عبر المالك، مراجعة الصلاحيات الزائدة قبل إزالتها. التغييرات الخارجية تحتاج التفويض المناسب؛ لا تعرض معرفات سرية أو بيانات اعتماد أو بيانات دفع.
- [ ] REC-005 — الأداء والأمان والموثوقية: قيّم قائمة 31 معيار أداء من مستودع المهارات بدليل قبل/بعد، 390×844 RTL وCPU×4 وlatency 150ms و200000/93750 B/s (ملف قياس تاريخي لا نتيجة حية)، الخطوط العربية وnext/font وswap، N+1 في cron/followup، حقول الاستعلام الضرورية، ترقيم وبحث، زمن الطلبات الخارجية والـ SDK، RLS EXPLAIN في بيئة اختبار، تعافي webhook/Stripe من failed/pending مع leases/retry/dead-letter، منع ازدواج الآثار الجانبية، حد معدل استدعاءات AI وAPI keys، ترويسات الأمان، أخطاء عامة لا SQL خام. لا Redis/CDN أو virtualization دون دليل حاجة؛ لا حذف تبعية قبل إثبات عدم استخدامها ديناميكيًا. هذه أيضًا تغطي بنود التدقيق الأقدم ذات ترقيم F1–F10 المختلف؛ لا تخلطها بمعرفات F-001..019.
- [ ] REC-006 — التحقق من التسجيل واستعادة كلمة المرور وتأكيد البريد وملكية رقم التواصل وOAuth (Google/Apple حسب الاعتماد)، صلاحية روابط الاستعادة والاستخدام مرة واحدة، إعداد البريد والقوالب من دون قراءة أسرار، رحلة التسجيل والإعداد وإكمال التقدم بعد تسجيل الخروج، صحة مؤشرات الأداء؛ مراجعة الوارد والعملاء والمساعد والمعرفة والقنوات والحملات والقوالب والأتمتة والتكاملات والتقارير والفريق والفوترة؛ مراجعة صفحات الدعم والقانون وحذف البيانات ومركز المساعدة وSEO وتوثيق API. تحقق من الترحيلات الحالية ومخرجاتها، لا تشغّل ترحيلات قديمة يدويًا ولا تختبر إنتاج ببيانات حقيقية.
- [ ] REC-007 — بوابة UX إلزامية طوال 0A–7: حافظ على التصميم الحالي وهوية #D8E2D0 #1F3B22 #F2D600؛ لا تبسيط مفرط. إجراء رئيسي واضح لكل شاشة، إخفاء المتقدم تدريجيًا، مسارات حسب القطاع والدور والخطة، حالة فارغة/خطأ/تحميل/نجاح عربية وخطوة تالية واضحة. جولة تفاعلية أول دخول على عناصر فعلية مع تخطٍ/سابق/تالٍ/استئناف/إعادة وحفظ لكل مستخدم/مساحة/إصدار، بدون حجب أو إجبار. راجع AppBar وMobileTabBar والبطاقات والوارد وتفاصيل المحادثة والقنوات والوكيل والمعرفة والأتمتة والإعدادات والفريق والإشعارات، light/dark وRTL و360/390/430/820px وسطح المكتب، قارئ الشاشة والتركيز وEscape وsafe-area وتقليل الحركة و44px. أهداف قبول مقترحة: ≥90% إتمام المهام الأساسية دون مساعدة، ≤3 انتقالات للوظائف اليومية، صفر أزرار محجوبة أو مسارات مسدودة. الاختبارات البشرية منفصلة عن اختبارات الوكيل؛ لا ادعاء نجاح دون دليل.
- [ ] REC-008 — إغلاق بوابات الإصدار: Web/QR/PostgreSQL/evals/build، typecheck/lint واختبارات RLS والهجمات والانحدار، QA مصادق على القطاعات والقنوات الممكنة، التحقق من Railway SHA وHTTP health/logs وsmoke. إثبات النتائج لكل ID بحالة ودليل وتاريخ ومخاطر وتبعيات وخطة رجوع؛ لا إغلاق إصلاح بلا دليل ولا اعتماد لقطة تاريخية كحالة حية. راجع المتبقي من F-IDs غير المستعادة في نقطة التدقيق 0A.

تقدم سابق: PR #9 دمج عند المرجع أعلاه؛ CI الخاص بطلب الدمج سجل 661 اختبار ويب و8 gateway ناجحة، والـ checks الحالية web/database ناجحة؛ هذا لا يثبت تحقق جميع بوابات REC وEXT. تحقق لاحقًا من التغطية المصادقة والـ HTTP وحالة جلسة QR. سجل التاريخ القديم محفوظ في Git وIssue #7 لاستخدام الأدلة فقط، لا كخطة نشطة.

## Audit backlog
- [ ] KA-001 P0: runtime.ts starts with current user message only; unify web/WhatsApp conversation context, bounded history and summaries, provenance.
- [ ] KA-002/003 P1: memory-retrieval.ts limits candidates to newest 100 and returns top 8 without relevance threshold; full scoped hybrid retrieval, thresholds, deletion and stale/conflicting facts.
- [ ] KA-004/005 P1: four-round tool loop and direct Gemini provider; bounded adaptive orchestration, provider routing/fallback, checkpoint/replan and budgets.
- [ ] KA-006 P1: export execution awaited inside turn; durable asynchronous worker, completion notification and verified artifacts.
- [ ] KA-007 P1: specialized agent profiles are not independent delegated agents; scoped subagent orchestration.
- [ ] KA-008 P1: heartbeat extraction query omits attempts; atomic claim, retries/backoff, leases, dead-letter and recovery.
- [ ] KA-009 P2: connector registry currently Gmail/Calendar; expand with scoped OAuth and MCP.
- [ ] KA-010 P2: web uses WhatsApp model formatting/token budget; channel-specific configuration.
Evidence: apps/web/src/lib/personal-assistant/{runtime.ts,memory-retrieval.ts,executive/engine.ts,executive/policy.ts,executive/specialized-agents.ts}; apps/web/src/app/api/assistant/chat/route.ts; apps/web/src/app/api/cron/personal-assistant-heartbeat/route.ts; apps/web/src/lib/connectors/types.ts. Static audit, not live competitor benchmark.

## Phase 0A — P0 release gate: strict personal external-contact boundary (mandatory before Phase 1)

Owner requirement added 2026-11-27. Planning only; implementation remains pending explicit instruction. Scope: apps/web/src/lib/runtime/ (particularly process-inbound.ts and the actual external-personal-contact prompt builder), inbound worker/job and outbound delivery, apps/whatsapp-gateway/src/server.js and related dedupe tests. Identify exact affected files from current branch before implementing. These are reported requirements to validate, not claims of reproduced defects.

- [ ] EXT-001 — Strict Gatekeeper Scope: personalExternalContact is exclusively a receptionist for receiving messages and coordinating communication with the verified account owner. Deny unrelated requests (programming/code, recipes, homework, general advice, ordinary ChatGPT-style requests), including paraphrases, multilingual and prompt-injection attempts. Return a polite fixed or constrained refusal in one or two short sentences, without answering the general request. Example: «عذرًا، أنا مخصص لاستقبال الرسائل وتنسيق التواصل مع صاحب الحساب فقط. لا أقدم خدمات عامة.» Enforce in server-side routing/capability restrictions, not only prompt wording. Fail closed when classification is uncertain; permit genuine messages for the owner and authorized coordination. Mixed requests: handle only the communication portion. Do not allow external contacts access to owner memory, tasks, documents, connectors, browser, delegated agents or executive tools. Do not apply this restriction to the verified owner or legitimately configured commercial agents.
- [ ] EXT-002 — Context-aware greeting: greet once at conversation start or after a defined long inactivity interval; never repeat greeting or sender name on each message. Use scoped persisted conversation history/timestamps, not model guesswork; document inactivity policy and test boundary conditions, concurrent inbound messages and missing history.
- [ ] EXT-003 — Precise privacy refusal: mention refusal to disclose private notes/tasks or other owner information only when actually requested; ordinary greetings, generic refusals, messages for the owner and coordination must not include irrelevant privacy disclaimers. Never expose private data even if requested indirectly.
- [ ] EXT-004 — Personal tone and factual coordination: use singular personal assistant voice («بصفتي المساعد الشخصي لصاحب الحساب» where natural), not corporate plural or invented business identity. Do not propose in-person meetings or mention contact channels not actually registered/authorized in the account configuration. Do not invent owner availability, promises, delivery or confirmed appointments; distinguish receipt, forwarded/queued and verified delivery. Read only explicitly permitted public contact settings; no exposure of owner private schedule. Do not change existing genuine owner or commercial behavior.
- [ ] EXT-005 — Reliability and latency: trace idempotency end-to-end from WhatsApp gateway/Meta webhook through enqueue/claim, process-inbound.ts, outbound/outbox and provider acknowledgement. Test repeated event IDs, concurrent retries, reconnect/replay, successive distinct messages (including identical text with distinct IDs), slow model and worker restart. Use tenant/channel/provider-scoped stable event identity and atomic claim/unique constraints where needed; never dedupe by text alone or suppress distinct requests. Prevent duplicate replies and blind retry after uncertain delivery; reconcile actual send state. Measure queue wait, processing and delivery latency with synthetic fixtures and redacted correlation IDs; report p50/p95, baseline and bottlenecks; preserve per-conversation ordering as needed without globally blocking unrelated conversations. Do not claim exactly-once delivery beyond provider guarantees.
- [ ] EXT-006 — Automated regression tests: synthetic fictional sender/owner IDs and messages only. Unit/integration tests for refusal of code/recipes/homework/general advice; greeting once and after inactivity; privacy refusal only on actual private-info request; no invented meetings/contact channels; legitimate message/coordination accepted; mixed and adversarial input stays within scope; verified owner can still use normal coding/recipe/general capabilities; ordinary business agent behavior unchanged; tenant isolation and concurrent duplicate/retry tests. Assert no external access to private memory, connectors, browser or owner execution tools. Test text and media-derived content routes wherever applicable.

**Phase 0A acceptance gate:** all EXT-001–006 verified with actual regression tests and latency/dedupe evidence; review prompt and deterministic policy, verified owner classification and gateway/outbox. Run relevant unit/integration suite, tsc --noEmit, gateway node --check and full CI; follow existing no-blind-push and release rules. No real phone numbers, customer data, credentials or .env reads. Report changed files, test counts, commit and deployment evidence when implementation is later authorized. Do not begin Phase 1 or enable any expanded external-contact capability before this gate passes. Carry the external-contact boundary through Phases 1–7 (including memory, scheduling, MCP, browser, multi-agent and voice); owner-only capabilities must never become available to external contacts through fallback or delegation. Use the consolidated REC/F and EXT acceptance gates in this document; Issue #7 is historical evidence only.

## Phase 1 — context and intelligence (indicative week 1)
- [ ] Fix KA-001/004/005/010; bounded conversation history, summaries, source/tenant provenance, no cross-user data; channel-aware limits.
- [ ] Provider abstraction with capability routing, timeout, fallback, budget, no duplicate side effects on retries.
Gate: multi-turn Arabic web/WhatsApp tests, provider failure recovery, tool-loop bounds, existing regression suite.

## Phase 2 — memory (week 2)
- [ ] Fix KA-002/003/008; scoped pgvector/hybrid search, relevance thresholds, conflict resolution, consent, provenance, retention, deletion and export controls.
Gate: recall older facts among thousands of synthetic records; no unrelated memory, no cross-tenant recall; retry and deletion tests.

## Phase 3 — durable autonomy (weeks 3–4)
- [ ] Fix KA-006; durable job queue, leases, fencing, heartbeat, checkpoints, cancellation, idempotency, backoff, dead-letter, bounded concurrency and quotas.
- [ ] Custom recurring and conditional tasks, timezone, event triggers, notification preferences, status/progress and receipts. Separate queued/running/verified/failed; never report queued as success.
- [ ] Monitoring email, prices and deployments; safe scheduling and event deduplication.
Gate: restart recovery, duplicate delivery, approval expiry, cancellation and Kill Switch tests; no real customer messages.

## Phase 4 — connectors (weeks 5–6)
- [ ] Preserve Gmail/Calendar OAuth; add Drive/Docs/Sheets, GitHub, Railway, Notion incrementally; prefer APIs to browser.
- [ ] MCP client with approved server registry, scoped discovery, schemas, least privilege, revocation, secret broker, tool provenance and approval policy. No arbitrary untrusted MCP endpoints.
Gate: synthetic OAuth lifecycle, scopes, revoked tokens, malicious tool descriptions and cross-tenant isolation.

## Phase 5 — Cloud Browser Agent (weeks 7–9, extend if security gates require)
Architecture: web/WhatsApp -> runPersonalAssistantTurn -> persisted browser plan -> policy/approval/Kill Switch -> durable queue -> apps/browser-worker (separate Railway service) -> isolated Playwright/Chromium -> untrusted observations -> verify/replan -> receipt/artifacts/notification.
Playwright is automation, not an agent by itself. Never launch Chromium in Next.js HTTP requests. Reuse agent_tasks/agent_task_steps and existing policy/credential services where appropriate. Browser jobs need asynchronous state transitions and verified results, not synchronous executor success.

### 5A Read-only pilot
- [ ] New apps/browser-worker with TypeScript, Zod validated typed inputs, pinned compatible Playwright and Chromium/Docker versions, reproducible lockfile, build and health endpoints, graceful shutdown.
- [ ] Explicit tools browser_open_page, browser_extract_page, browser_search_page, browser_screenshot, browser_go_back, browser_wait_for_result; no arbitrary evaluate, shell or browser_do_anything.
- [ ] Per-site allowlist, enforce at every navigation, redirect, subresource, popup, websocket and download; HTTPS default, deny internal/private/link-local/metadata IPs IPv4/IPv6, DNS rebinding, unsafe ports/protocols, proxy bypass. Network egress enforcement outside browser, no production DB/private network access from browser sandbox.
- [ ] Non-root sandboxed Chromium, seccomp or equivalent supported isolation, separate process/container per trust boundary; BrowserContext alone is not a security boundary. Verify Railway supports required isolation; otherwise use dedicated sandbox provider. No --no-sandbox workaround.
- [ ] Read-only means no intentional external mutations; block unsafe methods/actions by site policy, account for GET side effects and auto-submit behavior. Start with vetted public sites, no authenticated browsing.
- [ ] Time/page/byte/concurrency limits, safe locators getByRole/getByLabel, strict schemas, bounded observation text, sanitized untrusted content and structured provenance. Screenshots/HTML only when necessary, redact sensitive content, restricted storage and TTL.
Gate: synthetic fixture sites, navigation/redirect/SSRF/DNS tests, prompt injection, timeout, no side effects, no cross-session leaks.

### 5B Personal sessions
- [ ] browser_sessions and browser_task_artifacts migrations using existing organization_id/user_id conventions, FK/RLS, indexes, scoped access, encrypted storageState and artifact hashes/TTL. Never expose cookies/tokens to model or logs.
- [ ] Maintain live context across steps within task; close at task end, checkpoint encrypted session state where authorized; storageState does not restore full DOM/navigation state. Restore and revalidate after restart; session locks and expiry/revocation.
- [ ] User-controlled secure login/takeover, short-lived scoped access links, MFA/CAPTCHA -> awaiting_user, resume after manual intervention; no bypass. Prefer OAuth for supported services.
Gate: concurrent users, session revocation, crash recovery, MFA pause/resume, no credential disclosure.

### 5C Preview and controlled actions
- [ ] Add browser_click/fill/select/download/upload only through per-site capabilities and validated element references; classify unknown effects as sensitive, no arbitrary selectors/code.
- [ ] Preview drafts, form filling, appointment selection; if filling or adding to cart changes external state, approval BEFORE action. Prevent auto-submit and cross-site data transfer.
- [ ] File quarantine, type/size validation, malware scan, scoped artifact access; no automatic execution.
Gate: dynamic DOM, ambiguous elements, auto-save/auto-submit, malicious files, stale approval and cancellation.

### 5D Sensitive actions
- [ ] Explicit submit/book/send/checkout/payment tools only for individually approved sites and supported flows. High/financial approval required for all external state mutations; no blanket approval.
- [ ] Bind canonical hash to owner, task, tool, site/origin, exact recipient, action, fields, amount/currency, date/time and expiry. Re-read live page immediately before execution; invalidate if anything changes; single-use atomic approval, recheck Kill Switch and permissions.
- [ ] Verify actual confirmation/receipt; ambiguous outcome -> reconcile/manual review, never blindly retry purchases or sends. No storing payment credentials in model context; no bypass of platform controls.
Gate: synthetic checkout and booking only, changed amount/recipient, replay, duplicate side effects, kill switch, audit trail. Real financial actions disabled until separately authorized and validated.

### Deployment
- [ ] Separate Railway browser-worker service, private authenticated job interface, least-privilege queue credentials; browser runtime cannot reach control plane or database. Pin matching image/package versions (do not assume example version exists), build from source, non-root, resource quotas, health/readiness, metrics, rollback and feature flags. No new paid service without explicit approval.
References: https://playwright.dev/docs/browsers ; https://playwright.dev/docs/browser-contexts ; https://playwright.dev/docs/best-practices ; https://playwright.dev/docs/docker .

## Phase 6 — multi-agent and research (weeks 10–11)
- [ ] Orchestrator delegates scoped tasks to research, computer, productivity, coding, data, creative and existing business agents; bounded parallelism, shared budget, provenance, no privilege escalation.
- [ ] Deep research with multi-source retrieval, citations, progress, cancellation, evidence verification; isolated Python/JS execution and PDF/DOCX/XLSX/PPTX artifacts.
Gate: delegation, failure recovery, citation accuracy, malicious content and artifact verification.

## Phase 7 — voice, UX and production QA (weeks 12–14)
- [ ] Live voice with Arabic/Yemeni quality, media controls, unified chat, task progress, approvals, memory/connector management, first-use interactive tour; preserve existing design, mobile RTL, 44px touch and accessible contrast.
- [ ] End-to-end tests, adversarial security, performance/cost, observability, deployment health, rollback. Compare against competitor with identical synthetic tasks; no invented parity score.
Gate: 14 scenarios: cross-channel context, old memory, recurring email monitor, cited research, document artifact, approved browser action, deployment monitor, restart resume, delegation, injection refusal, tenant isolation, duplicate prevention, Kill Switch, business regression.

## Mandatory execution rules
- اسم المنتج الوحيد KAYAN AI؛ لا تعد استخدام الهوية أو القنوات القديمة، ولا تسمِّ خطة جديدة خارج هذا الملف. لا تستخدم FreeLLMAPI لكود أو بيانات أو مفاتيح المشروع. الفرع الوحيد المستهدف main؛ لا force push أو فروع تنفيذ موازية دون توجيه صريح. مهارات KAYANSTOR/kayan-skill مرجع هندسي؛ اقرأ MASTER_AGENT_INSTRUCTIONS.md والـ registry والمهارة المناسبة قبل العمل. مواصفات التشغيل في docs/ ليست خططًا منافسة؛ عند أي تعارض أوقف الجزء المتعارض وراجع الخطة وصاحب المشروع. لا تفرض مزودًا مستبعدًا، ولا تحذف بيانات تاريخية أو تغير أسماء الجداول أو العقود البرمجية لمجرد تنظيف الهوية.
- على الوكيل قراءة هذه الخطة وAGENTS.md قبل العمل؛ يلخص نطاق المهمة والمرحلة والمعرفات والأدلة المطلوبة، ويحدث هذه الوثيقة فقط عند اعتماد تعديل في الخطة. سجل النتائج والأدلة في Issue #10 دون نسخ خطة ثانية. التحقق من الحالة الفعلية أولاً، لا ادعاء اكتمال. الالتزام بالمهارات ai-agentic-web-testing، ui-ux-behavior-qa-audit، brand-first-ui-refinement، performance-optimization (31)، security-and-hardening، verification-before-completion عند صلتها بالمهمة.
Use KAYANSTOR/kayan-skill main MASTER_AGENT_INSTRUCTIONS.md, registry and relevant skills (agent-memory, langgraph-agents, architecture, security, QA). Document evidence per phase. No .env/secrets/real phones, no blind pushes, no skipping tests. Run tsc --noEmit, node --check apps/whatsapp-gateway/src/server.js, lint, unit/integration, build, migrations/RLS and relevant browser tests where dependencies available; otherwise manually review imports/exports/types and disclose missing execution; CI must pass before merge. Verify Railway deployment and HTTP health, authenticated QA before claiming production readiness. All REC/F and EXT requirements in this document remain mandatory. Each phase needs checkpoint, actual test results, remaining risks and rollback. Timeline 14 weeks indicative only after Phase 0A acceptance; Phase 0A duration depends on reproduction and verification; cost, provider choices and infrastructure approval pending. لا تعني هذه الخطة بدء تنفيذ أي مرحلة أو تفويض خدمات مدفوعة أو إجراءات خارجية؛ ابدأ فقط بناءً على توجيه المستخدم.

## توحيد الفروع — قرار المالك 2026-11-27
- `main` هو الفرع الوحيد المعتمد للتطوير والنشر؛ لا تُنشأ فروع عمل جديدة إلا بتفويض صريح. لا تستعد أسماء الفروع القديمة أو قواعدها. لا force-push.
- تُحفظ كل تواريخ الفروع المفحوصة في آباء دمج موثق؛ شجرة النسخة الحالية هي المرجع عند التعارض. لا تعاد ترحيلات قديمة متضاربة أو سياسات فوترة أو صلاحيات مستبدلة. تبقى كل بوابات REC/F وEXT والمراحل دون تغيير.
- رُوجعت الفروع المتباعدة: إصلاحات CI/المالك في PR #8 غطتها النسخة الأحدث في معظمها؛ احتُفظ بالتحسين المفيد لاشتراك الجولة التعليمية في تغيّر التخزين المحلي مع الحفاظ على تهيئة hash الحالية. ترحيل 0043 في فرع الهاتف مطابق للحالي؛ ترحيل trial القديم 0044 يتعارض مع 0044 الحالي وسياسة الحصص، فلا يُطبق. تُحفظ التواريخ لا الادعاء بأن كل تغييراتها طُبقت.
- قبل إزالة أي فرع قديم، تحقق من أن رأسه سلف لـ main ومن تحويل Railway إلى main ونجاح CI والنشر. إغلاق طلب دمج قديم لا يعني اكتمال بنود التطوير.
