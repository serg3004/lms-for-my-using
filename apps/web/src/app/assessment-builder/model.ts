import { slugify } from '../../shared/slugify.js';

export type Course = { id: string; organizationId: string; title: string; status: string };
export type Lesson = { id: string; title: string; order: number };
export type AssessmentStatus = 'draft' | 'published' | 'archived';
export type Assessment = { id: string; title: string; slug: string; description: string | null; passingScore: number; maxAttempts: number | null; availableAfterCourseCompletion: boolean; status: string };
export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';
export type Question = { id: string; organizationId: string; type: QuestionType; title: string; text: string | null; points: number; order: number };
export type AnswerOption = { id: string; text: string | null; isCorrect: boolean; order: number };
export type SaveState = { status: 'idle' | 'saving' | 'error'; message?: string };
export type AssessmentForm = { title: string; description: string; passingScore: string; maxAttempts: string; availableAfterCourseCompletion: boolean; status: AssessmentStatus };

export const ASSESSMENT_STATUSES: AssessmentStatus[] = ['draft', 'published', 'archived'];
export const emptyAssessmentForm = (): AssessmentForm => ({ title: '', description: '', passingScore: '70', maxAttempts: '', availableAfterCourseCompletion: true, status: 'draft' });
export const assessmentToForm = (assessment: Assessment): AssessmentForm => ({ title: assessment.title, description: assessment.description ?? '', passingScore: String(assessment.passingScore), maxAttempts: assessment.maxAttempts === null ? '' : String(assessment.maxAttempts), availableAfterCourseCompletion: assessment.availableAfterCourseCompletion, status: assessment.status as AssessmentStatus });

export type FormAction = { type: 'change'; field: keyof AssessmentForm; value: string | boolean } | { type: 'reset'; value?: AssessmentForm };
export function assessmentFormReducer(state: AssessmentForm, action: FormAction): AssessmentForm {
  if (action.type === 'reset') return action.value ?? emptyAssessmentForm();
  return { ...state, [action.field]: action.value };
}

export type ValidAssessmentForm = { title: string; slug: string; description: string | null; passingScore: number; maxAttempts: number | null; availableAfterCourseCompletion: boolean; status: AssessmentStatus };
export function mapAssessmentForm(form: AssessmentForm): ValidAssessmentForm | null {
  const title = form.title.trim();
  const slug = slugify(title, 120);
  const passingScore = Number(form.passingScore);
  const maxAttempts = form.maxAttempts.trim() ? Number(form.maxAttempts) : null;
  if (!title || !slug || !Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100 || (maxAttempts !== null && (!Number.isInteger(maxAttempts) || maxAttempts < 1))) return null;
  return { title, slug, description: form.description.trim() || null, passingScore, maxAttempts, availableAfterCourseCompletion: form.availableAfterCourseCompletion, status: form.status };
}

export function appendOption(options: Record<string, AnswerOption[]>, questionId: string, option: AnswerOption) {
  return { ...options, [questionId]: [...(options[questionId] ?? []), option] };
}
