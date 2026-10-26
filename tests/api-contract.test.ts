import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { leadActionInputs, leadCommandSchema } from '../src/lib/lead-validation';
import { buildApiSpec, requestSchema, serializeApiSpec } from '../scripts/generate-api-spec';
import { mutationSchemas, type Action } from '../src/lib/validation';
import { catalogQuerySchema, platformViews } from '../src/lib/catalog-query';
import { profileInput } from '../src/app/api/profile/schema';
import {
  contentSettingsInput,
  contentReviewInput,
  contentEditInput,
  manualContentInput,
  requestSyncInput,
  sourceInput,
} from '../src/lib/content-validation';
import {
  contentIntakeDataSchema,
  contentMutationDataSchema,
} from '../src/contracts/content-intake';
import {
  apiErrorSchema,
  commandDataSchemas,
  profileSavedDataSchema,
  viewDataSchemas,
} from '../src/contracts/api-responses';

describe('Maintained application API contract', () => {
  it('keeps the saved OpenAPI artifact synchronized with runtime request validators', () => {
    const saved = readFileSync(new URL('../docs/api/openapi.json', import.meta.url), 'utf8');
    expect(saved).toBe(serializeApiSpec());
    expect(JSON.parse(saved).openapi).toBe('3.1.0');
  });

  it('requires a literal action for every implemented command and documents all access boundaries', () => {
    const spec = buildApiSpec();
    const schemas = spec.components.schemas as Record<string, Record<string, unknown>>;
    const union = schemas.MarketplaceCommand.oneOf as { $ref: string }[];
    expect(union.map((item) => item.$ref)).toEqual(
      Object.keys(mutationSchemas).map((action) => `#/components/schemas/Action_${action}`),
    );
    for (const action of Object.keys(mutationSchemas)) {
      expect(spec.components.schemas.MarketplaceCommand.discriminator.mapping[action]).toBe(
        `#/components/schemas/Action_${action}`,
      );
      const schema = schemas[`Action_${action}`];
      expect(schema.required).toContain('action');
      expect((schema.properties as Record<string, unknown>).action).toEqual({
        type: 'string',
        const: action,
      });
      expect(spec.paths['/api/platform'].post['x-action-access'][action as Action]).toBeTruthy();
    }
    expect(Object.keys(spec.paths['/api/platform'].get['x-view-access']).sort()).toEqual(
      [...platformViews].sort(),
    );
    expect(spec.paths['/api/platform'].get['x-view-access'].work).toContain('participants only');
    expect(spec.paths['/api/platform'].get['x-view-access'].applications).toContain('owner');
    expect(spec.paths['/api/platform'].get['x-view-access'].admin).toContain('excluded');
  });

  it('publishes safe synthetic examples accepted by the actual request schemas', () => {
    const spec = buildApiSpec();
    const examples =
      spec.paths['/api/platform'].post.requestBody.content['application/json'].examples;
    for (const { value } of Object.values(examples)) {
      expect(mutationSchemas[value.action as Action].safeParse(value).success).toBe(true);
    }
    const student =
      spec.paths['/api/profile'].post.requestBody.content['application/json'].examples.student
        .value;
    expect(profileInput.safeParse(student).success).toBe(true);
    expect(profileInput.safeParse({ ...student, role: 'admin' }).success).toBe(false);
    expect(profileInput.safeParse({ ...student, verificationStatus: 'verified' }).success).toBe(
      false,
    );
    expect(catalogQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
    expect(catalogQuerySchema.safeParse({ minBudget: '2000', maxBudget: '1000' }).success).toBe(
      false,
    );
  });

  it('preserves field bounds and explicitly represents deadlines for API tooling', () => {
    const project = requestSchema(mutationSchemas.createProject);
    const fields = project.properties as Record<string, Record<string, unknown>>;
    expect(fields.budgetKzt).toMatchObject({ type: 'integer', minimum: 1, maximum: 10000000 });
    expect(fields.dueAt).toMatchObject({ type: 'string', format: 'date-time' });
    expect(fields.acceptanceCriteria).toMatchObject({ type: 'array', minItems: 1, maxItems: 15 });
    const profile = requestSchema(profileInput);
    expect(profile.additionalProperties).toBe(false);
    expect((profile.properties as Record<string, unknown>).role).toMatchObject({
      enum: ['student', 'client'],
    });
  });

  it('distinguishes application and health envelopes and uses real cookie alternatives', () => {
    const spec = buildApiSpec();
    expect(spec.paths['/api/platform'].get.security).toContainEqual({});
    expect(spec.paths['/api/platform'].post.security).not.toContainEqual({});
    expect(spec.paths['/api/profile'].get.security).not.toContainEqual({});
    expect(spec.components.securitySchemes.sessionCookie.name).toBe('better-auth.session_token');
    expect(spec.components.securitySchemes.secureSessionCookie.name).toBe(
      '__Secure-better-auth.session_token',
    );
    expect((spec.components.schemas.ApiError as Record<string, unknown>).required).toEqual([
      'error',
      'code',
    ]);
    expect(
      spec.paths['/api/health'].get.responses['503'].content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/HealthUnavailable' });
    expect(spec.components.schemas.HealthUnavailable).toMatchObject({
      properties: { status: { const: 'unavailable' } },
      additionalProperties: false,
    });
    expect(spec.paths['/api/health'].get.security).toEqual([]);
  });

  it('provides an exact response envelope for every view and command without a fictional discriminator', () => {
    const spec = buildApiSpec();
    const schemas = spec.components.schemas as Record<string, Record<string, unknown>>;
    expect(schemas).not.toHaveProperty('ApiSuccess');
    expect(Object.keys(spec.paths['/api/platform'].get['x-view-response'])).toEqual([
      ...platformViews,
    ]);
    for (const view of platformViews) {
      expect(spec.paths['/api/platform'].get['x-view-response'][view]).toEqual({
        $ref: `#/components/schemas/ViewResponse_${view}`,
      });
      expect(schemas[`ViewResponse_${view}`]).toEqual({
        type: 'object',
        required: ['data'],
        additionalProperties: false,
        properties: { data: { $ref: `#/components/schemas/ViewData_${view}` } },
      });
    }
    expect(Object.keys(spec.paths['/api/platform'].post['x-action-response'])).toEqual(
      Object.keys(mutationSchemas),
    );
    for (const action of Object.keys(mutationSchemas) as Action[]) {
      expect(spec.paths['/api/platform'].post['x-action-response'][action]).toEqual({
        $ref: `#/components/schemas/CommandResponse_${action}`,
      });
      expect(schemas[`CommandResponse_${action}`]).toMatchObject({
        required: ['data'],
        additionalProperties: false,
        properties: { data: { $ref: `#/components/schemas/CommandData_${action}` } },
      });
    }
    const getSchema =
      spec.paths['/api/platform'].get.responses['200'].content['application/json'].schema;
    const postSchema =
      spec.paths['/api/platform'].post.responses['200'].content['application/json'].schema;
    expect(getSchema.anyOf).toHaveLength(platformViews.length);
    expect(postSchema.anyOf).toHaveLength(new Set(Object.values(commandDataSchemas)).size);
    expect(getSchema).not.toHaveProperty('oneOf');
    expect(postSchema).not.toHaveProperty('discriminator');
  });

  it('documents concrete wire fields, dates, nullability and strict public projections', () => {
    const schemas = buildApiSpec().components.schemas as Record<string, Record<string, unknown>>;
    const catalog = schemas.ViewData_catalog;
    expect(catalog).toMatchObject({ type: 'object', additionalProperties: false });
    expect(catalog.required).toEqual(
      expect.arrayContaining(['projects', 'total', 'categories', 'page']),
    );
    const catalogFields = catalog.properties as Record<string, Record<string, unknown>>;
    const project = catalogFields.projects.items as Record<string, unknown>;
    expect(project.additionalProperties).toBe(false);
    expect(project.properties).not.toHaveProperty('locationPrivate');
    expect(project.properties).not.toHaveProperty('contactPrivate');
    const created = schemas.CommandData_createProject.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(created.dueAt).toMatchObject({ type: 'string', format: 'date-time' });
    expect(JSON.stringify(created.publishedAt)).toContain('null');
    expect(created.status.enum).toContain('draft');
    const profile = schemas.ProfileData;
    expect(profile).toMatchObject({ type: 'object', additionalProperties: false });
    expect(profile.properties).not.toHaveProperty('sessions');
    expect(profile.properties).not.toHaveProperty('accounts');
  });

  it('ships response examples accepted by the same strict serialized schemas', () => {
    const spec = buildApiSpec();
    const catalog = spec.paths['/api/platform'].get.responses['200'].content['application/json']
      .examples?.catalog.value as { data: unknown };
    expect(viewDataSchemas.catalog.safeParse(catalog.data).success).toBe(true);
    const saved = spec.paths['/api/profile'].post.responses['200'].content['application/json']
      .examples?.savedStudent.value as { data: unknown };
    expect(profileSavedDataSchema.safeParse(saved.data).success).toBe(true);
    expect(apiErrorSchema.safeParse(spec.components.schemas.ApiError.examples[0]).success).toBe(
      true,
    );
  });

  it('resolves every local JSON reference instead of shipping dangling request components', () => {
    const spec = buildApiSpec();
    const references: string[] = [];
    function visit(value: unknown) {
      if (Array.isArray(value)) return value.forEach(visit);
      if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          if (key === '$ref') references.push(String(nested));
          else visit(nested);
        }
      }
    }
    visit(spec);
    for (const reference of references) {
      expect(reference.startsWith('#/')).toBe(true);
      const target = reference
        .slice(2)
        .split('/')
        .reduce<unknown>((value, key) => {
          return value && typeof value === 'object'
            ? (value as Record<string, unknown>)[key]
            : undefined;
        }, spec);
      expect(target, reference).toBeDefined();
    }
  });

  it('documents the admin content boundary, bounded pagination and seven literal actions', () => {
    const spec = buildApiSpec();
    const content = spec.paths['/api/admin/content'];
    const schemas = spec.components.schemas as Record<string, Record<string, unknown>>;
    const actions = [
      'setModuleEnabled',
      'createSource',
      'setSourceEnabled',
      'requestSync',
      'addManualContent',
      'reviewContent',
      'editContent',
    ];
    expect(content.get.security).not.toContainEqual({});
    expect(content.post.security).not.toContainEqual({});
    expect(content.post.parameters).toContainEqual({ $ref: '#/components/parameters/Origin' });
    expect(
      content.get.parameters.find((parameter) => 'name' in parameter && parameter.name === 'page'),
    ).toMatchObject({
      name: 'page',
      schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
    });
    expect(content.get.description).toContain('20 items per page');
    expect(content.post.description).toContain('32768 bytes');
    expect(Object.keys(content.post['x-action-access'])).toEqual(actions);
    expect(Object.keys(content.post['x-action-response'])).toEqual(actions);
    expect(schemas.ContentCommand.oneOf).toEqual(
      actions.map((action) => ({
        $ref: `#/components/schemas/ContentAction_${action}`,
      })),
    );
    for (const action of actions) {
      expect(schemas[`ContentAction_${action}`]).toMatchObject({
        required: expect.arrayContaining(['action']),
        properties: { action: { type: 'string', const: action } },
      });
      expect(
        content.post['x-action-access'][action as keyof (typeof content.post)['x-action-access']],
      ).toContain('Admin only');
    }
    expect(schemas.ContentAction_createSource).toMatchObject({
      properties: {
        enabled: { default: false },
        maxItems: { type: 'integer', minimum: 1, maximum: 100 },
        intervalMinutes: { type: 'integer', minimum: 60, maximum: 10080 },
      },
    });
    expect(schemas.ContentAction_addManualContent).toMatchObject({
      properties: { title: { minLength: 8, maxLength: 200 }, summary: { maxLength: 600 } },
    });
    expect(content.post['x-action-access'].addManualContent).toContain('No publication');
    expect(content.post['x-action-access'].setModuleEnabled).toContain('initially false');
  });

  it('keeps content request examples valid under the server validators and cross-field rules', () => {
    const examples =
      buildApiSpec().paths['/api/admin/content'].post.requestBody.content['application/json']
        .examples;
    expect(contentSettingsInput.safeParse(examples.setModuleEnabled.value).success).toBe(true);
    expect(sourceInput.safeParse(examples.createSource.value).success).toBe(true);
    expect(
      requestSyncInput.and(contentSettingsInput).safeParse(examples.setSourceEnabled.value).success,
    ).toBe(true);
    expect(requestSyncInput.safeParse(examples.requestSync.value).success).toBe(true);
    expect(manualContentInput.safeParse(examples.addManualContent.value).success).toBe(true);
    expect(contentReviewInput.safeParse(examples.reviewContent.value).success).toBe(true);
    expect(contentEditInput.safeParse(examples.editContent.value).success).toBe(true);
    expect(
      sourceInput.safeParse({
        ...examples.createSource.value,
        allowedHost: 'different.example.org',
      }).success,
    ).toBe(false);
    expect(sourceInput.safeParse({ ...examples.createSource.value, type: 'manual' }).success).toBe(
      false,
    );
  });

  it('separates public approved cards from protected editorial history', () => {
    const spec = buildApiSpec();
    const publicRead = spec.paths['/api/content/posts'].get;
    expect(publicRead.security).toEqual([]);
    expect(
      publicRead.parameters.find((parameter) => 'name' in parameter && parameter.name === 'limit'),
    ).toMatchObject({
      name: 'limit',
      schema: { minimum: 1, maximum: 6 },
    });
    expect(publicRead.description).toContain('approved immutable snapshot');
    const detail = spec.paths['/api/admin/content/{id}'].get;
    expect(detail.security).not.toContainEqual({});
    expect(detail.parameters).toContainEqual({
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
    const schemas = spec.components.schemas as Record<string, Record<string, unknown>>;
    const publicData = schemas.PublicContentData.properties as Record<
      string,
      { items: { properties: Record<string, unknown> } }
    >;
    const fields = Object.keys(publicData.posts.items.properties);
    expect(fields).toContain('url');
    for (const hidden of [
      'sourceId',
      'contentHash',
      'actorId',
      'rightsNote',
      'externalId',
      'approvedRevisionId',
    ])
      expect(fields).not.toContain(hidden);
    expect(spec.paths['/api/admin/content'].post['x-action-access'].reviewContent).toContain(
      'expectedUpdatedAt',
    );
  });

  it('keeps leads private and describes all manual commands and the owner-only draft handoff', () => {
    const spec = buildApiSpec();
    const admin = spec.paths['/api/admin/leads'],
      owner = spec.paths['/api/leads'];
    expect(admin.get.security).not.toContainEqual({});
    expect(owner.get.security).not.toContainEqual({});
    expect(admin.post['x-actions']).toEqual(Object.keys(leadActionInputs));
    expect(owner.post.description).toContain('confirmation=true');
    expect(owner.post.description).toContain('identical payload replay');
    expect(spec.paths['/api/admin/leads/{id}'].get.security).not.toContainEqual({});
    const schemas = spec.components.schemas as Record<string, Record<string, unknown>>;
    const handoffs = schemas.LeadHandoffsData.properties as Record<
      string,
      { items: { properties: Record<string, unknown> } }
    >;
    for (const privateField of [
      'consentEvidence',
      'conversionHash',
      'assignedToId',
      'createdById',
      'events',
    ])
      expect(Object.keys(handoffs.leads.items.properties)).not.toContain(privateField);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T00:00:00Z'));
    try {
      for (const sample of Object.values(
        admin.post.requestBody.content['application/json'].examples,
      ))
        expect(leadCommandSchema.safeParse(sample.value).success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps content result and error examples valid under the shared serialized contracts', () => {
    const content = buildApiSpec().paths['/api/admin/content'];
    const empty = content.get.responses['200'].content['application/json'].examples?.emptyDisabled
      .value as { data: unknown };
    expect(contentIntakeDataSchema.safeParse(empty.data).success).toBe(true);
    for (const { value } of Object.values(
      content.post.responses['200'].content['application/json'].examples ?? {},
    )) {
      expect(contentMutationDataSchema.safeParse((value as { data: unknown }).data).success).toBe(
        true,
      );
    }
    for (const status of ['400', '403', '409', '429'] as const) {
      for (const { value } of Object.values(
        content.post.responses[status].content['application/json'].examples ?? {},
      )) {
        expect(apiErrorSchema.safeParse(value).success).toBe(true);
      }
    }
  });
});
