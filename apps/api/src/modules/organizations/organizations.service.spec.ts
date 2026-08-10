import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/upload.service.js';
import { createOrganizationSchema, registerOrganizationSchema, themeSettingsSchema } from './organizations.schemas.js';
import { OrganizationsService } from './organizations.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const uploadService = {} as UploadService;

function createRegistrationInput() {
  return registerOrganizationSchema.parse({
    organization: {
      name: 'Acme LMS',
      slug: 'acme-lms',
    },
    admin: {
      email: 'ADMIN@Example.com',
      password: 'secret-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
  });
}

describe('Organizations validation', () => {
  it('accepts valid organization input', () => {
    const input = createOrganizationSchema.parse({
      name: 'Acme',
      slug: 'acme',
    });

    expect(input).toEqual({
      name: 'Acme',
      slug: 'acme',
      status: 'active',
      plan: 'trial',
    });
  });

  it('rejects invalid organization slug', () => {
    expect(() =>
      createOrganizationSchema.parse({
        name: 'Acme',
        slug: 'Bad Slug',
      }),
    ).toThrow();
  });

  it('accepts registration input and normalizes admin email', () => {
    const input = createRegistrationInput();

    expect(input.admin.email).toBe('admin@example.com');
    expect(input.organization.status).toBe('active');
    expect(input.organization.plan).toBe('trial');
  });
});

describe('OrganizationsService registration', () => {
  it('creates organization, first admin, and admin membership', async () => {
    const createdMemberships: unknown[] = [];
    const prisma = {
      organization: {
        findFirst: async () => null,
        create: async ({ data }: { data: { name: string; slug: string } }) => ({
          id: organizationId,
          name: data.name,
          slug: data.slug,
          status: 'active',
          plan: 'trial',
        }),
      },
      user: {
        findFirst: async () => null,
        create: async ({ data }: { data: { organizationId: string; email: string; passwordHash: string } }) => ({
          id: 'user-1',
          organizationId: data.organizationId,
          email: data.email,
          passwordHash: data.passwordHash,
          firstName: 'Ada',
          lastName: 'Lovelace',
        }),
      },
      membership: {
        create: async ({ data }: { data: unknown }) => {
          createdMemberships.push(data);

          return { id: 'membership-1' };
        },
      },
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma),
    } as unknown as PrismaService;

    const service = new OrganizationsService(prisma, uploadService);

    await expect(service.registerOrganization(createRegistrationInput())).resolves.toMatchObject({
      organization: {
        id: organizationId,
        slug: 'acme-lms',
      },
      admin: {
        id: 'user-1',
        organizationId,
        email: 'admin@example.com',
      },
    });
    expect(createdMemberships).toEqual([
      {
        organizationId,
        userId: 'user-1',
        role: 'admin',
      },
    ]);
  });

  it('rejects registration when organization slug already exists', async () => {
    const prisma = {
      organization: {
        findFirst: async () => ({ id: organizationId }),
      },
      user: {
        findFirst: async () => null,
      },
      membership: {
        create: async () => ({ id: 'membership-1' }),
      },
      $transaction: async () => {
        throw new Error('should not create');
      },
    } as unknown as PrismaService;

    const service = new OrganizationsService(prisma, uploadService);

    await expect(service.registerOrganization(createRegistrationInput())).rejects.toBeInstanceOf(ConflictException);
  });
});

function createThemeSettingsInput() {
  return themeSettingsSchema.parse({
    colorPrimary: '#4f46e5',
    colorPrimaryHover: '#4338ca',
    colorBackground: '#f5f7fb',
    colorSurface: '#ffffff',
    colorSurfaceMuted: '#f8fafc',
    colorBorder: '#e3e8ef',
    colorText: '#172033',
    colorTextMuted: '#667085',
    shadowCard: '0 8px 24px rgb(23 32 51 / 5%)',
    radiusSm: '6px',
    radiusMd: '11px',
    radiusLg: '18px',
    spacePage: 'clamp(16px, 4vw, 48px)',
    adminSidebarBackground: '#111827',
    adminSidebarText: '#ffffff',
    adminSidebarTextMuted: '#cbd5e1',
    platformName: 'LearnSpace',
  });
}

