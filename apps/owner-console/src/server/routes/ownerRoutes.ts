import { Router, type Request, type Response } from 'express';
import { claimFirstRunOwner, confirmOwnerMfa, getAuthStatus, getClientIp, loginOwner, requireOwnerAuth, requirePermission, setupOwnerMfa, writeAuditLog, revokeOwnerSession, setSessionCookie, clearSessionCookie } from '../security/auth';
import { platformStatus, platformUsers, platformUserDetail, platformWorkspaces, platformPlans, platformSubscriptions, platformAgents, platformAgentDetail, platformCreateAgent, platformAiUsage, platformChannels, platformConversations, platformEntitlements, platformBillingLedger, platformOverview, updatePlatformUser, platformUserAction, subscriptionAction, updatePlatformAgent, platformEntitlementOverride, platformConversationDetail, platformQueueConversationIntervention, updatePlatformWorkspaceStatus, platformCreateWorkspace, savePlatformPlan, platformAutomations, createPlatformAutomation, updatePlatformAutomation, platformKnowledge, platformApiIntegrations, createPlatformApiKey, revokePlatformApiKey, platformMonitoring, platformLogs, platformReport, platformAiProviders, platformNotificationsSupport, rotatePlatformChannelSecret, testPlatformChannel, platformSearch, platformAuditLogs, platformSettings, updatePlatformSetting, platformSecurity, createPlatformAdmin } from '../services/platformDataService';
export const ownerRouter = Router();
function handleError(res:Response,err:unknown,status=400){res.status(status).json({error:'request_failed',message:err instanceof Error?err.message:'حدث خطأ غير متوقع في الخادم.'})}
ownerRouter.get('/auth/status', async (_req,res)=>{try{res.json(await getAuthStatus())}catch(e){handleError(res,e,503)}});
ownerRouter.post('/auth/claim', async (req,res)=>{try{const input={email:String(req.body?.email||''),fullName:String(req.body?.fullName||''),password:String(req.body?.password||''),ipAddress:getClientIp(req),userAgent:String(req.headers['user-agent']||'unknown')};await claimFirstRunOwner(input);const auth=await loginOwner(input);setSessionCookie(res,auth.token,auth.expiresAt);res.status(201).json(auth)}catch(e){handleError(res,e)}});
ownerRouter.post('/auth/login', async (req,res)=>{try{const auth=await loginOwner({email:String(req.body?.email||''),password:String(req.body?.password||''),totpCode:req.body?.totpCode?String(req.body.totpCode):undefined,ipAddress:getClientIp(req),userAgent:String(req.headers['user-agent']||'unknown')});if('requiresMfa' in auth&&auth.requiresMfa){res.json(auth);return;}setSessionCookie(res,auth.token,auth.expiresAt);res.json(auth)}catch(e){handleError(res,e,401)}});
const platformDataRouter = Router();

