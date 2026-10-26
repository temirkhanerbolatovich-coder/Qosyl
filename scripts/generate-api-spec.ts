import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { categories, mutationSchemas, type Action } from '../src/lib/validation';
import { catalogQuerySchema, platformViews } from '../src/lib/catalog-query';
import { profileInput } from '../src/app/api/profile/schema';
import {
  threadsSearchInput,
  threadsSearchDataSchema,
  threadsStatusDataSchema,
} from '../src/lib/threads-search';
import {
  leadActionInputs,
  leadCommandSchema,
  leadConversionInput,
  leadKinds,
  leadStatuses,
} from '../src/lib/lead-validation';
import {
  leadListDataSchema,
  leadDetailDataSchema,
  leadMutationDataSchema,
  leadHandoffsDataSchema,
  leadConversionDataSchema,
} from '../src/contracts/leads';
import {
  contentSettingsInput,
  contentReviewInput,
  contentEditInput,
  contentStatuses,
  manualContentInput,
  requestSyncInput,
  sourceInput,
  manualCategories,
} from '../src/lib/content-validation';
import {
  contentIntakeDataSchema,
  contentMutationDataSchema,
  contentDetailDataSchema,
  publicContentDataSchema,
} from '../src/contracts/content-intake';
import {
  apiErrorSchema,
  commandDataSchemas,
  okHealthSchema,
  profileDataSchema,
  profileSavedDataSchema,
  unavailableHealthSchema,
  viewDataSchemas,
} from '../src/contracts/api-responses';

type JsonSchema = Record<string, unknown>;

// Descriptions document authorization; actual guards stay inside each transactional handler.
const actionAccess = {
  recordProjectView:
    'Active student; visible unexpired real project. Owner, admin, and demo views are ignored. One immutable first view per student/project; replay is safe.',
  recordPilotCost:
    'Admin only; records a cost entry. Per-actor UUID idempotency key replays identical input; changed payload conflicts. No payment or revenue is inferred.',
  voidPilotCost:
    'Admin only; records the first void with a reason. Original cost fields and history remain immutable.',
  createProject: 'Client role; creates a draft owned by the current user.',
  updateProject:
    'Client role and project owner, before assignment; published changes require moderation again.',
  submitForModeration: 'Client role and project owner; draft or paused state.',
  moderateProject:
    'Admin role; pending moderation only. Rejection requires a reason of at least 10 characters.',
  applyToProject:
    'Student role; published, unexpired project of another active user; one active application.',
  updateApplication: 'Application author; active application on a published project.',
  withdrawApplication: 'Application author; active application on a published project.',
  selectApplicant:
    'Client role and project owner; published project and active application; exactly one selected student.',
  approveAgreement:
    'Project participant; exact current agreement ID; approves only for the caller.',
  proposeAgreement:
    'Project participant; state permits changed terms; creates a new immutable version.',
  toggleMilestone: 'Project participant; milestone belongs to the project and relevant agreement.',
  submitDeliverable: 'Student role and assigned student; both participants approved the terms.',
  requestChanges: 'Client role and project owner; latest submission, specific agreed criteria.',
  acceptSubmission: 'Client role and project owner; latest submission in submitted state.',
  acknowledgePayment:
    'Participant. Client reports payment; assigned student confirms receipt only after the client report; either may dispute. No money is transferred.',
  closeProject: 'Participant after acceptance; completion requires both participants to close.',
  cancelProject: 'Participant in an allowed state; preserves history.',
  disputeProject:
    'Participant in an allowed state; creates an audit trail, not a financial arbitration payout.',
  setPortfolio: 'Participant of an accepted project; content changes reset publication consents.',
  consentPortfolio:
    'Participant; expectedUpdatedAt must match the reviewed version; public visibility needs both consents.',
  createReview:
    'Participant of an accepted project; one review of the other participant; author and recipient are server-selected.',
  fileComplaint:
    'Active user; at least one target (projectId or targetUserId); target access and complaint rate limits apply.',
  moderateClient:
    'Admin role; verifies or rejects an existing client profile; rejection requires a reason.',
  suspendUser:
    'Admin role; cannot target self or another admin; reason required; suspension revokes sessions.',
  resolveReport:
    'Admin role; existing open report; resolution does not rewrite payment statements.',
  pauseProject:
    'Project owner with client role, or admin; published or pending moderation; reason required.',
  markNotification: 'Notification recipient only.',
} satisfies Record<Action, string>;

const viewAccess = {
  backgroundJobs:
    'Admin only. Read-only worker run history and non-secret scheduling configuration. This endpoint never runs background work.',
  pilotCosts:
    'Admin only; paginated internal cost entries, all-history active totals and void count. No public journal access.',
  catalog:
    'Public. Only current published projects of active clients; public field projection; demo visibility follows environment settings.',
  project:
    'Public projection for a visible published project; owner sees own full fields. Participants and admins may inspect nonpublic projects; admin inspection does not reveal exact private location/contact.',
  dashboard:
    'Active current user only; own projects, applications, notifications, and portfolio. Assigned student sees exact private location/contact only after both approvals.',
  portfolio:
    'Active current user only; same private account projection as dashboard, including own consent states.',
  work: 'Project participants only, including when the caller is an admin. Private location/contact is revealed only to the owner or after agreement approvals.',
  applications:
    'Client role and owner of projectId; applications are private to the owning client.',
  admin:
    'Admin role only; moderation queues, safe users, reports and audit. Project contactPrivate/locationPrivate are excluded.',
  pilotMetrics:
    'Admin role only; measured aggregates with demo exclusion. Missing view measurements remain null.',
} satisfies Record<(typeof platformViews)[number], string>;

