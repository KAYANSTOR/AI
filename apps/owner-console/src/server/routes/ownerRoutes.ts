import { Router, type Request, type Response } from 'express';
import {
  claimFirstRunOwner,
  confirmOwnerMfa,
  getAuthStatus,
  getClientIp,
  loginOwner,
  requireOwnerAuth,
  requirePermission,
  setupOwnerMfa,
  writeAuditLog,
} from '../security/auth';
import { getOverviewDashboard } from '../services/overviewService';
import {
  createUserWithWorkspace,
  createWorkspace,
  getUserFullDetail,
  listUsers,
  listWorkspaces,
  performUserAdminAction,
  updateUser,
  updateWorkspaceStatus,
} from '../services/usersService';
import {
  createInvoice,
  getBillingLedger,
  listPlans,
  listSubscriptions,
  recordOperatingExpense,
  refundInvoice,
  savePlan,
  updateSubscriptionAction,
} from '../services/billingService';
import {
  getEntitlementsOverview,
  setUserEntitlementOverride,
  updateFeatureFlag,
} from '../services/entitlementsService';
import {
  createAgent,
  getAgentDetail,
  getAiProvidersAndModels,
  listAgents,
  listAiUsageEvents,
  recordIdempotentAiUsage,
  runAgentSandboxTest,
  updateAgentControl,
  updateAiModelGovernance,
} from '../services/aiService';
import {
  createApiKey,
  createAutomation,
  createChannel,
  createConversationRecord,
  createKnowledgeSource,
  createWebhook,
  getAutomationDetail,
  getConversationMessages,
  listApiAndWebhooks,
  listAutomations,
  listChannels,
  listConversations,
  listKnowledgeSources,
  revokeApiKey,
  rotateChannelSecret,
  sendAuditedConversationIntervention,
  testChannelConnection,
  updateAutomationStatus,
} from '../services/operationsService';
import {
  acknowledgeAlert,
  addInternalAdmin,
  buildReport,
  createSupportTicket,
  getNotificationsAndSupport,
  getOwnerSecurityCenter,
  getSystemMonitoring,
  globalOwnerSearch,
  listAuditLogs,
  listPlatformSettings,
  listSystemLogs,
  resolveSystemLog,
  revokeOwnerSession,
  sendNotificationBroadcast,
  updatePlatformSetting,
  updateTicketStatus,
} from '../services/monitoringService';
import type { PeriodGranularity } from '../domain/analytics';
import {
  platformStatus, platformUsers, platformUserDetail, platformWorkspaces, platformPlans, platformSubscriptions,
  platformAgents, platformAgentDetail, platformAiUsage, platformChannels, platformConversations, platformEntitlements, platformBillingLedger,
  platformOverview, updatePlatformUser, platformUserAction, subscriptionAction, updatePlatformAgent,
  platformEntitlementOverride, platformConversationDetail, platformQueueConversationIntervention,
  updatePlatformWorkspaceStatus, platformCreateWorkspace, savePlatformPlan, platformAutomations,
  createPlatformAutomation, updatePlatformAutomation, platformKnowledge, platformApiIntegrations,
  createPlatformApiKey, revokePlatformApiKey, platformMonitoring, platformLogs, platformReport,
  platformAiProviders, platformNotificationsSupport,
} from '../services/platformDataService';

export const ownerRouter = Router();

function handleError(res: Response, err: unknown, status = 400): void {
  const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع في الخادم.';
  res.status(status).json({ error: 'request_failed', message });
}

// ============================================================
// 1. PUBLIC OWNER AUTH ROUTES (No admin data exposed)
// ============================================================
ownerRouter.get('/auth/status', (_req: Request, res: Response) => {
  res.json(getAuthStatus());
});

ownerRouter.post('/auth/claim', (req: Request, res: Response) => {
  try {
    const result = claimFirstRunOwner({
      email: String(req.body?.email || ''),
      fullName: String(req.body?.fullName || ''),
      password: String(req.body?.password || ''),
      ipAddress: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || 'unknown'),
    });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 400);
  }
});

ownerRouter.post('/auth/login', (req: Request, res: Response) => {
  try {
    const result = loginOwner({
      email: String(req.body?.email || ''),
      password: String(req.body?.password || ''),
      totpCode: req.body?.totpCode ? String(req.body.totpCode) : undefined,
      ipAddress: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || 'unknown'),
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, 401);
  }
});

