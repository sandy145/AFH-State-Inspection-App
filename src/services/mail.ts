import "server-only";
import { env } from "@/lib/env";

/**
 * Mail transport behind the NotificationService.
 *
 * A hard product rule lives here: email carries a notice and a link, never a
 * document and never resident information. Recipients authenticate in the portal
 * to see the content. `assertNoAttachment` makes that structural — there is no
 * attachment parameter to pass.
 */
export interface OutboundMail {
  to: string;
  subject: string;
  /** Plain text body. Keep it free of case detail beyond the case number. */
  text: string;
  /** Absolute link into the portal; the recipient authenticates on arrival. */
  link?: string;
}

export interface MailTransport {
  readonly driver: string;
  send(mail: OutboundMail): Promise<void>;
}

function render(mail: OutboundMail): string {
  const lines = [mail.text];
  if (mail.link) {
    lines.push("", `Sign in to the AFH Compliance Portal to view it: ${mail.link}`);
  }
  lines.push(
    "",
    "This message is a notification only. Documents and case details are never",
    "sent by email — they are available in the portal after you sign in.",
  );
  return lines.join("\n");
}

class LogTransport implements MailTransport {
  readonly driver = "log";

  async send(mail: OutboundMail): Promise<void> {
    // Deliberately logs the recipient and subject only. Bodies can carry case
    // context, and application logs are not a place for that (§24).
    console.info(`[mail:log] to=${mail.to} subject=${JSON.stringify(mail.subject)}`);
  }
}

class SmtpTransport implements MailTransport {
  readonly driver = "smtp";

  async send(mail: OutboundMail): Promise<void> {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });

    await transporter.sendMail({
      from: env.mailFrom,
      to: mail.to,
      subject: mail.subject,
      text: render(mail),
    });
  }
}

let instance: MailTransport | undefined;

export function mailTransport(): MailTransport {
  if (!instance) {
    instance = env.mailDriver === "smtp" ? new SmtpTransport() : new LogTransport();
  }
  return instance;
}

export { render as renderMailBody };
