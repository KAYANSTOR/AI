import type { SupabaseClient } from '@supabase/supabase-js'
import { createAppointmentRecord, findAvailableSlots } from '@/lib/calendar/slots'
import { resolveContactByPhone } from '@/lib/channels/contacts'
import { getToolPolicy, isActorAllowed, type ToolActor } from '@/lib/ai/registry'
import { getEnabledCapabilities } from '@/lib/ai/capabilities'
import { createPendingAction } from '@/lib/runtime/pending'
import { searchKnowledge } from '@/lib/knowledge/retrieval'
import { TOOL_POLICIES } from '@/lib/ai/registry'

// The registry is the only place tools are declared.
export { TOOL_NAMES } from '@/lib/ai/registry'

export type ToolContext = {
  organizationId:string
  businessId:string
  /** Absent only when the channel has no conversation context yet (e.g. a voice call with no caller identity). */
  conversationId?:string|null
  contactId?:string|null
  supabase:SupabaseClient
  agentId?:string|null
  /**
   * Who is invoking the tool. Every call site states this explicitly so a tool can
   * never be reached by an actor the registry does not authorise.
   */
  actor:ToolActor
}
export type ExecuteOptions = { confirmed?:boolean }

export async function getToolDefinitionsForAgent(supabase:SupabaseClient,organizationId:string,agentId?:string|null,actor:ToolActor='agent'){
  const enabled=await getEnabledCapabilities(supabase,organizationId)
  const definitions:Array<{name:string,description:string,input_schema:Record<string,unknown>}>=[]

  for(const name of Object.keys(TOOL_POLICIES)){
    const policy=getToolPolicy(name)
    if(!policy) continue
    if(!isActorAllowed(policy,actor)) continue
    let allowed=policy.capability ? enabled.has(policy.capability) : true
    if(agentId){
      const {data}=await supabase.from('agent_tool_policies').select('is_allowed').eq('agent_id',agentId).eq('tool_name',name).maybeSingle()
      if(data) allowed=allowed && Boolean(data.is_allowed)
    }
    if(!allowed) continue
    definitions.push({name,description:policy.description,input_schema:policy.inputSchema})
  }
  return definitions
}

export async function executeTool(name:string,rawArgs:Record<string,unknown>,ctx:ToolContext,options:ExecuteOptions={}){
  const policy=getToolPolicy(name)
  if(!policy) return {ok:false as const,error:'Unknown tool: '+name}
  const started=Date.now()
  try{
    // Actor authorisation comes first: a tool the registry does not expose to this actor
    // must not even be evaluated for capabilities or confirmation.
    if(!isActorAllowed(policy,ctx.actor)){
      await recordToolExecution(ctx,name,'blocked',rawArgs,{error:'actor_not_allowed'},policy.requiresConfirmation,started)
      return {ok:false as const,error:'This actor is not allowed to invoke '+name+'.'}
    }

    const enabled=await getEnabledCapabilities(ctx.supabase,ctx.organizationId)
    if(policy.capability && !enabled.has(policy.capability)){
      await recordToolExecution(ctx,name,'blocked',rawArgs,{error:'capability_disabled'},policy.requiresConfirmation,started)
      return {ok:false as const,error:'Capability is disabled for this business.'}
    }

    let requiresConfirmation=policy.requiresConfirmation
    if(ctx.agentId){
      const {data:agentPolicy}=await ctx.supabase.from('agent_tool_policies').select('is_allowed,requires_confirmation').eq('agent_id',ctx.agentId).eq('tool_name',name).maybeSingle()
      if(agentPolicy && !agentPolicy.is_allowed){
        await recordToolExecution(ctx,name,'blocked',rawArgs,{error:'agent_policy_denied'},requiresConfirmation,started)
        return {ok:false as const,error:'This action is not allowed for the active agent.'}
      }
      if(agentPolicy?.requires_confirmation) requiresConfirmation=true
    }

    if(requiresConfirmation && !options.confirmed){
      if(!ctx.conversationId || !ctx.contactId) return {ok:false as const,error:'Conversation context is required before a confirmed write action.'}
      const actionId=await createPendingAction({
        supabase:ctx.supabase,organizationId:ctx.organizationId,businessId:ctx.businessId,
        conversationId:ctx.conversationId,contactId:ctx.contactId,toolName:name,toolArguments:rawArgs,
      })
      const result={confirmationRequired:true,actionId,tool:name}
      await ctx.supabase.from('conversations').update({state:'action_pending'}).eq('id',ctx.conversationId)
      await recordToolExecution(ctx,name,'confirmation_required',rawArgs,result,true,started)
      return {ok:true as const,result}
    }

    let result:unknown
    switch(name){
      case 'get_customer': result=await toolGetCustomer(ctx,rawArgs); break
      case 'find_available_slots': result=await toolFindSlots(ctx,rawArgs); break
      case 'create_appointment': result=await toolCreateAppointment(ctx,rawArgs); break
      case 'create_lead': result=await toolCreateLead(ctx,rawArgs); break
      case 'search_knowledge': result=await toolSearchKnowledge(ctx,rawArgs); break
      case 'request_human_handoff': result=await toolHandoff(ctx,rawArgs); break
      case 'create_quote': result=await toolCreateQuote(ctx,rawArgs); break
    }
    if(result === undefined) return {ok:false as const,error:'Tool '+name+' has no implementation.'}
    if(policy.auditClass==='sensitive_write') await writeToolAudit(ctx,name,policy.capability,result)
    await recordToolExecution(ctx,name,'succeeded',rawArgs,result,requiresConfirmation,started)
    return {ok:true as const,result}
  }catch(error){
    const message=error instanceof Error ? error.message : 'Tool execution failed'
    await recordToolExecution(ctx,name,'failed',rawArgs,{error:message},policy.requiresConfirmation,started)
    return {ok:false as const,error:message}
  }
}