// ============================================================
// 2. PROTECTED OWNER ROUTES — SERVER-ENFORCED RBAC BARRIER
// ============================================================
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
      res.send('\\uFEFF'+[header,...rows].join('\\r\\n'));
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
platformDataRouter.post('/channels/:id/test', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/channels/:id/rotate-secret', requirePermission('ops:write'), unavailablePlatformData);
platformDataRouter.post('/workspaces', requirePermission('users:write'), async (req,res)=>{
  try {const result=await platformCreateWorkspace({ownerUserId:String(req.body?.ownerUserId||''),name:String(req.body?.name||''),businessType:req.body?.businessType?String(req.body.businessType):undefined});
    writeAuditLog({actor:req.ownerAdmin!,action:'workspace.created',entityType:'workspace',entityId:String(result.organization.id),summary:'إنشاء مؤسسة ونشاط ووكيل افتراضي في PostgreSQL.',after:result,ipAddress:getClientIp(req)});res.status(201).json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.patch('/workspaces/:id/status', requirePermission('users:write'), async (req,res)=>{
  try {const result=await updatePlatformWorkspaceStatus(String(req.params.id),String(req.body?.status||''));writeAuditLog({actor:req.ownerAdmin!,action:'workspace.status_updated',entityType:'workspace',entityId:String(req.params.id),summary:'تحديث حالة نشاط مساحة العمل.',after:result,ipAddress:getClientIp(req)});res.json(result);}
  catch(err){handleError(res,err);}
});
platformDataRouter.post('/agents', requirePermission('ai:write'), unavailablePlatformData);
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

ownerRouter.get('/auth/me', (req: Request, res: Response) => {
  res.json({ admin: req.ownerAdmin });
});

ownerRouter.post('/auth/logout', (req: Request, res: Response) => {
  try {
    revokeOwnerSession(req.ownerAdmin!.sessionId, req.ownerAdmin!, getClientIp(req));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/auth/mfa/setup', (req: Request, res: Response) => {
  try {
    res.json(setupOwnerMfa(req.ownerAdmin!));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/auth/mfa/confirm', (req: Request, res: Response) => {
  try {
    confirmOwnerMfa(req.ownerAdmin!, String(req.body?.code || ''), getClientIp(req));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- OVERVIEW ----------
ownerRouter.get('/overview', (req: Request, res: Response) => {
  try {
    const period = (String(req.query.period || 'month') as PeriodGranularity) || 'month';
    const data = getOverviewDashboard({
      period,
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
    });
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- GLOBAL SEARCH ----------
ownerRouter.get('/search', (req: Request, res: Response) => {
  try {
    res.json(globalOwnerSearch(String(req.query.q || '')));
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- USERS & WORKSPACES ----------
ownerRouter.get('/users', (req: Request, res: Response) => {
  try {
    res.json(
      listUsers({
        search: req.query.search ? String(req.query.search) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        paymentStatus: req.query.paymentStatus ? String(req.query.paymentStatus) : undefined,
        sortBy: req.query.sortBy ? String(req.query.sortBy) : undefined,
        sortDir: req.query.sortDir === 'asc' ? 'asc' : 'desc',
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
      })
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/users', requirePermission('users:write'), (req: Request, res: Response) => {
  try {
    const created = createUserWithWorkspace(req.body || {}, req.ownerAdmin!, getClientIp(req));
    res.status(201).json(created);
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/users/:id', (req: Request, res: Response) => {
  try {
    const detail = getUserFullDetail(String(req.params.id));
    if (!detail) {
      res.status(404).json({ error: 'not_found', message: 'المستخدم غير موجود.' });
      return;
    }
    res.json(detail);
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.patch('/users/:id', requirePermission('users:write'), (req: Request, res: Response) => {
  try {
    res.json(updateUser(String(req.params.id), req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/users/:id/actions', requirePermission('users:write'), (req: Request, res: Response) => {
  try {
    const action = String(req.body?.action || '');
    res.json(
      performUserAdminAction(String(req.params.id), action, req.body || {}, req.ownerAdmin!, getClientIp(req))
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/users/:id/export', (req: Request, res: Response) => {
  try {
    const detail = getUserFullDetail(String(req.params.id));
    if (!detail) {
      res.status(404).json({ error: 'not_found', message: 'المستخدم غير موجود.' });
      return;
    }
    writeAuditLog({
      actor: req.ownerAdmin!,
      action: 'user.data_exported',
      entityType: 'user',
      entityId: String(req.params.id),
      summary: `تصدير ملف بيانات المستخدم ${String(detail.user.full_name)} وفق سياسة المنصة.`,
      ipAddress: getClientIp(req),
    });
    res.json({ exportedAt: new Date().toISOString(), policy: 'Kayan AI Data Export Policy', data: detail });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/workspaces', (req: Request, res: Response) => {
  try {
    res.json({ items: listWorkspaces(req.query.search ? String(req.query.search) : undefined) });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/workspaces', requirePermission('users:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createWorkspace(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.patch('/workspaces/:id/status', requirePermission('users:write'), (req: Request, res: Response) => {
  try {
    res.json(
      updateWorkspaceStatus(String(req.params.id), req.body?.status, req.ownerAdmin!, getClientIp(req))
    );
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- PLANS, SUBSCRIPTIONS, BILLING & EXPENSES ----------
ownerRouter.get('/plans', (_req: Request, res: Response) => {
  try {
    res.json({ items: listPlans() });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/plans', requirePermission('billing:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(savePlan(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.put('/plans/:id', requirePermission('billing:write'), (req: Request, res: Response) => {
  try {
    res.json(savePlan({ ...(req.body || {}), id: String(req.params.id) }, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/subscriptions', (req: Request, res: Response) => {
  try {
    res.json(listSubscriptions(req.query.status ? String(req.query.status) : undefined));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/subscriptions/:id/actions', requirePermission('billing:write'), (req: Request, res: Response) => {
  try {
    res.json(
      updateSubscriptionAction(
        String(req.params.id),
        req.body?.action,
        req.body || {},
        req.ownerAdmin!,
        getClientIp(req)
      )
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/billing', (_req: Request, res: Response) => {
  try {
    res.json(getBillingLedger());
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/invoices', requirePermission('billing:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createInvoice(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/invoices/:id/refund', requirePermission('billing:write'), (req: Request, res: Response) => {
  try {
    res.json(refundInvoice(String(req.params.id), String(req.body?.reason || ''), req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/expenses', requirePermission('billing:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(recordOperatingExpense(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- ENTITLEMENTS & FEATURE FLAGS ----------
ownerRouter.get('/entitlements', (_req: Request, res: Response) => {
  try {
    res.json(getEntitlementsOverview());
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.patch('/entitlements/flags/:key', requirePermission('users:write'), (req: Request, res: Response) => {
  try {
    res.json(updateFeatureFlag(String(req.params.key), req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/entitlements/overrides', requirePermission('users:write'), (req: Request, res: Response) => {
  try {
    res.json(setUserEntitlementOverride(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- AI AGENTS, PROVIDERS, MODELS & USAGE ----------
ownerRouter.get('/agents', (req: Request, res: Response) => {
  try {
    res.json({
      items: listAgents({
        search: req.query.search ? String(req.query.search) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        provider: req.query.provider ? String(req.query.provider) : undefined,
      }),
    });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/agents', requirePermission('ai:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createAgent(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/agents/:id', (req: Request, res: Response) => {
  try {
    const detail = getAgentDetail(String(req.params.id));
    if (!detail) {
      res.status(404).json({ error: 'not_found', message: 'الوكيل غير موجود.' });
      return;
    }
    res.json(detail);
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.patch('/agents/:id/control', requirePermission('ai:write'), (req: Request, res: Response) => {
  try {
    res.json(updateAgentControl(String(req.params.id), req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/agents/:id/sandbox-test', requirePermission('ai:write'), async (req: Request, res: Response) => {
  try {
    const result = await runAgentSandboxTest(
      String(req.params.id),
      String(req.body?.message || ''),
      req.ownerAdmin!,
      getClientIp(req)
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/ai/providers', (_req: Request, res: Response) => {
  try {
    res.json(getAiProvidersAndModels());
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.patch('/ai/models/:modelId', requirePermission('ai:write'), (req: Request, res: Response) => {
  try {
    res.json(
      updateAiModelGovernance(decodeURIComponent(String(req.params.modelId)), req.body || {}, req.ownerAdmin!, getClientIp(req))
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/ai/usage', (req: Request, res: Response) => {
  try {
    res.json(
      listAiUsageEvents({
        userId: req.query.userId ? String(req.query.userId) : undefined,
        agentId: req.query.agentId ? String(req.query.agentId) : undefined,
        modelId: req.query.modelId ? String(req.query.modelId) : undefined,
        providerCode: req.query.providerCode ? String(req.query.providerCode) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 25,
      })
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/ai/usage', requirePermission('ai:write'), (req: Request, res: Response) => {
  try {
    const result = recordIdempotentAiUsage(req.body || {});
    res.status(result.deduplicated ? 200 : 201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- CONVERSATIONS, CHANNELS, AUTOMATIONS, KNOWLEDGE, API/WEBHOOKS ----------
ownerRouter.get('/conversations', (req: Request, res: Response) => {
  try {
    res.json(
      listConversations({
        search: req.query.search ? String(req.query.search) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        channelType: req.query.channelType ? String(req.query.channelType) : undefined,
        agentId: req.query.agentId ? String(req.query.agentId) : undefined,
        userId: req.query.userId ? String(req.query.userId) : undefined,
      })
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/conversations', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createConversationRecord(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/conversations/:id', (req: Request, res: Response) => {
  try {
    const detail = getConversationMessages(String(req.params.id));
    if (!detail) {
      res.status(404).json({ error: 'not_found', message: 'المحادثة غير موجودة.' });
      return;
    }
    res.json(detail);
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/conversations/:id/intervene', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.json(
      sendAuditedConversationIntervention(
        String(req.params.id),
        String(req.body?.content || ''),
        String(req.body?.reason || ''),
        req.ownerAdmin!,
        getClientIp(req)
      )
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/channels', (_req: Request, res: Response) => {
  try {
    res.json({ items: listChannels() });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/channels', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json({ items: createChannel(req.body || {}, req.ownerAdmin!, getClientIp(req)) });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/channels/:id/rotate-secret', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.json(
      rotateChannelSecret(String(req.params.id), String(req.body?.newSecret || ''), req.ownerAdmin!, getClientIp(req))
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/channels/:id/test', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.json(testChannelConnection(String(req.params.id), req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/automations', (_req: Request, res: Response) => {
  try {
    res.json({ items: listAutomations() });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/automations', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createAutomation(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/automations/:id', (req: Request, res: Response) => {
  try {
    const detail = getAutomationDetail(String(req.params.id));
    if (!detail) {
      res.status(404).json({ error: 'not_found', message: 'الأتمتة غير موجودة.' });
      return;
    }
    res.json(detail);
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.patch('/automations/:id/status', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.json(
      updateAutomationStatus(
        String(req.params.id),
        req.body?.status,
        String(req.body?.reason || ''),
        req.ownerAdmin!,
        getClientIp(req)
      )
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/knowledge', (_req: Request, res: Response) => {
  try {
    res.json(listKnowledgeSources());
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/knowledge', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createKnowledgeSource(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/integrations/api', (_req: Request, res: Response) => {
  try {
    res.json(listApiAndWebhooks());
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/integrations/api-keys', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createApiKey(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/integrations/api-keys/:id/revoke', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.json(revokeApiKey(String(req.params.id), req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/integrations/webhooks', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createWebhook(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- MONITORING, LOGS, NOTIFICATIONS, SUPPORT, REPORTS, AUDIT, SETTINGS ----------
ownerRouter.get('/monitoring', (_req: Request, res: Response) => {
  try {
    res.json(getSystemMonitoring());
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/alerts/:id/ack', (req: Request, res: Response) => {
  try {
    res.json(acknowledgeAlert(String(req.params.id), req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/logs', (req: Request, res: Response) => {
  try {
    res.json({
      items: listSystemLogs({
        category: req.query.category ? String(req.query.category) : undefined,
        severity: req.query.severity ? String(req.query.severity) : undefined,
        resolved: req.query.resolved ? String(req.query.resolved) : undefined,
      }),
    });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/logs/:id/resolve', (req: Request, res: Response) => {
  try {
    res.json(resolveSystemLog(String(req.params.id), req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/notifications-support', (_req: Request, res: Response) => {
  try {
    res.json(getNotificationsAndSupport());
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/notifications', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(sendNotificationBroadcast(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/tickets', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.status(201).json(createSupportTicket(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.patch('/tickets/:id/status', requirePermission('ops:write'), (req: Request, res: Response) => {
  try {
    res.json(updateTicketStatus(String(req.params.id), req.body?.status, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/reports/:type', (req: Request, res: Response) => {
  try {
    const type = String(req.params.type);
    const report = buildReport(type);
    if (req.query.format === 'csv') {
      writeAuditLog({
        actor: req.ownerAdmin!,
        action: 'report.exported_csv',
        entityType: 'report',
        entityId: type,
        summary: `تصدير ${report.title} بصيغة CSV.`,
        ipAddress: getClientIp(req),
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="kayan-${type}-report.csv"`);
      res.send(report.csv);
      return;
    }
    res.json({ title: report.title, headers: report.headers, rows: report.rows });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/audit-logs', (req: Request, res: Response) => {
  try {
    res.json(
      listAuditLogs({
        action: req.query.action ? String(req.query.action) : undefined,
        entityType: req.query.entityType ? String(req.query.entityType) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 30,
      })
    );
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/settings', (_req: Request, res: Response) => {
  try {
    res.json({ items: listPlatformSettings() });
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.patch('/settings/:key', requirePermission('settings:write'), (req: Request, res: Response) => {
  try {
    res.json(updatePlatformSetting(String(req.params.key), req.body?.value, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.get('/security', (req: Request, res: Response) => {
  try {
    res.json(getOwnerSecurityCenter(req.ownerAdmin!));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/security/sessions/:id/revoke', (req: Request, res: Response) => {
  try {
    res.json(revokeOwnerSession(String(req.params.id), req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});

ownerRouter.post('/security/admins', (req: Request, res: Response) => {
  try {
    res.status(201).json(addInternalAdmin(req.body || {}, req.ownerAdmin!, getClientIp(req)));
  } catch (err) {
    handleError(res, err);
  }
});
