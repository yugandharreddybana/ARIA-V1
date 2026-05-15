import { z } from 'zod';
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(80),
  description: z.string().trim().max(500).optional(),
});
export const connectRepoSchema = z.object({
  repoUrl: z.string().url('Must be a valid URL').regex(/github\.com/, 'Must be a GitHub URL'),
  branch: z.string().default('main'),
});
