/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as tagActionNotification } from './tag-action-notification.tsx'
import { template as passwordChangedConfirmation } from './password-changed-confirmation.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'tag-action-notification': tagActionNotification,
  'password-changed-confirmation': passwordChangedConfirmation,
}
