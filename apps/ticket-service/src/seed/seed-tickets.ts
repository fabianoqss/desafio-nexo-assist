import { computePriority, type Ticket, TicketStatus } from '@nexo/domain';
import { SEED_USERS } from './seed-users.ts';

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const [ana, bruno, carla, diego] = SEED_USERS;

type SeedTicket = Omit<Ticket, 'priority' | 'createdAt' | 'lastUpdateAt' | 'resolvedAt'> & {
  ageMs: number;
};

const seedData: readonly SeedTicket[] = [
  {
    id: 'INC-20311',
    requesterId: ana.id,
    type: 'INC',
    category: 'NETWORK_VPN',
    title: 'VPN não conecta (erro 809)',
    description: 'O cliente VPN retorna o erro 809 ao tentar acessar a rede de casa.',
    impact: 'SELF',
    urgency: 'SAME_DAY_COMMITMENT',
    status: 'IN_PROGRESS',
    ageMs: 7 * dayMs,
  },
  {
    id: 'REQ-10442',
    requesterId: ana.id,
    type: 'REQ',
    category: 'ACCESS',
    title: 'Acesso à pasta do Financeiro',
    description: 'Preciso de acesso de leitura à pasta compartilhada de relatórios.',
    impact: 'SELF',
    urgency: 'NO_URGENCY',
    status: 'OPEN',
    ageMs: hourMs,
  },
  {
    id: 'INC-20298',
    requesterId: ana.id,
    type: 'INC',
    category: 'EMAIL',
    title: 'Outlook não sincroniza',
    description: 'As mensagens novas apareciam no webmail, mas não no Outlook.',
    impact: 'SELF',
    urgency: 'HAS_WORKAROUND',
    status: 'RESOLVED',
    ageMs: 2 * dayMs,
  },
  {
    id: 'INC-20250',
    requesterId: ana.id,
    type: 'INC',
    category: 'HARDWARE',
    item: 'Notebook',
    title: 'Teclado do notebook falhando',
    description: 'As teclas E e R falhavam. Usei um teclado USB até o reparo.',
    impact: 'SELF',
    urgency: 'HAS_WORKAROUND',
    status: 'RESOLVED',
    ageMs: 20 * dayMs,
  },
  {
    id: 'INC-20320',
    requesterId: bruno.id,
    type: 'INC',
    category: 'NETWORK_VPN',
    title: 'VPN caiu para o time comercial',
    description: 'A equipe perdeu o acesso ao CRM quando a conexão VPN caiu.',
    impact: 'TEAM',
    urgency: 'BLOCKED',
    status: 'WAITING_ANALYST',
    ageMs: 30 * minuteMs,
  },
  {
    id: 'REQ-10450',
    requesterId: bruno.id,
    type: 'REQ',
    category: 'SOFTWARE',
    item: 'Figma',
    title: 'Instalação do Figma',
    description: 'Solicito a instalação do aplicativo de desktop. Estou usando a versão web.',
    impact: 'SELF',
    urgency: 'HAS_WORKAROUND',
    status: 'APPROVED',
    ageMs: 7 * dayMs,
  },
  {
    id: 'INC-20305',
    requesterId: carla.id,
    type: 'INC',
    category: 'SOFTWARE',
    title: 'Sistema de folha lento',
    description: 'A consulta demora para toda a equipe, que segue usando os relatórios exportados.',
    impact: 'TEAM',
    urgency: 'HAS_WORKAROUND',
    status: 'IN_PROGRESS',
    ageMs: hourMs,
  },
  {
    id: 'INC-20290',
    requesterId: diego.id,
    type: 'INC',
    category: 'OTHER',
    item: 'Projetor',
    title: 'Projetor da sala 3 sem imagem',
    description: 'O projetor liga, mas exibe mensagem de ausência de sinal no HDMI.',
    impact: 'SELF',
    urgency: 'NO_URGENCY',
    status: 'OPEN',
    ageMs: 2 * hourMs,
  },
];

export function buildSeedTickets(now: Date): Ticket[] {
  const nowMs = now.getTime();

  return seedData.map(({ ageMs, ...ticket }) => {
    const lastUpdateMs = nowMs - ageMs;

    return {
      ...ticket,
      priority: computePriority(ticket.impact, ticket.urgency),
      createdAt: new Date(lastUpdateMs - dayMs),
      lastUpdateAt: new Date(lastUpdateMs),
      ...(ticket.status === TicketStatus.RESOLVED ? { resolvedAt: new Date(lastUpdateMs) } : {}),
    };
  });
}
