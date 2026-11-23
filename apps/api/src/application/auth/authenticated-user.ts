import type { UserRole } from '@nexo/domain';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  name: string;
}
