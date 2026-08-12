/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your Physique Crafters password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>
          PHYSIQUE <span style={brandGold}>CRAFTERS</span>
        </Text>
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset your password for {siteName}. Tap the
          button below to choose a new one. This link works once and expires in
          one hour.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Reset Password
        </Button>
        <Text style={small}>
          Button not working? Copy and paste this link into your browser:
        </Text>
        <Link href={confirmationUrl} style={link}>
          {confirmationUrl}
        </Link>
        <Hr style={hr} />
        <Text style={footer}>
          Always use the most recent reset email you received — older links stop
          working once a newer one is requested. If you didn't request this, you
          can safely ignore this email; your password will not change.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const brand = {
  fontSize: '15px',
  letterSpacing: '2px',
  fontWeight: 'bold' as const,
  color: '#0a0a0a',
  margin: '0 0 24px',
}
const brandGold = { color: '#D4A017' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0a0a0a',
  margin: '0 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const button = {
  backgroundColor: '#0a0a0a',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '13px 22px',
  textDecoration: 'none',
}
const small = { fontSize: '12px', color: '#55575d', margin: '28px 0 6px' }
const link = { fontSize: '12px', color: '#8a6a10', wordBreak: 'break-all' as const }
const hr = { borderColor: '#e6e6e6', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.6' }