/** Input JSON schemas are derived from the same Zod objects used by the API. */
export function requestSchema(schema: z.ZodType): JsonSchema {
  const result = z.toJSONSchema(schema, {
    io: 'input',
    reused: 'inline',
    unrepresentable: ({ zodSchema }) => {
      if (zodSchema._zod.def.type === 'date') {
        return {
          type: 'string',
          format: 'date-time',
          description: 'ISO datetime; the server also requires a future deadline.',
        };
      }
      return 'throw';
    },
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema._zod.def.type === 'date') {
        jsonSchema.type = 'string';
        jsonSchema.format = 'date-time';
        jsonSchema.description = 'ISO datetime; the server also requires a future deadline.';
      }
    },
  });
  delete result.$schema;
  return result;
}

/** Response schemas describe serialized JSON, including strict projections and nullable dates. */
export function responseSchema(schema: z.ZodType, componentName: string): JsonSchema {
  const result = z.toJSONSchema(schema, { io: 'output', reused: 'inline' });
  delete result.$schema;
  // Recursive JSON fields may generate local $defs. Anchor those refs at this component,
  // rather than at the OpenAPI document root where #/$defs would not exist.
  function anchor(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(anchor);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === '$ref' && typeof nested === 'string' && nested.startsWith('#')) {
        (value as JsonSchema)[key] = `#/components/schemas/${componentName}${nested.slice(1)}`;
      } else anchor(nested);
    }
  }
  anchor(result);
  return result;
}

const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const dataEnvelope = (name: string) => ({
  type: 'object',
  required: ['data'],
  properties: { data: schemaRef(name) },
  additionalProperties: false,
});

const cacheHeader = {
  description: 'These API responses must not be stored by browsers or shared caches.',
  schema: { type: 'string', const: 'private, no-store' },
};
const cookieSecurity = [{ sessionCookie: [] }, { secureSessionCookie: [] }];

function errorResponse(
  description: string,
  examples?: Record<string, { summary?: string; value: unknown }>,
) {
  return {
    description,
    headers: { 'Cache-Control': cacheHeader },
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        ...(examples ? { examples } : {}),
      },
    },
  };
}

function successResponse(
  description: string,
  schema: JsonSchema,
  examples?: Record<string, { summary?: string; value: unknown }>,
) {
  return {
    description,
    headers: { 'Cache-Control': cacheHeader },
    content: { 'application/json': { schema, ...(examples ? { examples } : {}) } },
  };
}

const errors = {
  '400': errorResponse(
    'Invalid JSON, selector, query, or input fields. Validation and business refinements are checked by the server.',
  ),
  '401': errorResponse('An active session is required.'),
  '403': errorResponse(
    'Role, ownership, account/email state, or same-origin check denied the operation.',
  ),
  '404': errorResponse('The target is absent or not visible to this caller.'),
  '409': errorResponse(
    'State/version conflict, duplicate operation, or concurrent transaction. Refresh before deciding whether to retry.',
  ),
  '413': errorResponse('The streamed request body exceeds the endpoint byte limit.'),
  '415': errorResponse(
    'Expected application/json, optionally with parameters such as charset=utf-8.',
  ),
  '429': errorResponse('The operation rate limit was reached. Do not retry in a tight loop.'),
  '500': errorResponse('Unexpected server failure; internal details are not exposed.'),
  '503': errorResponse('A required service is temporarily unavailable.'),
};

const contentInputs = {
  setModuleEnabled: contentSettingsInput,
  createSource: sourceInput,
  setSourceEnabled: requestSyncInput.and(contentSettingsInput),
  requestSync: requestSyncInput,
  addManualContent: manualContentInput,
  reviewContent: contentReviewInput,
  editContent: contentEditInput,
};
const contentActionAccess = {
  setModuleEnabled:
    'Admin only. Changes the collection and public visibility flag, initially false. Disabled hides all public opportunities. Does not approve revisions or start a network request.',
  createSource:
    'Admin only. Up to 100 sources; a rights note and exact allowed hostname are required. Sources default to disabled. RSS requires a matching HTTPS feedUrl; manual sources have no feedUrl. No network request is made.',
  setSourceEnabled:
    'Admin only. Changes an existing source flag; collection still requires the module to be enabled. No network request is made.',
  requestSync:
    'Admin only; enabled module and enabled RSS source. Returns the existing queued/running run, or queues a new one if nextRunAt permits. The separate worker fetches the source later; this request never publishes or fetches content.',
  addManualContent:
    'Admin only; enabled module and enabled manual source. URL hostname must exactly match the source. Stores plain text in a closed pending_review queue with immutable revisions; an identical current revision returns duplicate. Returning to earlier content creates a new revision. No publication or marketplace project is created.',
  reviewContent:
    'Admin only. Requires expectedRevisionId and expectedUpdatedAt matching the current item. Decisions publish/reject/archive/withdraw/reopen require a reason of 10-2000 characters. Publish requires enabled module/source, pending_review and the latest immutable URL snapshot. Explicit expiresAt must be future and within 90 days, capped by earlier known deadline/eventDate. Other decisions remain available while disabled. Reopen is an explicit human action for a terminal item, never automatic import.',
  editContent:
    'Admin only. Saves a new immutable editorial snapshot for an active item and moves it to pending_review, hiding any old publication. Requires current expectedRevisionId/expectedUpdatedAt and a reason. Retains prior approval and history; never edits historical rows. URLs must match the source host.',
} satisfies Record<keyof typeof contentInputs, string>;
// Reuse the serialized result branches; two commands legitimately return the same saved shape.
const contentResultSchemas = {
  setModuleEnabled: contentMutationDataSchema.options[0],
  createSource: contentMutationDataSchema.options[1],
  setSourceEnabled: contentMutationDataSchema.options[0],
  requestSync: contentMutationDataSchema.options[2],
  addManualContent: contentMutationDataSchema.options[3],
  reviewContent: contentMutationDataSchema.options[0],
  editContent: contentMutationDataSchema.options[0],
};

