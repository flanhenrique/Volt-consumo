/**
 * Autenticação — validação de cadastro e tradução de falhas.
 *
 * Este módulo existe porque a política de senha estava declarada em quatro
 * lugares com quatro valores diferentes (6 no campo HTML, 8 na leitura de
 * credenciais, 12 na verificação de força, 8 no campo de recuperação) e porque
 * o cliente traduzia toda falha de cadastro numa única frase genérica, que
 * escondia a causa real e impedia o diagnóstico.
 *
 * Aqui a política existe uma vez só, e cada falha tem uma mensagem própria.
 *
 * Escopo: puro. Nenhuma chamada de rede, nenhum acesso ao DOM, nenhum segredo.
 * É por isso que pode ser testado sem navegador e sem servidor.
 */
/** Política de senha para credenciais novas. Fonte única do produto. */
export const PASSWORD_POLICY = Object.freeze({
    minLength: 12,
    maxLength: 128
});
/**
 * Senhas previsíveis o bastante para serem tentadas primeiro num ataque.
 * A lista espelha `COMMON_PASSWORDS` de `auth-login-core.mjs`: o servidor
 * continua sendo a autoridade, e esta cópia serve para avisar o usuário antes
 * da viagem de ida e volta.
 */
export const COMMON_PASSWORDS = new Set([
    "123456789012",
    "123456789123",
    "abcdefghijkl",
    "administrator",
    "iloveyou1234",
    "letmein123456",
    "password1234",
    "qwerty123456",
    "senha1234567",
    "volt12345678"
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
/**
 * Mensagens ao usuário.
 *
 * Nenhuma delas é genérica: cada uma diz o que houve e o que fazer. A última,
 * `unexpected`, é a única de fallback e mesmo assim carrega o identificador da
 * requisição, para que o suporte consiga rastrear a tentativa.
 */
const MESSAGES = Object.freeze({
    email_required: "Informe o e-mail para criar a conta.",
    email_invalid: "E-mail inválido. Confira o endereço digitado.",
    email_too_long: "E-mail longo demais. Use um endereço com até 254 caracteres.",
    password_required: "Informe a senha para criar a conta.",
    password_too_short: `Senha deve possuir no mínimo ${PASSWORD_POLICY.minLength} caracteres.`,
    password_too_long: `Senha deve possuir no máximo ${PASSWORD_POLICY.maxLength} caracteres.`,
    password_too_common: "Essa senha é previsível demais e já aparece em listas de ataque. Escolha outra, exclusiva desta conta.",
    privacy_not_accepted: "Leia e confirme o Aviso de Privacidade para criar a conta.",
    email_taken: "E-mail já cadastrado. Use Entrar ou recupere a senha.",
    rate_limited: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
    service_unavailable: "O serviço de contas está indisponível no momento. Nenhuma conta foi criada; tente novamente em instantes.",
    network_error: "Erro de conexão. Verifique a internet e tente novamente.",
    invalid_request: "Os dados enviados não foram aceitos. Confira e-mail, senha e o aceite do Aviso de Privacidade.",
    // Último recurso. Mesmo aqui a frase diz o que aconteceu com os dados e o
    // que fazer — "não foi possível" sozinho deixaria o usuário sem saída.
    unexpected: "Não foi possível criar a conta. Nenhum dado foi gravado; tente de novo em instantes ou acione o suporte."
});
const VALID = Object.freeze({ ok: true, code: "", message: "", field: "" });
function fail(code, field) {
    return Object.freeze({ ok: false, code, message: MESSAGES[code], field });
}
/**
 * Verifica a entrada antes de qualquer chamada de rede.
 *
 * A ordem importa: o usuário vê primeiro o problema que ele consegue corrigir
 * sem adivinhar. E-mail antes de senha, senha antes do aceite.
 */
export function validateSignupInput(input) {
    const email = input.email.trim();
    if (!email)
        return fail("email_required", "email");
    if (email.length > MAX_EMAIL_LENGTH)
        return fail("email_too_long", "email");
    if (!EMAIL_PATTERN.test(email))
        return fail("email_invalid", "email");
    const password = input.password;
    if (!password)
        return fail("password_required", "password");
    // Contagem por ponto de código: emojis e acentos compostos contam como um
    // caractere, igual à verificação do servidor.
    const length = [...password].length;
    if (length < PASSWORD_POLICY.minLength)
        return fail("password_too_short", "password");
    if (length > PASSWORD_POLICY.maxLength)
        return fail("password_too_long", "password");
    if (isCommonPassword(password))
        return fail("password_too_common", "password");
    if (!input.privacyAccepted)
        return fail("privacy_not_accepted", "privacy");
    return VALID;
}
/** Mesma normalização do servidor: NFKC e minúsculas. */
export function isCommonPassword(password) {
    const normalized = password.normalize("NFKC").toLowerCase();
    return COMMON_PASSWORDS.has(normalized) || /^(.)\1+$/u.test(normalized);
}
/**
 * Traduz a resposta do servidor de cadastro.
 *
 * Sobre duplicidade: a rota de cadastro responde 202 tanto para um e-mail novo
 * quanto para um já existente. Isso é deliberado — revelar quais e-mails têm
 * conta permite enumerar a base de usuários. A mensagem de sucesso é escrita
 * para ser verdadeira nos dois casos.
 */
export function describeSignupOutcome(outcome) {
    if (outcome.status === 0) {
        return outcomeFor("network_error");
    }
    if (outcome.status === 202 || outcome.status === 200) {
        return Object.freeze({
            ok: true,
            code: "created",
            message: "Conta solicitada. Abra o e-mail de confirmação para liberar o acesso.",
            requiresEmailConfirmation: true
        });
    }
    if (outcome.status === 429 || outcome.code === "rate_limited") {
        return outcomeFor("rate_limited");
    }
    if (outcome.status >= 500 || outcome.code === "service_unavailable") {
        return outcomeFor("service_unavailable");
    }
    if (outcome.code === "weak_password") {
        return outcomeFor("password_too_short");
    }
    if (outcome.code === "invalid_request") {
        return outcomeFor("invalid_request");
    }
    return Object.freeze({
        ok: false,
        code: "unexpected",
        message: outcome.requestId
            ? `${MESSAGES.unexpected} Informe o código ${outcome.requestId} ao suporte.`
            : MESSAGES.unexpected,
        requiresEmailConfirmation: false
    });
}
function outcomeFor(code) {
    return Object.freeze({ ok: false, code, message: MESSAGES[code], requiresEmailConfirmation: false });
}
/**
 * Traduz o erro do SDK do provedor, usado no ambiente oficial.
 *
 * Ali o cadastro não passa pela função de borda, então a mensagem de e-mail já
 * cadastrado chega ao cliente e pode ser exibida.
 */
export function describeProviderError(rawMessage) {
    const message = rawMessage.toLowerCase();
    if (message.includes("already") || message.includes("registered"))
        return outcomeFor("email_taken");
    if (message.includes("weak") || message.includes("at least") || message.includes("short")) {
        return outcomeFor("password_too_short");
    }
    if (message.includes("rate") || message.includes("too many"))
        return outcomeFor("rate_limited");
    if (message.includes("email") && message.includes("invalid"))
        return outcomeFor("email_invalid");
    if (message.includes("failed to fetch") || message.includes("network"))
        return outcomeFor("network_error");
    return outcomeFor("service_unavailable");
}
export function buildSignupRequestBody(input, privacyNoticeVersion) {
    return Object.freeze({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        privacy_accepted: true,
        privacy_notice_version: privacyNoticeVersion
    });
}
/** Mensagem de uma falha conhecida. Exposto para o registro de diagnóstico. */
export function messageForCode(code) {
    return MESSAGES[code];
}