platformDataRouter.get('/platform-data/status', async (_req, res) => {
  try { res.json(await platformStatus()); } catch (err) { handleError(res, err, 503); }
});
platformDataRouter.get('/overview', async (req, res) => {
  try { res.json(await platformOverview(String(req.query.period || 'month'), req.query.startDate ? String(req.query.startDate) : undefined, req.query.endDate ? String(req.query.endDate) : undefined)); }
  catch (err) { handleError(res, err, 503); }
});
platformDataRouter.get('/users', async (req, res) => {
  try { res.json(await platformUsers({search:req.query.search?String(req.query.search):undefined,status:req.query.status?String(req.query.status):undefined,paymentStatus:req.query.paymentStatus?String(req.query.paymentStatus):undefined,sortBy:req.query.sortBy?String(req.query.sortBy):undefined,sortDir:req.query.sortDir==='asc'?'asc':'desc',page:req.query.page?Number(req.query.page):1,pageSize:req.query.pageSize?Number(req.query.pageSize):20})); }
  catch (err) { handleError(res, err, 503); }
});
platformDataRouter.get('/users/:id', async (req, res) => {
  try { const data=await platformUserDetail(String(req.params.id)); if(!data){res.status(404).json({error:'not_found',message:'المستخدم غير موجود.'});return;} res.json(data); }
  catch (err) { handleError(res, err, 503); }
});
platformDataRouter.get('/users/:id/export', async (req, res) => {
  try { const data=await platformUserDetail(String(req.params.id)); if(!data){res.status(404).json({error:'not_found',message:'المستخدم غير موجود.'});return;} writeAuditLog({actor:req.ownerAdmin!,action:'user.data_exported',entityType:'user',entityId:String(req.params.id),summary:'تصدير بيانات المستخدم من PostgreSQL.',ipAddress:getClientIp(req)}); res.json({exportedAt:new Date().toISOString(),data}); }
  catch (err) { handleError(res, err, 503); }
});
platformDataRouter.patch('/users/:id', requirePermission('users:write'), async (req, res) => {
  try { const result=await updatePlatformUser(String(req.params.id),req.body||{}); writeAuditLog({actor:req.ownerAdmin!,action:'user.updated',entityType:'user',entityId:String(req.params.id),summary:'تحديث بيانات المستخدم في PostgreSQL.',after:result,ipAddress:getClientIp(req)}); res.json(await platformUserDetail(String(req.params.id))); }
  catch (err) { handleError(res, err); }
});
platformDataRouter.post('/users/:id/actions', requirePermission('users:write'), async (req, res) => {
  try { const action=String(req.body?.action||''); const result=await platformUserAction(String(req.params.id),action); writeAuditLog({actor:req.ownerAdmin!,action:action==='suspend'?'user.suspended':'user.reactivated',entityType:'user',entityId:String(req.params.id),summary:String(req.body?.reason||'تغيير حالة الحساب من لوحة المالك.'),after:result,ipAddress:getClientIp(req)}); res.json(result); }
  catch (err) { handleError(res, err); }
});
platformDataRouter.get('/workspaces', async (req, res) => {
  try { res.json(await platformWorkspaces(req.query.search?String(req.query.search):undefined)); } catch (err) { handleError(res, err, 503); }
});
platformDataRouter.get('/subscriptions', async (req, res) => {
  try { res.json(await platformSubscriptions(req.query.status?String(req.query.status):undefined)); } catch (err) { handleError(res, err, 503); }
});
platformDataRouter.post('/subscriptions/:id/actions', requirePermission('billing:write'), async (req, res) => {
  try { const result=await subscriptionAction(String(req.params.id),String(req.body?.action||''),req.body||{}); writeAuditLog({actor:req.ownerAdmin!,action:'subscription.updated',entityType:'subscription',entityId:String(req.params.id),summary:'تعديل الاشتراك في قاعدة PostgreSQL.',after:result,ipAddress:getClientIp(req)}); res.json(result); }
  catch (err) { handleError(res, err); }
});
platformDataRouter.get('/agents', async (req, res) => {
  try { res.json({items:await platformAgents({search:req.query.search?String(req.query.search):undefined,status:req.query.status?String(req.query.status):undefined,provider:req.query.provider?String(req.query.provider):undefined})}); } catch (err) { handleError(res, err, 503); }
});
platformDataRouter.get('/agents/:id', async (req, res) => {
  try { const data=await platformAgentDetail(String(req.params.id)); if(!data){res.status(404).json({error:'not_found',message:'الوكيل غير موجود.'});return;} res.json(data); }
  catch (err) { handleError(res, err, 503); }
});
platformDataRouter.patch('/agents/:id/control', requirePermission('ai:write'), async (req, res) => {
  try { const result=await updatePlatformAgent(String(req.params.id),req.body||{}); writeAuditLog({actor:req.ownerAdmin!,action:'agent.control_updated',entityType:'agent',entityId:String(req.params.id),summary:'تحديث تحكم الوكيل في PostgreSQL.',after:result,ipAddress:getClientIp(req)}); res.json(result); }
  catch (err) { handleError(res, err); }
});
platformDataRouter.get('/ai/usage', async (req, res) => {
  try { res.json(await platformAiUsage({userId:req.query.userId?String(req.query.userId):undefined,agentId:req.query.agentId?String(req.query.agentId):undefined,modelId:req.query.modelId?String(req.query.modelId):undefined,providerCode:req.query.providerCode?String(req.query.providerCode):undefined,status:req.query.status?String(req.query.status):undefined,page:req.query.page?Number(req.query.page):1,pageSize:req.query.pageSize?Number(req.query.pageSize):25})); } catch (err) { handleError(res, err, 503); }
});
platformDataRouter.get('/channels', async (_req, res) => {
  try { res.json(await platformChannels()); } catch (err) { handleError(res, err, 503); }
});
platformDataRouter.get('/conversations', async (req, res) => {
  try { res.json(await platformConversations({search:req.query.search?String(req.query.search):undefined,status:req.query.status?String(req.query.status):undefined,channelType:req.query.channelType?String(req.query.channelType):undefined,agentId:req.query.agentId?String(req.query.agentId):undefined,userId:req.query.userId?String(req.query.userId):undefined})); } catch (err) { handleError(res, err, 503); }
});

