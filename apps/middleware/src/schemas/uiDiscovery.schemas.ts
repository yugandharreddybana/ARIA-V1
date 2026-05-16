import { z } from 'zod';

export const uiDiscoverySchema = z.object({
  ticketId:        z.string().min(1).max(200),
  audience:        z.string().min(1).max(500),
  surface:         z.string().min(1).max(500),
  tone:            z.string().min(1).max(500),
  brandContext:    z.string().max(2000).optional(),
  constraints:     z.array(z.string()).default([]),
  successMetrics:  z.array(z.string()).default([]),
}).strict();

export type UiDiscoveryInput = z.infer<typeof uiDiscoverySchema>;
