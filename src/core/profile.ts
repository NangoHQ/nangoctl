import { z } from 'zod';

export const ProfileSchema = z.object({
  namespace: z.string().min(1).default('nango'),
  release: z.string().min(1).default('nango'),
  kubeContext: z.string().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export function getDefaultProfile(): Profile {
  return ProfileSchema.parse({});
}

