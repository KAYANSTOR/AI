'use client'
import { useEffect,useState } from 'react'
import { MessageCircle,Loader2 } from 'lucide-react'
import { beginMessengerConnectionAction,createMessengerOAuthStateAction } from '@/app/dashboard/channels/actions'
import type { FacebookLoginResponse,FacebookSdk } from '@/components/channels/whatsapp-embedded-signup'
declare global{interface Window{FB?:FacebookSdk;fbAsyncInit?:()=>void;__kayanMetaSdkAppId?:string}}
type Page={id:string;name:string}
export function MessengerConnectButton({disabled,onPages,onError}:{disabled?:boolean;onPages:(pages:Page[])=>void;onError:(message:string)=>void}){
 const appId=process.env.NEXT_PUBLIC_META_APP_ID?.trim()??''
 const [ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 useEffect(()=>{
  let mounted=true,script:HTMLScriptElement|null=null
  const initialize=()=>{
   if(!mounted||!window.FB||!appId)return
   if(window.__kayanMetaSdkAppId!==appId){window.FB.init({appId,cookie:true,xfbml:false,version:'v27.0'});window.__kayanMetaSdkAppId=appId}
   setReady(true);setError(null)
  }
  if(!appId){
   // Surface a configuration error once the external SDK effect mounts.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   setError('معرّف تطبيق Meta غير مضبوط على المنصة.');return()=>{mounted=false}
  }
  window.fbAsyncInit=initialize
  if(window.FB)queueMicrotask(initialize)
  else{
   const existing=document.getElementById('facebook-jssdk') as HTMLScriptElement|null;script=existing
   if(existing)existing.addEventListener('load',initialize,{once:true})
   else{script=document.createElement('script');script.id='facebook-jssdk';script.src='https://connect.facebook.net/en_US/sdk.js'
    script.async=true;script.defer=true;script.onload=initialize
    script.onerror=()=>{if(mounted)setError('تعذّر تحميل خدمة تسجيل الدخول من Meta.')}
    document.head.appendChild(script)}
  }
  return()=>{mounted=false;if(script)script.removeEventListener('load',initialize);if(window.fbAsyncInit===initialize)delete window.fbAsyncInit}
 },[appId])
 async function launch(){
  if(disabled||busy)return
  const fb=window.FB
  if(!fb||!ready){onError(error??'خدمة Meta لم تجهز بعد. أعد المحاولة.');return}
  setBusy(true)
  try{
   const state=await createMessengerOAuthStateAction()
   if(!state.ok){setBusy(false);onError(state.error);return}
   fb.login(async(response:FacebookLoginResponse)=>{
    const accessToken=response.authResponse?.accessToken?.trim()
    if(!accessToken){setBusy(false);onError(response.error?.message?'رفضت Meta التفويض: '+response.error.message:'لم يمنح Facebook رمز وصول. وافق على صلاحيات الصفحات والرسائل ثم أعد المحاولة.');return}
    try{
     const result=await beginMessengerConnectionAction({accessToken,state:state.state});setBusy(false)
     if(!result.ok){onError(result.error??'تعذّر تفويض صفحات Facebook.');return}
     if(!result.pages.length){onError('لم نجد صفحة تملك صلاحية إدارة الرسائل عليها.');return}
     onPages(result.pages)
    }catch(e){setBusy(false);console.error('Messenger OAuth failed',e);onError('تعذّر إكمال تفويض Facebook.')}
   },{scope:'pages_show_list,pages_messaging,pages_manage_metadata',auth_type:'rerequest'})
  }catch(e){setBusy(false);console.error('Messenger login launch failed',e);onError('تعذّر بدء تسجيل الدخول إلى Facebook.')}
 }
 return <div className="space-y-2">
  <button type="button" onClick={launch} disabled={disabled||busy||!ready}
   className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0866FF] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
   {busy||(!ready&&!error)?<Loader2 size={18} className="animate-spin"/>:<MessageCircle size={18}/>}
   {busy?'جارٍ تفويض حساب فيسبوك…':'ربط صفحة Facebook'}
  </button>
  {error?<p role="status" className="text-xs text-error">{error}</p>:null}
 </div>
}