describe('OrganizationsService theme settings', () => {
  it('returns null theme settings when none have been saved', async () => {
    const prisma = {
      organization: {
        findFirst: async () => ({ themeSettings: null }),
      },
    } as unknown as PrismaService;

    const service = new OrganizationsService(prisma, uploadService);

    await expect(service.getThemeSettings(organizationId)).resolves.toEqual({ themeSettings: null });
  });

  it('throws when the organization does not exist', async () => {
    const prisma = {
      organization: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;

    const service = new OrganizationsService(prisma, uploadService);

    await expect(service.getThemeSettings(organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates and returns the saved theme settings', async () => {
    const themeSettings = createThemeSettingsInput();
    const updateCalls: unknown[] = [];
    const prisma = {
      organization: {
        findFirst: async () => ({ themeSettings: null }),
        update: async ({ data }: { data: { themeSettings: unknown } }) => {
          updateCalls.push(data);

          return { themeSettings: data.themeSettings };
        },
      },
    } as unknown as PrismaService;

    const service = new OrganizationsService(prisma, uploadService);

    await expect(service.updateThemeSettings(organizationId, themeSettings)).resolves.toEqual({ themeSettings });
    expect(updateCalls).toEqual([{ themeSettings }]);
  });

  it('resets theme settings back to null', async () => {
    const updateCalls: unknown[] = [];
    const prisma = {
      organization: {
        findFirst: async () => ({ themeSettings: createThemeSettingsInput() }),
        update: async ({ data }: { data: { themeSettings: unknown } }) => {
          updateCalls.push(data);

          return { id: organizationId };
        },
      },
    } as unknown as PrismaService;

    const service = new OrganizationsService(prisma, uploadService);

    await expect(service.resetThemeSettings(organizationId)).resolves.toEqual({ themeSettings: null });
    expect(updateCalls).toEqual([{ themeSettings: Prisma.JsonNull }]);
  });

  it('preserves the existing logo when saving other theme settings', async () => {
    const themeSettings = createThemeSettingsInput();
    const updateCalls: unknown[] = [];
    const prisma = {
      organization: {
        findFirst: async () => ({
          themeSettings: { ...themeSettings, logoObjectKey: 'organizations/org/branding/1', logoMimeType: 'image/png' },
        }),
        update: async ({ data }: { data: { themeSettings: unknown } }) => {
          updateCalls.push(data);

          return { themeSettings: data.themeSettings };
        },
      },
    } as unknown as PrismaService;
    const getInlinePresignedUrl = jest.fn().mockResolvedValue('https://files.example.com/signed-logo');
    const service = new OrganizationsService(prisma, { getInlinePresignedUrl } as unknown as UploadService);

    const result = await service.updateThemeSettings(organizationId, themeSettings);

    expect(updateCalls).toEqual([
      { themeSettings: { ...themeSettings, logoObjectKey: 'organizations/org/branding/1', logoMimeType: 'image/png' } },
    ]);
    expect(getInlinePresignedUrl).toHaveBeenCalledWith('organizations/org/branding/1', 'image/png');
    expect(result.themeSettings).toMatchObject({ logoUrl: 'https://files.example.com/signed-logo' });
  });

  it('uploads a logo, stores its object key, and deletes the previous one', async () => {
    const themeSettings = { ...createThemeSettingsInput(), logoObjectKey: 'organizations/org/branding/old', logoMimeType: 'image/jpeg' };
    const updateCalls: unknown[] = [];
    const prisma = {
      organization: {
        findFirst: async () => ({ themeSettings }),
        update: async ({ data }: { data: { themeSettings: unknown } }) => {
          updateCalls.push(data);

          return { themeSettings: data.themeSettings };
        },
      },
    } as unknown as PrismaService;
    const uploadOrganizationLogo = jest.fn().mockResolvedValue('organizations/org/branding/new');
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const getInlinePresignedUrl = jest.fn().mockResolvedValue('https://files.example.com/new-logo');
    const service = new OrganizationsService(
      prisma,
      { uploadOrganizationLogo, deleteObject, getInlinePresignedUrl } as unknown as UploadService,
    );
    const file = { mimetype: 'image/png' } as Express.Multer.File;

    const result = await service.uploadLogo(organizationId, file);

    expect(uploadOrganizationLogo).toHaveBeenCalledWith(file, organizationId);
    expect(updateCalls).toEqual([
      { themeSettings: { ...themeSettings, logoObjectKey: 'organizations/org/branding/new', logoMimeType: 'image/png' } },
    ]);
    expect(deleteObject).toHaveBeenCalledWith('organizations/org/branding/old');
    expect(result.themeSettings).toMatchObject({ logoUrl: 'https://files.example.com/new-logo' });
  });
});
