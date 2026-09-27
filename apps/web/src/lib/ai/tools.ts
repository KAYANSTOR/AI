import type { SupabaseClient } from '@supabase/supabase-js'
import { createAppointmentRecord, findAvailableSlots } from '@/lib/calendar/slots'
import { resolveContactByPhone } from '@/lib/channels/contacts'
import { getToolPolicy } from '@/lib/ai/registry'
import { getEnabledCapabilities } from '@/lib/ai/capabilities'
import { createPendingAction } from '@/lib/runtime/pending'

export const TOOL_NAMES = ['get_customer','find_available_slots','create_appointment','request_human_handoff'] as const
export type ToolName = (typeof TOOL_NAMES)[number]
export type ToolContext = {
  organizationId:string
  businessId:string
  /** Absent only when the channel has no conversation context yet (e.g. a voice call with no caller identity). */
  conversationId?:string|null
  contactId?:string|null
  supabase:SupabaseClient
  agentId?:string|null
}
export type ExecuteOptions = { confirmed?:boolean }

export async function getToolDefinitionsForAgent(supabase:SupabaseClient,organizationId:string,agentId?:string|null){
  const enabled=await getEnabledCapabilities(supabase,organizationId)
  const definitions:Array<{name:string,description:string,input_schema:Record<string,unknown>}>=[]

  for(const name of TOOL_NAMES){
    const policy=getToolPolicy(name)
    if(!policy) continue
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
      case 'request_human_handoff': result=await toolHandoff(ctx,rawArgs); break
    }
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
