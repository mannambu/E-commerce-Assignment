import nodemailer from 'nodemailer'
import { RESET_CODE_EXPIRES_MINUTES } from '~/constants/password-reset'
import { ErrorWithStatus } from '~/models/Errors'

class EmailService {
  getResetConfig() {
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
      throw new ErrorWithStatus({ status: 503, message: 'Chưa cấu hình dịch vụ email đặt lại mật khẩu' })
    }
    return {
      host: SMTP_HOST.trim(),
      port,
      secure: SMTP_SECURE === 'true',
      auth: SMTP_USER?.trim() ? { user: SMTP_USER.trim(), pass: SMTP_PASSWORD } : undefined,
      from: SMTP_FROM.trim()
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
