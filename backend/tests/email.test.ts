import './setup'
import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import nodemailer from 'nodemailer'
import email from '../src/services/email.services'

function configureSmtp(t: TestContext, overrides: Record<string, string | undefined> = {}) {
  const values = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'sender@example.com',
    SMTP_PASSWORD: 'test-only-password',
    SMTP_FROM: 'Fitbite <sender@example.com>',
    PASSWORD_RESET_URL: undefined,
    ...overrides
  }
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
    t.after(() => {
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    })
  }
}

test('reset email contains the code and expiry, without a URL or user ID', async (t) => {
  configureSmtp(t)
  const messages: nodemailer.SendMailOptions[] = []
  const transport = t.mock.method(nodemailer, 'createTransport', (options: any) => {
    assert.equal(options.port, 465)
    assert.equal(options.secure, true)
    assert.equal(options.auth.user, 'sender@example.com')
    return {
      sendMail: async (message: nodemailer.SendMailOptions) => {
        messages.push(message)
      }
    } as any
  })
  await email.sendPasswordReset('customer@example.com', '012345')
  assert.equal(transport.mock.callCount(), 1)
  assert.equal(messages[0].to, 'customer@example.com')
  assert.match(String(messages[0].text), /012345/)
  assert.match(String(messages[0].text), /15 phút/)
  assert.doesNotMatch(String(messages[0].text), /https?:|localhost|user_id|forgot_password_token/)
})

test('SMTP supports STARTTLS and ignores the obsolete reset URL', (t) => {
  configureSmtp(t, { SMTP_PORT: '587', SMTP_SECURE: 'false', PASSWORD_RESET_URL: 'not-a-url' })
  const config = email.getResetConfig()
  assert.equal(config.port, 587)
  assert.equal(config.secure, false)
  assert.equal('resetUrl' in config, false)
})

test('incomplete or malformed SMTP configuration returns a service error', async (t) => {
  for (const overrides of [
    { SMTP_HOST: '' },
    { SMTP_FROM: ' ' },
    { SMTP_PORT: '' },
    { SMTP_PORT: 'abc' },
    { SMTP_PORT: '65536' },
    { SMTP_PORT: '465.5' },
    { SMTP_SECURE: 'yes' },
    { SMTP_PASSWORD: undefined },
    { SMTP_USER: undefined }
  ]) {
    await t.test(Object.keys(overrides)[0], (child) => {
      configureSmtp(child, overrides)
      assert.throws(() => email.getResetConfig(), { status: 503 })
    })
  }
})
