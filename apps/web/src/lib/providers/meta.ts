function requireGraphBase(){
  const value=process.env.META_GRAPH_BASE_URL
  if(!value) throw new Error('META_GRAPH_BASE_URL is required')
  return value.replace(/\/+$/,'')
}

export async function sendWhatsAppText(phoneNumberId:string,to:string,body:string){
  const token=process.env.WHATSAPP_ACCESS_TOKEN
  if(!token) throw new Error('WHATSAPP_ACCESS_TOKEN is required')
  const response=await fetch(requireGraphBase()+'/'+encodeURIComponent(phoneNumberId)+'/messages',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body}}),
  })
  if(!response.ok) throw new Error('WhatsApp send failed: HTTP '+response.status)
}

export async function sendInstagramText(accountId:string,recipientId:string,body:string){
  const token=process.env.INSTAGRAM_ACCESS_TOKEN
  if(!token) throw new Error('INSTAGRAM_ACCESS_TOKEN is required')
  const response=await fetch(requireGraphBase()+'/'+encodeURIComponent(accountId)+'/messages',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({recipient:{id:recipientId},message:{text:body}}),
  })
  if(!response.ok) throw new Error('Instagram send failed: HTTP '+response.status)
}
