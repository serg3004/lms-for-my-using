import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { ManagerTeamScope, type TeamScopeActor } from '../manager-team-scope/public.js';
import { buildAssessmentExport, exportLabels, type ExportFormat, type ExportLocale } from './assessment-export-file.js';
import { attemptScope } from './attempt-scope.js';

/** The report reads at most this many answers sets, newest first; a survey of a larger team is exported in parts by period. */
const MAX_RESPONDENTS = 5000;

export type SurveyQuestionReport = {
  id: string; type: string; title: string; answered: number;
  options: { id: string; text: string | null; count: number; percent: number }[];
  texts: { attemptId: string; name: string; text: string }[];
};
export type SurveyReport = {
  assessment: { id: string; title: string };
  respondents: number;
  questions: SurveyQuestionReport[];
  rows: { attemptId: string; userId: string; name: string; completedAt: Date | null; answers: string[] }[];
};

/**
 * PR 540: the report of a survey. Answers are tied to the employee (the owner's decision: a survey is not anonymous), so
 * each respondent is named. It counts only completed attempts the viewer may see, so a manager sees their own team.
 */
@Injectable()
export class AssessmentSurveyReportService {
  private readonly teamScope = new ManagerTeamScope();

  constructor(private readonly prisma: PrismaService) {}

  async report(assessmentId: string, actor: TeamScopeActor): Promise<SurveyReport> {
    const { organizationId } = actor;
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, organizationId, deletedAt: null, mode: 'survey' },
      select: { id: true, title: true },
    });
    if (!assessment) throw new NotFoundException('Survey not found');
    const [questions, attempts] = await Promise.all([
      this.prisma.assessmentQuestion.findMany({
        where: { assessmentId, organizationId, deletedAt: null },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: { id: true, type: true, title: true, options: { orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true, text: true, deletedAt: true } } },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: { assessmentId, organizationId, status: 'completed', countsTowardResults: true, deletedAt: null, ...attemptScope(this.teamScope, actor) },
        orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
        take: MAX_RESPONDENTS,
        select: {
          id: true, completedAt: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          answers: { where: { deletedAt: null }, select: { questionId: true, selectedOptionId: true, selectedOptionIds: true, response: true } },
        },
      }),
    ]);

    const name = (user: { firstName: string; lastName: string }) => `${user.lastName} ${user.firstName}`.trim();
    const optionText = new Map(questions.flatMap((question) => question.options.map((option) => [option.id, option.text ?? ''] as const)));
    const rows = attempts.map((attempt) => ({
      attemptId: attempt.id, userId: attempt.user.id, name: name(attempt.user), completedAt: attempt.completedAt,
      answers: questions.map((question) => {
        const answer = attempt.answers.find((item) => item.questionId === question.id);
        if (!answer) return '';
        const response = answer.response as { type?: string; text?: string } | null;
        if (response?.type === 'short_answer') return response.text ?? '';
        const picked = Array.isArray(answer.selectedOptionIds) ? answer.selectedOptionIds as string[] : answer.selectedOptionId ? [answer.selectedOptionId] : [];
        return picked.map((id) => optionText.get(id) ?? '').join('; ');
      }),
    }));

    return {
      assessment: { id: assessment.id, title: assessment.title },
      respondents: attempts.length,
      rows,
      questions: questions.map((question) => {
        const answers = attempts.flatMap((attempt) => {
          const answer = attempt.answers.find((item) => item.questionId === question.id);
          return answer ? [{ attempt, answer }] : [];
        });
        const counts = new Map<string, number>();
        const texts: SurveyQuestionReport['texts'] = [];
        for (const { attempt, answer } of answers) {
          const response = answer.response as { type?: string; text?: string } | null;
          if (response?.type === 'short_answer') {
            if (response.text?.trim()) texts.push({ attemptId: attempt.id, name: name(attempt.user), text: response.text });
            continue;
          }
          const picked = Array.isArray(answer.selectedOptionIds) ? answer.selectedOptionIds as string[] : answer.selectedOptionId ? [answer.selectedOptionId] : [];
          for (const id of picked) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return {
          id: question.id, type: question.type, title: question.title, answered: answers.length,
          // A removed option keeps its answers out of the chart: only the options the question has now are shown.
          options: question.options.filter((option) => !option.deletedAt).map((option) => ({
            id: option.id, text: option.text, count: counts.get(option.id) ?? 0,
            percent: answers.length ? Math.round(100 * (counts.get(option.id) ?? 0) / answers.length) : 0,
          })),
          texts,
        };
      }),
    };
  }

  /** One row per respondent, one column per question, in the language the viewer works in. */
  async export(assessmentId: string, actor: TeamScopeActor, format: ExportFormat, locale: ExportLocale) {
    const report = await this.report(assessmentId, actor);
    const labels = exportLabels[locale];
    const questionWidth = Math.max(90, Math.floor(480 / Math.max(1, report.questions.length)));
    const date = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
    return buildAssessmentExport(format, {
      label: labels.survey, title: report.assessment.title,
      headers: [...labels.surveyColumns, ...report.questions.map((question) => question.title)],
      rows: report.rows.map((row) => [row.name, row.completedAt ? date.format(row.completedAt) : null, ...row.answers]),
      widths: [150, 90, ...report.questions.map(() => questionWidth)],
    });
  }
}
