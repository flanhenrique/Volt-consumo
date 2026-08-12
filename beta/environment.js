import { BETA_ENVIRONMENT } from "./packages/app-environment/browser/index.js";
import "./startup-runtime.js?v=99";

// environment.js é executado antes de app.js no documento. O runtime precisa
// estar instalado aqui para compartilhar o cliente Supabase e priorizar os
// dados da conta antes que app.js registre autenticação e RPCs administrativos.
window.VOLT_ENVIRONMENT = BETA_ENVIRONMENT;
