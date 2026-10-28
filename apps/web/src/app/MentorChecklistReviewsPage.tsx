import { ObserverSessionsBlock } from './ObserverSessionsBlock.js';
import { InstructorChecklistReviewsPage } from './InstructorChecklistReviewsPage.js';
import { ObserverSessionsNav } from './ObserverSessionsNav.js';
import { MentorPageLayout } from '../shared/mentorLayout.js';

export function MentorChecklistReviewsPage() {
  return <InstructorChecklistReviewsPage Layout={({ children }) => <MentorPageLayout><ObserverSessionsNav current="conduct" />{children}<ObserverSessionsBlock /></MentorPageLayout>} />;
}
