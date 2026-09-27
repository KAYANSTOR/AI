export type ToolRisk='read'|'write'
export type ToolPolicy={
  name:string
  description:string
  capability:string|null
  risk:ToolRisk
  requiresConfirmation:boolean
  inputSchema:Record<string,unknown>
}
export const TOOL_POLICIES:Record<string,ToolPolicy>={
  get_customer:{name:'get_customer',description:'Look up a customer by phone number and return profile and upcoming appointments.',capability:'lead_capture',risk:'read',requiresConfirmation:false,inputSchema:{
    type:'object',properties:{phone:{type:'string'}},required:['phone'],additionalProperties:false,
  }},
  find_available_slots:{name:'find_available_slots',description:'Find available appointment slots for a service on a specific date.',capability:'appointments',risk:'read',requiresConfirmation:false,inputSchema:{
    type:'object',properties:{date:{type:'string',description:'YYYY-MM-DD'},service_name:{type:'string'},service_id:{type:'string'}},required:['date'],additionalProperties:false,
  }},
  create_appointment:{name:'create_appointment',description:'Create an appointment after explicit customer confirmation of the proposed slot.',capability:'appointments',risk:'write',requiresConfirmation:true,inputSchema:{
    type:'object',properties:{phone:{type:'string'},name:{type:'string'},service_id:{type:'string'},starts_at:{type:'string'}},required:['phone','service_id','starts_at'],additionalProperties:false,
  }},
  request_human_handoff:{name:'request_human_handoff',description:'Transfer the conversation to a human and pause AI automation.',capability:null,risk:'write',requiresConfirmation:false,inputSchema:{
    type:'object',properties:{reason:{type:'string'}},additionalProperties:false,
  }},
}
export function getToolPolicy(name:string){return TOOL_POLICIES[name] ?? null}
