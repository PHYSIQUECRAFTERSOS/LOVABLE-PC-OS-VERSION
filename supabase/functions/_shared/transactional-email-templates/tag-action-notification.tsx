import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Physique Crafters"

interface TagActionProps {
  clientName?: string
  emailSubject?: string
  emailBody?: string
}

const getParagraphs = (content?: string) =>
  (content || 'You have a new update from your coach.')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

const TagActionNotificationEmail = ({ clientName, emailBody }: TagActionProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{clientName ? `Hey ${clientName}` : 'Update from Physique Crafters'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {SITE_NAME}
        </Heading>
        <Hr style={divider} />
        {clientName && (
          <Text style={greeting}>Hey {clientName},</Text>
        )}
        {getParagraphs(emailBody).map((paragraph, paragraphIndex) => (
          <Text key={paragraphIndex} style={text}>
            {paragraph.split('\n').map((line, lineIndex) => (
              <React.Fragment key={`${paragraphIndex}-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </Text>
        ))}
        <Hr style={divider} />
        <Text style={footer}>
          — The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TagActionNotificationEmail,
  subject: (data: Record<string, any>) => data.emailSubject || `Update from ${SITE_NAME}`,
  displayName: 'Tag action notification',
  previewData: { clientName: 'Jane', emailSubject: 'Welcome to your new program!', emailBody: 'Your new training program is ready. Head to the app to check it out!' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#D4A017', margin: '0 0 24px', textAlign: 'center' as const }
const divider = { borderColor: '#e5e5e5', margin: '24px 0' }
const greeting = { fontSize: '16px', color: '#1a1a1a', fontWeight: '600' as const, margin: '0 0 12px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 24px' }
const footer = { fontSize: '13px', color: '#999999', margin: '24px 0 0' }
