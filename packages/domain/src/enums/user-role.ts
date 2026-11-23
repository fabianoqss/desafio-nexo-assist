export const UserRole = {
  EMPLOYEE: 'EMPLOYEE',
  ANALYST: 'ANALYST',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
