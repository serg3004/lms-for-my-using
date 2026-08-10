import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ApiExceptionFilter } from '../common/filters/api-exception.filter.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuthGuard, RolesGuard } from '../modules/auth/public.js';
import { CourseAccessPolicy } from '../modules/course-access/public.js';
import { CoursesController } from '../modules/courses/courses.controller.js';
import { CoursesService } from '../modules/courses/courses.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const instructorId = '33333333-3333-3333-3333-333333333333';
const adminId = '44444444-4444-4444-4444-444444444444';

type HttpTestResponse = {
  statusCode?: number;
  body: unknown;
};

function getAppUrl(app: INestApplication) {
  const address = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function postJson(url: string, body: unknown): Promise<HttpTestResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const target = new URL(url);
    const req = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: response.statusCode,
            body: rawBody ? JSON.parse(rawBody) : null,
          });
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('Course instructor role HTTP contract', () => {
  let app: INestApplication;
  const findInstructor = jest.fn(async () => null);
  const upsert = jest.fn(async () => ({}));

  beforeEach(async () => {
    findInstructor.mockClear();
    upsert.mockClear();

    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      user: { findFirst: findInstructor },
      courseInstructor: { upsert },
    } as unknown as PrismaService;

    const moduleReference = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CourseAccessPolicy,
          useValue: { assertCourseAccess: jest.fn(async () => undefined) },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const httpRequest = context.switchToHttp().getRequest<{ currentUser?: unknown }>();
          httpRequest.currentUser = {
            id: adminId,
            organizationId,
            roles: ['admin'],
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

  it('returns 404 and does not create an assignment when the target lacks instructor membership', async () => {
    const path = `/api/v1/courses/${courseId}/instructors`;
    const response = await postJson(`${getAppUrl(app)}${path}`, { instructorId });

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: {
        message: 'User not found',
      },
      path,
    });
    expect(findInstructor).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        memberships: {
          some: {
            organizationId,
            role: 'instructor',
          },
        },
      }),
    }));
    expect(upsert).not.toHaveBeenCalled();
  });
});
