// Volt Beta — único entry point do runtime publicado.
// A ordem é parte do contrato: ambiente -> runtime -> domínio/UI -> acabamento.
import "./environment.js";
import "./startup-runtime.js?v=98";
import "./app.js";
import "./beta-shell.js";
import "./beta-v3.js";
