import type { z } from 'zod';
import type {
  publicProjectSchema,
  privateProjectSchema,
  externalWorkSchema,
  viewerSchema,
  personNameSchema,
} from '@/contracts/api-entities';
import type { ViewData } from '@/contracts/api-responses';

// The server-rendered viewer is a display prop; database roles remain strings at that boundary.
export type Viewer = Omit<z.infer<typeof viewerSchema>, 'roles'> & {
  roles: string[];
  demo?: boolean;
};

type PublicProject = z.infer<typeof publicProjectSchema>;
type PrivateProject = z.infer<typeof privateProjectSchema>;
/** Shared display fields only. Endpoint data stays exact through ViewData in useData. */
export type Project = Omit<PublicProject, 'client'> &
  Partial<Omit<PrivateProject, keyof PublicProject>> & {
    client?: PublicProject['client'];
    assignedStudent?: z.infer<typeof personNameSchema> | null;
    _count?: { applications: number };
  };
export type ExternalWork = z.infer<typeof externalWorkSchema>;
export type DashboardData = ViewData<'dashboard'>;
export type WorkData = ViewData<'work'>;
export type AdminData = ViewData<'admin'>;
