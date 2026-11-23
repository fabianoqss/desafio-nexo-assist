import type { AgentTurnEvent, AgentTurnRunner } from '../../application/ports/agent-turn-runner.ts';

export const unavailableAgentTurnRunner: AgentTurnRunner = {
  async *run() {
    yield Promise.resolve<AgentTurnEvent>({
      type: 'message',
      author: 'SYSTEM',
      content:
        'O assistente está indisponível no momento. Se precisar, peça para falar com um analista.',
    });
  },
};
