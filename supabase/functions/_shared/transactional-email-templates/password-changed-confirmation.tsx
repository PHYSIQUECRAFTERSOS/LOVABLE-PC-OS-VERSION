import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Physique Crafters"

const PasswordChangedEmail = () => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} password was changed</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Password Changed</Heading>
        <Text style={text}>
          Your password for {SITE_NAME} was just changed successfully.
        </Text>
        <Text style={text}>
          If you did not make this change, please contact our support team immediately
          to secure your account.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          — The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PasswordChangedEmail,
  subject: `Your ${SITE_NAME} password was changed`,
  displayName: 'Password changed confirmation',
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '30px 25px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#D4A017', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 16px' }
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
