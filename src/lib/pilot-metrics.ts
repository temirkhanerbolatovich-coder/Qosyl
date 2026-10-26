export type PilotProject = {
  id: string;
  clientId: string;
  assignedStudentId: string | null;
  status: string;
  demo: boolean;
  client: { demo: boolean };
  assignedStudent: { demo: boolean } | null;
  events: { action: string; metadataJson: unknown; createdAt: Date; actorId?: string | null }[];
  applications: { studentId: string; createdAt: Date; student: { demo: boolean } }[];
  views?: { studentId: string; firstViewedAt: Date; student: { demo: boolean } }[];
  payment: { status: string; clientPaidAt: Date | null; studentReceivedAt: Date | null } | null;
};

type MetricsOptions = { now?: Date; viewsStartedAt?: Date | null };
const DAY_MS = 86_400_000;
const REPEAT_WINDOW_MS = 30 * DAY_MS;

function validTime(date: Date | null | undefined) {
  if (!date) return null;
  const value = date.getTime();
  return Number.isFinite(value) ? value : null;
}

function firstEventAt(project: PilotProject, action: string, now: number, approvalOnly = false) {
  let first: number | null = null;
  for (const event of project.events) {
    if (event.action !== action) continue;
    if (approvalOnly) {
      const metadata = event.metadataJson;
      if (
        !metadata ||
        typeof metadata !== 'object' ||
        Array.isArray(metadata) ||
        !('approve' in metadata) ||
        metadata.approve !== true
      )
        continue;
    }
    const time = validTime(event.createdAt);
    if (time !== null && time <= now && (first === null || time < first)) first = time;
  }
  return first;
}

function claimedPaidAt(project: PilotProject, now: number) {
  if (
    !['accepted', 'completed'].includes(project.status) ||
    project.payment?.status !== 'confirmed_received_by_student'
  )
    return null;
  const clientPaid = validTime(project.payment.clientPaidAt);
  const studentReceived = validTime(project.payment.studentReceivedAt);
  if (clientPaid === null || studentReceived === null) return null;
  const paidAt = Math.max(clientPaid, studentReceived);
  return paidAt <= now ? paidAt : null;
}

