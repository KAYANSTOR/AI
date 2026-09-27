import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveChannelExact(supabase:SupabaseClient,input:{channelType:string;providerAccountId?:string|null;externalIdentifier?:string|null}){
  const providerAccountId=input.providerAccountId?.trim() || null
  const externalIdentifier=input.externalIdentifier?.trim() || null
  if(!providerAccountId && !externalIdentifier) return null
  let query=supabase.from('channels')
    .select('id,organization_id,business_id,channel_type,provider_account_id,external_identifier')
    .eq('channel_type',input.channelType).eq('is_active',true)
  query=providerAccountId ? query.eq('provider_account_id',providerAccountId) : query.eq('external_identifier',externalIdentifier)
  const {data,error}=await query.maybeSingle()
  if(error) throw new Error(error.message)
  if(!data?.business_id) return null
  return {
    id:data.id,organizationId:data.organization_id,businessId:data.business_id,
    channelType:data.channel_type,providerAccountId:data.provider_account_id,externalIdentifier:data.external_identifier,
  }
}

export async function resolveBusinessAgent(supabase:SupabaseClient,businessId:string){
  const {data,error}=await supabase.from('ai_agents')
    .select('id,organization_id,business_id,name,model_provider,temperature,locale,status')
    .eq('business_id',businessId).eq('status','active').order('created_at').limit(1).maybeSingle()
  if(error) throw new Error(error.message)
  return data ?? null
}

