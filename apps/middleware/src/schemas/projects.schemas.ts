import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});

export const connectRepoSchema = z.object({
  repoUrl: z.string().url('Must be a valid URL'),
  repoName: z.string().min(1, 'Repo name is required').max(100),
  branch: z.string().max(100).optional(),
});
