const SIGNUP_DIALOG_ID = "guided-signup-dialog";
const CONFIRMATION_DIALOG_ID = "volt-signup-confirmation-dialog";

queueMicrotask(initializeSignupConfirmation);

function initializeSignupConfirmation() {
  const signupDialog = document.getElementById(SIGNUP_DIALOG_ID);
  if (!signupDialog) return;

  attachStyles();
  ensureConfirmationDialog();

  let submittedEmail = "";
  let submitted = false;

  signupDialog.addEventListener("submit", (event) => {
    if (!(event.target instanceof HTMLFormElement) || event.target.id !== "guided-signup-form") return;
    submittedEmail = event.target.querySelector("#guided-email")?.value?.trim()?.toLowerCase() || "";
    submitted = true;
  }, true);

  signupDialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-guided-cancel],.guided-close")) {
      submitted = false;
      submittedEmail = "";
    }
  }, true);

  signupDialog.addEventListener("close", () => {
    if (!submitted) return;
    submitted = false;

    const loginMessage = document.querySelector("#login-message")?.textContent?.trim() || "";
    if (!loginMessage) return;

    showSignupConfirmation(submittedEmail);
    submittedEmail = "";
  });
}

function attachStyles() {
  if (document.querySelector('link[href*="signup-confirmation.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./signup-confirmation.css";
  document.head.append(link);
}

function ensureConfirmationDialog() {
  let dialog = document.getElementById(CONFIRMATION_DIALOG_ID);
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = CONFIRMATION_DIALOG_ID;
  dialog.className = "signup-confirmation-dialog";
  dialog.setAttribute("aria-labelledby", "signup-confirmation-title");
  dialog.innerHTML = `
    <div class="signup-confirmation-card">
      <div class="signup-confirmation-icon" aria-hidden="true">✓</div>
      <p class="eyebrow">CONTA CRIADA</p>
      <h2 id="signup-confirmation-title">Confirme seu e-mail</h2>
      <p class="signup-confirmation-copy">Enviamos um link de confirmação para <strong id="signup-confirmation-email"></strong>.</p>
      <div class="signup-confirmation-steps">
        <p><strong>1.</strong> Abra sua caixa de entrada.</p>
        <p><strong>2.</strong> Toque no link enviado pelo Volt para ativar a conta.</p>
        <p><strong>3.</strong> Depois volte ao Volt e entre com seu e-mail e senha.</p>
      </div>
      <p class="signup-confirmation-note">Se não encontrar a mensagem, verifique Spam, Lixo eletrônico ou Promoções. O cadastro só fica liberado após a confirmação do e-mail.</p>
      <button id="signup-confirmation-ok" class="primary-button" type="button">Entendi</button>
    </div>`;

  document.body.append(dialog);
  dialog.querySelector("#signup-confirmation-ok").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.close();
  });
  return dialog;
}

function showSignupConfirmation(email) {
  const dialog = ensureConfirmationDialog();
  const emailNode = dialog.querySelector("#signup-confirmation-email");
  emailNode.textContent = email || "o e-mail informado";
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => dialog.querySelector("#signup-confirmation-ok")?.focus());
}
