const fs = require("fs");
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const dotenv = require("dotenv");

dotenv.config();

const useResend = Boolean(process.env.RESEND_API_KEY);

const port = Number(process.env.MAIL_PORT || 587);
const mailTimeout = Number(process.env.MAIL_CONNECTION_TIMEOUT || 60000);

let transporter = null;
let resendClient = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
    connectionTimeout: mailTimeout,
    greetingTimeout: mailTimeout,
    socketTimeout: mailTimeout,
    pool: true,
    maxConnections: 2,
    maxMessages: 20,
    tls: {
      rejectUnauthorized: process.env.MAIL_TLS_REJECT_UNAUTHORIZED !== "false",
    },
  });

  transporter.verify((error) => {
    if (error) {
      console.log("Erro ao conectar no SMTP:", error);
    } else {
      console.log("Conexão SMTP bem-sucedida!");
    }
  });

  return transporter;
}

function getResend() {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

function normalizeRecipients(value) {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value
      .flatMap((v) =>
        typeof v === "string"
          ? v.split(",").map((s) => s.trim())
          : String(v)
      )
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value.includes(",")
      ? value.split(",").map((s) => s.trim()).filter(Boolean)
      : [value];
  }
  return [String(value)];
}

function mapAttachmentsForResend(attachments) {
  if (!attachments?.length) return undefined;
  return attachments.map((att) => {
    const filename = att.filename || "attachment";
    let content = att.content;
    if (att.path != null && content == null) {
      content = fs.readFileSync(att.path);
    }
    if (content == null) {
      throw new Error(`Anexo inválido (sem content ou path): ${filename}`);
    }
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const item = {
      filename,
      content: buf.toString("base64"),
    };
    if (att.contentType) item.contentType = att.contentType;
    return item;
  });
}

function resolveFrom(options) {
  if (options.from) return options.from;
  if (useResend && process.env.RESEND_FROM) return process.env.RESEND_FROM;
  return `"EMEI" <${process.env.MAIL_USER}>`;
}

async function sendMailWithResend(options) {
  const resend = getResend();
  const to = normalizeRecipients(options.to);
  if (!to?.length) {
    throw new Error("Campo 'to' é obrigatório para envio de e-mail");
  }

  const payload = {
    from: resolveFrom(options),
    to: to.length === 1 ? to[0] : to,
    subject: options.subject,
  };

  if (options.html) payload.html = options.html;
  if (options.text) payload.text = options.text;
  if (options.replyTo) payload.replyTo = options.replyTo;

  const cc = normalizeRecipients(options.cc);
  if (cc?.length) payload.cc = cc.length === 1 ? cc[0] : cc;

  const bcc = normalizeRecipients(options.bcc);
  if (bcc?.length) payload.bcc = bcc.length === 1 ? bcc[0] : bcc;

  if (options.headers && Object.keys(options.headers).length) {
    payload.headers = options.headers;
  }

  const attachments = mapAttachmentsForResend(options.attachments);
  if (attachments) payload.attachments = attachments;

  const { data, error } = await resend.emails.send(payload);
  if (error) {
    const msg =
      typeof error.message === "string"
        ? error.message
        : JSON.stringify(error);
    const err = new Error(msg || "Falha ao enviar e-mail via Resend");
    err.resendError = error;
    throw err;
  }

  return { messageId: data?.id, ...data };
}

async function sendMail(options) {
  if (useResend) {
    return sendMailWithResend(options);
  }
  return getTransporter().sendMail(options);
}

module.exports = { sendMail };
