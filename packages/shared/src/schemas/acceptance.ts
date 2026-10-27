import { z } from 'zod';

export const acceptanceCriterionZ = z.object({
  given: z.string().min(1).max(2000),
  when: z.string().min(1).max(2000),
  then: z.string().min(1).max(2000),
});

/** Stories and sub-tasks need ≥1 G/W/T criterion before ready. */
export const acceptanceCriteriaZ = z.array(acceptanceCriterionZ).min(1);

export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionZ>;
export type AcceptanceCriteria = z.infer<typeof acceptanceCriteriaZ>;

export function parseAcceptanceCriteria(value: unknown): AcceptanceCriteria | null {
  const parsed = acceptanceCriteriaZ.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function hasAcceptanceCriteria(value: unknown): boolean {
  return acceptanceCriteriaZ.safeParse(value).success;
}
