import { ACTOR_ID_HEADER, ACTOR_ROLE_HEADER, ActorHeadersSchema } from '@nexo/contracts';
import { createMiddleware } from 'hono/factory';
import type { Actor } from '../../../application/access/actor.ts';

export interface ActorVariables {
  actor: Actor;
}

export const actorContext = createMiddleware<{ Variables: ActorVariables }>(
  async (context, next) => {
    const headers = ActorHeadersSchema.parse({
      [ACTOR_ID_HEADER]: context.req.header(ACTOR_ID_HEADER),
      [ACTOR_ROLE_HEADER]: context.req.header(ACTOR_ROLE_HEADER),
    });
    context.set('actor', { id: headers[ACTOR_ID_HEADER], role: headers[ACTOR_ROLE_HEADER] });

    await next();
  },
);