export function buildApiSpec() {
  const contentActionSchemas = Object.fromEntries(
    Object.entries(contentInputs).map(([action, schema]) => [
      `ContentAction_${action}`,
      {
        ...requestSchema(schema.and(z.object({ action: z.literal(action) }))),
        description: contentActionAccess[action as keyof typeof contentInputs],
      },
    ]),
  );
  const contentResponseRefs = Object.fromEntries(
    Object.keys(contentInputs).map((action) => [action, schemaRef(`ContentResponse_${action}`)]),
  );
  const contentResponseComponents = Object.fromEntries(
    Object.entries(contentResultSchemas).flatMap(([action, schema]) => [
      [`ContentData_${action}`, responseSchema(schema, `ContentData_${action}`)],
      [`ContentResponse_${action}`, dataEnvelope(`ContentData_${action}`)],
    ]),
  );
  const viewResponseRefs = Object.fromEntries(
    platformViews.map((view) => [view, schemaRef(`ViewResponse_${view}`)]),
  ) as Record<(typeof platformViews)[number], ReturnType<typeof schemaRef>>;
  const commandResponseRefs = Object.fromEntries(
    Object.keys(mutationSchemas).map((action) => [action, schemaRef(`CommandResponse_${action}`)]),
  ) as Record<Action, ReturnType<typeof schemaRef>>;
  const viewResponseComponents = Object.fromEntries(
    Object.entries(viewDataSchemas).flatMap(([view, schema]) => [
      [`ViewData_${view}`, responseSchema(schema, `ViewData_${view}`)],
      [`ViewResponse_${view}`, dataEnvelope(`ViewData_${view}`)],
    ]),
  );
  const commandResponseComponents = Object.fromEntries(
    Object.entries(commandDataSchemas).flatMap(([action, schema]) => [
      [`CommandData_${action}`, responseSchema(schema, `CommandData_${action}`)],
      [`CommandResponse_${action}`, dataEnvelope(`CommandData_${action}`)],
    ]),
  );
  // Several selectors legitimately have the same response shape. anyOf avoids
  // pretending that a response contains a selector or must match only one branch.
  const commandAlternatives = new Map<z.ZodType, ReturnType<typeof schemaRef>>();
  for (const action of Object.keys(commandDataSchemas) as Action[]) {
    const schema = commandDataSchemas[action];
    if (!commandAlternatives.has(schema)) {
      commandAlternatives.set(schema, commandResponseRefs[action]);
    }
  }
  const actionSchemas = Object.fromEntries(
    Object.entries(mutationSchemas).map(([action, schema]) => [
      `Action_${action}`,
      {
        ...requestSchema(schema.and(z.object({ action: z.literal(action) }))),
        description: actionAccess[action as Action],
      },
    ]),
  );
  const filters = requestSchema(catalogQuerySchema).properties as Record<string, JsonSchema>;
  const queryParameters = Object.entries(filters).map(([name, schema]) => ({
    name,
    in: 'query',
    required: false,
    description:
      name === 'dueBefore'
        ? 'Existing calendar date YYYY-MM-DD (end of that day in UTC+05) or ISO datetime with timezone. Calendar validation also runs on the server.'
        : name === 'page'
          ? '1-based integer page, at most 10000; 30 projects per page.'
          : `Catalog filter ${name}. Empty values are ignored; incompatible budget ranges are rejected.`,
    schema,
  }));
  return {
    openapi: '3.1.0',
    info: {
      title: 'Qosyl application API',
      version: '0.1.0',
      description:
        'Current application contract. Existing RPC selectors are retained for compatibility. Request fields and serialized response projections are generated from shared Zod schemas; role, ownership, state, cross-field, future-date and safe-URL checks remain authoritative on the server. Select x-view-response or x-action-response for the exact response of a requested selector. Auth endpoints under /api/auth/* are managed separately by Better Auth and are not redefined here.',
    },
    servers: [
      {
        url: '/',
        description:
          'Same origin as the Qosyl application; no credentials or deployment-specific hostnames are embedded.',
      },
    ],
    tags: [
      {
        name: 'Marketplace',
        description:
          'Public catalog, private participant work, and explicitly restricted administration.',
      },
      {
        name: 'Profile',
        description: 'Current account only; cannot grant admin or verification privileges.',
      },
      { name: 'Operations', description: 'Bounded readiness signal without internal details.' },
      {
        name: 'Private leads',
        description:
          'Admin-only research and outcomes, with optional read-only Threads search preview. Only a specifically consenting client can create one normal draft. No external messages or public lead catalog.',
      },
      {
        name: 'Content intake',
        description:
          'Source intake and revision-specific editorial approval. Admin-only configuration/history; a separate public projection returns only approved current snapshots. Disabled by default. No marketplace-project creation or automatic publication.',
      },
    ],
    paths: {
      '/api/admin/leads/threads': {
        get: {
          operationId: 'threadsSearchStatus',
          tags: ['Private leads'],
          security: cookieSecurity,
          summary: 'Read the Threads search switch and token presence without exposing credentials',
          description:
            'Fresh active admin only; no external I/O. Private no-store. Enabled/configured booleans do not prove provider permissions or public search access.',
          responses: {
            '200': successResponse('Local readiness only.', schemaRef('ThreadsStatusResponse')),
            '401': errors['401'],
            '403': errors['403'],
            '500': errors['500'],
          },
        },
        post: {
          operationId: 'searchThreads',
          tags: ['Private leads'],
          security: cookieSecurity,
          summary: 'Preview a bounded official Threads keyword search',
          description:
            'Fresh active admin, same-origin Origin, application/json; 2048 byte streamed body. Disabled by default; server-only token. One RECENT request, up to 25 normalized candidates, no paging, redirects or automatic retries. 10s timeout and 256KiB upstream body cap. Local technical ceilings: 5 calls/min/admin and 100/24h globally; failures consume quota. Provider throttling persists a shared pause. No Lead/Project is created or modified: operator explicitly fills and submits the existing lead form. Preview does not prove demand, consent or complete public coverage. 429 means local/provider throttling; 503 covers disabled/missing credentials, denied access, unavailable/invalid upstream or disabling during a call. No provider body, token or paging URL is returned.',
          parameters: [{ $ref: '#/components/parameters/Origin' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: schemaRef('ThreadsSearchInput'),
                example: { query: 'таблицы для бизнеса' },
              },
            },
          },
          responses: {
            '200': successResponse(
              'Private preview; not a durable import.',
              schemaRef('ThreadsSearchResponse'),
            ),
            ...errors,
          },
        },
      },
      '/api/admin/leads': {
        get: {
          operationId: 'queryLeads',
          tags: ['Private leads'],
          summary: 'Read private business requests and discussions',
          security: cookieSecurity,
          description:
            'Admin only. No remote I/O. 20 records per page; filters apply to leads and total. Includes up to 100 active operator/client id+name options, without emails. Source capture and internal consent evidence are private.',
          parameters: [
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
            },
            {
              name: 'kind',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: [...leadKinds] },
            },
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: [...leadStatuses] },
            },
          ],
          responses: {
            '200': successResponse(
              'Private registry, matching total and bounded actor options.',
              schemaRef('LeadListResponse'),
            ),
            '400': errors['400'],
            '401': errors['401'],
            '403': errors['403'],
            '500': errors['500'],
          },
        },
        post: {
          operationId: 'mutateLead',
          tags: ['Private leads'],
          summary: 'Record manual research, contact and consent outcomes',
          security: cookieSecurity,
          description:
            'Admin only; current active role/account and verified email outside local mode are rechecked in a Serializable transaction. Requires same-origin Origin and application/json, maximum streamed body 32768 bytes. 60 committed mutations per minute per admin. Actions: createLead/editLead/assignLead/verifyLead/recordContact/recordConsent/revokeConsent/closeLead/reopenLead/addLeadNote. Every change except creation requires expectedVersion; one increment and immutable event are atomic. URLs are HTTPS, canonicalized without tracking and never fetched. Create deduplicates kind+URL even for archived/declined records without resurrection. New/edited expiry must be future and within 90 days. Consent requires a verified, manually contacted business request and an active client; discussions cannot become a project. Converted ownership cannot change. This API records human claims: no messages or projects are sent/created here.',
          parameters: [{ $ref: '#/components/parameters/Origin' }],
          'x-actions': Object.keys(leadActionInputs),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: schemaRef('LeadCommand'),
                examples: {
                  create: {
                    value: {
                      action: 'createLead',
                      kind: 'business_request',
                      sourceUrl: 'https://example.org/request/1',
                      sourceName: 'Синтетический источник',
                      title: 'Пример запроса на таблицу учёта',
                      summary:
                        'Учебный пример потребности для приватной проверки, не готовый заказ.',
                      assignedToId: 'example-admin-id',
                      expiresAt: '2026-11-02T00:00:00.000Z',
                    },
                  },
                  consent: {
                    value: {
                      action: 'recordConsent',
                      leadId: 'example-lead-id',
                      expectedVersion: 3,
                      clientId: 'example-client-id',
                      evidence: 'Пример записи оператора: заказчик согласовал передачу 26.10.2026.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': successResponse(
              'Current lead ID and version. A duplicate creation returns the existing identity without rewriting it.',
              schemaRef('LeadMutationResponse'),
              { saved: { value: { data: { leadId: 'example-lead-id', version: 1 } } } },
            ),
            ...errors,
          },
        },
      },
      '/api/admin/leads/{id}': {
        get: {
          operationId: 'queryLeadDetail',
          tags: ['Private leads'],
          summary: 'Read private lead and immutable history',
          security: cookieSecurity,
          description:
            'Admin only. Current lead plus 20 events per page, descending version, and total event count. Events include operator IDs, reasons and internal evidence; no public access or network request.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
            },
          ],
          responses: {
            '200': successResponse(
              'Private lead and paginated history.',
              schemaRef('LeadDetailResponse'),
            ),
            '400': errors['400'],
            '401': errors['401'],
            '403': errors['403'],
            '404': errors['404'],
            '500': errors['500'],
          },
        },
      },
      '/api/leads': {
        get: {
          operationId: 'queryLeadHandoffs',
          tags: ['Private leads'],
          summary: 'Read only the current client’s permitted handoffs',
          security: cookieSecurity,
          description:
            'Client only. Up to 20 own consented, unexpired business requests or already converted links. Never returns internal evidence, notes, hashes, operator IDs or other clients. Stable updatedAt/id order descending. Empty data is a successful response.',
          parameters: [
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
            },
          ],
          responses: {
            '200': successResponse(
              'Owner-only handoff projection.',
              schemaRef('LeadHandoffsResponse'),
              { empty: { value: { data: { leads: [], total: 0, page: 1 } } } },
            ),
            '400': errors['400'],
            '401': errors['401'],
            '403': errors['403'],
            '500': errors['500'],
          },
        },
        post: {
          operationId: 'convertLead',
          tags: ['Private leads'],
          summary: 'Client explicitly creates one draft from a consented handoff',
          security: cookieSecurity,
          description:
            'Current active client only; requires same-origin JSON up to 65536 bytes, verified email outside local mode, confirmation=true, current expectedVersion and a complete normal project brief. Only this client’s consented, unexpired business request is eligible; an admin cannot create on behalf of another owner. Reuses the normal project creation handler inside the same transaction as the lead link/event, retaining draft state and normal moderation. A valid identical payload replay returns the existing projectId; changed payload conflicts with 409. Never publishes the project or sends external messages. 30 committed conversions per minute per client.',
          parameters: [{ $ref: '#/components/parameters/Origin' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: schemaRef('LeadConversionInput') } },
          },
          responses: {
            '200': successResponse(
              'The same project ID for a successful identical retry.',
              schemaRef('LeadConversionResponse'),
              { draft: { value: { data: { projectId: 'example-project-id' } } } },
            ),
            ...errors,
          },
        },
      },
      '/api/platform': {
        get: {
          operationId: 'queryMarketplace',
          tags: ['Marketplace'],
          summary: 'Read a public or authorized marketplace projection',
          description:
            'Default view is catalog. project/work require id; applications requires projectId. Query selectors determine additional access checks: a cookie alone never grants owner/participant/admin authority. All reads are side-effect-free with respect to marketplace state. Only catalog/project permit guests.',
          security: [{}, ...cookieSecurity],
          'x-view-access': viewAccess,
          'x-view-response': viewResponseRefs,
          parameters: [
            {
              name: 'view',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: [...platformViews], default: 'catalog' },
            },
            {
              name: 'id',
              in: 'query',
              required: false,
              description: 'Required by project and work views.',
              schema: { type: 'string', minLength: 1, maxLength: 100 },
            },
            {
              name: 'projectId',
              in: 'query',
              required: false,
              description: 'Required by applications view.',
              schema: { type: 'string', minLength: 1, maxLength: 100 },
            },
            ...queryParameters,
          ],
          responses: {
            '200': successResponse(
              'Exact authorized response envelope selected by view. x-view-response maps each selector to its schema; project has public and owner variants without inventing fields on the wire.',
              { anyOf: Object.values(viewResponseRefs) },
              {
                catalog: {
                  summary: 'Empty public catalog',
                  value: { data: { projects: [], total: 0, categories: [...categories], page: 1 } },
                },
              },
            ),
            '400': errors['400'],
            '401': errors['401'],
            '403': errors['403'],
            '404': errors['404'],
            '500': errors['500'],
          },
        },
        post: {
          operationId: 'mutateMarketplace',
          tags: ['Marketplace'],
          summary: 'Perform one authorized marketplace command',
          description:
            'Requires an active session, Origin exactly matching the configured application origin and application/json. Maximum streamed body: 65536 bytes. The transaction rereads current account status and roles; role alone does not override entity ownership or state. In public mode email must be verified. No command transfers or holds money. Commands are not automatically retried after a lost response.',
          security: cookieSecurity,
          'x-action-access': actionAccess,
          'x-action-response': commandResponseRefs,
          parameters: [{ $ref: '#/components/parameters/Origin' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MarketplaceCommand' },
                examples: {
                  createProject: {
                    value: {
                      action: 'createProject',
                      title: 'Сводная таблица учебных данных',
                      category: 'spreadsheets',
                      problem: 'Нужно сгруппировать обезличенные учебные строки.',
                      description:
                        'Собрать сводную таблицу по категориям на основе предоставленных вымышленных данных.',
                      deliverables: 'Таблица и краткая методика расчёта.',
                      acceptanceCriteria: ['Итоги по категориям сходятся с общей суммой.'],
                      difficulty: 'beginner_friendly',
                      mode: 'remote',
                      budgetKzt: 12000,
                      estimatedHours: 4,
                      dueAt: '2099-01-01T12:00:00.000Z',
                    },
                  },
                  applyToProject: {
                    value: {
                      action: 'applyToProject',
                      projectId: 'example-project-id',
                      message: 'Готов подготовить таблицу и описать методику.',
                      links: [],
                    },
                  },
                  acknowledgePayment: {
                    value: {
                      action: 'acknowledgePayment',
                      projectId: 'example-project-id',
                      status: 'reported_paid_by_client',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': successResponse(
              'Exact result selected by action; x-action-response maps all commands to their response envelopes. No response action discriminator is added. Commands returning no record use data.ok=true.',
              { anyOf: [...commandAlternatives.values()] },
              {
                acknowledgement: {
                  summary: 'Command completed without a returned record',
                  value: { data: { ok: true } },
                },
              },
            ),
            ...errors,
          },
        },
      },
      '/api/profile': {
        get: {
          operationId: 'getOwnProfile',
          tags: ['Profile'],
          summary: 'Read the current private account and profiles',
          security: cookieSecurity,
          description:
            'Returns only the authenticated account: id, name, email, roles, demo, studentProfile, clientProfile, externalWorks. No arbitrary user ID parameter is accepted.',
          responses: {
            '200': successResponse(
              'Exact current private profile projection.',
              schemaRef('ProfileResponse'),
            ),
            '401': errors['401'],
            '503': errors['503'],
          },
        },
        post: {
          operationId: 'saveOwnProfile',
          tags: ['Profile'],
          summary: 'Save a student or client profile of the current account',
          security: cookieSecurity,
          description:
            'Same-origin JSON only; maximum streamed body 16384 bytes. Role is student or client; requests cannot set admin, verification flags, or another account ID. Client profile changes reset verification to pending; public work URLs require HTTPS without embedded credentials. The update and audit record are transactional.',
          parameters: [{ $ref: '#/components/parameters/Origin' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProfileInput' },
                examples: {
                  student: {
                    value: {
                      role: 'student',
                      name: 'Пример участника',
                      city: 'Семей',
                      weeklyHours: 5,
                      skills: ['Excel'],
                      formats: ['remote'],
                      isPublic: false,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': successResponse(
              'Saved current profile.',
              {
                $ref: '#/components/schemas/ProfileSaved',
              },
              { savedStudent: { value: { data: { saved: true, role: 'student' } } } },
            ),
            '400': errors['400'],
            '401': errors['401'],
            '403': errors['403'],
            '409': errors['409'],
            '413': errors['413'],
            '415': errors['415'],
            '503': errors['503'],
          },
        },
      },
      '/api/content/posts': {
        get: {
          operationId: 'queryPublicContent',
          tags: ['Content intake'],
          summary: 'Read up to six approved and current opportunities',
          security: [],
          description:
            'Public, read-only, private/no-store. Returns an empty posts array when module is disabled or no material qualifies. Only published items of enabled sources with unexpired explicit approval are included. Reads the approved immutable snapshot, never pending revisions, audit, rights notes, hashes or runs. No remote requests. Stable order: approvedAt descending, id descending. Errors do not prevent the marketplace homepage from rendering.',
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
            },
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string', maxLength: 100 },
              description: 'Case-insensitive literal text search.',
            },
            {
              name: 'category',
              in: 'query',
              schema: { type: 'string', enum: [...manualCategories] },
            },
            {
              name: 'geography',
              in: 'query',
              schema: { type: 'string', maxLength: 120 },
              description: 'Matches explicitly recorded geography only.',
            },
            {
              name: 'specialty',
              in: 'query',
              schema: {
                type: 'string',
                enum: [
                  'it',
                  'engineering',
                  'business',
                  'education',
                  'health',
                  'humanities',
                  'agriculture',
                  'services',
                ],
              },
              description: 'Keyword heuristic; not an eligibility decision.',
            },

            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 6, default: 6 },
            },
          ],
          responses: {
            '200': successResponse(
              'Approved public projection only.',
              schemaRef('PublicContentResponse'),
              { empty: { value: { data: { posts: [] } } } },
            ),
            '400': errors['400'],
            '500': errors['500'],
            '503': errors['503'],
          },
        },
      },
      '/api/admin/content/{id}': {
        get: {
          operationId: 'queryContentDetail',
          tags: ['Content intake'],
          summary: 'Inspect latest snapshot, paginated revision history and recent decisions',
          security: cookieSecurity,
          description:
            'Admin only, read-only. item contains the latest revision regardless of history page; history holds 20 immutable revisions per page in descending number order, historyTotal is the full count. Includes the internal source and last 50 audit rows with actor and revision IDs. Never loads a remote source.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
            },
          ],
          responses: {
            '200': successResponse(
              'Latest item and paginated internal history.',
              schemaRef('ContentDetailResponse'),
            ),
            '400': errors['400'],
            '401': errors['401'],
            '403': errors['403'],
            '404': errors['404'],
            '500': errors['500'],
          },
        },
      },
      '/api/admin/content': {
        get: {
          operationId: 'queryContentIntake',
          tags: ['Content intake'],
          summary: 'Read the closed content intake queue and source status',
          security: cookieSecurity,
          description:
            'Admin only, including while collection is disabled. Read-only: never synchronizes sources. Returns up to 100 sources, 20 items per page with only their latest revision, and the 30 latest runs. Optional status filters items and total; page applies only to items. The module is seeded disabled.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string', maxLength: 100 },
              description: 'Case-insensitive literal text search.',
            },
            {
              name: 'category',
              in: 'query',
              schema: { type: 'string', enum: [...manualCategories] },
            },
            {
              name: 'geography',
              in: 'query',
              schema: { type: 'string', maxLength: 120 },
              description: 'Matches explicitly recorded geography only.',
            },
            {
              name: 'specialty',
              in: 'query',
              schema: {
                type: 'string',
                enum: [
                  'it',
                  'engineering',
                  'business',
                  'education',
                  'health',
                  'humanities',
                  'agriculture',
                  'services',
                ],
              },
              description: 'Keyword heuristic; not an eligibility decision.',
            },

            {
              name: 'page',
              in: 'query',
              required: false,
              description: '1-based integer page for items, 20 per page; at most 10000.',
              schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
            },
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: [...contentStatuses] },
              description: 'Optional editorial status filter; total counts only matching items.',
            },
          ],
          responses: {
            '200': successResponse(
              'Current internal settings, source status, latest item revisions and recent runs.',
              schemaRef('ContentIntakeResponse'),
              {
                emptyDisabled: {
                  summary: 'New internal module before adding sources',
                  value: {
                    data: {
                      settings: {
                        id: 'content',
                        enabled: false,
                        updatedAt: '2026-10-26T00:00:00.000Z',
                      },
                      sources: [],
                      items: [],
                      runs: [],
                      page: 1,
                      total: 0,
                    },
                  },
                },
              },
            ),
            '400': errors['400'],
            '401': errors['401'],
            '403': errors['403'],
            '500': errors['500'],
          },
        },
        post: {
          operationId: 'mutateContentIntake',
          tags: ['Content intake'],
          summary: 'Manage sources, review material and approve an explicit revision',
          security: cookieSecurity,
          description:
            'Admin only; requires an active session, same-origin Origin and application/json. Maximum streamed body: 32768 bytes. Current active status and admin role are reread within the transaction; verified email is required outside local mode. Configuration and editorial safety decisions remain available while disabled. HTTPS on port 443 without credentials or fragments is required for input URLs, up to 2000 characters. Cross-field, allowed-host and state rules are checked on the server. Publication explicitly approves the latest revision with a bounded expiry. Import or edits never publish automatically; changed content is hidden until reviewed again.',
          'x-action-access': contentActionAccess,
          'x-action-response': contentResponseRefs,
          parameters: [{ $ref: '#/components/parameters/Origin' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: schemaRef('ContentCommand'),
                examples: {
                  setModuleEnabled: { value: { action: 'setModuleEnabled', enabled: true } },
                  reviewContent: {
                    value: {
                      action: 'reviewContent',
                      itemId: 'example-item-id',
                      expectedRevisionId: 'example-revision-id',
                      expectedUpdatedAt: '2026-10-26T00:00:00.000Z',
                      decision: 'publish',
                      reason: 'Оригинал и условия использования проверены редактором.',
                      expiresAt: '2026-11-02T00:00:00.000Z',
                    },
                  },
                  editContent: {
                    value: {
                      action: 'editContent',
                      itemId: 'example-item-id',
                      expectedRevisionId: 'example-revision-id',
                      expectedUpdatedAt: '2026-10-26T00:00:00.000Z',
                      url: 'https://opportunities.example.org/events/student-hackathon',
                      title: 'Уточнённый студенческий хакатон',
                      summary: 'Короткий редакционный анонс.',
                      category: 'hackathon',
                      reason: 'Уточнение по официальной странице организатора.',
                    },
                  },
                  createSource: {
                    summary: 'Synthetic disabled RSS source; does not fetch the URL',
                    value: {
                      action: 'createSource',
                      name: 'Пример RSS источника',
                      type: 'rss',
                      feedUrl: 'https://opportunities.example.org/feed.xml',
                      allowedHost: 'opportunities.example.org',
                      rightsNote: 'Пример условий: сохраняется ссылка и краткое описание.',
                      termsUrl: 'https://opportunities.example.org/terms',
                      enabled: false,
                      intervalMinutes: 360,
                      maxItems: 50,
                    },
                  },
                  setSourceEnabled: {
                    value: {
                      action: 'setSourceEnabled',
                      sourceId: 'example-source-id',
                      enabled: true,
                    },
                  },
                  requestSync: {
                    value: { action: 'requestSync', sourceId: 'example-rss-source-id' },
                  },
                  addManualContent: {
                    summary: 'Synthetic entry for an enabled manual source of this hostname',
                    value: {
                      action: 'addManualContent',
                      sourceId: 'example-manual-source-id',
                      url: 'https://opportunities.example.org/events/student-hackathon',
                      title: 'Пример студенческого хакатона',
                      summary: 'Учебный пример для закрытой очереди.',
                      category: 'hackathon',
                      geography: 'Казахстан',
                      language: 'ru',
                      publishedAt: '2026-10-26T00:00:00.000Z',
                      deadline: null,
                      eventDate: null,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': successResponse(
              'Exact result selected by action; x-action-response maps all seven commands. Sync acknowledgement queues work or returns an existing active run, rather than confirming a completed fetch. Repeating the current manual revision creates no new item or revision.',
              schemaRef('ContentMutationResponse'),
              {
                saved: { value: { data: { saved: true } } },
                sourceCreated: { value: { data: { sourceId: 'example-source-id' } } },
                syncQueued: { value: { data: { runId: 'example-run-id', status: 'queued' } } },
                manualDuplicate: {
                  value: { data: { kind: 'duplicate', itemId: 'example-item-id' } },
                },
              },
            ),
            ...errors,
            '400': errorResponse(
              'Invalid JSON, fields, action or unsafe/mismatched material URL.',
              {
                invalidAction: {
                  value: {
                    error: 'Неизвестное действие модуля контента.',
                    code: 'VALIDATION_ERROR',
                  },
                },
              },
            ),
            '403': errorResponse(
              'Admin role, active account, verified email or same-origin check failed.',
              {
                wrongOrigin: {
                  value: {
                    error: 'Запрос должен быть отправлен с сайта платформы.',
                    code: 'FORBIDDEN',
                  },
                },
              },
            ),
            '409': errorResponse(
              'Collection is disabled, the enabled source has the wrong type, source limit or identity/transaction conflict.',
              {
                moduleDisabled: { value: { error: 'Внутренний сбор выключен.', code: 'CONFLICT' } },
              },
            ),
            '429': errorResponse(
              'The source cannot be requested before nextRunAt. Read source status before retrying.',
              {
                waitForSource: {
                  value: {
                    error: 'Источник ожидает следующего разрешённого запроса.',
                    code: 'RATE_LIMITED',
                  },
                },
              },
            ),
          },
        },
      },
      '/api/health': {
        get: {
          operationId: 'getReadiness',
          tags: ['Operations'],
          summary: 'Check bounded database readiness',
          security: [],
          description:
            'SELECT 1 only. Does not expose hostnames, configuration, credentials or database exceptions. This endpoint deliberately uses a status envelope instead of the application data/error envelope.',
          responses: {
            '200': {
              description: 'Database responded.',
              headers: { 'Cache-Control': { schema: { type: 'string', const: 'no-store' } } },
              content: {
                'application/json': {
                  schema: schemaRef('HealthOk'),
                  example: { status: 'ok' },
                },
              },
            },
            '503': {
              description: 'Database is unavailable.',
              headers: { 'Cache-Control': { schema: { type: 'string', const: 'no-store' } } },
              content: {
                'application/json': {
                  schema: schemaRef('HealthUnavailable'),
                  example: { status: 'unavailable' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'better-auth.session_token',
          description:
            'HttpOnly Better Auth session cookie in local HTTP mode; use the browser authentication flow. The API does not use arbitrary user/role headers.',
        },
        secureSessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: '__Secure-better-auth.session_token',
          description:
            'HTTPS secure-cookie variant of the Better Auth session; used in public mode.',
        },
      },
      parameters: {
        Origin: {
          name: 'Origin',
          in: 'header',
          required: true,
          description:
            'Must exactly equal the configured application origin. This is CSRF protection, not an authentication credential.',
          schema: { type: 'string', format: 'uri' },
        },
      },
      schemas: {
        ApiError: {
          ...responseSchema(apiErrorSchema, 'ApiError'),
          examples: [{ error: 'Войдите в аккаунт.', code: 'UNAUTHENTICATED' }],
        },
        ProfileInput: requestSchema(profileInput),
        ThreadsSearchInput: requestSchema(threadsSearchInput),
        ThreadsSearchData: responseSchema(threadsSearchDataSchema, 'ThreadsSearchData'),
        ThreadsSearchResponse: dataEnvelope('ThreadsSearchData'),
        ThreadsStatusData: responseSchema(threadsStatusDataSchema, 'ThreadsStatusData'),
        ThreadsStatusResponse: dataEnvelope('ThreadsStatusData'),
        LeadCommand: requestSchema(leadCommandSchema),
        LeadConversionInput: requestSchema(leadConversionInput),
        LeadListData: responseSchema(leadListDataSchema, 'LeadListData'),
        LeadListResponse: dataEnvelope('LeadListData'),
        LeadDetailData: responseSchema(leadDetailDataSchema, 'LeadDetailData'),
        LeadDetailResponse: dataEnvelope('LeadDetailData'),
        LeadMutationData: responseSchema(leadMutationDataSchema, 'LeadMutationData'),
        LeadMutationResponse: dataEnvelope('LeadMutationData'),
        LeadHandoffsData: responseSchema(leadHandoffsDataSchema, 'LeadHandoffsData'),
        LeadHandoffsResponse: dataEnvelope('LeadHandoffsData'),
        LeadConversionData: responseSchema(leadConversionDataSchema, 'LeadConversionData'),
        LeadConversionResponse: dataEnvelope('LeadConversionData'),
        ProfileData: responseSchema(profileDataSchema, 'ProfileData'),
        ProfileResponse: dataEnvelope('ProfileData'),
        ProfileSavedData: responseSchema(profileSavedDataSchema, 'ProfileSavedData'),
        ProfileSaved: dataEnvelope('ProfileSavedData'),
        HealthOk: responseSchema(okHealthSchema, 'HealthOk'),
        HealthUnavailable: responseSchema(unavailableHealthSchema, 'HealthUnavailable'),
        ContentIntakeData: responseSchema(contentIntakeDataSchema, 'ContentIntakeData'),
        ContentIntakeResponse: dataEnvelope('ContentIntakeData'),
        ContentDetailData: responseSchema(contentDetailDataSchema, 'ContentDetailData'),
        ContentDetailResponse: dataEnvelope('ContentDetailData'),
        PublicContentData: responseSchema(publicContentDataSchema, 'PublicContentData'),
        PublicContentResponse: dataEnvelope('PublicContentData'),
        ContentMutationData: responseSchema(contentMutationDataSchema, 'ContentMutationData'),
        ContentMutationResponse: dataEnvelope('ContentMutationData'),
        ContentCommand: {
          oneOf: Object.keys(contentInputs).map((action) => schemaRef(`ContentAction_${action}`)),
          discriminator: {
            propertyName: 'action',
            mapping: Object.fromEntries(
              Object.keys(contentInputs).map((action) => [
                action,
                `#/components/schemas/ContentAction_${action}`,
              ]),
            ),
          },
        },
        ...contentActionSchemas,
        ...contentResponseComponents,
        MarketplaceCommand: {
          oneOf: Object.keys(mutationSchemas).map((action) => ({
            $ref: `#/components/schemas/Action_${action}`,
          })),
          discriminator: {
            propertyName: 'action',
            mapping: Object.fromEntries(
              Object.keys(mutationSchemas).map((action) => [
                action,
                `#/components/schemas/Action_${action}`,
              ]),
            ),
          },
        },
        ...actionSchemas,
        ...viewResponseComponents,
        ...commandResponseComponents,
      },
    },
  };
}

export function serializeApiSpec() {
  return JSON.stringify(buildApiSpec(), null, 2) + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = new URL('../docs/api/openapi.json', import.meta.url);
  const expected = serializeApiSpec();
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== expected) {
      console.error('OpenAPI is out of date. Run node --import tsx scripts/generate-api-spec.ts.');
      process.exitCode = 1;
    } else {
      console.log('OpenAPI matches runtime request validators.');
    }
  } else {
    writeFileSync(target, expected);
    console.log('Updated docs/api/openapi.json.');
  }
}
