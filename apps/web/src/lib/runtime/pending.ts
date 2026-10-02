import type { SupabaseClient } from '@supabase/supabase-js'

function normalizeConfirmationText(text:string){
  return text.trim().toLocaleLowerCase('ar').replace(/[.!؟?،]+$/g,'').trim()
}
export async function getPendingAction(supabase:SupabaseClient,conversationId:string){
  const {data,error}=await supabase.from('pending_actions').select('id,tool_name,arguments,status,expires_at')
    .eq('conversation_id',conversationId).eq('status','pending').gt('expires_at',new Date().toISOString())
    .order('created_at',{ascending:false}).limit(1).maybeSingle()
  if(error) throw new Error(error.message)
  return data as {id:string;tool_name:string;arguments:Record<string,unknown>;status:string;expires_at:string}|null
}
export async function createPendingAction(args:{supabase:SupabaseClient;organizationId:string;businessId:string;conversationId:string;contactId:string;toolName:string;toolArguments:Record<string,unknown>}){
  const {data,error}=await args.supabase.from('pending_actions').insert({
    organization_id:args.organizationId,business_id:args.businessId,conversation_id:args.conversationId,
    contact_id:args.contactId,tool_name:args.toolName,arguments:args.toolArguments,status:'pending',
  }).select('id').single()
  if(error || !data) throw new Error(error?.message ?? 'Failed to create pending action')
  return data.id as string
}
export async function markPendingAction(supabase:SupabaseClient,actionId:string,status:'confirmed'|'cancelled'|'expired'|'executed'|'failed',result?:unknown,expectedStatus:'pending'|'confirmed'='pending'){
  const patch:Record<string,unknown>={status}
  if(status==='confirmed') patch.confirmed_at=new Date().toISOString()
  if(status==='executed') patch.executed_at=new Date().toISOString()
  if(result!==undefined) patch.result=result
  const {data,error}=await supabase.from('pending_actions').update(patch).eq('id',actionId).eq('status',expectedStatus).select('id').maybeSingle()
  if(error) throw new Error(error.message)
  return Boolean(data?.id)
}
export function isAffirmative(text:string){
  const v=normalizeConfirmationText(text)
  return ['نعم','نعم احجز','احجز','موافق','موافقة','تمام','أكيد','اي','أيوه','ايوه','نعم اريد','yes','yeah','yep','ok','okay','confirm','book it'].includes(v)
}
export function isNegative(text:string){
  const v=normalizeConfirmationText(text)
  return ['لا','الغاء','إلغاء','ليس الآن','لا احجز','no','cancel','stop','not now'].includes(v)
}
