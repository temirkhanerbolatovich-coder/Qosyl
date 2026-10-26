import { describe, expect, it } from 'vitest';
import { calculatePilotMetrics, type PilotProject } from '../src/lib/pilot-metrics';

const date = (value: string) => new Date(value);
const now = date('2026-12-01T00:00:00Z');
const start = date('2026-10-01T00:00:00Z');
const publication = date('2026-01-01T00:00:00Z');
const accepted = date('2026-01-05T00:00:00Z');
const paid = date('2026-01-06T00:00:00Z');
const application = (
  studentId = 'student',
  createdAt = date('2026-10-03T00:00:00Z'),
  demo = false,
) => ({ studentId, createdAt, student: { demo } });
const view = (
  studentId = 'student',
  firstViewedAt = date('2026-10-02T00:00:00Z'),
  demo = false,
) => ({ studentId, firstViewedAt, student: { demo } });
const project = (changes: Partial<PilotProject> = {}): PilotProject => ({
  id: 'project',
  clientId: 'client',
  assignedStudentId: 'student',
  status: 'completed',
  demo: false,
  client: { demo: false },
  assignedStudent: { demo: false },
  applications: [application()],
  views: [],
  events: [
    { action: 'moderateProject', metadataJson: { approve: true }, createdAt: publication },
    ...['selectApplicant', 'work_started', 'submitDeliverable', 'acceptSubmission'].map(
      (action) => ({ action, metadataJson: {}, createdAt: accepted }),
    ),
  ],
  payment: { status: 'confirmed_received_by_student', clientPaidAt: paid, studentReceivedAt: paid },
  ...changes,
});
const outcome = (id: string, clientId: string, at: Date): PilotProject =>
  project({
    id,
    clientId,
    events: [
      { action: 'moderateProject', metadataJson: { approve: true }, createdAt: publication },
      { action: 'acceptSubmission', metadataJson: {}, createdAt: at },
    ],
    payment: { status: 'confirmed_received_by_student', clientPaidAt: at, studentReceivedAt: at },
  });
const calculate = (projects: PilotProject[], viewsStartedAt: Date | null = null) =>
  calculatePilotMetrics(projects, { now, viewsStartedAt });

