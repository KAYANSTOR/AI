import { NextRequest,NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { acquireWebhookEvent,markWebhookProcessed } from '@/lib/channels/idempotency'
import { resolveChannelExact } from '@/lib/runtime/tenant'
import { processInboundMessage,recordInboundMediaMessage } from '@/lib/runtime/process-inbound'
import { deliverOutbound,recordDeliveredOutboundMessage } from '@/lib/runtime/outbound'
import { stablePayloadEventId,verifyMetaSignature } from '@/lib/runtime/security'
import { messengerWebhookVerifyToken } from '@/lib/providers/messenger'
import { fromMetaMessaging } from '@/lib/media/attachment'
import { handleInboundMedia } from '@/lib/media/pipeline'
import { downloaderForChannel } from '@/lib/media/channel-downloader'
export const runtime='nodejs'
export const dynamic='force-dynamic'
type Attachment={type?:string;payload?:{url?:string}}
type Event={sender?:{id?:string};message?:{mid?:string;text?:string;is_echo?:boolean;attachments?:Attachment[]};postback?:{title?:string;payload?:string}}
type Payload={object?:string;entry?:Array<{id?:string;messaging?:Event[]}>}
export async function GET(req:NextRequest){
 const mode=req.nextUrl.searchParams.get('hub.mode'),token=req.nextUrl.searchParams.get('hub.verify_token')??''
 const challenge=req.nextUrl.searchParams.get('hub.challenge'),expected=messengerWebhookVerifyToken()
 if(mode==='subscribe'&&expected&&token===expected&&challenge)return new NextResponse(challenge,{status:200})
 return NextResponse.json({error:'Forbidden'},{status:403})
}
export async function POST(req:NextRequest){
 let db:ReturnType<typeof createAdminClient>|null=null,activeEventId:string|null=null
 try{
  const raw=Buffer.from(await req.arrayBuffer())
  if(!verifyMetaSignature(raw,req.headers))return NextResponse.json({error:'invalid_webhook_signature'},{status:401})
  const payload=JSON.parse(raw.toString('utf8')) as Payload
  if(payload.object!=='page'||!Array.isArray(payload.entry))return NextResponse.json({ok:true,ignored:true})
  db=createAdminClient()
  for(const entry of payload.entry){
   const pageId=String(entry.id??'').trim();if(!pageId)continue
   const channel=await resolveChannelExact(db,{channelType:'messenger',providerAccountId:pageId});if(!channel)continue
   for(const event of entry.messaging??[]){
    const sender=String(event.sender?.id??'').trim()
    if(!sender||sender===pageId||event.message?.is_echo)continue
    const text=(event.message?.text??event.postback?.title??'').trim()
    const eventId=event.message?.mid?'messenger:'+pageId+':'+event.message.mid:stablePayloadEventId('messenger:'+pageId,event)
    const claim=await acquireWebhookEvent(db,'messenger',eventId,event)
    if(claim.status==='duplicate')continue
    if(claim.status==='error')throw new Error('messenger_event_claim_failed')
    activeEventId=claim.eventRowId
    await db.from('webhook_events').update({organization_id:channel.organizationId,channel_id:channel.id,
     event_type:event.postback?'message.postback':'message.received',signature_verified:true}).eq('id',activeEventId)
    const identity={organizationId:channel.organizationId,businessId:channel.businessId,
     channelId:channel.id,channelType:'messenger' as const,provider:'messenger',externalEventId:eventId,
     externalUserId:sender,displayName:null}
    const outboundChannel={id:channel.id,organizationId:channel.organizationId,businessId:channel.businessId,
     channelType:'messenger',providerAccountId:channel.providerAccountId,externalIdentifier:channel.externalIdentifier}
    const attachment=event.message?.attachments?.[0]
    const media=text?null:fromMetaMessaging('messenger',attachment)
    let result:{reply:string|null;conversationId:string}|null=null
    if(text)result=await processInboundMessage(db,{...identity,text})
    else if(media)result=await handleInboundMedia(db,{...identity,attachment:media},{download:downloaderForChannel(db,outboundChannel)})
    else if(attachment?.type&&attachment.payload?.url){
     const kind=attachment.type.toLowerCase(),messageType=kind==='video'?'video':'file'
     await recordInboundMediaMessage(db,{...identity,messageType,content:attachment.payload.url})
    }
    if(result?.reply){
     const delivery=await deliverOutbound(db,{channel:outboundChannel,
      recipient:sender,body:result.reply,idempotencyKey:eventId+':reply',conversationId:result.conversationId})
     if(delivery==='sent')await recordDeliveredOutboundMessage(db,{organizationId:channel.organizationId,
      conversationId:result.conversationId,body:result.reply,idempotencyKey:eventId+':reply'})
    }
    await markWebhookProcessed(db,activeEventId,'processed');activeEventId=null
   }
  }
  return NextResponse.json({ok:true})
 }catch(error){
  const reason=error instanceof Error?error.message:'messenger_webhook_error'
  if(db&&activeEventId)await markWebhookProcessed(db,activeEventId,'failed',reason)
  console.error('Messenger webhook processing failed',{reason})
  return NextResponse.json({error:'webhook_processing_failed'},{status:500})
 }
}
