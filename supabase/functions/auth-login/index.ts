import { createAuthLoginHandler } from "../_shared/auth-login-core.mjs";

const handler = createAuthLoginHandler({
  env: (name: string) => name === "BETA_APP_ORIGIN"
    ? Deno.env.get(name) ?? "https://flanhenrique.github.io"
    : Deno.env.get(name) ?? ""
});

Deno.serve(handler);
