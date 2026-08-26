import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ApiExceptionFilter } from '../common/filters/api-exception.filter.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogService } from '../modules/audit-log/public.js';
import { AuthGuard, RolesGuard } from '../modules/auth/public.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistsController } from '../modules/checklists/checklists.controller.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { UploadService } from '../modules/upload/public.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const checklistId = '22222222-2222-2222-2222-222222222222';
const instanceId = '33333333-3333-3333-3333-333333333333';
const itemId = '44444444-4444-4444-4444-444444444444';
const userId = '55555555-5555-5555-5555-555555555555';

type HttpTestResponse = { statusCode?: number; body: unknown };
type InstancePatch = {
  status?: string;
  totalScore?: number;
  maxScore?: number;
  percentage?: number;
  passed?: boolean;
  submittedAt?: Date;
  completedAt?: Date;
};
type ResultCreate = {
  itemId: string;
  checked?: boolean;
  points: number;
};

type TestResult = {
  id: string;
  itemId: string;
  checked: boolean;
  scaleLevel: number | null;
  points: number;
  photoUrl: null;
  photoObjectKey: null;
  photoFileName: null;
  comment: null;
  reviewStatus: 'pending';
  reviewComment: null;
  reviewedBy: null;
  reviewedAt: null;
};

function patchJson(url: string, body: unknown): Promise<HttpTestResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const target = new URL(url);
    const req = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({ statusCode: response.statusCode, body: raw ? JSON.parse(raw) : null });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

describe('Checklist completion HTTP contract', () => {
  let app: INestApplication;
  const instance: { status: string } = { status: 'assigned' };
  const results: TestResult[] = [];

  beforeEach(async () => {
    instance.status = 'assigned';
    results.splice(0, results.length);

    const prisma = {
      checklistInstance: {
        findFirst: jest.fn(async () => ({ id: instanceId, userId, status: instance.status, checklistId })),
        findFirstOrThrow: jest.fn(async () => ({ checklistId, status: instance.status })),
        update: jest.fn(async ({ data }: { data: InstancePatch }) => {
          Object.assign(instance, data);
          return {
            id: instanceId,
            organizationId,
            checklistId,
            userId,
            assignedBy: userId,
            ...instance,
            totalScore: data.totalScore,
            maxScore: data.maxScore,
            percentage: data.percentage,
            passed: data.passed,
            dueAt: null,
            submittedAt: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            checklist: {
              id: checklistId,
              organizationId,
              title: 'Safety check',
              description: null,
              status: 'published',
              scoringMode: 'sum_points',
              passThreshold: 0,
              scaleLevels: null,
              requiresReview: false,
              createdBy: userId,
              createdAt: new Date(),
              updatedAt: new Date(),
              items: [{ id: itemId, checklistId, order: 0, text: 'Attach evidence', points: 10, isRequired: true, photoRequired: true }],
            },
            results,
          };
        }),
      },
      checklist: {
        findFirstOrThrow: jest.fn(async () => ({ scoringMode: 'sum_points', scaleLevels: null, requiresReview: false, passThreshold: 0 })),
      },
      checklistItem: {
        findFirst: jest.fn(async () => ({ id: itemId, points: 10 })),
        findMany: jest.fn(async () => [{ id: itemId, points: 10, isRequired: true, photoRequired: true }]),
      },
      checklistItemResult: {
        upsert: jest.fn(async ({ create }: { create: ResultCreate }) => {
          const created: TestResult = {
            id: 'result-1',
            itemId,
            checked: create.checked ?? false,
            scaleLevel: null,
            points: create.points,
            photoUrl: null,
            photoObjectKey: null,
            photoFileName: null,
            comment: null,
            reviewStatus: 'pending',
            reviewComment: null,
            reviewedBy: null,
            reviewedAt: null,
          };
          results[0] = created;
          return created;
        }),
        findMany: jest.fn(async () => results),
      },
      checklistInstanceEvent: {
        createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      },
    } as unknown as PrismaService;

    const moduleReference = await Test.createTestingModule({
      controllers: [ChecklistsController],
      providers: [
        ChecklistsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: {} },
        { provide: AuditLogService, useValue: { record: jest.fn(async () => undefined) } },
        {
          provide: ChecklistReviewAccessService,
          useValue: { filterPending: jest.fn(), assertReviewerCanAccess: jest.fn() },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const httpRequest = context.switchToHttp().getRequest<{ currentUser?: unknown }>();
          httpRequest.currentUser = {
            id: userId,
            organizationId,
            roles: ['learner'],
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleReference.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await app.listen(0);
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps a required photo item in progress after the answer until evidence is attached', async () => {
    const address = app.getHttpServer().address() as AddressInfo;
    const response = await patchJson(
      `http://127.0.0.1:${address.port}/api/v1/checklist-instances/${instanceId}/items/${itemId}`,
      { checked: true },
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      id: instanceId,
      status: 'in_progress',
      totalScore: 10,
    });
  });
});