async function toolGetCustomer(ctx:ToolContext,args:Record<string,unknown>){
  const phone=String(args.phone ?? '').trim()
  if(!phone) throw new Error('phone is required')
  const contact=await resolveContactByPhone(ctx.supabase,ctx.organizationId,phone)
  const {data:upcoming,error}=await ctx.supabase.from('appointments')
    .select('id,starts_at,status,services(name)')
    .eq('organization_id',ctx.organizationId).eq('contact_id',contact.contactId)
    .gte('starts_at',new Date().toISOString()).order('starts_at').limit(3)
  if(error) throw new Error(error.message)
  return {contactId:contact.contactId,fullName:contact.fullName,phone:contact.phone,isNew:contact.isNew,upcomingAppointments:upcoming ?? []}
}

async function toolFindSlots(ctx:ToolContext,args:Record<string,unknown>){
  const date=String(args.date ?? '').trim()
  const serviceName=String(args.service_name ?? '').trim()
  if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD')
  let serviceId=args.service_id ? String(args.service_id).trim() : ''
  if(!serviceId){
    if(!serviceName) throw new Error('service_name or service_id is required')
    const {data:svc,error}=await ctx.supabase.from('services').select('id').eq('organization_id',ctx.organizationId).eq('is_active',true).ilike('name','%'+serviceName+'%').limit(1).maybeSingle()
    if(error) throw new Error(error.message)
    if(!svc) return {slots:[],message:'No active service matches the request.'}
    serviceId=svc.id
  }
  return {serviceId,date,slots:await findAvailableSlots(ctx.supabase,ctx.organizationId,serviceId,date)}
}

async function toolCreateAppointment(ctx:ToolContext,args:Record<string,unknown>){
  const phone=String(args.phone ?? '').trim()
  const serviceId=String(args.service_id ?? '').trim()
  const startsAt=String(args.starts_at ?? '').trim()
  const name=args.name ? String(args.name).trim() : null
  if(!phone || !serviceId || !startsAt) throw new Error('phone, service_id, and starts_at are required')
  const contact=await resolveContactByPhone(ctx.supabase,ctx.organizationId,phone,name)
  const {data:service,error}=await ctx.supabase.from('services').select('id,duration_minutes,name').eq('id',serviceId).eq('organization_id',ctx.organizationId).maybeSingle()
  if(error) throw new Error(error.message)
  if(!service) throw new Error('Service not found')
  const start=new Date(startsAt)
  if(Number.isNaN(start.getTime())) throw new Error('Invalid starts_at')
  const end=new Date(start.getTime()+Number(service.duration_minutes ?? 60)*60000)
  const appointment=await createAppointmentRecord(ctx.supabase,{organizationId:ctx.organizationId,contactId:contact.contactId,serviceId:service.id,startsAt:start.toISOString(),endsAt:end.toISOString()})
  const {error:leadError}=await ctx.supabase.from('leads').insert({organization_id:ctx.organizationId,contact_id:contact.contactId,status:'booked',intent:service.name})
  if(leadError && leadError.code!=='23505') throw new Error(leadError.message)
  return {appointmentId:appointment.id,service:service.name,startsAt:appointment.starts_at,status:appointment.status,contactId:contact.contactId}
}

