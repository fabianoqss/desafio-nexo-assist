import { UserRole } from '@nexo/domain';

export const SEED_USERS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Ana Souza',
    role: UserRole.EMPLOYEE,
    department: 'Financeiro',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Bruno Lima',
    role: UserRole.EMPLOYEE,
    department: 'Comercial',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Carla Mendes',
    role: UserRole.EMPLOYEE,
    department: 'RH',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Diego Rocha',
    role: UserRole.EMPLOYEE,
    department: 'Marketing',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Elisa Prado',
    role: UserRole.EMPLOYEE,
    department: 'Jurídico',
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    name: 'Felipe Nunes',
    role: UserRole.EMPLOYEE,
    department: 'Operações',
  },
  {
    id: '00000000-0000-4000-8000-000000000101',
    name: 'Gabriela Torres',
    role: UserRole.ANALYST,
    department: 'TI',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    name: 'Henrique Alves',
    role: UserRole.ANALYST,
    department: 'TI',
  },
] as const;