describe('pilot project outcomes', () => {
  it('distinguishes missing tracking from an initialized empty measurement', () => {
    const missing = calculate([]);
    expect(missing.views).toBeNull();
    expect(missing.engagement.startedAt).toBeNull();
    expect(
      missing.stages.every((stage) => stage.count === 0 && stage.shareOfPublished === null),
    ).toBe(true);
    expect(missing.asOf).toBe(now.toISOString());
    const initialized = calculate([], start);
    expect(initialized.views).toBe(0);
    expect(initialized.engagement).toMatchObject({
      viewedPairs: 0,
      appliedPairs: 0,
      conversionRate: null,
      viewedProjects: 0,
      coverage: 'tracked_authenticated_students',
    });
    expect(initialized.repeat30Days.repeatRate).toBeNull();
  });

  it('deduplicates project IDs and events while preserving legacy lifetime counts', () => {
    const first = project();
    first.events.push(...first.events);
    const result = calculate([first, first, project({ id: 'second' })]);
    expect(result.stages.map((stage) => stage.count)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(result.firstPaidStudents).toBe(1);
    expect(result.repeatClients).toBe(1);
  });

  it('excludes demo participants, rejected drafts, and future approvals', () => {
    const result = calculate(
      [
        project({ demo: true }),
        project({ client: { demo: true } }),
        project({ assignedStudent: { demo: true } }),
        project({
          events: [
            { action: 'moderateProject', metadataJson: { approve: false }, createdAt: publication },
          ],
        }),
        project({
          events: [{ action: 'moderateProject', metadataJson: null, createdAt: publication }],
        }),
        project({
          events: [
            {
              action: 'moderateProject',
              metadataJson: { approve: true },
              createdAt: date('2027-01-01T00:00:00Z'),
            },
          ],
        }),
      ].map((item, index) => ({ ...item, id: String(index) })),
    );
    expect(result.stages[0].count).toBe(0);
  });

  it('retains cancellations but excludes disputed and one-sided payment claims', () => {
    const result = calculate([
      project({
        id: 'cancelled',
        status: 'cancelled',
        applications: [application('demo', undefined, true)],
      }),
      project({
        id: 'disputed',
        payment: { status: 'disputed', clientPaidAt: paid, studentReceivedAt: paid },
      }),
      project({
        id: 'one-sided',
        payment: { status: 'reported_paid_by_client', clientPaidAt: paid, studentReceivedAt: null },
      }),
      project({ id: 'accepted', status: 'accepted' }),
    ]);
    expect(result.stages[0].count).toBe(4);
    expect(result.stages.find((stage) => stage.id === 'applied')?.count).toBe(3);
    expect(result.stages.find((stage) => stage.id === 'paid')).toMatchObject({
      count: 1,
      shareOfPublished: 0.25,
    });
    expect(result.cancelled).toBe(1);
    expect(result.disputed).toBe(1);
  });

  it('does not count future claims or future stage/application events at asOf', () => {
    const future = date('2027-01-01T00:00:00Z');
    const result = calculate([
      project({
        events: [
          { action: 'moderateProject', metadataJson: { approve: true }, createdAt: publication },
          { action: 'acceptSubmission', metadataJson: {}, createdAt: future },
        ],
        applications: [application('student', future)],
        payment: {
          status: 'confirmed_received_by_student',
          clientPaidAt: paid,
          studentReceivedAt: future,
        },
      }),
    ]);
    expect(result.stages.find((stage) => stage.id === 'accepted')?.count).toBe(0);
    expect(result.stages.find((stage) => stage.id === 'applied')?.count).toBe(0);
    expect(result.stages.find((stage) => stage.id === 'paid')?.count).toBe(0);
  });
});

describe('measured authenticated-student engagement', () => {
  it('deduplicates a student/project pair and uses its earliest valid view', () => {
    const result = calculate(
      [
        project({
          views: [view(), view('student', date('2026-10-04T00:00:00Z')), view('other')],
          applications: [application(), application(), application('untracked')],
        }),
      ],
      start,
    );
    expect(result.views).toBe(2);
    expect(result.engagement).toMatchObject({
      viewedPairs: 2,
      appliedPairs: 1,
      conversionRate: 0.5,
      viewedProjects: 1,
    });
  });

  it('does not use historical, demo, future, invalid, or owner views as a denominator', () => {
    const result = calculate(
      [
        project({
          views: [
            view('before', date('2026-09-30T23:59:59Z')),
            view('future', date('2027-01-01T00:00:00Z')),
            view('demo', undefined, true),
            view('client'),
            view('invalid', new Date('invalid')),
            view('real', start),
          ],
        }),
      ],
      start,
    );
    expect(result.engagement.viewedPairs).toBe(1);
    expect(result.engagement.appliedPairs).toBe(0);
  });

  it('counts only an application from the viewed student at or after the first view', () => {
    const at = date('2026-10-10T00:00:00Z');
    const result = calculate(
      [
        project({
          views: [
            view('early', at),
            view('exact', at),
            view('demo-app', at),
            view('future-app', at),
          ],
          applications: [
            application('early', date('2026-10-09T00:00:00Z')),
            application('exact', at),
            application('demo-app', at, true),
            application('future-app', date('2027-01-01T00:00:00Z')),
          ],
        }),
      ],
      start,
    );
    // Withdrawn applications still carry this same creation fact; no status filter is applied.
    expect(result.engagement).toMatchObject({
      viewedPairs: 4,
      appliedPairs: 1,
      conversionRate: 0.25,
    });
    expect(result.stages.find((stage) => stage.id === 'applied')?.count).toBe(1);
  });

  it('never backfills untracked historical applications and ignores saved views while tracking is uninitialized', () => {
    const first = project({ views: [view()] });
    const result = calculate([first, project({ id: 'untracked' })], start);
    expect(result.stages.find((stage) => stage.id === 'applied')?.count).toBe(2);
    expect(result.engagement).toMatchObject({ viewedPairs: 1, appliedPairs: 1 });
    expect(calculate([first]).engagement).toMatchObject({
      startedAt: null,
      viewedPairs: 0,
      appliedPairs: 0,
      conversionRate: null,
    });
  });

  it.each([
    {
      name: 'reapplication after the view',
      actorId: 'student',
      at: '2026-10-03T00:00:00Z',
      expected: 1,
    },
    {
      name: 'another student application',
      actorId: 'other',
      at: '2026-10-03T00:00:00Z',
      expected: 0,
    },
    {
      name: 'application event before the view',
      actorId: 'student',
      at: '2026-10-01T00:00:00Z',
      expected: 0,
    },
    {
      name: 'future application event',
      actorId: 'student',
      at: '2027-01-01T00:00:00Z',
      expected: 0,
    },
  ])('$name with an old application row', ({ actorId, at, expected }) => {
    const value = project({
      views: [view()],
      applications: [application('student', date('2026-09-30T00:00:00Z'))],
    });
    value.events.push({ action: 'applyToProject', actorId, createdAt: date(at), metadataJson: {} });
    expect(calculate([value], start).engagement.appliedPairs).toBe(expected);
  });

  it('counts the same student once per distinct project, not once globally', () => {
    const result = calculate(
      [project({ views: [view()] }), project({ id: 'second', views: [view()] })],
      start,
    );
    expect(result.engagement).toMatchObject({
      viewedPairs: 2,
      appliedPairs: 2,
      viewedProjects: 2,
      conversionRate: 1,
    });
  });
});

describe('personal mature 30-day repeat windows', () => {
  it('does not call an incomplete window a mature zero, even if it already has a repeat', () => {
    const result = calculate([
      outcome('first', 'client', date('2026-11-20T00:00:00Z')),
      outcome('second', 'client', date('2026-11-21T00:00:00Z')),
    ]);
    expect(result.repeatClients).toBe(1);
    expect(result.repeat30Days).toMatchObject({
      windowDays: 30,
      matureClients: 0,
      immatureClients: 1,
      repeatClients: 0,
      repeatRate: null,
    });
  });

  it('matures exactly at day 30 and includes a repeat exactly on the window endpoint', () => {
    const result = calculatePilotMetrics(
      [
        outcome('first', 'client', date('2026-01-01T00:00:00Z')),
        outcome('second', 'client', date('2026-01-31T00:00:00Z')),
      ],
      { now: date('2026-01-31T00:00:00Z') },
    );
    expect(result.repeat30Days).toMatchObject({
      matureClients: 1,
      immatureClients: 0,
      repeatClients: 1,
      repeatRate: 1,
    });
  });

  it('excludes a late repeat from the personal window while preserving lifetime repeat', () => {
    const result = calculate([
      outcome('second', 'client', date('2026-02-01T00:00:00Z')),
      outcome('first', 'client', date('2026-01-01T00:00:00Z')),
      outcome('other-client', 'other', date('2026-02-01T00:00:00Z')),
    ]);
    expect(result.repeatClients).toBe(1);
    expect(result.repeat30Days).toMatchObject({
      matureClients: 2,
      repeatClients: 0,
      repeatRate: 0,
    });
  });

  it('starts the window only after both claims and actual acceptance are all present', () => {
    const value = project({
      events: [
        { action: 'moderateProject', metadataJson: { approve: true }, createdAt: publication },
        { action: 'acceptSubmission', metadataJson: {}, createdAt: date('2026-11-20T00:00:00Z') },
      ],
    });
    expect(calculate([value]).repeat30Days).toMatchObject({ matureClients: 0, immatureClients: 1 });
  });

  it('keeps undated paid outcomes in lifetime totals but excludes that client from dated windows', () => {
    const undated = project({
      id: 'undated',
      events: [
        { action: 'moderateProject', metadataJson: { approve: true }, createdAt: publication },
      ],
    });
    const result = calculate([
      undated,
      project({ id: 'dated' }),
      project({ id: 'other', clientId: 'other-client' }),
    ]);
    expect(result.stages.find((stage) => stage.id === 'paid')?.count).toBe(3);
    expect(result.repeat30Days).toMatchObject({
      undatedClients: 1,
      matureClients: 1,
      repeatClients: 0,
    });
  });

  it('groups clients by the first qualifying outcome month in UTC+05', () => {
    const result = calculate([
      outcome('first', 'client', date('2026-01-31T20:00:00Z')),
      outcome('other', 'other-client', date('2026-02-28T19:00:00Z')),
    ]);
    expect(result.repeat30Days.cohorts.map((cohort) => cohort.month)).toEqual([
      '2026-02',
      '2026-03',
    ]);
  });

  it('uses deterministic distinct-project ties and excludes demo outcomes', () => {
    const at = date('2026-01-10T00:00:00Z');
    const result = calculate([
      outcome('b', 'client', at),
      outcome('a', 'client', at),
      { ...outcome('demo', 'client', at), demo: true },
    ]);
    expect(result.repeat30Days).toMatchObject({
      matureClients: 1,
      repeatClients: 1,
      repeatRate: 1,
    });
  });

  it('rejects invalid reporting/collection timestamps instead of inventing a period', () => {
    expect(() => calculatePilotMetrics([], { now: new Date('invalid') })).toThrow(RangeError);
    expect(() =>
      calculatePilotMetrics([], { now, viewsStartedAt: date('2027-01-01T00:00:00Z') }),
    ).toThrow(RangeError);
  });
});
