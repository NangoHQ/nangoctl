import { z } from 'zod';

export const localInstallOptionsSchema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  kubeContext: z.string().optional(),
  namespace: z.string().min(1).default('nango'),
  release: z.string().min(1).default('nango'),
  stateDir: z.string().optional(),
  clusterRuntime: z.enum(['kind']).default('kind'),
  createCluster: z.boolean().default(true),
  access: z.enum(['port-forward']).default('port-forward'),
  serverPort: z.coerce.number().int().min(1024).max(65535).default(4280),
  waitTimeout: z.string().default('10m'),
  valuesFile: z.string().optional(),
  set: z.array(z.string()).default([])
});

export type LocalInstallOptions = z.infer<typeof localInstallOptionsSchema>;

