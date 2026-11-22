import { getMetaGraphBaseUrl } from '@/lib/channels/embedded-signup'
type GraphError={error?:{code?:number;message?:string;type?:string}}
type GraphResult<T>=T&GraphError
const GRAPH_VERSION='v27.0'
export type MessengerPage={id:string;name:string;access_token:string;tasks:string[]}
function baseUrl(){return getMetaGraphBaseUrl().replace(/\/v\d+\.\d+$/i,'/'+GRAPH_VERSION)}
function env(name:string){const value=process.env[name]?.trim();if(!value)throw new Error('messenger_config_missing_'+name.toLowerCase());return value}
export function messengerWebhookVerifyToken(){return process.env.META_MESSENGER_VERIFY_TOKEN?.trim()||process.env.WHATSAPP_VERIFY_TOKEN?.trim()||''}
export function messengerWebhookUrl(){
 const domain=process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
 const configured=domain?(domain.includes('://')?domain:'https://'+domain):(process.env.NEXT_PUBLIC_APP_URL?.trim()||process.env.NEXT_PUBLIC_SITE_URL?.trim())
 if(!configured)throw new Error('messenger_public_url_missing')
 const url=new URL(configured)
 if(url.protocol!=='https:'&&url.hostname!=='localhost')throw new Error('messenger_https_required')
 return new URL('/api/messenger/webhook',url.origin).toString()
}
async function graph<T>(path:string,options:{method?:'GET'|'POST';token?:string;body?:URLSearchParams|Record<string,unknown>}={}):Promise<T>{
 const url=new URL(baseUrl()+'/'+path.replace(/^\/+/,''))
 if(options.token)url.searchParams.set('access_token',options.token)
 const form=options.body instanceof URLSearchParams
 const response=await fetch(url.toString(),{method:options.method??'GET',
  headers:options.body?{'content-type':form?'application/x-www-form-urlencoded':'application/json'}:undefined,
  body:options.body?(form?options.body.toString():JSON.stringify(options.body)):undefined,
  cache:'no-store',signal:AbortSignal.timeout(15000)})
 const body=await response.json().catch(()=>null) as GraphResult<T>|null
 if(!response.ok||!body||body.error)throw new Error('meta_graph_error_'+(body?.error?.code??response.status))
 return body
}
export async function exchangeMessengerCode(code:string,redirectUri:string):Promise<string>{
 const appId=env('NEXT_PUBLIC_META_APP_ID'),appSecret=env('META_APP_SECRET')
 const url=new URL(baseUrl()+'/oauth/access_token')
 url.searchParams.set('client_id',appId);url.searchParams.set('client_secret',appSecret)
 url.searchParams.set('code',code);url.searchParams.set('redirect_uri',redirectUri)
 const response=await fetch(url.toString(),{cache:'no-store',signal:AbortSignal.timeout(15000)})
 const short=await response.json().catch(()=>null) as {access_token?:string;error?:{code?:number}}|null
 if(!response.ok||!short?.access_token)throw new Error('messenger_code_exchange_failed_'+(short?.error?.code??response.status))
 const longUrl=new URL(baseUrl()+'/oauth/access_token')
 longUrl.searchParams.set('grant_type','fb_exchange_token');longUrl.searchParams.set('client_id',appId)
 longUrl.searchParams.set('client_secret',appSecret);longUrl.searchParams.set('fb_exchange_token',short.access_token)
 const longResponse=await fetch(longUrl.toString(),{cache:'no-store',signal:AbortSignal.timeout(15000)})
 const long=await longResponse.json().catch(()=>null) as {access_token?:string;error?:{code?:number}}|null
 if(!longResponse.ok||!long?.access_token)throw new Error('messenger_long_token_exchange_failed_'+(long?.error?.code??longResponse.status))
 return long.access_token
}
export async function verifyMessengerPermissions(token:string){
 const result=await graph<{data?:Array<{permission?:string;status?:string}>}>('me/permissions',{token})
 const granted=new Set((result.data??[]).filter(x=>x.status==='granted').map(x=>x.permission))
 const required=['pages_show_list','pages_messaging','pages_manage_metadata']
 const missing=required.filter(x=>!granted.has(x))
 if(missing.length)throw new Error('messenger_permissions_missing_'+missing.join('_'))
}
export function canManageMessengerPage(tasks:string[]){
 const values=new Set(tasks.map(x=>x.toUpperCase()))
 return values.has('MESSAGING')&&(values.has('MANAGE')||values.has('MODERATE')||values.has('CREATE_CONTENT'))
}
export async function listMessengerPages(token:string){
 const result=await graph<{data?:MessengerPage[]}>('me/accounts?fields=id,name,access_token,tasks&limit=100',{token})
 return(result.data??[]).filter(x=>Boolean(x.id&&x.name&&x.access_token)&&canManageMessengerPage(x.tasks??[]))
}
export async function getMessengerPage(token:string,id:string){
 const page=await graph<MessengerPage>(encodeURIComponent(id)+'?fields=id,name,access_token,tasks',{token})
 if(page.id!==id||!page.access_token||!canManageMessengerPage(page.tasks??[]))throw new Error('messenger_page_access_denied')
 return page
}
export async function ensureMessengerAppWebhook(){
 const appId=env('NEXT_PUBLIC_META_APP_ID'),appSecret=env('META_APP_SECRET')
 const verify=messengerWebhookVerifyToken();if(!verify)throw new Error('messenger_verify_token_missing')
 const callback=messengerWebhookUrl(),appToken=appId+'|'+appSecret
 const read=await graph<{data?:Array<{object?:string;callback_url?:string;active?:boolean;fields?:Array<string|{name?:string}>}>}>(encodeURIComponent(appId)+'/subscriptions',{token:appToken})
 const current=(read.data??[]).find(x=>x.object==='page')
 if(current?.callback_url&&current.callback_url!==callback)throw new Error('messenger_webhook_callback_conflict')
 const existing=(current?.fields??[]).map(x=>typeof x==='string'?x:String(x.name??'')).filter(Boolean)
 const required=['messages','messaging_postbacks']
 if(!current?.active||current.callback_url!==callback||required.some(x=>!existing.includes(x))){
  const form=new URLSearchParams();form.set('object','page');form.set('callback_url',callback)
  form.set('verify_token',verify);form.set('fields',Array.from(new Set([...existing,...required])).join(','))
  await graph<{success?:boolean}>(encodeURIComponent(appId)+'/subscriptions',{method:'POST',token:appToken,body:form})
 }
 const check=await graph<{data?:Array<{object?:string;callback_url?:string;active?:boolean;fields?:Array<string|{name?:string}>}>}>(encodeURIComponent(appId)+'/subscriptions',{token:appToken})
 const saved=(check.data??[]).find(x=>x.object==='page')
 const savedFields=(saved?.fields??[]).map(x=>typeof x==='string'?x:String(x.name??''))
 if(!saved?.active||saved.callback_url!==callback||!required.every(x=>savedFields.includes(x)))throw new Error('messenger_app_webhook_not_verified')
 return{callbackUrl:callback}
}
export async function subscribeMessengerPage(id:string,token:string){
 const form=new URLSearchParams();form.set('subscribed_fields','messages,messaging_postbacks')
 await graph<{success?:boolean}>(encodeURIComponent(id)+'/subscribed_apps',{method:'POST',token,body:form})
}
export async function verifyMessengerPage(id:string,token:string){
 const [page,apps]=await Promise.all([
  graph<{id?:string}>(encodeURIComponent(id)+'?fields=id',{token}),
  graph<{data?:Array<{id?:string}>}>(encodeURIComponent(id)+'/subscribed_apps',{token})
 ])
 return{identityOk:page.id===id,subscriptionOk:(apps.data??[]).some(x=>x.id===env('NEXT_PUBLIC_META_APP_ID'))}
}
export async function sendMessengerText(input:{pageId:string;pageAccessToken:string;recipientPsid:string;text:string}){
 await graph(encodeURIComponent(input.pageId)+'/messages',{method:'POST',token:input.pageAccessToken,
  body:{recipient:{id:input.recipientPsid},message:{text:input.text},messaging_type:'RESPONSE'}})
}
