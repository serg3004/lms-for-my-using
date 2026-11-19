-- PR 477: handing an unfinished self-filled check over to a colleague is recorded as an event of the check.
ALTER TYPE "ChecklistInstanceEventType" ADD VALUE 'transferred';
