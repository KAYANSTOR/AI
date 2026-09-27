import type { SupabaseClient } from '@supabase/supabase-js'
import { buildBusinessSystemPrompt } from '@/lib/ai/prompt'
import { executeTool,getToolDefinitionsForAgent } from '@/lib/ai/tools'

type ModelBlock={type:'text';text:string}|{type:'tool_use';id:string;name:string;input:Record<string,unknown>}
type ModelMessage={role:'user'|'assistant';content:string|Record<string,unknown>[]}
type AnthropicResponse={content?:ModelBlock[];usage?:{input_tokens?:number;output_tokens?:number};error?:{message?:string}}

export async function runAgentTurn(args:{
  supabase:SupabaseClient;organizationId:string;businessId:string;conversationId:string;contactId:string;channel:string;userText:string;
  agentId?:string|null;serverActionResult?:unknown;
}){
  const apiKey=process.env.ANTHROPIC_API_KEY
  const model=process.env.ANTHROPIC_MODEL
  if(!apiKey || !model) throw new Error('ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required')

  const [{data:history,error:historyError},prompt,toolSet]=await Promise.all([
    args.supabase.from('messages').select('direction,content,created_at').eq('organization_id',args.organizationId).eq('conversation_id',args.conversationId).order('created_at',{ascending:false}).limit(20),
    buildBusinessSystemPrompt(args.supabase,args.organizationId,args.agentId),
    getToolDefinitionsForAgent(args.supabase,args.organizationId,args.agentId),
  ])
  if(historyError) throw new Error(historyError.message)

  const messages:ModelMessage[]=(history ?? []).reverse().filter(row=>Boolean(row.content)).map(row=>({
    role:row.direction==='inbound'?'user':'assistant',content:String(row.content),
  }))
  if(messages.at(-1)?.role!=='user') messages.push({role:'user',content:args.userText})
  if(args.serverActionResult!==undefined) messages.push({role:'user',content:'Trusted server action result:\n'+JSON.stringify(args.serverActionResult)})

  const agent=args.agentId ? {id:args.agentId} : (await args.supabase.from('ai_agents').select('id').eq('business_id',args.businessId).eq('status','active').order('created_at').limit(1).maybeSingle()).data
  const promptVersion=agent?.id ? (await args.supabase.from('agent_prompt_versions').select('id').eq('agent_id',agent.id).eq('status','published').maybeSingle()).data : null

  const run=await args.supabase.from('agent_runs').insert({
    organization_id:args.organizationId,business_id:args.businessId,agent_id:agent?.id ?? null,conversation_id:args.conversationId,
    channel:args.channel,model_provider:'anthropic',model,prompt_version_id:promptVersion?.id ?? null,status:'running',
  }).select('id').single()
  if(run.error || !run.data) throw new Error(run.error?.message ?? 'Unable to start agent run')

  const runId=run.data.id
  const started=Date.now()
  let inputTokens=0,outputTokens=0
  try{
    for(let round=0;round<5;round+=1){
      const response=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Type':'application/json'},
        body:JSON.stringify({model,max_tokens:700,temperature:0.2,system:prompt,messages,tools:toolSet}),
      })
      const payload=await response.json() as AnthropicResponse
      if(!response.ok) throw new Error(payload.error?.message ?? 'Anthropic request failed: HTTP '+response.status)
      inputTokens+=Number(payload.usage?.input_tokens ?? 0);outputTokens+=Number(payload.usage?.output_tokens ?? 0)

      const textParts=(payload.content ?? []).filter((b):b is {type:'text';text:string}=>b.type==='text').map(b=>b.text)
      const toolBlocks=(payload.content ?? []).filter((b):b is {type:'tool_use';id:string;name:string;input:Record<string,unknown>}=>b.type==='tool_use')
      if(!toolBlocks.length){
        const reply=textParts.join('\n').trim()
        if(!reply) throw new Error('Model returned an empty response')
        await args.supabase.from('agent_runs').update({status:'completed',input_tokens:inputTokens,output_tokens:outputTokens,latency_ms:Date.now()-started,completed_at:new Date().toISOString()}).eq('id',runId)
        await args.supabase.from('usage_ledger').insert({
          organization_id:args.organizationId,business_id:args.businessId,event_type:'ai_tokens',units:inputTokens+outputTokens,
          reference_type:'agent_run',reference_id:runId,metadata:{input_tokens:inputTokens,output_tokens:outputTokens,model},
        })
        return reply
      }

      messages.push({role:'assistant',content:payload.content as unknown as Record<string,unknown>[]})
      const results:Record<string,unknown>[]=[]
      for(const tool of toolBlocks){
        const result=await executeTool(tool.name,tool.input,{
          organizationId:args.organizationId,businessId:args.businessId,conversationId:args.conversationId,contactId:args.contactId,supabase:args.supabase,agentId:agent?.id ?? null,
        })
        results.push({type:'tool_result',tool_use_id:tool.id,content:JSON.stringify(result.ok ? result.result : {error:result.error})})
      }
      messages.push({role:'user',content:results})
    }
    throw new Error('Agent tool loop exceeded maximum rounds')
  }catch(error){
    await args.supabase.from('agent_runs').update({
      status:'failed',input_tokens:inputTokens,output_tokens:outputTokens,latency_ms:Date.now()-started,
      error_code:error instanceof Error ? error.message.slice(0,120) : 'agent_error',completed_at:new Date().toISOString(),
    }).eq('id',runId)
    if(inputTokens+outputTokens>0) await args.supabase.from('usage_ledger').insert({
      organization_id:args.organizationId,business_id:args.businessId,event_type:'ai_tokens',units:inputTokens+outputTokens,
      reference_type:'agent_run',reference_id:runId,metadata:{input_tokens:inputTokens,output_tokens:outputTokens,model,failed:true},
    })
    throw error
  }
}
