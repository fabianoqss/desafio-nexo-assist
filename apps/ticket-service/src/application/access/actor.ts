import type { UserRole } from '@nexo/domain';

export interface Actor {
  id: string;
  role: UserRole;
}
