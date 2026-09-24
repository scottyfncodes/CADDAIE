/** Cloudflare Worker entry point for the CADDAIE API. */
import { createHandler, type Env } from './handler';
import { callAnthropic } from './model';

const handle = createHandler(callAnthropic);

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
} satisfies ExportedHandler<Env>;
