import { describe, expect, it } from 'vitest';
import { planProjectLifecycle, type LifecycleProject } from '../src/lib/lifecycle-policy';

const now = new Date('2026-10-26T10:00:00.000Z');
const hours = (amount: number) => new Date(now.getTime() + amount * 3_600_000);
const person = (id: string) => ({ id, status: 'active', demo: false });
const project = (changes: Partial<LifecycleProject> = {}): LifecycleProject => ({
  id: 'project',
  title: 'Небольшая задача',
  status: 'published',
  demo: false,
  clientId: 'client',
  assignedStudentId: null,
  dueAt: hours(12),
  publishedAt: hours(-24),
  createdAt: hours(-48),
  client: person('client'),
  assignedStudent: null,
  agreements: [],
  submissions: [],
  applications: [{ student: person('first') }, { student: person('second') }],
  ...changes,
});
const execution = (changes: Partial<LifecycleProject> = {}) =>
  project({
    status: 'in_progress',
    assignedStudentId: 'student',
    assignedStudent: person('student'),
    agreements: [{ id: 'agreed-version', snapshotJson: { dueAt: hours(12).toISOString() } }],
    ...changes,
  });

describe('published project expiration and reminder', () => {
  it('expires exactly at the deadline and informs affected active people once each', () => {
    const result = planProjectLifecycle(project({ dueAt: now }), now);
    expect(result.expire).toBe(true);
    expect(result.notifications.map((item) => item.userId)).toEqual(['client', 'first', 'second']);
    expect(result.notifications.every((item) => item.kind === 'expired')).toBe(true);
    expect(new Set(result.notifications.map((item) => item.dedupeKey)).size).toBe(3);
  });
  it('does not double-notify a person appearing in more than one affected role', () => {
    const result = planProjectLifecycle(
      project({
        dueAt: hours(-1),
        applications: [
          { student: person('client') },
          { student: person('first') },
          { student: person('first') },
        ],
      }),
      now,
    );
    expect(result.notifications.map((item) => item.userId)).toEqual(['client', 'first']);
  });
  it('expires an unassigned publication even when its author is suspended, without notifying that author', () => {
    const result = planProjectLifecycle(
      project({ dueAt: hours(-1), client: { ...person('client'), status: 'suspended' } }),
      now,
    );
    expect(result.expire).toBe(true);
    expect(result.notifications.some((item) => item.userId === 'client')).toBe(false);
  });
  it('ignores inactive and demonstration applicants while preserving the expiry decision', () => {
    const result = planProjectLifecycle(
      project({
        dueAt: now,
        applications: [
          { student: { ...person('first'), demo: true } },
          { student: { ...person('second'), status: 'suspended' } },
        ],
      }),
      now,
    );
    expect(result.expire).toBe(true);
    expect(result.notifications.map((item) => item.userId)).toEqual(['client']);
  });
  it('sends one publication reminder at the 24-hour boundary', () => {
    const result = planProjectLifecycle(project({ dueAt: hours(24) }), now);
    expect(result.expire).toBe(false);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      kind: 'publication',
      userId: 'client',
      url: '/projects/project',
    });
    expect(planProjectLifecycle(project({ dueAt: hours(24.01) }), now).notifications).toEqual([]);
  });
  it('retains the same key across later ticks but creates a new logical key for a republished deadline', () => {
    const original = project();
    const first = planProjectLifecycle(original, now).notifications[0].dedupeKey;
    expect(planProjectLifecycle(original, hours(1)).notifications[0].dedupeKey).toBe(first);
    expect(
      planProjectLifecycle(project({ publishedAt: hours(-1) }), now).notifications[0].dedupeKey,
    ).not.toBe(first);
    expect(
      planProjectLifecycle(project({ dueAt: hours(10) }), now).notifications[0].dedupeKey,
    ).not.toBe(first);
  });
  it('does not expire an assigned project or use publication reminders while assignment is pending', () => {
    expect(
      planProjectLifecycle(
        project({
          status: 'assigned',
          assignedStudentId: 'student',
          assignedStudent: person('student'),
          dueAt: hours(-1),
        }),
        now,
      ),
    ).toMatchObject({ expire: false, notifications: [] });
  });
});

