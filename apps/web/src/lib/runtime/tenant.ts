import type { DbClient } from '@/lib/db/client'

export async function resolveChannelExact(db:DbClient,input:{channelType:string;providerAccountId?:string|null;externalIdentifier?:string|null}){
  const providerAccountId=input.providerAccountId?.trim() || null
  const externalIdentifier=input.externalIdentifier?.trim() || null
  if(!providerAccountId && !externalIdentifier) return null
  let query=db.from('channels')
    .select('id,organization_id,business_id,channel_type,provider_account_id,external_identifier')
    .eq('channel_type',input.channelType).eq('is_active',true).eq('verification_status','verified')
  query=providerAccountId ? query.eq('provider_account_id',providerAccountId) : query.eq('external_identifier',externalIdentifier)
  const {data,error}=await query.maybeSingle()
  if(error) return null
  if(!data?.business_id) return null
  return {
    id:data.id,organizationId:data.organization_id,businessId:data.business_id,
    channelType:data.channel_type,providerAccountId:data.provider_account_id,externalIdentifier:data.external_identifier,
  }
}

export async function resolveBusinessAgent(db:DbClient,businessId:string){
  // Check if business profile is active (Go-live gate)
  const {data: profile} = await db.from('business_profiles')
    .select('activation_state')
    .eq('business_id', businessId)
    .single()
    
  if (profile?.activation_state !== 'active') {
    console.warn(`Business ${businessId} is not active. Agent execution blocked.`)
    return null
  }

  const {data,error}=await db.from('ai_agents')
    .select('id,organization_id,business_id,name,model_provider,temperature,locale,status')
    .eq('business_id',businessId).eq('status','active').order('created_at').limit(1).maybeSingle()
  if(error) throw new Error(error.message)
  return data ?? null
}
