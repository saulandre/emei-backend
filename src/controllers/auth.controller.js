const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateVerificationCode } = require('../services/validation');
const dotenv = require('dotenv');
const transporter = require('../config/mailer');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient, Prisma } = require('@prisma/client');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const prisma = new PrismaClient();
dotenv.config();

// Constantes atualizadas para mensagens
const MESSAGES = {
  errors: {
    missingFields: 'O e-mail e a senha são obrigatórios.',
    emailInUse: 'E-mail já está em uso.',
    userNotFound: 'Usuário não encontrado.',
    invalidCredentials: 'Credenciais inválidas.',
    verificationCodeInvalid: 'Código de verificação inválido ou expirado.',
    internalError: 'Erro interno do servidor.',
    invalidEmail: 'Email inválido.',
    emailExists: 'Email já cadastrado.',
    unverifiedUser: 'Por favor, verifique seu e-mail antes de fazer login.',
    invalidData: 'Dados inválidos fornecidos.',
    codeExpired: 'Código expirado. Solicite um novo.',
    resendTooSoon: 'Aguarde 60 segundos antes de reenviar o código.',
  },
  success: {
    verificationEmailSent: 'Código de verificação enviado. Verifique seu e-mail.',
    verificationCodeResent: 'Código de verificação enviado com sucesso.',
    verifiedUser: 'Usuário verificado com sucesso!',
    registeredUser: 'Usuário registrado com sucesso!',
    loggedIn: 'Login realizado com sucesso!',
    passwordReset: 'Senha redefinida com sucesso!',
    updatedUser: 'Dados atualizados com sucesso!',
    deletedUser: 'Conta removida com sucesso!',
    inscriptionCreated: 'Inscrição realizada com sucesso!',
  },
};

// const supabase = require('../config/supabase'); // Arquivo de configuração separado

