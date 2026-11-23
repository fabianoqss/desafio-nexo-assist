import { UserRole } from '@nexo/domain';

export interface SeedUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly department: string;
}

export const SEED_USERS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Ana Souza',
    email: 'ana.souza@nexo.com.br',
    role: UserRole.EMPLOYEE,
    department: 'Financeiro',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Bruno Lima',
    email: 'bruno.lima@nexo.com.br',
    role: UserRole.EMPLOYEE,
    department: 'Comercial',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Carla Mendes',
    email: 'carla.mendes@nexo.com.br',
    role: UserRole.EMPLOYEE,
    department: 'RH',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Diego Rocha',
    email: 'diego.rocha@nexo.com.br',
    role: UserRole.EMPLOYEE,
    department: 'Marketing',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Elisa Prado',
    email: 'elisa.prado@nexo.com.br',
    role: UserRole.EMPLOYEE,
    department: 'Jurídico',
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    name: 'Felipe Nunes',
    email: 'felipe.nunes@nexo.com.br',
    role: UserRole.EMPLOYEE,
    department: 'Operações',
  },
  {
    id: '00000000-0000-4000-8000-000000000101',
    name: 'Gabriela Torres',
    email: 'gabriela.torres@nexo.com.br',
    role: UserRole.ANALYST,
    department: 'TI',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    name: 'Henrique Alves',
    email: 'henrique.alves@nexo.com.br',
    role: UserRole.ANALYST,
    department: 'TI',
  },
] as const satisfies readonly SeedUser[];
