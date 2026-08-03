import { createHealthHandler } from "../_shared/health-core.mjs";

const handler = createHealthHandler({ env: (name: string) => Deno.env.get(name) ?? "" });

Deno.serve(handler);