const enviarComprovante = async (req, res) => { // Adicione req e res como parâmetros
  try {
    // Validação
    if (!req.body.nome || !req.file) {
      return res.status(400).json({ error: 'Nome e comprovante são obrigatórios' });
    }

    // Upload para o Supabase Storage
    const fileName = `comprovante-${Date.now()}-${req.file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from('comprovantes')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (uploadError) {
      throw new Error(`Erro no upload: ${uploadError.message}`);
    }

    // Construir URL pública
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/comprovantes/${fileName}`;

    // Inserção no banco de dados
    const { data, error } = await supabase
      .from('pagamentos')
      .insert([{
        nome: req.body.nome,
        comprovante_url: publicUrl,
        status: 'pendente'
      }]);

    if (error) {
      throw new Error(`Erro no banco de dados: ${error.message}`);
    }

    return res.status(201).json({ // Adicione return aqui
      success: true,
      message: 'Comprovante enviado com sucesso!',
      data
    });

  } catch (error) {
    console.error('Erro no controller:', error);
    
    // Verifica se a resposta já foi enviada
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Erro ao processar solicitação',
        details: error.message.replace(/supabase_key=[^\s&]+/gi, '[REDACTED]') // Esconde dados sensíveis
      });
    }
  }
};
const CODE_EXPIRATION_TIME = 15 * 60 * 1000; // 15 minutos
const RESEND_INTERVAL = 60000; // 60 segundos
 const newAccountEmail = async (name, email, code) => {
  try {
    await transporter.sendMail({
      from: `"EMEI" <${process.env.MAIL_USER}>`,
      headers: {
        'X-Mailer': 'Nodemailer',
        'X-Priority': '3',
        'Return-Path': 'process.env.MAIL_USER' 
      },
      to: email,
      subject: 'Confirmação de Cadastro',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Confirmar Cadastro</title>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              margin: 0;
              padding: 30px 0;
              background-color: #F2F2F2;
;
            }
            .container {
              max-width: 680px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 3px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            .header {
              padding: 40px 30px 20px;
              border-bottom: 1px solid #e9ecef;
              text-align: center;
            }
            .header img {
              height: 40px;
            }
            .content {
              padding: 40px 30px;
              color: #4a4e69;
            }
            .code-container {
              margin: 30px 0;
              text-align: center;
            }
            .verification-code {
              display: inline-block;
              padding: 15px 30px;
              background-color: #d64042;
              border-radius: 6px;
              font-size: 24px;
              font-weight: 600;
              color: #fff;
              letter-spacing: 2px;
            }
              a {
  color: #2b6cb0 !important;
  text-decoration: none !important;
}
            .footer {
              padding: 25px 30px;
              background-color: #f8f9fa;
              text-align: center;
              font-size: 14px;
              color: #6c757d;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
             <img src="https://raw.githubusercontent.com/saulandre/emei-backend/main/src/public/favicon.png" alt="Logo EMEI" />

            </div>
            
            <div class="content">
              <p>Olá ${name},</p>
              
              <p>O seu cadastro no <strong>Portal EMEI</strong> está quase completo. <br><br>Para acessar sem restrições você precisa verificar o seu e-mail. <br> <br> Insira o código abaixo em <a href="https://www.emeirj.com.br" target="_blank">EMEI</a>.</p>

              <div class="code-container">
                <div class="verification-code">${code}</div>
              </div>

              <p>⏳ Este código é válido por 15 minutos.</p>

        

              <p>Atenciosamente,<br>
              Equipe EMEI</p>
            </div>

            <div class="footer">
              <p>Esta é uma mensagem automática. Por favor não responda este e-mail.</p>
              <p>Dúvidas? Contate-nos: emeiiraja23@gmail.com </p>
              <p>© ${new Date().getFullYear()} EMEI App. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`✅ E-mail de verificação enviado para: ${email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error);
    throw new Error('Falha no envio do e-mail');
  }
};

// Configuração do Multer
const upload = multer({ dest: 'uploads/' });







 const accountVerifiedEmail = async (name, email) => {
  try {
    await transporter.sendMail({
      from: `"EMEI" <${process.env.MAIL_USER}>`,
      headers: {
        'X-Mailer': 'Nodemailer',
        'X-Priority': '3',
        'Return-Path': 'process.env.MAIL_USER' 
      },
      to: email,
      subject: '✅ Conta Verificada',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Conta Verificada</title>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              margin: 0;
              padding: 30px 0;
              background-color: #F2F2F2;
            }
            .container {
              max-width: 680px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            .header {
              padding: 40px 30px 20px;
              border-bottom: 1px solid #e9ecef;
              text-align: center;
            }
            .header img {
              height: 40px;
            }
            .content {
              padding: 40px 30px;
              color: #4a4e69;
            }
            .success-message {
              text-align: center;
              margin: 30px 0;
              font-size: 20px;
              font-weight: 600;
              color: #2ecc71;
            }
            a {
              color: #2b6cb0 !important;
              text-decoration: none !important;
            }
            .footer {
              padding: 25px 30px;
              background-color: #f8f9fa;
              text-align: center;
              font-size: 14px;
              color: #6c757d;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://raw.githubusercontent.com/saulandre/emei-backend/main/src/public/favicon.png" alt="Logo EMEI">
            </div>
            
            <div class="content">
              <p>Olá ${name},</p>
              
              <p>Informamos que seu acesso ao <strong>Portal EMEI</strong> foi verificado com sucesso!</p>

    

              <p>Agora você tem acesso completo ao sistema.</p>

              <p>Estamos empenhados em fazer você ter a melhor experiência.</p>

              <p>Atenciosamente,<br>
              Equipe EMEI</p>
            </div>

            <div class="footer">
              <p>Esta é uma mensagem automática. Por favor não responda este e-mail.</p>
              <p>Dúvidas? Contate-nos: emeiiraja23@gmail.com </p>
              <p>© ${new Date().getFullYear()} EMEI app. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`✅ E-mail de confirmação de verificação enviado para: ${email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error);
    throw new Error('Falha no envio do e-mail');
  }
};

 const novoCodigoEmail = async (name, email, code) => {
  try {
    await transporter.sendMail({
      from: `"EMEI" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Novo código',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Novo código</title>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              margin: 0;
              padding: 30px 0;
              background-color: #ffffff;
            }
            .container {
              max-width: 680px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            .header {
              padding: 40px 30px 20px;
              border-bottom: 1px solid #e9ecef;
              text-align: center;
            }
            .header img {
              height: 40px;
            }
            .content {
              padding: 40px 30px;
              color: #4a4e69;
            }
            .code-container {
              margin: 30px 0;
              text-align: center;
            }
            .verification-code {
              display: inline-block;
              padding: 15px 30px;
              background-color: #d64042;
              border-radius: 6px;
              font-size: 24px;
              font-weight: 600;
              color: #fff;
              letter-spacing: 2px;
            }
              a {
  color: #2b6cb0 !important;
  text-decoration: none !important;
}
            .footer {
              padding: 25px 30px;
              background-color: #f8f9fa;
              text-align: center;
              font-size: 14px;
              color: #6c757d;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://raw.githubusercontent.com/saulandre/emei-backend/main/src/public/favicon.png" alt="Logo EMEI">
            </div>
            
            <div class="content">
              <p>Prezado(a) ${name},</p>
              
              <p>Seu cadastro no  <strong>Portal EMEI</strong>  está quase completo. <br><br> O próximo passo é verificar seu endereço e-mail inserindo o código abaixo através do portal <a href="https://www.emeirj.com.br" target="_blank">EMEI</a>.</p>

              <div class="code-container">
                <div class="verification-code">${code}</div>
              </div>

              <p>⏳ Este código é válido por 15 minutos.</p>

        

              <p>Atenciosamente,<br>
              Equipe EMEI</p>
            </div>

            <div class="footer">
              <p>Esta é uma mensagem automática. Por favor não responda este e-mail.</p>
              <p>Dúvidas? Contate-nos: emeiiiraja23@gmail.com </p>
              <p>© ${new Date().getFullYear()} EMEI App. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`✅ E-mail de verificação enviado para: ${email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error);
    throw new Error('Falha no envio do e-mail');
  }
};

 const verificar = async (req, res) => {
  const { userId, verificationCode } = req.body;
  console.log('Dados recebidos:', req.body);  // Adicionando log para verificar os dados

  if (!userId || !verificationCode) {
    return res.status(400).json({ error: MESSAGES.errors.missingFields });
  }

  try {
    // Busca o usuário no banco de dados
    const userId = parseInt(req.body.userId, 10); // Converte string para número

    const user = await prisma.users.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: MESSAGES.errors.userNotFound });
    }

    // Verifica se o código de verificação coincide
    if (user.verificationCode !== verificationCode) {
      return res.status(400).json({ error: MESSAGES.errors.verificationCodeInvalid });
    }

    // Verifica se o código de verificação expirou
    if (new Date(user.verificationCodeExpiration).getTime() < new Date().getTime()) {
      return res.status(400).json({ error: MESSAGES.errors.codeExpired });
    }

    // Atualiza o usuário e confirma a transação
    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: {
        isVerified: true,
        verificationCode: null, // Invalida o código de verificação após o uso
        verificationCodeExpiration: null, // Limpa a data de expiração
      },
    });

    // Envia o e-mail de confirmação de verificação
    await accountVerifiedEmail(updatedUser.name, updatedUser.email);

    // Geração do token após a verificação
    const token = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, isVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Retorno com a mensagem de sucesso e os dados do usuário
    return res.json({
      message: MESSAGES.success.verifiedUser,
      token,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        isVerified: updatedUser.isVerified,
      },
    });
  } catch (error) {
    console.error('Verification Error:', error);
    return res.status(500).json({
      error: MESSAGES.errors.internalError,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};



 const validateToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ valid: false, error: "Token não fornecido" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });

  } catch (error) {
    let errorMessage = "Token inválido";

    if (error.name === "TokenExpiredError") {
      errorMessage = "Token expirado. Faça login novamente.";
    } else if (error.name === "JsonWebTokenError") {
      errorMessage = "Token malformado.";
    }

    res.status(401).json({ valid: false, error: errorMessage });
  }
};


 const register = async (req, res) => {

  const { name, email, password } = req.body;


 
  try {

    const isStrongPassword = (password) => {
      const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]{8,}$/;
      return strongPasswordRegex.test(password);
    };
    
    // Validação dos campos
    if (!name || !email || !password) {
      return res.status(400).json({ error: MESSAGES.errors.missingFields });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: "A senha deve conter pelo menos 8 caracteres, incluindo uma letra maiúscula, uma minúscula, um número e um caractere especial.",
      });
    }
    // Verifica usuário existente
    const existingUser = await prisma.users.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: MESSAGES.errors.emailInUse });
    }

    // Criptografia da senha
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Geração do código de verificação
    const verificationCode = generateVerificationCode();
    const verificationCodeExpiration = new Date(Date.now() + CODE_EXPIRATION_TIME);

    // Criação do usuário
    const newUser = await prisma.users.create({
      data: {
        name,
        email,
        password: hashedPassword,
        verificationCode,
        verificationCodeExpiration,
        isVerified: false,
      },
    });

    // Geração do JWT
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        isVerified: newUser.isVerified
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION || '2h' }
    );

    // Envio do e-mail de verificação
    await newAccountEmail(name, email, verificationCode);

    // Resposta com JWT e dados do usuário
    return res.status(201).json({
      message: MESSAGES.success.verificationEmailSent,
      token: token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        isVerified: newUser.isVerified
      }
    });

  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({ 
      error: MESSAGES.errors.internalError,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

 const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log('Buscando usuário no banco de dados...');
    const user = await prisma.users.findUnique({ where: { email } });

    if (!user) {
      console.log('Usuário não encontrado:', email);
      return res.status(404).json({ error: MESSAGES.errors.userNotFound });
    }

    console.log('Usuário encontrado:', user);

  

    console.log('Verificando senha...');
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Senha inválida para o usuário:', user.email);
      return res.status(401).json({ error: MESSAGES.errors.invalidCredentials });
    }

    console.log('Gerando token JWT...');
    const token = jwt.sign(
      { id: user.id, email: user.email, isVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('Login bem-sucedido. Retornando token e dados do usuário...');
    return res.json({
      message: MESSAGES.success.loggedIn,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified,
        role: user.role,
      
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ error: MESSAGES.errors.internalError });
  }
};
 const resendVerificationCode = async (req, res) => {
  const { email } = req.body;

  try {
    console.log('Iniciando reenvio do código de verificação para:', email);

    // Verifica se o usuário existe
    const user = await prisma.users.findUnique({ where: { email } });

    if (!user) {
      console.log(`Usuário não encontrado: ${email}`);
      return res.status(400).json({ error: MESSAGES.errors.userNotFound });
    }

    console.log(`Usuário encontrado: ${user.name}`);

    // Gera um novo código de verificação
    const newVerificationCode = generateVerificationCode();
    const verificationCodeExpiration = new Date(Date.now() + CODE_EXPIRATION_TIME);

    // Atualiza o código e a data de expiração no banco
    await prisma.users.update({
      where: { email },
      data: {
        verificationCode: newVerificationCode,
        verificationCodeExpiration,
      },
    });

    console.log('Novo código gerado e banco de dados atualizado.');

    // Envia o e-mail de verificação
    await novoCodigoEmail(user.name, user.email, newVerificationCode);

    console.log(`E-mail de verificação enviado para: ${user.email}`);

    return res.status(200).json({ message: MESSAGES.success.verificationCodeResent });
  } catch (error) {
    console.error('Erro ao reenviar código de verificação:', error);
    return res.status(500).json({
      error: MESSAGES.errors.internalError,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};




const calcularIdade = (dataNascimento) => {
  // Data de referência para cálculo da idade (19/07/2025)
  const dataReferencia = new Date('2025-07-19');
  
  // Cria um objeto Date com a data de nascimento fornecida
  const nascimento = new Date(dataNascimento);

  // Calcula a diferença em anos
  let idade = dataReferencia.getFullYear() - nascimento.getFullYear();

  // Ajusta caso o aniversário do usuário ainda não tenha ocorrido no ano de 2025
  const mesReferencia = dataReferencia.getMonth();
  const mesNascimento = nascimento.getMonth();
  const diaReferencia = dataReferencia.getDate();
  const diaNascimento = nascimento.getDate();

  if (
    mesReferencia < mesNascimento ||
    (mesReferencia === mesNascimento && diaReferencia < diaNascimento)
  ) {
    idade--; // Se o aniversário ainda não passou, subtrai um ano
  }

  return idade;
};


const mercadopago = require('mercadopago');


 const participante = async (req, res) => {
  const userId = req.userId;
  console.log("Valor de userId:", userId);
  console.log("Dados recebidos:", req.body);

  // Schema de validação completo
  const schema = Joi.object({
    // Dados Pessoais
    nomeCompleto: Joi.string().min(3).max(100).required().label('Nome Completo'),
    nomeSocial: Joi.string().min(3).max(100).allow(null, '').optional().label('Nome social'),
    nomeCracha: Joi.string().min(2).max(100).allow(null, '').required().label('Nome no crachá'),
    dataNascimento: Joi.date().iso().max(new Date()).required().label('Data de Nascimento'),
    sexo: Joi.string().required().label('Pronome'),
    email: Joi.string().email().max(100).required().label('E-mail'),
    telefone: Joi.string().pattern(/^\d{10,11}$/).required().label('Telefone'),

    // Responsável (para menores)
    tipoParticipacao: Joi.string()
      .valid('Confraternista', 'Trabalhador')
      .required()
      .label('Tipo de Participação'),
    nomeCompletoResponsavel: Joi.string()
      .min(3)
      .max(100)
      .allow(null, '')
      .optional()
      .label('Nome do Responsável'),
    documentoResponsavel: Joi.string()
      /* .pattern(/^\d{10,11}$/)  */
      .allow(null, '')
      .optional()
      .label('Documento do Responsável'),
      telefoneResponsavel: Joi.string().pattern(/^\d{10,11}$/).allow(null, '').optional().label('Telefone do Responsável'),

    // Configuração do Evento
    comissao: Joi.string()
      .valid('', 'Alimentação',  'Atendimento Fraterno', 'Núcleo Gestor', 'Divulgação', 'Estudos Doutrinários', 'Multimeios', 'Secretaria', 'Serviços Gerais', 'Recepção')
      .optional()
      .label('Comissão'),
      camisa: Joi.boolean()
      .optional()
      .label('Camisa'),
    
    tamanhoCamisa: Joi.when('camisa', {
      is: true,
      then: Joi.string().required().label('Tamanho da Camisa'), 
      otherwise: Joi.string().allow('').optional()
    }),
    
    vegetariano: Joi.string().label('Vegetarianismo'),
    

    // Endereço
    cep: Joi.string().pattern(/^\d{5}-?\d{3}$/).required().label('CEP'),
    estado: Joi.string().length(2).required().label('Estado'),
    cidade: Joi.string().max(50).required().label('Cidade'),
    IE: Joi.string().max(100).required().label('IE'),
    bairro: Joi.string().max(50).required().label('Bairro'),
    logradouro: Joi.string().max(100).required().label('Logradouro'),
    numero: Joi.string().max(10).required().label('Número'),
    complemento: Joi.string().max(50).allow(null, '').optional().label('Complemento'),
    primeiraComejaca: Joi.boolean().default(false),
    deficienciaAuditiva: Joi.boolean().default(false),
    otherInstitution: Joi.string().allow(null, '').optional().label('Outra Instituição'),
    deficienciaAutismo: Joi.boolean().default(false),
    deficienciaIntelectual: Joi.boolean().default(false),
    deficienciaParalisiaCerebral: Joi.boolean().default(false),
    deficienciaVisual: Joi.boolean().default(false),
    deficienciaFisica: Joi.boolean().default(false),
    deficienciaOutra: Joi.boolean().default(false),
    deficienciaOutraDescricao: Joi.when('deficienciaOutra', {
      is: true,
      then: Joi.string().required().messages({
        'string.empty': 'A descrição da deficiência é obrigatória.',
        'any.required': 'A descrição da deficiência é obrigatória.',
      }),
      otherwise: Joi.string().allow('').optional(),
    }),

    // Saúde
    medicacao: Joi.string().max(500).allow(null, '').optional().label('Medicação'),
    alergia: Joi.string().max(500).allow(null, '').optional().label('Alergia'),
    outrasInformacoes: Joi.string().max(1000).allow(null, '').optional().label('Outras Informações'),
    outroGenero: Joi.string().max(1000).allow(null, '').optional().label('Outros Gêneros')
  }).messages({
    'any.required': 'O campo {{#label}} é obrigatório',
    'string.empty': 'O campo {{#label}} não pode estar vazio',
    'string.pattern.base': 'Formato inválido para {{#label}}',
    'date.max': '{{#label}} não pode ser uma data futura'
  });

  // Validação dos dados
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.context.label,
      message: detail.message
    }));
    return res.status(400).json({
      error: MESSAGES.errors.invalidData,
      details: errors
    });
  }

  try {
    // Verificação do usuário
    const usuario = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, isVerified: true }
    });

    if (!usuario) {
      return res.status(404).json({ error: MESSAGES.errors.userNotFound });
    }
    if (!usuario.isVerified) {
      return res.status(403).json({ error: MESSAGES.errors.unverifiedUser });
    }
    const participanteId = uuidv4();
    const dadosParticipante = {
      id: participanteId,
      ...req.body,
      userId,
      dataNascimento: new Date(req.body.dataNascimento),
    };
    
    console.log("Dados antes de tratar telefone e CEP:", dadosParticipante);
    
    // Verificação de telefone e CEP
    const camposComErro = ['cep', 'telefone', 'telefoneResponsavel', 'documentoResponsavel'];
    
    camposComErro.forEach(campo => {
      if (req.body[campo] !== undefined) {
        console.log(`${campo}:`, req.body[campo]);
      }
    });
    console.log('CEP:', req.body.cep); // Adicione isso antes da linha de tratamento
