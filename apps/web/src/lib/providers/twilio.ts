/**
 * Twilio cloud SMS adapter.
 *
 * Credentials are supplied by the caller (resolved per channel via CredentialService);
 * this module never reads the account token from the environment itself.
 */
export type TwilioCredentials = {
  account_sid: string
  auth_token: string
}

export async function sendTwilioSms(
  credentials: TwilioCredentials,
  args: { to: string; body: string; from: string; messagingServiceSid?: string | null }
): Promise<void> {
  if (!credentials.account_sid || !credentials.auth_token) {
    throw new Error('Twilio account_sid and auth_token are required')
  }

  const form = new URLSearchParams()
  form.set('To', args.to)
  form.set('Body', args.body)
  if (args.messagingServiceSid) form.set('MessagingServiceSid', args.messagingServiceSid)
  else form.set('From', args.from)

  const response = await fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(credentials.account_sid) + '/Messages.json',
    {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(credentials.account_sid + ':' + credentials.auth_token).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }
  )
  if (!response.ok) throw new Error('Twilio SMS send failed: HTTP ' + response.status)
}