platformDataRouter.get('/conversations/:id', async (req, res) => {
  try { const data=await platformConversationDetail(String(req.params.id)); if(!data){res.status(404).json({error:'not_found',message:'المحادثة غير موجودة.'});return;} res.json(data); }
  catch (err) { handleError(res, err, 503); }
});
platformDataRouter.post('/conversations/:id/intervene', requirePermission('ops:write'), async (req, res) => {
  try {
    const data=await platformQueueConversationIntervention(String(req.params.id),String(req.body?.content||''),String(req.body?.reason||''));
    writeAuditLog({actor:req.ownerAdmin!,action:'conversation.intervention_queued',entityType:'conversation',entityId:String(req.params.id),summary:String(req.body?.reason||'تدخل إداري مسجل في قائمة الإرسال.'),ipAddress:getClientIp(req)});
    res.json(data);
  } catch (err) { handleError(res, err); }
});
platformDataRouter.get('/automations', async (_req,res)=>{try{res.json(await platformAutomations());}catch(err){handleError(res,err,503);}});
platformDataRouter.post('/automations', requirePermission('ops:write'), async (req,res)=>{
  try { const result=await createPlatformAutomation({workspaceId:String(req.body?.workspaceId||''),name:String(req.body?.name||''),automationType:String(req.body?.automationType||'')});
    writeAuditLog({actor:req.ownerAdmin!,action:'automation.created',entityType:'automation',entityId:String(result.id),summary:'إنشاء سجل أتمتة في قاعدة المنصة.',after:result,ipAddress:getClientIp(req)});res.status(201).json(result);
  } catch(err){handleError(res,err);}
});
platformDataRouter.patch('/automations/:id/status', requirePermission('ops:write'), async (req,res)=>{
  try { const result=await updatePlatformAutomation(String(req.params.id),String(req.body?.status||''));writeAuditLog({actor:req.ownerAdmin!,action:'automation.status_updated',entityType:'automation',entityId:String(req.params.id),summary:String(req.body?.reason||'تحديث حالة الأتمتة.'),after:result,ipAddress:getClientIp(req)});res.json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.get('/knowledge', async (_req,res)=>{try{res.json(await platformKnowledge());}catch(err){handleError(res,err,503);}});
platformDataRouter.get('/integrations/api', async (_req,res)=>{try{res.json(await platformApiIntegrations());}catch(err){handleError(res,err,503);}});
platformDataRouter.post('/integrations/api-keys', requirePermission('ops:write'), async (req,res)=>{
  try {const result=await createPlatformApiKey({organizationId:String(req.body?.organizationId||''),name:String(req.body?.name||'')});writeAuditLog({actor:req.ownerAdmin!,action:'api_key.created',entityType:'api_key',entityId:String(result.id),summary:'إصدار مفتاح API لمؤسسة محددة؛ السر يعرض مرة واحدة.',ipAddress:getClientIp(req)});res.status(201).json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.post('/integrations/api-keys/:id/revoke', requirePermission('ops:write'), async (req,res)=>{
  try {const result=await revokePlatformApiKey(String(req.params.id));writeAuditLog({actor:req.ownerAdmin!,action:'api_key.revoked',entityType:'api_key',entityId:String(req.params.id),summary:'إبطال مفتاح API.',ipAddress:getClientIp(req)});res.json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.get('/monitoring', async (_req,res)=>{try{res.json(await platformMonitoring());}catch(err){handleError(res,err,503);}});
platformDataRouter.get('/logs', async (req,res)=>{
  try {res.json(await platformLogs({category:req.query.category?String(req.query.category):undefined,severity:req.query.severity?String(req.query.severity):undefined,resolved:req.query.resolved?String(req.query.resolved):undefined}));}
  catch(err){handleError(res,err,503);}
});
platformDataRouter.get('/notifications-support', async (_req,res)=>{try{res.json(await platformNotificationsSupport());}catch(err){handleError(res,err,503);}});
platformDataRouter.get('/reports/:type', async (req,res)=>{
  try {
    const report=await platformReport(String(req.params.type));
    if(String(req.query.format||'')==='csv'){
      const cell=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
      const header=report.headers.map(h=>cell(h.label)).join(',');
      const rows=report.rows.map((row:Record<string,unknown>)=>report.headers.map(h=>cell(row[h.key])).join(','));
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition','attachment; filename="kayan-'+String(req.params.type)+'-report.csv"');
      res.send('\uFEFF'+[header,...rows].join('\r\n'));
      return;
    }
    res.json(report);
  } catch(err){handleError(res,err,503);}
});
platformDataRouter.get('/entitlements', async (_req, res) => {
  try { res.json(await platformEntitlements()); } catch (err) { handleError(res, err, 503); }
});
platformDataRouter.post('/entitlements/overrides', requirePermission('users:write'), async (req, res) => {
  try { const result=await platformEntitlementOverride(req.body||{}); writeAuditLog({actor:req.ownerAdmin!,action:'entitlement.overridden',entityType:'entitlement',entityId:String(result.id),summary:String(req.body?.reason||'تعديل استحقاق المؤسسة في PostgreSQL.'),after:result,ipAddress:getClientIp(req)}); res.json(result); }
  catch (err) { handleError(res, err); }
});


platformDataRouter.get('/search', async (req,res)=>{
  try { res.json(await platformSearch(String(req.query.q||''))); }
  catch(err){handleError(res,err,503);}
});
platformDataRouter.get('/audit-logs', async (req,res)=>{
  try { res.json(await platformAuditLogs({search:req.query.search?String(req.query.search):undefined,
    entityType:req.query.entityType?String(req.query.entityType):undefined,
    page:req.query.page?Number(req.query.page):1,pageSize:25})); }
  catch(err){handleError(res,err,503);}
});
platformDataRouter.get('/settings', async (_req,res)=>{
  try { res.json(await platformSettings()); } catch(err){handleError(res,err,503);}
});
platformDataRouter.patch('/settings/:key', requirePermission('settings:write'), async (req,res)=>{
  try {
    const result=await updatePlatformSetting(String(req.params.key),req.body?.value,req.ownerAdmin!.id);
    await writeAuditLog({actor:req.ownerAdmin!,action:'platform_setting.updated',entityType:'platform_setting',entityId:String(req.params.key),
      summary:'تحديث إعداد عام في PostgreSQL.',after:result,ipAddress:getClientIp(req)});
    res.json({item:result});
  } catch(err){handleError(res,err);}
});
platformDataRouter.get('/security', async (req,res)=>{
  try { res.json(await platformSecurity(req.ownerAdmin!)); } catch(err){handleError(res,err,503);}
});
platformDataRouter.post('/security/admins', requirePermission('settings:write'), async (req,res)=>{
  if(req.ownerAdmin?.role!=='platform_owner'){res.status(403).json({error:'forbidden',message:'إضافة المديرين متاحة لمالك المنصة فقط.'});return;}
  try {
    const created=await createPlatformAdmin({fullName:String(req.body?.fullName||''),email:String(req.body?.email||''),
      role:req.body?.role,password:String(req.body?.password||'')});
    await writeAuditLog({actor:req.ownerAdmin!,action:'admin.created',entityType:'admin',entityId:String(created.id),
      summary:'إضافة مدير داخلي بصلاحيات محددة.',after:{id:created.id,email:created.email,role:created.role},ipAddress:getClientIp(req)});
    res.status(201).json({admin:created});
  } catch(err){handleError(res,err);}
});
platformDataRouter.post('/security/sessions/:id/revoke', requirePermission('settings:write'), async (req,res)=>{
  try {
    const sessionId=String(req.params.id);
    await revokeOwnerSession(sessionId,req.ownerAdmin!,getClientIp(req));
    if(sessionId===req.ownerAdmin!.sessionId) clearSessionCookie(res);
    res.json({ok:true});
  } catch(err){handleError(res,err);}
});

// These areas have no canonical PostgreSQL source yet. Block the former local/demo store rather than displaying misleading data.
const unavailablePlatformData = (_req: Request, res: Response) => res.status(501).json({error:'not_integrated',message:'هذا القسم لم يُربط بعد بمصدر بيانات المنصة الحقيقي؛ لم نعد نعرض بيانات المخزن المحلي على أنها بيانات إنتاجية.'});
platformDataRouter.get('/plans', async (_req, res) => { try { res.json(await platformPlans()); } catch (err) { handleError(res, err, 503); } });
platformDataRouter.post('/users', requirePermission('users:write'), unavailablePlatformData);
platformDataRouter.post('/knowledge', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/integrations/webhooks', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/notifications', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/tickets', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.patch('/tickets/:id/status', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/alerts/:id/ack', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/logs/:id/resolve', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/channels/:id/test', requirePermission('ops:write'), async (req,res)=>{
  try {const result=await testPlatformChannel(String(req.params.id));writeAuditLog({actor:req.ownerAdmin!,action:'channel.connection_tested',entityType:'channel',entityId:String(req.params.id),summary:result.diagnostic,after:result,ipAddress:getClientIp(req)});res.json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.post('/channels/:id/rotate-secret', requirePermission('ops:write'), async (req,res)=>{
  try {const result=await rotatePlatformChannelSecret(String(req.params.id),String(req.body?.newSecret||''));writeAuditLog({actor:req.ownerAdmin!,action:'channel.credential_rotated',entityType:'channel',entityId:String(req.params.id),summary:'تدوير بيانات اعتماد القناة وتطلب اختبار اتصال جديد.',after:result,ipAddress:getClientIp(req)});res.json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.post('/workspaces', requirePermission('users:write'), async (req,res)=>{
  try {const result=await platformCreateWorkspace({ownerUserId:String(req.body?.ownerUserId||''),name:String(req.body?.name||''),businessType:req.body?.businessType?String(req.body.businessType):undefined});
    writeAuditLog({actor:req.ownerAdmin!,action:'workspace.created',entityType:'workspace',entityId:String(result.organization.id),summary:'إنشاء مؤسسة ونشاط ووكيل افتراضي في PostgreSQL.',after:result,ipAddress:getClientIp(req)});res.status(201).json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.patch('/workspaces/:id/status', requirePermission('users:write'), async (req,res)=>{
  try {const result=await updatePlatformWorkspaceStatus(String(req.params.id),String(req.body?.status||''));writeAuditLog({actor:req.ownerAdmin!,action:'workspace.status_updated',entityType:'workspace',entityId:String(req.params.id),summary:'تحديث حالة نشاط مساحة العمل.',after:result,ipAddress:getClientIp(req)});res.json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.post('/agents', requirePermission('ai:write'), async (req,res)=>{
  try {
    const result=await platformCreateAgent({workspaceId:String(req.body?.workspaceId||''),userId:req.body?.userId?String(req.body.userId):undefined,name:String(req.body?.name||''),systemPrompt:req.body?.systemPrompt?String(req.body.systemPrompt):undefined,dailyRequestLimit:req.body?.dailyRequestLimit===undefined?undefined:Number(req.body.dailyRequestLimit)});
    writeAuditLog({actor:req.ownerAdmin!,action:'agent.created',entityType:'agent',entityId:String(result.agent.id),summary:'إنشاء وكيل ذكاء اصطناعي في PostgreSQL.',after:result.agent,ipAddress:getClientIp(req)});
    res.status(201).json(result);
  } catch(err){handleError(res,err);}
});
platformDataRouter.get('/ai/providers', async (_req,res)=>{try{res.json(await platformAiProviders());}catch(err){handleError(res,err,503);}});
platformDataRouter.patch('/ai/models/:modelId', requirePermission('ai:write'), unavailablePlatformData);
platformDataRouter.post('/ai/usage', requirePermission('ai:write'), unavailablePlatformData);
platformDataRouter.patch('/entitlements/flags/:key', requirePermission('users:write'), unavailablePlatformData);
platformDataRouter.post('/conversations', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/channels', requirePermission('ops:write'), unavailablePlatformData);

platformDataRouter.post('/plans', requirePermission('billing:write'), async (req,res)=>{
  try {const result=await savePlatformPlan(req.body||{});writeAuditLog({actor:req.ownerAdmin!,action:'plan.created',entityType:'plan',entityId:String(result.id),summary:'إنشاء باقة في كتالوج PostgreSQL.',after:result,ipAddress:getClientIp(req)});res.status(201).json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.put('/plans/:id', requirePermission('billing:write'), async (req,res)=>{
  try {const result=await savePlatformPlan(req.body||{},String(req.params.id));writeAuditLog({actor:req.ownerAdmin!,action:'plan.updated',entityType:'plan',entityId:String(req.params.id),summary:'تحديث باقة في كتالوج PostgreSQL.',after:result,ipAddress:getClientIp(req)});res.json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.get('/billing', async (_req, res) => { try { res.json(await platformBillingLedger()); } catch (err) { handleError(res, err, 503); } });
platformDataRouter.post('/invoices', unavailablePlatformData);
platformDataRouter.post('/invoices/:id/refund', unavailablePlatformData);
platformDataRouter.post('/expenses', unavailablePlatformData);

ownerRouter.use(requireOwnerAuth);
ownerRouter.use(platformDataRouter);
ownerRouter.get('/auth/me',(req,res)=>res.json({admin:req.ownerAdmin}));
ownerRouter.post('/auth/logout',async(req,res)=>{try{const result=await revokeOwnerSession(req.ownerAdmin!.sessionId,req.ownerAdmin!,getClientIp(req));clearSessionCookie(res);res.json(result)}catch(e){handleError(res,e)}});
ownerRouter.post('/auth/mfa/setup',async(req,res)=>{try{res.json(await setupOwnerMfa(req.ownerAdmin!))}catch(e){handleError(res,e)}});
ownerRouter.post('/auth/mfa/confirm',async(req,res)=>{try{res.json(await confirmOwnerMfa(req.ownerAdmin!,String(req.body?.code||'')))}catch(e){handleError(res,e)}});