describe('execution and review reminders', () => {
  it('uses the approved snapshot deadline instead of an unrelated project scalar deadline', () => {
    const result = planProjectLifecycle(execution({ dueAt: hours(200) }), now);
    expect(result.notifications[0]).toMatchObject({
      kind: 'execution',
      userId: 'student',
      url: '/work/project',
    });
  });
  it('catches up once after the agreed deadline without expiring ongoing work', () => {
    const current = execution({
      agreements: [{ id: 'version', snapshotJson: { dueAt: hours(-5).toISOString() } }],
    });
    const result = planProjectLifecycle(current, now);
    expect(result.expire).toBe(false);
    expect(result.notifications[0].text).toContain('истёк');
    expect(planProjectLifecycle(current, hours(1)).notifications[0].dedupeKey).toBe(
      result.notifications[0].dedupeKey,
    );
  });
  it('starts a new execution reminder cycle only for a new approved version', () => {
    const current = execution();
    const next = execution({
      agreements: [{ id: 'next-version', snapshotJson: { dueAt: hours(12).toISOString() } }],
    });
    expect(planProjectLifecycle(current, now).notifications[0].dedupeKey).not.toBe(
      planProjectLifecycle(next, now).notifications[0].dedupeKey,
    );
  });
  it('does not invent an agreed deadline when the historical snapshot is missing or invalid', () => {
    for (const snapshotJson of [{}, { dueAt: 'not-a-date' }, { dueAt: 123 }, null]) {
      expect(
        planProjectLifecycle(execution({ agreements: [{ id: 'version', snapshotJson }] }), now),
      ).toMatchObject({
        expire: false,
        notifications: [],
        skipReason: 'invalid_agreement_deadline',
      });
    }
  });
  it('does not remind about a distant agreed deadline', () => {
    expect(
      planProjectLifecycle(
        execution({
          agreements: [{ id: 'version', snapshotJson: { dueAt: hours(25).toISOString() } }],
        }),
        now,
      ).notifications,
    ).toEqual([]);
  });
  it('reminds the reviewer exactly after 48 hours and keys the reminder to the current submission', () => {
    const current = project({
      status: 'submitted',
      submissions: [{ id: 'submission', createdAt: hours(-48) }],
    });
    const result = planProjectLifecycle(current, now);
    expect(result.notifications[0]).toMatchObject({ kind: 'review', userId: 'client' });
    expect(
      planProjectLifecycle(
        { ...current, submissions: [{ id: 'submission', createdAt: hours(-47.99) }] },
        now,
      ).notifications,
    ).toEqual([]);
    expect(
      planProjectLifecycle(
        { ...current, submissions: [{ id: 'new-submission', createdAt: hours(-48) }] },
        now,
      ).notifications[0].dedupeKey,
    ).not.toBe(result.notifications[0].dedupeKey);
  });
  it('does not notify a suspended assigned student or reviewer', () => {
    expect(
      planProjectLifecycle(
        execution({ assignedStudent: { ...person('student'), status: 'suspended' } }),
        now,
      ).notifications,
    ).toEqual([]);
    expect(
      planProjectLifecycle(
        project({
          status: 'submitted',
          client: { ...person('client'), status: 'suspended' },
          submissions: [{ id: 'submission', createdAt: hours(-72) }],
        }),
        now,
      ).notifications,
    ).toEqual([]);
  });
});

describe('inactive and demonstration boundaries', () => {
  it.each([
    'draft',
    'pending_moderation',
    'paused',
    'accepted',
    'completed',
    'cancelled',
    'disputed',
    'expired',
  ])('does not remind a closed or inactive workflow: %s', (status) => {
    expect(planProjectLifecycle(execution({ status }), now)).toMatchObject({
      expire: false,
      notifications: [],
    });
  });
  it.each([
    { demo: true },
    { client: { ...person('client'), demo: true } },
    { assignedStudent: { ...person('student'), demo: true } },
  ])('excludes demonstration data: %j', (changes) => {
    expect(planProjectLifecycle(execution(changes), now)).toMatchObject({
      expire: false,
      notifications: [],
    });
  });
  it('rejects an invalid policy clock and safely skips an invalid project deadline', () => {
    expect(() => planProjectLifecycle(project(), new Date('invalid'))).toThrow(RangeError);
    expect(planProjectLifecycle(project({ dueAt: new Date('invalid') }), now)).toMatchObject({
      expire: false,
      notifications: [],
      skipReason: 'invalid_project_deadline',
    });
  });
});
