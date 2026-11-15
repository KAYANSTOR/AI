import type { WorkflowDefinition } from '@/lib/workflows/engine'

export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  triggerType: string
  definition: WorkflowDefinition
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'lead-won-notify',
    name: 'إشعار عند فوز عميل محتمل',
    description: 'عند lead.won يُرسل إشعار للفريق ثم يتوقف.',
    triggerType: 'lead.won',
    definition: {
      nodes: [
        { id: 't', type: 'trigger', next: 'n' },
        {
          id: 'n',
          type: 'notify',
          config: {
            type: 'workflow',
            title: 'عميل محتمل فاز',
            body: 'تم تحويل عميل محتمل إلى فوز — راجع التفاصيل.',
          },
          next: 's',
        },
        { id: 's', type: 'stop' },
      ],
    },
  },
  {
    id: 'lead-lost-followup',
    name: 'متابعة بعد خسارة',
    description: 'عند lead.lost ينتظر يومًا ثم يُشعر الفريق.',
    triggerType: 'lead.lost',
    definition: {
      nodes: [
        { id: 't', type: 'trigger', next: 'w' },
        { id: 'w', type: 'wait', config: { minutes: 1440 }, next: 'n' },
        {
          id: 'n',
          type: 'notify',
          config: {
            type: 'workflow',
            title: 'مراجعة عميل خاسر',
            body: 'مرّ يوم على خسارة العميل — هل تريد إعادة تواصل؟',
          },
          next: 's',
        },
        { id: 's', type: 'stop' },
      ],
    },
  },
  {
    id: 'conversation-handoff',
    name: 'تسجيل تسليم محادثة',
    description: 'عند conversation.handoff يُشعر الفريق.',
    triggerType: 'conversation.handoff',
    definition: {
      nodes: [
        { id: 't', type: 'trigger', next: 'n' },
        {
          id: 'n',
          type: 'notify',
          config: {
            type: 'handoff',
            title: 'تسليم محادثة',
            body: 'محادثة تم تسليمها للعنصر البشري.',
          },
          next: 's',
        },
        { id: 's', type: 'stop' },
      ],
    },
  },
  {
    id: 'appointment-no-show',
    name: 'عدم حضور الموعد',
    description: 'عند appointment.no_show إشعار فوري للفريق.',
    triggerType: 'appointment.no_show',
    definition: {
      nodes: [
        { id: 't', type: 'trigger', next: 'n' },
        {
          id: 'n',
          type: 'notify',
          config: {
            type: 'high_priority',
            title: 'عدم حضور',
            body: 'عميل لم يحضر الموعد — فكّر في متابعة.',
          },
          next: 's',
        },
        { id: 's', type: 'stop' },
      ],
    },
  },
]

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id)
}
