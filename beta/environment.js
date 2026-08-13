import { BETA_ENVIRONMENT } from "./packages/app-environment/browser/index.js";

// environment.js publica somente o contrato do ambiente. O runtime é carregado
// explicitamente pelo index logo depois deste módulo e antes de app.js, mantendo
// uma única origem de bootstrap e uma ordem de execução auditável.
window.VOLT_ENVIRONMENT = BETA_ENVIRONMENT;
