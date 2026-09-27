import type { SupabaseClient } from '@supabase/supabase-js'

export async function enqueueOutbound(args:{
  supabase:SupabaseClient;organizationId:string;businessId:string|null;channelId:string;
  eventType:string;idempotencyKey:string;recipient:string;payload:Record<string,unknown>
}){
  const {data,error}=await args.supabase.from('outbox_events').insert({
    organization_id:args.organizationId,business_id:args.businessId,channel_id:args.channelId,event_type:args.eventType,
    idempotency_key:args.idempotencyKey,recipient:args.recipient,payload:args.payload,status:'pending',
  }).select('id').single()
  if(error){
    if(error.code==='23505') return ''
    throw new Error(error.message)
  }
  return data.id as string
}