dadosParticipante.cep = req.body.cep && typeof req.body.cep === 'string' ? req.body.cep.replace(/\D/g, '') : '';

 
    dadosParticipante.telefone = req.body.telefone && typeof req.body.telefone === 'string' ? req.body.telefone.replace(/\D/g, '') : '';
    dadosParticipante.telefoneResponsavel = req.body.telefoneResponsavel && typeof req.body.telefoneResponsavel === 'string' ? req.body.telefoneResponsavel.replace(/\D/g, '') : '';
    dadosParticipante.documentoResponsavel = req.body.documentoResponsavel && typeof req.body.documentoResponsavel === 'string' ? req.body.documentoResponsavel.replace(/\D/g, '') : '';
    
    console.log("Dados após tratar telefone e CEP:", dadosParticipante);
    
    
    
 

    

    // Calcular idade
    const idade = calcularIdade(dadosParticipante.dataNascimento);

/*     // Definir valor da inscrição
    const valor = idade < 11 ? 45 : 60;

    const { email, nomeCompleto, id } = req.body;

    // Criar preferência de pagamento com o Mercado Pago
    const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  
const client = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

const preference = new mercadopago.Preference(client);
const preferenceData = {
  items: [
    {
      title: 'EMEI | INSCRIÇÃO',
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(valor),
    },
  ],
  payer: {
    email: email,
    name: nomeCompleto,

     },

     metadata: {
       participanteId:  dadosParticipante.id
    },
     payment_methods: {
  
      excluded_payment_methods: [
        { id: 'ticket' }, 
        { id: 'atm' }   
      ],
      excluded_payment_types: [
        { id: 'ticket' }
      ], 
      installments: 1, 
    },
  notification_url: `${BASE_URL}/api/auth/mercadopago/notificacao`,
  back_urls: {
    success: `${FRONTEND_URL}/sucesso`,
    failure: `${FRONTEND_URL}/falha`,
    pending: `${FRONTEND_URL}/pendente`,
  },
  auto_return: 'approved',
};



    try {
      // Criar link de pagamento
      const mpResponse = await preference.create({ body: preferenceData });

      const linkPagamento = mpResponse.init_point;
      console.log('mpResponse:', mpResponse);
      console.log('Link de pagamento:', mpResponse.init_point); 
   
    
      // Anexar dados de pagamento ao participante
      dadosParticipante.valor = valor;
      dadosParticipante.linkPagamento = linkPagamento;
      dadosParticipante.statusPagamento = 'pendente';
 */
      console.log('Dados que vão pro banco:', dadosParticipante);
      console.log('Prisma Client:', prisma);
      // Criação do participante no banco
      const novoParticipante = await prisma.participante2025.create({
        data: dadosParticipante,
        select: {
          id: true,
          nomeCompleto: true,
          nomeCracha: true,
          nomeSocial: true,
          dataNascimento: true,
          sexo: true,
          email: true,
          telefone: true,
          tipoParticipacao: true,
          nomeCompletoResponsavel: true,
          documentoResponsavel: true,
          telefoneResponsavel: true,
          cep: true,
          estado: true,
          cidade: true,
          IE: true,
          bairro: true,
          logradouro: true,
          numero: true,
          complemento: true,
          vegetariano: true,
          camisa: true,
          tamanhoCamisa: true,
          primeiraComejaca: true,
          deficienciaAuditiva: true,
          deficienciaAutismo: true,
          deficienciaIntelectual: true,
          deficienciaParalisiaCerebral: true,
          deficienciaVisual: true,
          deficienciaFisica: true,
          deficienciaOutra: true,
          deficienciaOutraDescricao: true,
          medicacao: true,
          alergia: true,
          outrasInformacoes: true,
          outroGenero: true,
       //   valor: true,
       //   linkPagamento: true,
       //   statusPagamento: true,
          otherInstitution: true
        },
      });
 //    console.log('Resposta do MercadoPago:', mpResponse);
      // Retornar dados do participante
      return res.status(201).json({
        success: true,
        message: MESSAGES.success.participantCreated,
        data: novoParticipante,
      });
    } /* catch (paymentError) {
      console.error('Erro ao criar pagamento:', paymentError);
      return res.status(500).json({
        error: MESSAGES.errors.paymentError,
        details: paymentError.message,
      });
    }
  }  */catch (err) {
    console.error('Erro ao processar participante:', err);
    return res.status(500).json({
      error: MESSAGES.errors.internalError,
      details: err.message,
    });
  }
};

