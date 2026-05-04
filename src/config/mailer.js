const fs = require("fs");
const { Resend } = require("resend");
const dotenv = require("dotenv");

dotenv.config();

let resendClient = null;

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || !String(key).trim()) {
    const err = new Error(
      "RESEND_API_KEY não configurada. Configure a chave da API Resend."
    );
    err.code = "RESEND_NOT_CONFIGURED";
    throw err;
  }
  if (!resendClient) {
    resendClient = new Resend(String(key).trim());
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
  if (process.env.RESEND_FROM) return process.env.RESEND_FROM;
  if (process.env.MAIL_USER) {
    return `"EMEI" <${process.env.MAIL_USER}>`;
  }
  throw new Error(
    "Remetente não definido: use from no envio ou defina RESEND_FROM ou MAIL_USER."
  );
}

/**
 * Envia e-mail exclusivamente via Resend (API).
 * @param {object} options - Compatível com o objeto usado antes (from, to, subject, html, text, attachments, etc.)
 */
async function sendMail(options) {
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

module.exports = { sendMail };