async function toolCreateLead(ctx:ToolContext,args:Record<string,unknown>){
  const phone=String(args.phone ?? '').trim()
  if(!phone) throw new Error('phone is required')
  const name=args.name ? String(args.name).trim() : null
  const intent=args.intent ? String(args.intent).trim() : null
  const notes=args.notes ? String(args.notes).trim() : null
  const estimated=args.estimated_value == null ? null : Number(args.estimated_value)
  if(estimated != null && (!Number.isFinite(estimated) || estimated < 0)) throw new Error('estimated_value must be a positive number')

  const contact=await resolveContactByPhone(ctx.supabase,ctx.organizationId,phone,name)
  const {data,error}=await ctx.supabase.from('leads').insert({
    organization_id:ctx.organizationId,contact_id:contact.contactId,status:'new',intent,notes,
    estimated_value:estimated,source:ctx.agentId ? 'ai_agent' : 'staff',
  }).select('id,status,intent').single()
  if(error) throw new Error(error.message)
  return {leadId:data.id,status:data.status,intent:data.intent,contactId:contact.contactId}
}

async function toolSearchKnowledge(ctx:ToolContext,args:Record<string,unknown>){
  const query=String(args.query ?? '').trim()
  if(query.length < 2) throw new Error('query is required')
  const category=args.category ? String(args.category).trim() : null
  const matches=await searchKnowledge(ctx.supabase,ctx.organizationId,query,{category})
  if(matches.length===0){
    // Never fabricate: an unmatched question must be reported as uncovered.
    return {found:false,matches:[],message:'No knowledge base entry covers this question. Do not guess; offer a human handoff.'}
  }
  return {found:true,matches:matches.map(m=>({title:m.title,category:m.category,content:m.content}))}
}

/** Audit trail for tool writes, written through the membership-guarded path. */
async function writeToolAudit(ctx:ToolContext,name:string,capability:string|null,result:unknown){
  await ctx.supabase.rpc('log_audit_event',{
    p_organization_id:ctx.organizationId,
    p_action:'tool.'+name,
    p_entity_type:'conversation',
    p_entity_id:ctx.conversationId ?? null,
    p_business_id:ctx.businessId,
    p_metadata:{capability,result},
  })
}

async function toolHandoff(ctx:ToolContext,args:Record<string,unknown>){
  if(!ctx.conversationId) throw new Error('conversation_id is required for handoff')
  const reason=String(args.reason ?? 'customer_requested').trim() || 'customer_requested'
  const {error}=await ctx.supabase.from('conversations').update({status:'handed_off',state:'human_handoff',ai_enabled:false,ai_paused_at:new Date().toISOString(),handoff_reason:reason}).eq('id',ctx.conversationId)
  if(error) throw new Error(error.message)
  const {error:auditError}=await ctx.supabase.from('audit_events').insert({
    organization_id:ctx.organizationId,business_id:ctx.businessId,actor_type:'agent',actor_id:ctx.agentId ?? null,
    action:'conversation.handoff_requested',entity_type:'conversation',entity_id:ctx.conversationId,metadata:{reason},
  })
  if(auditError) throw new Error(auditError.message)
  return {handoff:true,reason,message:'A human team member will follow up shortly.'}
}

