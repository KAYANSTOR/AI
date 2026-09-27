export async function sendTwilioSms(args:{to:string;body:string;from:string;messagingServiceSid?:string|null}){
  const accountSid=process.env.TWILIO_ACCOUNT_SID
  const authToken=process.env.TWILIO_AUTH_TOKEN
  if(!accountSid || !authToken) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required')

  const form=new URLSearchParams()
  form.set('To',args.to);form.set('Body',args.body)
  if(args.messagingServiceSid) form.set('MessagingServiceSid',args.messagingServiceSid)
  else form.set('From',args.from)

  const response=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(accountSid)+'/Messages.json',{
    method:'POST',
    headers:{
      Authorization:'Basic '+Buffer.from(accountSid+':'+authToken).toString('base64'),
      'Content-Type':'application/x-www-form-urlencoded',
    },
    body:form.toString(),
  })
  if(!response.ok) throw new Error('Twilio SMS send failed: HTTP '+response.status)
}
