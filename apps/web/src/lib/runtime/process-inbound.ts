import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveContactIdentity } from '@/lib/channels/contacts'
import { checkEligibility } from '@/lib/channels/eligibility'
import { runAgentTurn } from '@/lib/runtime/agent-runtime'
import { getPendingAction,isAffirmative,isNegative,markPendingAction } from '@/lib/runtime/pending'
import { resolveBusinessAgent } from '@/lib/runtime/tenant'
import { executeTool } from '@/lib/ai/tools'

export async function processInboundMessage(supabase:SupabaseClient,input:{
  organizationId:string;businessId:string;channelId:string;channelType:'sms'|'whatsapp'|'instagram'|'phone'|'website';
  provider:string;externalEventId:string;externalUserId?:string|null;senderPhone?:string|null;senderUsername?:string|null;
  displayName?:string|null;text:string;
}):Promise<{reply:string|null;conversationId:string;contactId:string}>{
  const contact=await resolveContactIdentity(supabase,input.organizationId,{
    channel:input.channelType,externalUserId:input.externalUserId,externalUsername:input.senderUsername,
    phone:input.senderPhone,displayName:input.displayName,
  })

  const existing=await supabase.from('conversations').select('id,business_id,ai_enabled,status')
    .eq('organization_id',input.organizationId).eq('contact_id',contact.contactId).eq('channel_id',input.channelId)
    .eq('status','active').maybeSingle()
  if(existing.error) throw new Error(existing.error.message)

  let conversationId=existing.data?.id ?? ''
  if(!conversationId){
    const created=await supabase.from('conversations').insert({
      organization_id:input.organizationId,business_id:input.businessId,contact_id:contact.contactId,channel_id:input.channelId,
      status:'active',state:'discovery',ai_enabled:true,last_message_at:new Date().toISOString(),last_inbound_at:new Date().toISOString(),
    }).select('id').single()
    if(created.error){
      if(created.error.code==='23505'){
        const retry=await supabase.from('conversations').select('id').eq('organization_id',input.organizationId)
          .eq('contact_id',contact.contactId).eq('channel_id',input.channelId).eq('status','active').maybeSingle()
        if(retry.error || !retry.data) throw new Error(retry.error?.message ?? 'conversation_create_race')
        conversationId=retry.data.id
      }else throw new Error(created.error.message)
    }else if(created.data) conversationId=created.data.id
  }

  const stored=await supabase.from('messages').insert({
    organization_id:input.organizationId,conversation_id:conversationId,direction:'inbound',message_type:'text',
    content:input.text,external_message_id:input.externalEventId,
  })
  if(stored.error && stored.error.code!=='23505') throw new Error(stored.error.message)

  await supabase.from('conversations').update({last_message_at:new Date().toISOString(),last_inbound_at:new Date().toISOString()}).eq('id',conversationId)

  const current=await supabase.from('conversations').select('ai_enabled,status').eq('id',conversationId).maybeSingle()
  if(current.data?.ai_enabled===false || current.data?.status==='handed_off') return {reply:null,conversationId,contactId:contact.contactId}

  let serverActionResult:unknown
  const pending=await getPendingAction(supabase,conversationId)
  if(pending && isNegative(input.text)){
    await markPendingAction(supabase,pending.id,'cancelled')
    await supabase.from('conversations').update({state:'waiting_customer'}).eq('id',conversationId)
    return {reply:'تم إلغاء العملية. أخبرني عندما تريد المتابعة.',conversationId,contactId:contact.contactId}
  }

  if(pending && isAffirmative(input.text)){
    await markPendingAction(supabase,pending.id,'confirmed')
    const agent=await resolveBusinessAgent(supabase,input.businessId)
    const actionResult=await executeTool(pending.tool_name,pending.arguments,{
      organizationId:input.organizationId,businessId:input.businessId,conversationId,contactId:contact.contactId,supabase,agentId:agent?.id ?? null,
    },{confirmed:true})
    serverActionResult=actionResult.ok ? actionResult.result : {error:actionResult.error}
    await markPendingAction(supabase,pending.id,actionResult.ok?'executed':'failed',serverActionResult)
    await supabase.from('conversations').update({state:actionResult.ok?'completed':'action_pending'}).eq('id',conversationId)
  }

  const agent=await resolveBusinessAgent(supabase,input.businessId)
  if(!agent) return {reply:null,conversationId,contactId:contact.contactId}
  const eligibility=checkEligibility({channel:input.channelType,lastInboundAt:new Date().toISOString()})
  if(!eligibility.allowed) return {reply:null,conversationId,contactId:contact.contactId}
  if(eligibility.mode==='template_only' && input.channelType!=='sms') return {reply:null,conversationId,contactId:contact.contactId}

  const reply=await runAgentTurn({
    supabase,organizationId:input.organizationId,businessId:input.businessId,conversationId,
    contactId:contact.contactId,channel:input.channelType,userText:input.text,agentId:agent.id,serverActionResult,
  })
  if(!reply) return {reply:null,conversationId,contactId:contact.contactId}

  const outbound=await supabase.from('messages').insert({
    organization_id:input.organizationId,conversation_id:conversationId,direction:'outbound',message_type:'text',content:reply,
  })
  if(outbound.error) throw new Error(outbound.error.message)
  await supabase.from('conversations').update({
    last_message_at:new Date().toISOString(),last_outbound_at:new Date().toISOString(),state:serverActionResult?'completed':'waiting_customer',
  }).eq('id',conversationId)
  return {reply,conversationId,contactId:contact.contactId}
}
