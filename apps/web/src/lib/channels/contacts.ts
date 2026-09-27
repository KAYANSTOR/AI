import type { SupabaseClient } from '@supabase/supabase-js'

export type ResolvedContact={contactId:string;organizationId:string;fullName:string|null;phone:string|null;isNew:boolean}

export async function resolveContactIdentity(supabase:SupabaseClient,organizationId:string,input:{
  channel:string;externalUserId?:string|null;externalUsername?:string|null;phone?:string|null;displayName?:string|null
}):Promise<ResolvedContact>{
  const normalizedPhone=input.phone ? normalizePhone(input.phone) : null
  const externalUserId=input.externalUserId?.trim() || null

  if(externalUserId){
    const {data,error}=await supabase.from('contact_identities')
      .select('contact_id,contacts!inner(id,full_name,phone,organization_id)')
      .eq('channel',input.channel).eq('external_user_id',externalUserId).maybeSingle()
    if(error) throw new Error(error.message)
    const contact=data?.contacts as unknown as {id:string;full_name:string|null;phone:string|null;organization_id:string}|null
    if(contact?.organization_id===organizationId){
      return {contactId:contact.id,organizationId,fullName:contact.full_name,phone:contact.phone,isNew:false}
    }
  }

  if(normalizedPhone){
    const {data,error}=await supabase.from('contacts').select('id,full_name,phone,organization_id').eq('organization_id',organizationId).eq('phone',normalizedPhone).maybeSingle()
    if(error) throw new Error(error.message)
    if(data){
      const identity={
        contact_id:data.id,channel:input.channel,external_user_id:externalUserId,
        external_username:input.externalUsername ?? null,external_phone:normalizedPhone,
      }
      const {error:identityError}=await supabase.from('contact_identities').upsert(identity,{onConflict:'contact_id,channel,external_user_id'})
      if(identityError && identityError.code!=='23505') throw new Error(identityError.message)
      return {contactId:data.id,organizationId,fullName:data.full_name,phone:data.phone,isNew:false}
    }
  }

  const {data:created,error}=await supabase.from('contacts').insert({
    organization_id:organizationId,phone:normalizedPhone,full_name:input.displayName?.trim() || input.externalUsername?.trim() || null,
  }).select('id,full_name,phone').single()
  if(error || !created) throw new Error(error?.message ?? 'Failed to create contact')

  const {error:identityError}=await supabase.from('contact_identities').insert({
    contact_id:created.id,channel:input.channel,external_user_id:externalUserId,
    external_username:input.externalUsername ?? null,external_phone:normalizedPhone,
  })
  if(identityError && identityError.code!=='23505') throw new Error(identityError.message)

  return {contactId:created.id,organizationId,fullName:created.full_name,phone:created.phone,isNew:true}
}

export async function resolveContactByPhone(supabase:SupabaseClient,organizationId:string,phone:string,displayName?:string|null){
  return resolveContactIdentity(supabase,organizationId,{channel:'phone',phone,displayName,externalUserId:normalizePhone(phone)})
}

export function normalizePhone(phone:string){
  const digits=phone.replace(/[^\d+]/g,'')
  if(digits.startsWith('+')) return digits
  if(digits.startsWith('00')) return '+'+digits.slice(2)
  return digits
}
