import nodemailer from 'nodemailer'
import { RESET_CODE_EXPIRES_MINUTES } from '~/constants/password-reset'
import { ErrorWithStatus } from '~/models/Errors'
import { validRecipient } from '~/utils/notification-email'

class EmailService {
  getSmtpConfig() {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env
    const port = Number(SMTP_PORT)
    if (
      !SMTP_HOST?.trim() ||
      !SMTP_FROM?.trim() ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !['true', 'false'].includes(SMTP_SECURE || '') ||
      Boolean(SMTP_USER?.trim()) !== Boolean(SMTP_PASSWORD)
    ) {
      throw new ErrorWithStatus({ status: 503, message: 'Chưa cấu hình dịch vụ email' })
    }
    return {
      host: SMTP_HOST.trim(),
      port,
      secure: SMTP_SECURE === 'true',
      auth: SMTP_USER?.trim() ? { user: SMTP_USER.trim(), pass: SMTP_PASSWORD } : undefined,
      from: SMTP_FROM.trim()
    }
  }

  getResetConfig() {
    return this.getSmtpConfig()
  }

  async sendNotification(email: string, notification: { id: string; title: string; message: string }) {
    if (!validRecipient(email) || !/^[a-f\d]{24}$/i.test(notification.id))
      throw new Error('Invalid notification recipient or ID')
    const { from, ...smtp } = this.getSmtpConfig()
    const transport = nodemailer.createTransport({
      ...smtp,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          transport.close()
          reject(new Error('Notification SMTP timeout'))
        }, 30000)
      })
      const result = await Promise.race([
        transport.sendMail({
          from,
          to: { address: email, name: '' },
          subject: `Fitbite - ${notification.title.replace(/[\r\n]/g, ' ').slice(0, 200)}`,
          text: `${notification.message}\n\nThông báo tự động từ Fitbite. Vui lòng đăng nhập để xem trạng thái hiện tại.`,
          messageId: `<notification-${notification.id}@notifications.fitbite.invalid>`
        }),
        timeout
      ])
      if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept recipient')
    } finally {
      if (timer) clearTimeout(timer)
      transport.close()
    }
  }

  async sendPasswordReset(email: string, code: string) {
    const { from, ...smtp } = this.getResetConfig()
    const transport = nodemailer.createTransport({ ...smtp, connectionTimeout: 10000, socketTimeout: 10000 })
    await transport.sendMail({
      from,
      to: email,
      subject: 'Fitbite - Đặt lại mật khẩu',
      text: `Mã xác nhận đặt lại mật khẩu của bạn là: ${code}\n\nNhập mã này cùng email đã đăng ký để đặt mật khẩu mới. Mã có hiệu lực ${RESET_CODE_EXPIRES_MINUTES} phút và chỉ dùng một lần.\nKhông chia sẻ mã này với người khác. Nếu bạn không yêu cầu, hãy bỏ qua email này.`
    })
  }
}

export default new EmailService()
