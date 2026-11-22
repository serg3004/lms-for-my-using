import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import type { AnalyticsFieldFilters, CreateUserFieldInput, CustomFieldValues, UpdateUserFieldInput } from './user-fields.schemas.js';
import {
  canEditField, canSeeField, isEmptyInput, normalizeFieldValue, normalizeText, optionKeyFromTitle, optionTitle, presentFieldValue, searchTerms,
  FIELD_LANGUAGES, WORK_SCHEDULE_KEY,
  type FieldDefinition, type FieldLabels, type FieldOption, type FieldType, type FieldViewer,
} from './user-field-values.js';

type Db = PrismaService | Prisma.TransactionClient;
type DefinitionRow = Prisma.UserFieldDefinitionGetPayload<object>;

export type FieldWrite =
  | { definition: FieldDefinition; clear: true }
  | { definition: FieldDefinition; clear?: false; value: string; normalized: string };
export type FieldProblem = { key: string; status: 400 | 403; message: string };
export type FieldChange = { key: string; from: string | number | boolean | null; to: string | number | boolean | null; unique: boolean };

function toDefinition(row: DefinitionRow): FieldDefinition {
  return {
    id: row.id, key: row.key, labels: row.labels as FieldLabels, type: row.type, required: row.required, isUnique: row.isUnique, searchable: row.searchable,
    options: (row.options as FieldOption[] | null) ?? null, visibleTo: row.visibleTo, editableBy: row.editableBy, sortOrder: row.sortOrder, archivedAt: row.archivedAt,
  };
}

/** The definition as an administrator sees it. */
export function presentDefinition(definition: FieldDefinition, valueCount?: number) {
  return {
    id: definition.id, key: definition.key, labels: definition.labels, type: definition.type, required: definition.required, unique: definition.isUnique,
    searchable: definition.searchable, options: definition.options, visibleTo: definition.visibleTo, editableBy: definition.editableBy,
    sortOrder: definition.sortOrder, archived: definition.archivedAt !== null, ...(valueCount === undefined ? {} : { valueCount }),
  };
}

/** The definition as a non-administrator sees it: no rights lists, only whether they may change the value. */
export function presentDefinitionFor(definition: FieldDefinition, viewer: FieldViewer) {
  return {
    key: definition.key, labels: definition.labels, type: definition.type, required: definition.required, unique: definition.isUnique, searchable: definition.searchable,
    options: definition.options?.filter((option) => !option.archived) ?? null, sortOrder: definition.sortOrder, editable: canEditField(definition, viewer),
  };
}

/**
 * Checks the values a client sends against the active definitions, without touching the database. A field the viewer cannot see is
 * reported exactly like a field that does not exist; a visible field the viewer may not change is a 403.
 */
export function validateFieldValues(
  definitions: FieldDefinition[], viewer: FieldViewer, input: CustomFieldValues,
  options: { mode: 'create' | 'update'; current?: ReadonlyMap<string, string> },
): { writes: FieldWrite[]; problems: FieldProblem[] } {
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const writes: FieldWrite[] = [];
  const problems: FieldProblem[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const definition = byKey.get(key);
    if (!definition || definition.archivedAt || !canSeeField(definition, viewer)) { problems.push({ key, status: 400, message: `Unknown field "${key}"` }); continue; }
    if (!canEditField(definition, viewer)) { problems.push({ key, status: 403, message: `The field "${key}" cannot be changed by you` }); continue; }
    if (isEmptyInput(raw)) {
      if (definition.required) problems.push({ key, status: 400, message: `The field "${key}" is required` });
      else writes.push({ definition, clear: true });
      continue;
    }
    const result = normalizeFieldValue(definition, raw, options.current?.get(definition.id));
    if (!result.ok) {
      problems.push({ key, status: 400, message: result.code === 'option' ? `The value of "${key}" is not one of the options` : result.code === 'tooLong' ? `The value of "${key}" is too long` : `The value of "${key}" is not valid` });
      continue;
    }
    writes.push({ definition, value: result.value, normalized: result.normalized });
  }
  if (options.mode === 'create') {
    const provided = new Set(Object.keys(input));
    for (const definition of definitions) {
      if (definition.required && !definition.archivedAt && canEditField(definition, viewer) && !provided.has(definition.key)) {
        problems.push({ key: definition.key, status: 400, message: `The field "${definition.key}" is required` });
      }
    }
  }
  return { writes, problems };
}

