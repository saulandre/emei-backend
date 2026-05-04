const { body } = require('express-validator');
const {
  validatePassword,
  PASSWORD_POLICY_MESSAGE,
} = require('../src/utils/passwordPolicy');

const validateLogin = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha é obrigatória'),
];

const validateRegister = [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password')
    .notEmpty()
    .withMessage('Senha é obrigatória')
    .custom((value) => validatePassword(value))
    .withMessage(PASSWORD_POLICY_MESSAGE),
];

const validateVerification = [
  body('verificationCode').notEmpty().withMessage('Código de verificação é obrigatório'),
];

module.exports = {
  validateLogin,
  validateRegister,
  validateVerification,
};