-- PR 416: sheet mode "Without points".
ALTER TYPE "ChecklistScoringMode" ADD VALUE IF NOT EXISTS 'none';
