/**
 * Política única de senha para cadastro, redefinição e alteração.
 * Login não usa esta regra (apenas bcrypt.compare), para não bloquear senhas antigas.
 */
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{6,}$/;

const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter pelo menos 6 caracteres, incluindo pelo menos uma letra maiúscula e um número.';

function validatePassword(password) {
  if (password == null) return false;
  const s = String(password).trim();
  if (!s) return false;
  return PASSWORD_REGEX.test(s);
}

function normalizePasswordForHash(password) {
  return String(password).trim();
}

module.exports = {
  PASSWORD_REGEX,
  PASSWORD_POLICY_MESSAGE,
  validatePassword,
  normalizePasswordForHash,
};