const updateInscricao = async (req, res) => {
  const { id } = req.params;
  const dadosParticipante = req.body;

  try {
    // Verifica se o ID foi passado
    if (!id) {
      return res.status(400).json({ error: 'ID do participante não informado.' });
    }

    const participanteAtualizado = await prisma.participante2025.update({
      where: { id },
      data: dadosParticipante,
      select: {
        id: true,
        nomeCompleto: true,
        nomeCracha: true,
        nomeSocial: true,
        dataNascimento: true,
        sexo: true,
        email: true,
        telefone: true,
        tipoParticipacao: true,
        nomeCompletoResponsavel: true,
        documentoResponsavel: true,
        telefoneResponsavel: true,
        cep: true,
        estado: true,
        cidade: true,
        IE: true,
        bairro: true,
        logradouro: true,
        numero: true,
        complemento: true,
        vegetariano: true,
        camisa: true,
        tamanhoCamisa: true,
        primeiraComejaca: true,
        deficienciaAuditiva: true,
        deficienciaAutismo: true,
        deficienciaIntelectual: true,
        deficienciaParalisiaCerebral: true,
        deficienciaVisual: true,
        deficienciaFisica: true,
        deficienciaOutra: true,
        deficienciaOutraDescricao: true,
        medicacao: true,
        alergia: true,
        outrasInformacoes: true,
        outroGenero: true,
        valor: true,
        linkPagamento: true,
        statusPagamento: true,
        otherInstitution: true
      },
    });

    return res.status(200).json(participanteAtualizado);

  } catch (error) {
    console.error(error);
    return res.status(400).json({
      error: 'Erro ao atualizar participante.',
      detalhes: error.message
    });
  }
};

 const getparticipantes = async (req, res) => {
  try {
    // 1. Obter ID do usuário corretamente do middleware de autenticação
    const userId = req.userId;  // ✅ Correto (assumindo que o middleware populou req.user)

    // 2. Validação reforçada
    if (!userId) {
      console.warn('Tentativa de acesso não autenticada');
      return res.status(401).json({ 
        error: 'Não autorizado',
        message: 'Token de acesso inválido ou expirado' 
      });
    }

    // 3. Buscar participantes com tratamento de erros específico
    const participantes = await prisma.participante2025.findMany({
      where: { userId },
      select: {
        id: true,
        nomeCompleto: true,
        IE: true,
        createdAt: true,
      }
    });

    // 4. Melhor resposta para nenhum resultado
    if (participantes.length === 0) {
      return res.status(200).json({
        message: 'Nenhuma inscrição encontrada',
        suggestions: ['Verifique se já realizou alguma inscrição']
      });
    }

    // 5. Resposta de sucesso padronizada
    return res.status(200).json({
      count: participantes.length,
      data: participantes,
      meta: {
        requestId: req.requestId, // Assumindo que existe um ID de requisição
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    // 6. Log de erro melhorado
    console.error(`Erro [${req.requestId}] em getparticipantes:`, {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });

    // 7. Resposta de erro padronizada
    return res.status(500).json({
      error: 'Erro no processamento',
      message: 'Não foi possível recuperar as inscrições',
      reference: req.requestId // Para rastreamento de logs
    });
  }
};

 const criarInstituicao = async (req, res) => {
  try {
  
    const userId = req.userId;

    // Logando o ID do usuário para verificar
    console.log("Headers recebidos:", req.headers);
    console.log("User ID recebido no controlador:", req.userId);
    if (!userId) {
      return res.status(400).json({ error: "ID do usuário não fornecido." });
    }

    // Verificando se o usuário existe
    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    // Logando o usuário para verificar se foi encontrado
    console.log("Usuário encontrado:", user);

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // Formatando o nome conforme "Sigla - Nome - CNPJ"
    const nomeFormatado = `${req.body.sigla} - ${req.body.nome}`;

    // Logando antes de criar a instituição para verificar os dados
    console.log("Dados para criação da instituição:", req.body);

    // Criando a instituição
    const instituicao = await prisma.instituicaoEspirita.create({
      data: {
        nome: nomeFormatado,  // Usando o nome formatado
        sigla: req.body.sigla,
        CEU: req.body.CEU,
        
        estado: req.body.estado,
        cidade: req.body.cidade,
        bairro: req.body.bairro,
        logradouro: req.body.logradouro,
        numero: req.body.numero,
        complemento: req.body.complemento,
        telefone: req.body.telefone,
        horario: req.body.horario,
        dia: req.body.dia,
        email: req.body.email,
        CNPJ: req.body.CNPJ, // Incluindo o CNPJ se necessário
        criadoPor: {
          connect: { id: userId }, // Relacionando o usuário com a instituição
        },
      },
    });

    // Logando a instituição criada
    console.log("Instituição criada:", instituicao);

    return res.status(201).json(instituicao);
  } catch (error) {
    // Logando o erro para debug
    console.error("Erro ao criar instituição:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
};


 const listarInstituicoes = async (req, res) => {
  try {
    // Consultando todas as instituições espíritas no banco de dados
    const instituicoes = await prisma.instituicaoEspirita.findMany();

    // Retornando a lista de instituições
    return res.status(200).json(instituicoes);
  } catch (error) {
    console.error("Erro ao listar instituições:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
};
 const atualizarInstituicao = async (req, res) => {
  console.log("Request completa:", req); // 🔍 Debug geral da request
  console.log("ID do usuário recebido:", req.userId); // Verificar se está undefined
  try {
    const userId = req.userId;  // Verifique se o 'userId' está sendo passado corretamente pelo middleware

    console.log("ID do usuário:", userId);

    // Verificando se o ID do usuário foi fornecido
    if (!userId) {
      return res.status(400).json({ error: "ID do usuário não fornecido." });
    }

    // Convertendo o ID da instituição para um número inteiro
    const instituicaoId = parseInt(req.params.id, 10); 

    if (isNaN(instituicaoId)) {
      return res.status(400).json({ error: "ID da instituição inválido." });
    }

    // Verificando se o usuário existe e se é administrador
    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // Verificando se o usuário é administrador
    if (user.role !== 'admin') {
      return res.status(403).json({ error: "Acesso negado. Somente administradores podem atualizar." });
    }

    // Verificando se a instituição a ser atualizada existe
    const instituicao = await prisma.instituicaoEspirita.findUnique({
      where: { id: instituicaoId },  // Usando o ID convertido
    });

    if (!instituicao) {
      return res.status(404).json({ error: "Instituição não encontrada." });
    }
    const updatedInstituicao = await prisma.instituicaoEspirita.update({
      where: { id: instituicaoId }, // ID da instituição
      data: {
        nome: req.body.nome || instituicao.nome,
        sigla: req.body.sigla || instituicao.sigla,
        CEU: req.body.CEU || instituicao.CEU,
        estado: req.body.estado || instituicao.estado,
        cidade: req.body.cidade || instituicao.cidade,
        bairro: req.body.bairro || instituicao.bairro,
        logradouro: req.body.logradouro || instituicao.logradouro,
        numero: req.body.numero || instituicao.numero,
        complemento: req.body.complemento || instituicao.complemento,
        telefone: req.body.telefone || instituicao.telefone,
        horario: req.body.horario || instituicao.horario,
        dia: req.body.dia || instituicao.dia,
        email: req.body.email || instituicao.email,
        atualizadoPorId: userId, // Atualizando o ID do usuário que fez a atualização
      },
    });
    console.log(updatedInstituicao)

    return res.status(200).json(updatedInstituicao);
  } catch (error) {
    console.error("Erro ao atualizar a instituição:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
};
 const updateProfile = async (req, res) => { 
  const { userId, name, email, phone, currentPassword, newPassword, communication1, communication2 } = req.body;

  // Validações de dados
  if (!userId || !name || !email || !currentPassword ) {
    return res.status(400).send('Todos os campos obrigatórios precisam ser preenchidos.');
  }

  try {
    // Verifique a senha atual (assumindo que o sistema armazena senhas de forma segura, com hash)
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('Usuário não encontrado.');
    }

    const dbPassword = result.rows[0].password;

    // Aqui você deve comparar a senha atual (com hash) com o banco de dados (não é uma comparação simples de string)
    if (dbPassword !== currentPassword) {
      return res.status(403).send('Senha atual incorreta.');
    }

    // Atualize as informações no banco de dados
    const updateQuery = `
      UPDATE users
      SET name = $1, email = $2, phone = $3, password = $4, communication1 = $5, communication2 = $6
      WHERE id = $7
      RETURNING id
    `;
    const values = [name, email, phone, newPassword, communication1, communication2, userId];

    const updateResult = await pool.query(updateQuery, values);

    if (updateResult.rows.length === 0) {
      return res.status(400).send('Falha ao atualizar as informações.');
    }

    res.status(200).send('Perfil atualizado com sucesso.');
  } catch (error) {
    console.error('Erro ao atualizar o perfil:', error);
    res.status(500).send('Erro ao atualizar o perfil.');
  }
}

 const getProfile = async (req, res) => { 
 
    const { userId } = req.params; 
  
    try {
      // Busque os dados do usuário no banco de dados com base no userId
      const result = await pool.query('SELECT name, email, telefone, comunicacaocomejaca, comunicacaomovimento FROM users WHERE id = $1', [userId]);
  
      // Verifique se o usuário existe
      if (result.rows.length === 0) {
        return res.status(404).send('Usuário não encontrado.');
      }
  
      // Retorne os dados do perfil
      const user = result.rows[0];
      res.status(200).json({
        name: user.name,
        email: user.email,
        telefone: user.telefone,
        comunicacaocomejaca: user.comunicacaocomejaca,
        comunicacaomovimento: user.comunicacaomovimento, 
      });
    } catch (error) {
      console.error('Erro ao buscar o perfil:', error);
      res.status(500).send('Erro ao buscar o perfil.');
    }
  };
  
 const obterInscricao = async (req, res) => {
    const userId = req.userId; // Obtém o ID do usuário autenticado
    const { participanteId } = req.params; // Obtém o ID do participante da URL
  
    try {
      // Verifica se o usuário existe e está verificado
      const usuario = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true, isVerified: true }
      });
  
      if (!usuario) {
        return res.status(404).json({ error: MESSAGES.errors.userNotFound });
      }
      if (!usuario.isVerified) {
        return res.status(403).json({ error: MESSAGES.errors.unverifiedUser });
      }
  
      const inscricao = await prisma.participante2025.findUnique({
        where: { id: participanteId, userId },
        select: {
          id: true,
          nomeCompleto: true,
          nomeCracha: true,
          nomeSocial: true,
          dataNascimento: true,
          sexo: true,
          email: true,
          telefone: true,
          tipoParticipacao: true,
          nomeCompletoResponsavel: true,
          documentoResponsavel: true,
          telefoneResponsavel: true,
          comissao: true,
          camisa: true,
          tamanhoCamisa: true,
          cep: true,
          estado: true,
          cidade: true,
          bairro: true,
          logradouro: true,
          numero: true,
          complemento: true,
          medicacao: true,
          alergia: true,
          vegetariano: true,
          outrasInformacoes: true,
          IE: true,
          outroGenero: true,
          otherInstitution: true,
          primeiraComejaca: true,
          deficienciaAuditiva: true,
          deficienciaAutismo: true,
          deficienciaIntelectual: true,
          deficienciaParalisiaCerebral: true,
          deficienciaVisual: true,
          deficienciaFisica: true,
          deficienciaOutra: true,
          deficienciaOutraDescricao: true,
          statusPagamento: true,
          userId: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
  
      // Se não encontrar a inscrição, retorna erro
      if (!inscricao) {
        return res.status(404).json({ error: MESSAGES.errors.registrationNotFound });
      }
  
      return res.status(200).json({
        success: true,
        message: "Dados da inscrição encontrados com sucesso!",
        data: inscricao
      });
  
    } catch (error) {
      console.error("Erro ao buscar inscrição:", error);
      
      return res.status(500).json({
        error: MESSAGES.errors.internalError,
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };
  
   const esquecisenha = async (req, res) => {
    const { email } = req.body;

    try {
      // Gerando um token de redefinição (expira em 1 hora)
      const resetToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "1h" });
  
      // Criando o link de redefinição
      const resetLink = `https://www.emeirj.com.br/redefinir-senha?token=${resetToken}`;
  
      // Enviando o e-mail
      await transporter.sendMail({
        from: `"Seu App" <${process.env.MAIL_USER}>`,
        to: email,
        subject: "Redefinição de Senha",
        html: `
          <p>Olá,</p>
          <p>Você solicitou a redefinição de senha. Clique no link abaixo para cadastrar uma nova senha:</p>
          <p><a href="${resetLink}" target="_blank">Redefinir Senha</a></p>
          <p>Se você não solicitou essa mudança, ignore este e-mail.</p>
          <p>Este link é válido por 1 hora.</p>
        `,
      });
  
      res.json({ message: "E-mail de redefinição enviado com sucesso!" });
    } catch (error) {
      console.error("Erro ao enviar e-mail:", error);
      res.status(500).json({ error: "Erro ao enviar e-mail." });
    }
  };

  const paymentId = async (req, res) => {
    const { id } = req.params;
  
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' });
    }
  
    try {
      const participante = await prisma.participante2025.findUnique({
        where: { id },
      });
  
      if (!participante || !participante.linkPagamento) {
        return res.status(404).json({ error: 'Link de pagamento não encontrado' });
      }
  
      return res.status(200).json({ init_point: participante.linkPagamento });
    } catch (error) {
      console.error('Erro ao buscar link de pagamento:', error);
      return res.status(500).json({ error: 'Erro ao buscar pagamento' });
    }
  };
  
  
  const AtualizarpaymentId = async (req, res) => {
    const { id } = req.params;
    const { statusPagamento } = req.body;
  
    console.log('ID do participante:', id); // Adicione este log para verificar o id
  
    try {
      // Verifique se o participante existe
      const participante = await prisma.participante2025.findUnique({
        where: { id },
      });
  
      if (!participante) {
        return res.status(404).json({ success: false, error: 'Participante não encontrado' });
      }
  
      // Atualiza o status de pagamento
      const updated = await prisma.participante2025.update({
        where: { id },
        data: { statusPagamento },
      });
  
      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Erro ao atualizar status de pagamento:', error);
      return res.status(500).json({ success: false, error: 'Erro ao atualizar status de pagamento' });
    }
  };
  

  const forgotPassword = async (req, res) => {
    const { email } = req.body;
  
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
  
    const token = jwt.sign(
      { id: user.id, resetTokenVersion: user.resetTokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  
    const resetLink = `http://emeirj.com.br/recuperarsenha/route?token=${token}`;
  
    try {
      await transporter.sendMail({
        from: `"EMEI" <${process.env.MAIL_USER}>`,
        headers: {
          'X-Mailer': 'Nodemailer',
          'X-Priority': '3',
          'Return-Path': 'process.env.MAIL_USER' 
        },
        to: email,
        subject: 'Redefinição de Senha',
        html: `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Redefinir Senha</title>
            <style>
              body {
                font-family: 'Arial', sans-serif;
                margin: 0;
                padding: 30px 0;
                background-color: #F2F2F2;
              }
              .container {
                max-width: 680px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 3px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              }
              .header {
                padding: 40px 30px 20px;
                border-bottom: 1px solid #e9ecef;
                text-align: center;
              }
              .header img {
                height: 40px;
              }
              .content {
                padding: 40px 30px;
                color: #4a4e69;
              }
              .button-container {
                margin: 30px 0;
                text-align: center;
              }
              .reset-button {
                display: inline-block;
                padding: 15px 30px;
                background-color: #22223b;
                border-radius: 6px;
                font-size: 16px;
                font-weight: bold;
                color: #fff;
                text-decoration: none;
              }
              a {
                color: #fff !important;
                text-decoration: none !important;
              }
              .footer {
                padding: 25px 30px;
                background-color: #f8f9fa;
                text-align: center;
                font-size: 14px;
                color: #6c757d;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <img src="https://i.postimg.cc/vZzhthCb/favicon-email.png" alt="Logo EMEI">
              </div>
              
              <div class="content">
                <p>Olá ${user.name},</p>
                
                <p>Recebemos uma solicitação para redefinir sua senha no <strong>Portal EMEI</strong>.</p>
                <p>Se você não solicitou, pode ignorar esta mensagem. </p>
      
                <div class="button-container">
                  <a href="${resetLink}" class="reset-button" target="_blank">Redefinir Senha</a>
                </div>
      
                <p>🔒 Este link é válido por 15 minutos.</p>
      
                <p>Atenciosamente,<br>
                Equipe EMEI</p>
              </div>
      
              <div class="footer">
                <p>Esta é uma mensagem automática. Por favor, não responda este e-mail.</p>
                <p>Dúvidas? Contate-nos: emeiiraja23@gmail.com</p>
                <p>© ${new Date().getFullYear()} EMEI App. Todos os direitos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
  
      res.json({ message: 'E-mail enviado com sucesso' });
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      res.status(500).json({ message: 'Erro ao enviar e-mail' });
    }
  }; 

  const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
  

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token e nova senha são obrigatórios.' });
    }
  
    try {
      const { id: userId, resetTokenVersion } = jwt.verify(token, process.env.JWT_SECRET);
  
      const user = await prisma.users.findUnique({ where: { id: userId } });
  
      if (!user || user.resetTokenVersion !== resetTokenVersion) {
        return res.status(400).json({ message: 'Token inválido ou expirado.' });
      }
  
      const sanitizedPassword = newPassword.trim();
  
      if (sanitizedPassword.length < 6) {
        return res.status(400).json({ message: 'A nova senha deve ter pelo menos 6 caracteres.' });
      }
  
      const passwordHash = await bcrypt.hash(sanitizedPassword, 10);
  
      await prisma.users.update({
        where: { id: userId },
        data: {
          password: passwordHash,
          resetTokenVersion: { increment: 1 }, 
        },
      });
  
      return res.status(200).json({ message: 'Senha redefinida com sucesso.' });
  
    } catch (error) {
      console.error('Erro na redefinição de senha:', error);
  
      if (error.name === 'TokenExpiredError') {
        return res.status(400).json({ message: 'Token expirado. Solicite uma nova redefinição de senha.' });
      }
  
      return res.status(400).json({ message: 'Token inválido ou erro inesperado.' });
    }
  };
  
  const listarParticipantes = async (req, res) => {
    try {
      const participantes = await prisma.participante2025.findMany({
        select: {
          id: true,
          nomeCompleto: true,
          IE: true,
          statusPagamento: true,
          linkPagamento: true,
        },
      });
  
      return res.status(200).json({
        success: true,
        data: participantes,
      });
    } catch (error) {
      console.error('Erro ao listar participantes:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar os participantes.',
      });
    }
  };


  const notificacao = async (req, res) => {
    try {
 // Verificação da assinatura secreta
 const signature = req.headers['x-signature'];
 const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET; // Defina a assinatura secreta no .env

 const payload = JSON.stringify(req.body);
 const hash = crypto
   .createHmac('sha256', secret)
   .update(payload)
   .digest('hex');

 if (signature !== hash) {
   console.warn('Assinatura inválida do webhook!');
   return res.status(401).send('Assinatura inválida');
 }


      console.log('Webhook recebido:', req.body);
  
      const paymentId = req.body.data?.id;
      const topic = req.body.type;
  
      if (topic !== 'payment') {
        return res.status(200).send('Notificação ignorada');
      }
  
      const client = new mercadopago.MercadoPagoConfig({
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
      });
  
      const payment = await mercadopago.Payment.findById(client, paymentId);
      const paymentInfo = payment.body;
  
      const status = paymentInfo.status; // 'approved', 'pending', etc
      const metadata = paymentInfo.metadata;
  
      const participanteId = metadata.participanteId;
  
      console.log('Pagamento recebido para participante:', participanteId, 'Status:', status);
  
      if (!participanteId) {
        return res.status(400).send('ParticipanteId ausente na metadata');
      }
  
      // Atualiza no banco (com Prisma)
      await prisma.participante2025.update({
        where: { id: participanteId },
        data: {
          statusPagamento: status,
        },
      });
  
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Erro no webhook:', err);
      return res.status(500).send('Erro interno');
    }
  };
  
const atualizarPerfil = async (req, res) => {
  const { nome, email, telefone, comunicacaocomejaca, comunicacaomovimento, senha } = req.body;
  console.log('Dados recebidos para atualização:', req.body);

  try {
    const userId = req.userId; // Pega o ID do usuário autenticado pelo token
    console.log('ID do usuário extraído:', userId);

    // Encontrar o usuário
    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    // Verificar se o usuário existe
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Prepara os dados de atualização
    const updateData = {
      name: nome,
      email: email,
      telefone: telefone,
      comunicacaocomejaca: comunicacaocomejaca,
      comunicacaomovimento: comunicacaomovimento,
      updatedAt: new Date(),
    };

    // Se a senha for fornecida, criptografa a nova senha
    if (senha) {
      const hashedPassword = await bcrypt.hash(senha, 10);
      updateData.password = hashedPassword;
    }

    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: updateData,
    });

    return res.status(200).json({
      message: 'Perfil atualizado com sucesso',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Erro ao atualizar o perfil:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o perfil' });
  }
};


  
  module.exports = { esquecisenha, obterInscricao, getProfile, updateProfile, atualizarInstituicao, listarInstituicoes, criarInstituicao, getparticipantes, participante,resendVerificationCode, login, register, validateToken,verificar, paymentId,resetPassword, forgotPassword,listarParticipantes, notificacao, AtualizarpaymentId, atualizarPerfil, updateInscricao, enviarComprovante}