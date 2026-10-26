import { createHash } from 'node:crypto';

export const DEADLINE_REMINDER_HOURS = 24;
export const REVIEW_REMINDER_HOURS = 48;
const HOUR_MS = 3_600_000;

type Recipient = { id: string; status: string; demo: boolean };
type Agreement = { id: string; snapshotJson: unknown };
type Submission = { id: string; createdAt: Date };

/** Only the fields required to decide lifecycle effects; no contacts or delivery links. */
export interface LifecycleProject {
  id: string;
  title: string;
  status: string;
  demo: boolean;
  clientId: string;
  assignedStudentId: string | null;
  dueAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
  client: Recipient;
  assignedStudent: Recipient | null;
  agreements: Agreement[];
  submissions: Submission[];
  applications: { student: Recipient }[];
}

export interface LifecycleNotification {
  kind: 'expired' | 'publication' | 'execution' | 'review';
  userId: string;
  text: string;
  url: string;
  dedupeKey: string;
}

export interface LifecyclePlan {
  expire: boolean;
  notifications: LifecycleNotification[];
  skipReason?: 'invalid_project_deadline' | 'invalid_agreement_deadline';
}

function available(user: Recipient | null): user is Recipient {
  return !!user && user.status === 'active' && !user.demo;
}

function timestamp(value: Date) {
  const result = value.getTime();
  return Number.isFinite(result) ? result : null;
}

function key(
  kind: LifecycleNotification['kind'],
  projectId: string,
  userId: string,
  token: string,
) {
  const hash = createHash('sha256')
    .update(JSON.stringify([kind, projectId, userId, token]))
    .digest('hex');
  return `lifecycle:${kind}:${hash}`;
}

/** One notification for a publication, agreed version, or submission and its recipient. */
export function planProjectLifecycle(project: LifecycleProject, now: Date): LifecyclePlan {
  const nowMs = timestamp(now);
  if (nowMs === null) throw new RangeError('Invalid lifecycle timestamp.');
  const none: LifecyclePlan = { expire: false, notifications: [] };
  if (project.demo || project.client.demo || project.assignedStudent?.demo) return none;
  const deadline = timestamp(project.dueAt);
  if (deadline === null) return { ...none, skipReason: 'invalid_project_deadline' };

  const notification = (
    kind: LifecycleNotification['kind'],
    user: Recipient,
    token: string,
    text: string,
    url: string,
  ): LifecycleNotification => ({
    kind,
    userId: user.id,
    text,
    url,
    dedupeKey: key(kind, project.id, user.id, token),
  });

  if (project.status === 'published' && !project.assignedStudentId) {
    if (deadline <= nowMs) {
      const recipients = new Map<string, Recipient>();
      if (available(project.client)) recipients.set(project.clientId, project.client);
      for (const application of project.applications)
        if (available(application.student))
          recipients.set(application.student.id, application.student);
      return {
        expire: true,
        notifications: [...recipients.values()].map((user) =>
          notification(
            'expired',
            user,
            project.dueAt.toISOString(),
            `Срок опубликованного задания «${project.title}» истёк. Открытые отклики закрыты; история сохранена.`,
            user.id === project.clientId ? '/client/projects' : '/student/applications',
          ),
        ),
      };
    }
    if (deadline <= nowMs + DEADLINE_REMINDER_HOURS * HOUR_MS && available(project.client)) {
      const publication = project.publishedAt ?? project.createdAt;
      return {
        expire: false,
        notifications: [
          notification(
            'publication',
            project.client,
            `${publication.toISOString()}:${project.dueAt.toISOString()}`,
            `До окончания публикации задания «${project.title}» осталось не более суток. Проверьте отклики и актуальность условий.`,
            `/projects/${project.id}`,
          ),
        ],
      };
    }
    return none;
  }

  if (
    ['in_progress', 'changes_requested'].includes(project.status) &&
    available(project.assignedStudent)
  ) {
    // The caller supplies the latest version approved by both participants, not an unapproved proposal.
    const agreement = project.agreements[0];
    const snapshot = agreement?.snapshotJson;
    const value =
      snapshot && typeof snapshot === 'object' && 'dueAt' in snapshot ? snapshot.dueAt : null;
    const agreedDeadline = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    if (!agreement || !Number.isFinite(agreedDeadline))
      return { ...none, skipReason: 'invalid_agreement_deadline' };
    if (agreedDeadline <= nowMs + DEADLINE_REMINDER_HOURS * HOUR_MS)
      return {
        expire: false,
        notifications: [
          notification(
            'execution',
            project.assignedStudent,
            agreement.id,
            agreedDeadline <= nowMs
              ? `Согласованный срок задания «${project.title}» истёк. Проверьте результат и согласуйте дальнейшие действия с заказчиком.`
              : `До согласованного срока задания «${project.title}» осталось не более суток. Проверьте результат и критерии приёмки.`,
            `/work/${project.id}`,
          ),
        ],
      };
    return none;
  }

  if (project.status === 'submitted' && available(project.client)) {
    const submission = project.submissions[0];
    const submittedAt = submission ? timestamp(submission.createdAt) : null;
    if (
      submission &&
      submittedAt !== null &&
      submittedAt <= nowMs - REVIEW_REMINDER_HOURS * HOUR_MS
    )
      return {
        expire: false,
        notifications: [
          notification(
            'review',
            project.client,
            submission.id,
            `Результат задания «${project.title}» ожидает проверки не менее двух суток. Примите его или укажите конкретные замечания по согласованным критериям.`,
            `/work/${project.id}`,
          ),
        ],
      };
  }
  return none;
}
