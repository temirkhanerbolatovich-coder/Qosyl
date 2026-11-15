import type { z } from 'zod';
import type { applicationStatusSchema, projectStatusSchema } from '@/contracts/api-entities';

type Status = z.infer<typeof projectStatusSchema> | z.infer<typeof applicationStatusSchema>;
type StatusDisplay = {
  tone: 'neutral' | 'info' | 'progress' | 'success' | 'attention';
  icon:
    | 'FileText'
    | 'PauseCircle'
    | 'CircleSlash'
    | 'Clock3'
    | 'Loader'
    | 'Send'
    | 'CheckCircle2'
    | 'AlertTriangle'
    | 'ShieldAlert';
  severity?: 'warning' | 'error';
};

export const statusDisplay = {
  draft: { tone: 'neutral', icon: 'FileText' },
  paused: { tone: 'neutral', icon: 'PauseCircle' },
  cancelled: { tone: 'neutral', icon: 'CircleSlash' },
  expired: { tone: 'neutral', icon: 'CircleSlash' },
  withdrawn: { tone: 'neutral', icon: 'CircleSlash' },
  not_selected: { tone: 'neutral', icon: 'CircleSlash' },
  pending_moderation: { tone: 'info', icon: 'Clock3' },
  assigned: { tone: 'info', icon: 'Clock3' },
  active: { tone: 'info', icon: 'Clock3' },
  pending: { tone: 'info', icon: 'Clock3' },
  in_progress: { tone: 'progress', icon: 'Loader' },
  submitted: { tone: 'progress', icon: 'Send' },
  published: { tone: 'success', icon: 'CheckCircle2' },
  accepted: { tone: 'success', icon: 'CheckCircle2' },
  completed: { tone: 'success', icon: 'CheckCircle2' },
  selected: { tone: 'success', icon: 'CheckCircle2' },
  changes_requested: { tone: 'attention', icon: 'AlertTriangle', severity: 'warning' },
  disputed: { tone: 'attention', icon: 'ShieldAlert', severity: 'error' },
  rejected: { tone: 'neutral', icon: 'CircleSlash' },
} as const satisfies Record<Status | 'pending' | 'rejected', StatusDisplay>;

export function getStatusDisplay(status: string): StatusDisplay {
  return Object.hasOwn(statusDisplay, status)
    ? statusDisplay[status as keyof typeof statusDisplay]
    : { tone: 'neutral', icon: 'FileText' };
}