function throwProblem(problem: FieldProblem): never {
  if (problem.status === 403) throw new ForbiddenException(problem.message);
  throw new BadRequestException(problem.message);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

const TEMPLATE: Array<{ key: string; labels: FieldLabels; type: FieldType; unique?: boolean; searchable?: boolean; visibleTo: string[]; editableBy: string[] }> = [
  { key: 'employee_number', labels: { ru: 'Табельный номер', en: 'Employee number', kk: 'Табель нөмірі', zh: '工号' }, type: 'text', unique: true, searchable: true, visibleTo: ['manager'], editableBy: [] },
  { key: 'whatsapp', labels: { ru: 'WhatsApp', en: 'WhatsApp', kk: 'WhatsApp', zh: 'WhatsApp' }, type: 'phone', visibleTo: ['manager', 'self'], editableBy: ['self'] },
  { key: 'telegram', labels: { ru: 'Telegram', en: 'Telegram', kk: 'Telegram', zh: 'Telegram' }, type: 'phone', visibleTo: ['manager', 'self'], editableBy: ['self'] },
  { key: 'hire_date', labels: { ru: 'Дата приёма', en: 'Hire date', kk: 'Қабылдау күні', zh: '入职日期' }, type: 'date', visibleTo: ['manager', 'self'], editableBy: [] },
  { key: WORK_SCHEDULE_KEY, labels: { ru: 'График работы', en: 'Work schedule', kk: 'Жұмыс кестесі', zh: '工作时间表' }, type: 'list', visibleTo: ['manager', 'self'], editableBy: ['manager'] },
];

const DEFAULT_SCHEDULE_OPTIONS: FieldOption[] = [
  { key: '2-2', labels: { ru: '2/2', en: '2/2', kk: '2/2', zh: '2/2' } },
  { key: '5-2', labels: { ru: '5/2', en: '5/2', kk: '5/2', zh: '5/2' } },
  { key: 'shift', labels: { ru: 'Сменный', en: 'Shift work', kk: 'Ауысымды', zh: '轮班' } },
];

function optionMatches(option: FieldOption, text: string): boolean {
  const wanted = normalizeText(text);
  return option.key === wanted || FIELD_LANGUAGES.some((language) => normalizeText(option.labels[language]) === wanted);
}

/** PR 499: definitions and values of the custom user fields of an organization. */
@Injectable()
export class UserFieldsService {
  private readonly seeded = new Set<string>();

  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  // ── Definitions (administrator) ────────────────────────────────────────────────

  async listDefinitions(organizationId: string, includeArchived: boolean) {
    await this.ensureSeeded(organizationId);
    const rows = await this.prisma.userFieldDefinition.findMany({
      where: { organizationId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const counts = await this.prisma.userFieldValue.groupBy({ by: ['fieldId'], where: { organizationId, fieldId: { in: rows.map((row) => row.id) } }, _count: { _all: true } });
    const countOf = new Map(counts.map((entry) => [entry.fieldId, entry._count._all]));
    return { items: rows.map((row) => presentDefinition(toDefinition(row), countOf.get(row.id) ?? 0)) };
  }

  async getDefinition(organizationId: string, key: string) {
    const row = await this.prisma.userFieldDefinition.findFirst({ where: { organizationId, key } });
    if (!row) throw new NotFoundException('Field not found');
    const valueCount = await this.prisma.userFieldValue.count({ where: { organizationId, fieldId: row.id } });
    return presentDefinition(toDefinition(row), valueCount);
  }

  async createDefinition(organizationId: string, input: CreateUserFieldInput, actorId: string) {
    await this.ensureSeeded(organizationId);
    const last = await this.prisma.userFieldDefinition.aggregate({ where: { organizationId }, _max: { sortOrder: true } });
    try {
      const row = await this.prisma.userFieldDefinition.create({
        data: {
          organizationId, key: input.key, labels: input.labels, type: input.type, required: input.required, isUnique: input.unique, searchable: input.searchable,
          ...(input.options ? { options: input.options } : {}), visibleTo: input.visibleTo, editableBy: input.editableBy, sortOrder: input.sortOrder ?? (last._max.sortOrder ?? 0) + 10,
        },
      });
      await this.auditLog.record({ organizationId, actorId, action: 'user_field.created', targetType: 'user_field', targetId: row.id, summary: `Created user field ${row.key}`, metadata: { key: row.key, type: row.type, required: row.required, unique: row.isUnique } });
      return presentDefinition(toDefinition(row), 0);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A field with this key already exists');
      throw error;
    }
  }

  async updateDefinition(organizationId: string, key: string, input: UpdateUserFieldInput, actorId: string) {
    await this.ensureSeeded(organizationId);
    const row = await this.prisma.userFieldDefinition.findFirst({ where: { organizationId, key } });
    if (!row) throw new NotFoundException('Field not found');
    const current = toDefinition(row);

    if (input.options !== undefined) {
      if (current.type !== 'list') throw new BadRequestException('Only a list field has options');
      const kept = new Set(input.options.map((option) => option.key));
      if ((current.options ?? []).some((option) => !kept.has(option.key))) throw new BadRequestException('An option cannot be removed: archive it instead');
    }
    const unique = input.unique ?? current.isUnique;
    const searchable = input.searchable ?? current.searchable;
    if ((unique || searchable) && !['text', 'number', 'phone'].includes(current.type)) throw new BadRequestException('Unique and searchable fit text, number and phone fields only');
    const visibleTo = input.visibleTo ?? current.visibleTo;
    const editableBy = (input.editableBy ?? current.editableBy).filter((viewer) => visibleTo.includes(viewer));

    const updated = await this.prisma.$transaction(async (tx) => {
      if (unique && !current.isUnique) {
        const duplicates = await tx.userFieldValue.groupBy({ by: ['normalizedValue'], where: { fieldId: row.id }, having: { normalizedValue: { _count: { gt: 1 } } } });
        if (duplicates.length > 0) throw new ConflictException('Some people already share a value of this field, so it cannot be unique yet');
        await tx.$executeRaw`UPDATE "user_field_values" SET "unique_key" = "normalized_value" WHERE "field_id" = ${row.id}::uuid`;
      }
      if (!unique && current.isUnique) await tx.$executeRaw`UPDATE "user_field_values" SET "unique_key" = NULL WHERE "field_id" = ${row.id}::uuid`;
      return tx.userFieldDefinition.update({
        where: { id: row.id },
        data: {
          ...(input.labels ? { labels: input.labels } : {}), ...(input.required === undefined ? {} : { required: input.required }),
          isUnique: unique, searchable, ...(input.options ? { options: input.options } : {}), visibleTo, editableBy,
        },
      });
    });
    await this.auditLog.record({ organizationId, actorId, action: 'user_field.updated', targetType: 'user_field', targetId: row.id, summary: `Changed user field ${row.key}`, metadata: { key: row.key, fields: Object.keys(input) } });
    return presentDefinition(toDefinition(updated), await this.prisma.userFieldValue.count({ where: { organizationId, fieldId: row.id } }));
  }

  async setArchived(organizationId: string, key: string, archived: boolean, actorId: string) {
    await this.ensureSeeded(organizationId);
    const row = await this.prisma.userFieldDefinition.findFirst({ where: { organizationId, key } });
    if (!row) throw new NotFoundException('Field not found');
    const valueCount = await this.prisma.userFieldValue.count({ where: { organizationId, fieldId: row.id } });
    if ((row.archivedAt !== null) === archived) return presentDefinition(toDefinition(row), valueCount);
    const updated = await this.prisma.userFieldDefinition.update({ where: { id: row.id }, data: { archivedAt: archived ? new Date() : null } });
    await this.auditLog.record({ organizationId, actorId, action: archived ? 'user_field.archived' : 'user_field.restored', targetType: 'user_field', targetId: row.id, summary: `${archived ? 'Archived' : 'Restored'} user field ${row.key}`, metadata: { key: row.key, valueCount } });
    return presentDefinition(toDefinition(updated), valueCount);
  }

  /** Removes a field that was archived first, with every value of it. The shift text of the user card stays as it is. */
  async deleteDefinition(organizationId: string, key: string, actorId: string) {
    await this.ensureSeeded(organizationId);
    const row = await this.prisma.userFieldDefinition.findFirst({ where: { organizationId, key } });
    if (!row) throw new NotFoundException('Field not found');
    if (!row.archivedAt) throw new ConflictException('Archive the field first: deleting it removes every value');
    const valueCount = await this.prisma.userFieldValue.count({ where: { organizationId, fieldId: row.id } });
    await this.prisma.userFieldDefinition.delete({ where: { id: row.id } });
    await this.auditLog.record({ organizationId, actorId, action: 'user_field.deleted', targetType: 'user_field', targetId: row.id, summary: `Deleted user field ${row.key}`, metadata: { key: row.key, valueCount } });
    return { deleted: true, key: row.key, valueCount };
  }

  async reorder(organizationId: string, keys: string[], actorId: string) {
    await this.ensureSeeded(organizationId);
    const active = await this.prisma.userFieldDefinition.findMany({ where: { organizationId, archivedAt: null }, select: { id: true, key: true } });
    if (active.length !== keys.length || active.some((row) => !keys.includes(row.key))) throw new BadRequestException('Send every active field exactly once');
    await this.prisma.$transaction(keys.map((key, index) => this.prisma.userFieldDefinition.updateMany({ where: { organizationId, key }, data: { sortOrder: (index + 1) * 10 } })));
    await this.auditLog.record({ organizationId, actorId, action: 'user_field.reordered', targetType: 'user_field', targetId: null, summary: 'Reordered user fields', metadata: { keys } });
    return this.listDefinitions(organizationId, false);
  }

  /**
   * The ready-made set (employee number, WhatsApp, hire date, work schedule). Idempotent: a field that exists is left alone.
   * When the work schedule is created, the different `shift` texts of the users become its options and every user keeps their value.
   */
  async applyTemplate(organizationId: string, actorId: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = new Set((await tx.userFieldDefinition.findMany({ where: { organizationId }, select: { key: true } })).map((row) => row.key));
      const last = await tx.userFieldDefinition.aggregate({ where: { organizationId }, _max: { sortOrder: true } });
      let order = last._max.sortOrder ?? 0;
      const created: string[] = [];
      let migratedShifts = 0;
      for (const item of TEMPLATE) {
        if (existing.has(item.key)) continue;
        order += 10;
        let options: FieldOption[] | undefined;
        let shifts: Array<{ id: string; shift: string }> = [];
        if (item.key === WORK_SCHEDULE_KEY) {
          shifts = (await tx.user.findMany({ where: { organizationId, deletedAt: null, shift: { not: null } }, select: { id: true, shift: true } }))
            .flatMap((user) => (user.shift && user.shift.trim() ? [{ id: user.id, shift: user.shift.trim() }] : []));
          options = [...DEFAULT_SCHEDULE_OPTIONS];
          const taken = new Set(options.map((option) => option.key));
          for (const { shift } of shifts) {
            if (options.some((option) => optionMatches(option, shift))) continue;
            const key = optionKeyFromTitle(shift, taken);
            taken.add(key);
            options.push({ key, labels: { ru: shift, en: shift, kk: shift, zh: shift } });
          }
        }
        const definition = await tx.userFieldDefinition.create({
          data: { organizationId, key: item.key, labels: item.labels, type: item.type, isUnique: item.unique ?? false, searchable: item.searchable ?? false, ...(options ? { options } : {}), visibleTo: item.visibleTo, editableBy: item.editableBy, sortOrder: order },
        });
        created.push(item.key);
        if (options) {
          const data = shifts.flatMap(({ id, shift }) => {
            const option = options!.find((candidate) => optionMatches(candidate, shift));
            return option ? [{ organizationId, userId: id, fieldId: definition.id, value: option.key, normalizedValue: option.key }] : [];
          });
          if (data.length > 0) await tx.userFieldValue.createMany({ data, skipDuplicates: true });
          migratedShifts = data.length;
        }
      }
      await tx.organization.updateMany({ where: { id: organizationId, userFieldsSeededAt: null }, data: { userFieldsSeededAt: new Date() } });
      return { created, skipped: TEMPLATE.map((item) => item.key).filter((key) => existing.has(key)), migratedShifts };
    });
    this.seeded.add(organizationId);
    if (actorId && result.created.length > 0) {
      await this.auditLog.record({ organizationId, actorId, action: 'user_field.template_applied', targetType: 'user_field', targetId: null, summary: 'Created the ready-made user fields', metadata: result });
    }
    return result;
  }

  // ── What a viewer may see ───────────────────────────────────────────────────────

  /**
   * The ready-made set is in place from the first use of the fields, without anyone pressing a button. It is only a start:
   * once the flag is set the administrator owns the set, and nothing here ever restores or overwrites a field.
   */
  async ensureSeeded(organizationId: string): Promise<void> {
    if (this.seeded.has(organizationId)) return;
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { userFieldsSeededAt: true } });
    if (organization && !organization.userFieldsSeededAt) {
      try { await this.applyTemplate(organizationId, null); } catch (error) {
        // Two requests seeding at once: the loser meets the unique key, the winner's set is what counts.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    this.seeded.add(organizationId);
  }

  async loadActive(organizationId: string, db: Db = this.prisma): Promise<FieldDefinition[]> {
    await this.ensureSeeded(organizationId);
    const rows = await db.userFieldDefinition.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(toDefinition);
  }

  async definitionsFor(organizationId: string, viewer: FieldViewer) {
    const items = (await this.loadActive(organizationId)).filter((definition) => canSeeField(definition, viewer));
    return { items: items.map((definition) => (viewer === 'admin' ? presentDefinition(definition) : presentDefinitionFor(definition, viewer))) };
  }

  /** `{ key: value }` per user, only for active fields the viewer may see; other fields never appear. */
  async readValues(organizationId: string, userIds: string[], viewer: FieldViewer, db: Db = this.prisma): Promise<Map<string, Record<string, string | number | boolean>>> {
    const result = new Map<string, Record<string, string | number | boolean>>(userIds.map((id) => [id, {}]));
    if (userIds.length === 0) return result;
    const definitions = (await this.loadActive(organizationId, db)).filter((definition) => canSeeField(definition, viewer));
    if (definitions.length === 0) return result;
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    const rows = await db.userFieldValue.findMany({ where: { organizationId, userId: { in: userIds }, fieldId: { in: [...byId.keys()] } }, select: { userId: true, fieldId: true, value: true } });
    for (const row of rows) {
      const definition = byId.get(row.fieldId)!;
      result.get(row.userId)![definition.key] = presentFieldValue(definition.type, row.value);
    }
    return result;
  }

  // ── Writing values ──────────────────────────────────────────────────────────────

  /** Required fields the viewer would have to fill make a creation path without fields impossible. */
  async assertNoRequired(organizationId: string, viewer: FieldViewer): Promise<void> {
    const required = (await this.loadActive(organizationId)).filter((definition) => definition.required && canEditField(definition, viewer));
    if (required.length > 0) throw new ConflictException('Required user fields are defined: create users one at a time or import them with the fields');
  }

  /** Values that two people of the same batch would both take in a unique field. */
  duplicateUniqueKeys(batch: ReadonlyArray<ReadonlyArray<FieldWrite>>): Set<string> {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const writes of batch) {
      for (const write of writes) {
        if (write.clear || !write.definition.isUnique) continue;
        const mark = `${write.definition.id}\u0000${write.normalized}`;
        if (seen.has(mark)) duplicates.add(mark);
        seen.add(mark);
      }
    }
    return duplicates;
  }

  /** The keys of the unique fields whose value another person already holds. */
  async takenUniqueFields(organizationId: string, writes: ReadonlyArray<FieldWrite>, exceptUserId: string | null, db: Db = this.prisma): Promise<string[]> {
    const taken: string[] = [];
    for (const write of writes) {
      if (write.clear || !write.definition.isUnique) continue;
      const other = await db.userFieldValue.findFirst({ where: { organizationId, fieldId: write.definition.id, uniqueKey: write.normalized, ...(exceptUserId ? { userId: { not: exceptUserId } } : {}) }, select: { id: true } });
      if (other) taken.push(write.definition.key);
    }
    return taken;
  }

  /** Writes already validated values; the unique index turns a lost race into a 409. */
  async persist(db: Db, organizationId: string, userId: string, writes: ReadonlyArray<FieldWrite>): Promise<void> {
    for (const write of writes) {
      if (write.clear) {
        await db.userFieldValue.deleteMany({ where: { userId, fieldId: write.definition.id } });
        continue;
      }
      const uniqueKey = write.definition.isUnique ? write.normalized : null;
      try {
        await db.userFieldValue.upsert({
          where: { userId_fieldId: { userId, fieldId: write.definition.id } },
          create: { organizationId, userId, fieldId: write.definition.id, value: write.value, normalizedValue: write.normalized, uniqueKey },
          update: { value: write.value, normalizedValue: write.normalized, uniqueKey },
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictException(`The value of "${write.definition.key}" is already used by another person`);
        throw error;
      }
    }
    const schedule = writes.find((write) => write.definition.key === WORK_SCHEDULE_KEY);
    if (schedule) {
      const option = schedule.clear ? null : (schedule.definition.options ?? []).find((item) => item.key === schedule.value);
      await db.user.update({ where: { id: userId }, data: { shift: option ? optionTitle(option) : null } });
    }
  }

  /** Validates and writes the values of one person inside the caller's transaction; throws 400, 403 or 409 and writes nothing then. */
  async applyValues(db: Db, params: { organizationId: string; userId: string; viewer: FieldViewer; input: CustomFieldValues; mode: 'create' | 'update' }): Promise<FieldChange[]> {
    const { organizationId, userId, viewer, input, mode } = params;
    const definitions = await this.loadActive(organizationId, db);
    const currentRows = mode === 'update' ? await db.userFieldValue.findMany({ where: { organizationId, userId }, select: { fieldId: true, value: true } }) : [];
    const current = new Map(currentRows.map((row) => [row.fieldId, row.value]));
    const { writes, problems } = validateFieldValues(definitions, viewer, input, { mode, current });
    if (problems[0]) throwProblem(problems[0]);
    const taken = await this.takenUniqueFields(organizationId, writes, userId, db);
    if (taken.length > 0) throw new ConflictException(`The value of "${taken[0]}" is already used by another person`);
    await this.persist(db, organizationId, userId, writes);
    return writes.map((write) => ({
      key: write.definition.key,
      from: current.has(write.definition.id) ? presentFieldValue(write.definition.type, current.get(write.definition.id)!) : null,
      to: write.clear ? null : presentFieldValue(write.definition.type, write.value),
      unique: write.definition.isUnique,
    }));
  }

  /** The old `shift` text of the user card kept in step with the work schedule field (a synonym for one release). */
  async syncShiftToSchedule(db: Db, organizationId: string, userId: string, shift: string | null | undefined): Promise<void> {
    if (shift === undefined) return;
    await this.ensureSeeded(organizationId);
    const row = await db.userFieldDefinition.findFirst({ where: { organizationId, key: WORK_SCHEDULE_KEY, archivedAt: null, type: 'list' } });
    if (!row) return;
    const definition = toDefinition(row);
    const text = shift?.trim() ?? '';
    if (!text) { await db.userFieldValue.deleteMany({ where: { userId, fieldId: definition.id } }); return; }
    const options = [...(definition.options ?? [])];
    let option = options.find((item) => optionMatches(item, text));
    if (!option) {
      option = { key: optionKeyFromTitle(text, new Set(options.map((item) => item.key))), labels: { ru: text, en: text, kk: text, zh: text } };
      options.push(option);
      await db.userFieldDefinition.update({ where: { id: definition.id }, data: { options } });
    }
    await db.userFieldValue.upsert({
      where: { userId_fieldId: { userId, fieldId: definition.id } },
      create: { organizationId, userId, fieldId: definition.id, value: option.key, normalizedValue: option.key },
      update: { value: option.key, normalizedValue: option.key },
    });
  }

  // ── Search and filters ──────────────────────────────────────────────────────────

  /** A user filter for the search box: values of searchable fields the viewer may see. */
  searchClause(organizationId: string, viewer: FieldViewer, search: string): Prisma.UserWhereInput | null {
    const terms = searchTerms(search);
    if (terms.length === 0) return null;
    return {
      userFieldValues: {
        some: {
          organizationId,
          field: { searchable: true, archivedAt: null, ...(viewer === 'admin' ? {} : { visibleTo: { has: viewer } }) },
          OR: terms.map((term) => ({ normalizedValue: { contains: term } })),
        },
      },
    };
  }

  /** A user filter "field = value"; a field the viewer cannot see is "unknown", as everywhere else. */
  async filterClause(organizationId: string, viewer: FieldViewer, key: string, rawValue: string): Promise<Prisma.UserWhereInput> {
    const definition = (await this.loadActive(organizationId)).find((item) => item.key === key && canSeeField(item, viewer));
    if (!definition) throw new BadRequestException(`Unknown field "${key}"`);
    const result = normalizeFieldValue(definition, rawValue, rawValue);
    if (!result.ok) throw new BadRequestException(`The value of "${key}" is not valid`);
    return { userFieldValues: { some: { organizationId, fieldId: definition.id, normalizedValue: result.normalized } } };
  }
}

/** Build a population predicate without reading or exposing employee values. */
export async function analyticsFieldFilter(
  prisma: PrismaService,
  organizationId: string,
  roles: readonly string[],
  filters: AnalyticsFieldFilters,
): Promise<Prisma.UserWhereInput> {
  if (!filters?.length) return {};
  const visible = analyticsFieldVisibility(organizationId, roles);
  const definitions = await prisma.userFieldDefinition.findMany({
    where: { ...visible, key: { in: filters.map(([key]) => key) } },
  });
  const byKey = new Map(definitions.map((row) => [row.key, toDefinition(row)]));
  return {
    AND: filters.map(([key, value]) => {
      const definition = byKey.get(key);
      if (!definition || definition.type === 'phone' || (definition.type === 'text' && !definition.searchable)) {
        throw new BadRequestException('Unknown user field');
      }
      const result = normalizeFieldValue(definition, value, value);
      if (!result.ok) throw new BadRequestException('Invalid user field value');
      const normalizedValue = definition.type === 'text'
        ? { contains: result.normalized.replace(/[\\%_]/g, (character) => '\\' + character) }
        : result.normalized;
      return {
        userFieldValues: {
          some: {
            organizationId, fieldId: definition.id, normalizedValue,
            field: { ...visible, ...(definition.type === 'text' ? { searchable: true } : {}) },
          },
        },
      };
    }),
  };
}

function analyticsFieldVisibility(organizationId: string, roles: readonly string[]): Prisma.UserFieldDefinitionWhereInput {
  const admin = roles.includes('admin');
  if (!admin && !roles.includes('manager')) throw new BadRequestException('Unknown user field');
  return { organizationId, archivedAt: null, ...(admin ? {} : { visibleTo: { has: 'manager' } }) };
}

export async function analyticsFieldPresentation(
  prisma: PrismaService, organizationId: string, actor: { roles: readonly string[]; locale?: string | null }, key: string,
) {
  const where = { ...analyticsFieldVisibility(organizationId, actor.roles), key };
  const row = await prisma.userFieldDefinition.findFirst({ where });
  if (!row) throw new BadRequestException('Unknown user field');
  const definition = toDefinition(row);
  const locale = FIELD_LANGUAGES.find((language) => language === actor.locale?.split(/[-_]/)[0]) ?? 'ru';
  const label = definition.labels[locale] || definition.labels.ru || key;
  const options = new Map(definition.options?.map((option) => [option.key, option.labels[locale] || optionTitle(option)]));
  const yes = { ru: 'Да', en: 'Yes', kk: 'Иә', zh: '是' };
  const no = { ru: 'Нет', en: 'No', kk: 'Жоқ', zh: '否' };
  return {
    label,
    async values(userIds: string[]) {
      if (!userIds.length) return new Map<string, { key: string; label: string }>();
      const rows = await prisma.userFieldValue.findMany({
        where: { organizationId, fieldId: row.id, field: where, userId: { in: userIds } },
        select: { userId: true, value: true, normalizedValue: true },
      });
      return new Map(rows.map((value) => [value.userId, {
        key: value.normalizedValue,
        label: definition.type === 'boolean' ? (value.value === 'true' ? yes[locale] : no[locale]) : options.get(value.value) ?? value.value,
      }]));
    },
  };
}
