import type { UserRole } from '@nexo/domain';

export interface User {
  id: string;
  name: string;
  email: string;
  department: string;
  role: UserRole;
}
