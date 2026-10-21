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

test('notification mail uses one recipient, plain text and a stable message ID', async (t) => {
  configureSmtp(t)
  const messages: nodemailer.SendMailOptions[] = []
  let closed = 0
  t.mock.method(nodemailer, 'createTransport', ((options: Record<string, unknown>) => {
    assert.equal(options.connectionTimeout, 10000)
    assert.equal(options.greetingTimeout, 10000)
    assert.equal(options.socketTimeout, 10000)
    return {
      close: () => {
        closed++
      },
      sendMail: async (message: nodemailer.SendMailOptions) => {
        messages.push(message)
        return { accepted: ['customer@example.com'], rejected: [] }
      }
    }
  }) as unknown as typeof nodemailer.createTransport)
  const notification = {
    id: '0123456789abcdef01234567',
    title: 'Hidden\r\nBcc: attacker',
    message: '<script>literal text</script>'
  }
  await email.sendNotification('customer@example.com', notification)
  await email.sendNotification('customer@example.com', notification)
  assert.deepEqual(messages[0].to, { address: 'customer@example.com', name: '' })
  assert.equal(messages[0].html, undefined)
  assert.doesNotMatch(String(messages[0].subject), /[\r\n]/)
  assert.match(String(messages[0].text), /<script>literal text<\/script>/)
  assert.equal(messages[0].messageId, messages[1].messageId)
  assert.equal(closed, 2)
  for (const recipient of ['a@example.com,b@example.com', 'a@example.com\r\nBcc:b@example.com', '', 'invalid'])
    await assert.rejects(email.sendNotification(recipient, notification), /Invalid/)
  assert.equal(messages.length, 2)
})

test('notification mail does not claim success when SMTP rejects the recipient', async (t) => {
  configureSmtp(t)
  t.mock.method(nodemailer, 'createTransport', (() => ({
    close: () => {},
    sendMail: async () => ({ accepted: [], rejected: ['customer@example.com'] })
  })) as unknown as typeof nodemailer.createTransport)
  await assert.rejects(
    email.sendNotification('customer@example.com', {
      id: '0123456789abcdef01234567',
      title: 'Order',
      message: 'Confirmed'
    }),
    /did not accept/
  )
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