function repeatMetrics(
  paid: { project: PilotProject; paidAt: number }[],
  now: number,
  undatedClients: number,
) {
  const clients = new Map<string, { projectId: string; paidAt: number }[]>();
  for (const { project, paidAt } of paid) {
    const items = clients.get(project.clientId) ?? [];
    items.push({ projectId: project.id, paidAt });
    clients.set(project.clientId, items);
  }
  let matureClients = 0;
  let immatureClients = 0;
  let repeatClients = 0;
  const cohorts = new Map<
    string,
    { month: string; matureClients: number; immatureClients: number; repeatClients: number }
  >();
  for (const projects of clients.values()) {
    projects.sort((a, b) => a.paidAt - b.paidAt || a.projectId.localeCompare(b.projectId));
    const first = projects[0];
    const end = first.paidAt + REPEAT_WINDOW_MS;
    // Cohort labels follow the project's fixed UTC+05 reporting day, not the host's timezone.
    const month = new Date(first.paidAt + 5 * 60 * 60_000).toISOString().slice(0, 7);
    const cohort = cohorts.get(month) ?? {
      month,
      matureClients: 0,
      immatureClients: 0,
      repeatClients: 0,
    };
    if (now < end) {
      immatureClients += 1;
      cohort.immatureClients += 1;
    } else {
      matureClients += 1;
      cohort.matureClients += 1;
      if (projects.some((item) => item.projectId !== first.projectId && item.paidAt <= end)) {
        repeatClients += 1;
        cohort.repeatClients += 1;
      }
    }
    cohorts.set(month, cohort);
  }
  return {
    windowDays: 30 as const,
    undatedClients,
    matureClients,
    immatureClients,
    repeatClients,
    repeatRate: matureClients ? repeatClients / matureClients : null,
    cohorts: [...cohorts.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((cohort) => ({
        ...cohort,
        repeatRate: cohort.matureClients ? cohort.repeatClients / cohort.matureClients : null,
      })),
  };
}

/** Project milestones are historical; student-view conversion and mature repeats have separate denominators. */
export function calculatePilotMetrics(projects: PilotProject[], options: MetricsOptions = {}) {
  const now = validTime(options.now ?? new Date());
  if (now === null) throw new RangeError('Invalid metrics timestamp.');
  const startedAt = validTime(options.viewsStartedAt);
  if (options.viewsStartedAt && (startedAt === null || startedAt > now)) {
    throw new RangeError('View collection must start at a valid past or current timestamp.');
  }
  // A source query normally returns distinct projects; deduplicate IDs if joined inputs are supplied.
  const cohort = [...new Map(projects.map((project) => [project.id, project])).values()].filter(
    (project) =>
      !project.demo &&
      !project.client.demo &&
      !project.assignedStudent?.demo &&
      firstEventAt(project, 'moderateProject', now, true) !== null,
  );
  const reached = (action: string) =>
    cohort.filter((project) => firstEventAt(project, action, now) !== null).length;
  const acceptedPaid = cohort.flatMap((project) => {
    const paidAt = claimedPaidAt(project, now);
    return paidAt === null ? [] : [{ project, paidAt }];
  });
  const undatedClients = new Set<string>();
  const datedPaid = acceptedPaid.flatMap(({ project, paidAt }) => {
    const acceptedAt = firstEventAt(project, 'acceptSubmission', now);
    if (acceptedAt === null) {
      undatedClients.add(project.clientId);
      return [];
    }
    return [{ project, paidAt: Math.max(paidAt, acceptedAt) }];
  });
  // If a client's first outcome may be undated, no reliable personal window can be established.
  const repeatPaid = datedPaid.filter(({ project }) => !undatedClients.has(project.clientId));
  const clientCounts = new Map<string, number>();
  for (const { project } of acceptedPaid)
    clientCounts.set(project.clientId, (clientCounts.get(project.clientId) ?? 0) + 1);

  let viewedPairs = 0;
  let appliedPairs = 0;
  let viewedProjects = 0;
  if (startedAt !== null) {
    for (const project of cohort) {
      const views = new Map<string, number>();
      for (const view of project.views ?? []) {
        const time = validTime(view.firstViewedAt);
        if (
          view.student.demo ||
          view.studentId === project.clientId ||
          time === null ||
          time < startedAt ||
          time > now
        )
          continue;
        const first = views.get(view.studentId);
        if (first === undefined || time < first) views.set(view.studentId, time);
      }
      viewedPairs += views.size;
      if (views.size) viewedProjects += 1;
      for (const [studentId, firstViewedAt] of views) {
        if (
          project.applications.some((application) => {
            const appliedAt = validTime(application.createdAt);
            return (
              application.studentId === studentId &&
              !application.student.demo &&
              appliedAt !== null &&
              appliedAt >= firstViewedAt &&
              appliedAt <= now
            );
          }) ||
          project.events.some((event) => {
            const appliedAt = validTime(event.createdAt);
            // Reapplication reuses the original Application row and its createdAt.
            return (
              event.action === 'applyToProject' &&
              event.actorId === studentId &&
              appliedAt !== null &&
              appliedAt >= firstViewedAt &&
              appliedAt <= now
            );
          })
        )
          appliedPairs += 1;
      }
    }
  }

  const stages = [
    { id: 'published', label: 'Опубликованы хотя бы раз', count: cohort.length },
    {
      id: 'applied',
      label: 'Получили хотя бы один реальный отклик',
      count: cohort.filter((project) =>
        project.applications.some(
          (application) =>
            !application.student.demo &&
            validTime(application.createdAt) !== null &&
            application.createdAt.getTime() <= now,
        ),
      ).length,
    },
    { id: 'selected', label: 'Исполнитель выбран', count: reached('selectApplicant') },
    { id: 'started', label: 'Обе стороны согласовали условия', count: reached('work_started') },
    { id: 'submitted', label: 'Результат сдавался', count: reached('submitDeliverable') },
    { id: 'accepted', label: 'Результат принимался', count: reached('acceptSubmission') },
    {
      id: 'paid',
      label: 'Приняты и оплата подтверждена обеими сторонами',
      count: acceptedPaid.length,
    },
  ].map((stage) => ({
    ...stage,
    shareOfPublished: cohort.length ? stage.count / cohort.length : null,
  }));
  return {
    asOf: new Date(now).toISOString(),
    stages,
    views: startedAt === null ? null : viewedPairs,
    engagement: {
      startedAt: startedAt === null ? null : new Date(startedAt).toISOString(),
      viewedPairs,
      appliedPairs,
      conversionRate: viewedPairs ? appliedPairs / viewedPairs : null,
      viewedProjects,
      coverage: 'tracked_authenticated_students' as const,
    },
    repeat30Days: repeatMetrics(repeatPaid, now, undatedClients.size),
    firstPaidStudents: new Set(
      acceptedPaid.flatMap(({ project }) =>
        project.assignedStudentId ? [project.assignedStudentId] : [],
      ),
    ).size,
    repeatClients: [...clientCounts.values()].filter((count) => count >= 2).length,
    disputed: cohort.filter(
      (project) => project.status === 'disputed' || project.payment?.status === 'disputed',
    ).length,
    cancelled: cohort.filter((project) => project.status === 'cancelled').length,
  };
}
export type PilotMetrics = ReturnType<typeof calculatePilotMetrics>;
