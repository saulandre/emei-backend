function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // Gera um número de 6 dígitos
}


module.exports = {
  generateVerificationCode
};