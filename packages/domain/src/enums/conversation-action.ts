export const ConversationAction = {
  HANDOFF: 'HANDOFF',
  ASSUME: 'ASSUME',
  RETURN_TO_AGENT: 'RETURN_TO_AGENT',
  CLOSE: 'CLOSE',
} as const;

export type ConversationAction = (typeof ConversationAction)[keyof typeof ConversationAction];
