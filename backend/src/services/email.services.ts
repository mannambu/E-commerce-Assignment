import nodemailer from 'nodemailer'
import { ErrorWithStatus } from '~/models/Errors'

class EmailService {
  getResetConfig() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, PASSWORD_RESET_URL } = process.env
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM || !PASSWORD_RESET_URL) {
      throw new ErrorWithStatus({ status: 503, message: 'Chưa cấu hình dịch vụ email đặt lại mật khẩu' })
    }
    const resetUrl = new URL(PASSWORD_RESET_URL)
    if (!['http:', 'https:'].includes(resetUrl.protocol)) throw new Error('Invalid PASSWORD_RESET_URL')
    return {
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
      from: SMTP_FROM,
      resetUrl
    }
  }

  async sendPasswordReset(email: string, userId: string, token: string) {
    const { from, resetUrl, ...smtp } = this.getResetConfig()
    resetUrl.searchParams.set('user_id', userId)
    resetUrl.searchParams.set('forgot_password_token', token)
    const transport = nodemailer.createTransport({ ...smtp, connectionTimeout: 10000, socketTimeout: 10000 })
    await transport.sendMail({
      from,
      to: email,
      subject: 'Fitbite - Đặt lại mật khẩu',
      text: `Mở liên kết sau để đặt lại mật khẩu (có hiệu lực 15 phút, chỉ dùng một lần):\n${resetUrl.toString()}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`
    })
  }
}

export default new EmailService()