async function recordToolExecution(ctx:ToolContext,name:string,status:'succeeded'|'failed'|'blocked'|'confirmation_required',args:Record<string,unknown>,result:unknown,requiresConfirmation:boolean,started:number){
  await ctx.supabase.from('tool_executions').insert({
    organization_id:ctx.organizationId,conversation_id:ctx.conversationId || null,tool_name:name,status,
    arguments:args,result,error_message:status==='failed' ? JSON.stringify(result).slice(0,500) : null,
    requires_confirmation:requiresConfirmation,latency_ms:Date.now()-started,
  })
}

 a s y n c   f u n c t i o n   t o o l C r e a t e Q u o t e ( c t x :   T o o l C o n t e x t ,   a r g s :   R e c o r d < s t r i n g ,   u n k n o w n > )   { 
     i f   ( ! c t x . c o n t a c t I d )   { 
         t h r o w   n e w   E r r o r ( ' C u s t o m e r   c o n t e x t   i s   r e q u i r e d   t o   c r e a t e   a   q u o t e . ' ) 
     } 
     c o n s t   i t e m s   =   a r g s . i t e m s   a s   A r r a y < { n a m e :   s t r i n g ,   d e s c r i p t i o n ? :   s t r i n g ,   q u a n t i t y :   n u m b e r ,   u n i t _ p r i c e :   n u m b e r ,   d i s c o u n t ? :   n u m b e r } > 
     i f   ( ! i t e m s   | |   ! i t e m s . l e n g t h )   { 
         t h r o w   n e w   E r r o r ( ' A t   l e a s t   o n e   i t e m   i s   r e q u i r e d . ' ) 
     } 
 
     l e t   s u b t o t a l   =   0 
     l e t   d i s c o u n t   =   0 
     c o n s t   p r o c e s s e d I t e m s   =   i t e m s . m a p ( i t e m   = >   { 
         c o n s t   q   =   N u m b e r ( i t e m . q u a n t i t y ) 
         c o n s t   p   =   N u m b e r ( i t e m . u n i t _ p r i c e ) 
         c o n s t   d   =   N u m b e r ( i t e m . d i s c o u n t   | |   0 ) 
         c o n s t   l i n e T o t a l   =   ( q   *   p )   -   d 
         s u b t o t a l   + =   ( q   *   p ) 
         d i s c o u n t   + =   d 
         r e t u r n   {   n a m e :   S t r i n g ( i t e m . n a m e ) ,   d e s c r i p t i o n :   i t e m . d e s c r i p t i o n   ?   S t r i n g ( i t e m . d e s c r i p t i o n )   :   n u l l ,   q u a n t i t y :   q ,   u n i t _ p r i c e :   p ,   d i s c o u n t :   d ,   l i n e _ t o t a l :   l i n e T o t a l   } 
     } ) 
     c o n s t   t o t a l   =   s u b t o t a l   -   d i s c o u n t 
 
     c o n s t   {   d a t a :   q u o t e ,   e r r o r   }   =   a w a i t   c t x . s u p a b a s e . f r o m ( ' q u o t e s ' ) . i n s e r t ( { 
         o r g a n i z a t i o n _ i d :   c t x . o r g a n i z a t i o n I d , 
         b u s i n e s s _ i d :   c t x . b u s i n e s s I d , 
         c o n t a c t _ i d :   c t x . c o n t a c t I d , 
         c o n v e r s a t i o n _ i d :   c t x . c o n v e r s a t i o n I d   | |   n u l l , 
         s t a t u s :   ' d r a f t ' , 
         c u r r e n c y :   ' S A R ' , 
         s u b t o t a l ,   d i s c o u n t ,   t a x :   0 ,   t o t a l , 
         n o t e s :   a r g s . n o t e s   ?   S t r i n g ( a r g s . n o t e s )   :   n u l l 
     } ) . s e l e c t ( ' i d ,   q u o t e _ n u m b e r ' ) . s i n g l e ( ) 
 
     i f   ( e r r o r   | |   ! q u o t e )   t h r o w   n e w   E r r o r ( ' D a t a b a s e   e r r o r   c r e a t i n g   q u o t e . ' ) 
 
     c o n s t   i t e m s T o I n s e r t   =   p r o c e s s e d I t e m s . m a p ( i t e m   = >   ( {   . . . i t e m ,   q u o t e _ i d :   q u o t e . i d   } ) ) 
     a w a i t   c t x . s u p a b a s e . f r o m ( ' q u o t e _ i t e m s ' ) . i n s e r t ( i t e m s T o I n s e r t ) 
 
     r e t u r n   {   q u o t e I d :   q u o t e . i d ,   q u o t e N u m b e r :   q u o t e . q u o t e _ n u m b e r ,   t o t a l ,   s t a t u s :   ' d r a f t '   } 
 } 
 
 
 
