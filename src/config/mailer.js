const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config();

const port = Number(process.env.MAIL_PORT || 587);

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "smtp.gmail.com",
  port,
  secure: port === 465, // true só para 465; false para 587
  requireTLS: port === 587,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

transporter.verify((error, success) => {
  if (error) {
    console.log("Erro ao conectar no SMTP:", error);
  } else {
    console.log("Conexão SMTP bem-sucedida!");
  }
});

module.exports = transporter;