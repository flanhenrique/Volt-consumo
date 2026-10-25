import { createMeterReadHandler } from "../_shared/meter-read-core.mjs";
const handler = createMeterReadHandler({ env: (name: string) => Deno.env.get(name) ?? "" });
Deno.serve(handler);
