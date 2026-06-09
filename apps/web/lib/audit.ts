/**
 * Audit Trail Utilities
 * Helper functions for managing Audit Trail
 */

import { 
  AuditElement, 
  AuditEvent, 
  AuditActionType, 
  AppModule, 
  UIObjectType,
  AuditConfig 
} from '@/types/audit';

/**
 * Create Audit Element Metadata
 */
export function createAuditElement(
  params: Omit<AuditElement, 'elementId' | 'metadata'>
): AuditElement {
  return {
    ...params,
    elementId: generateElementId(params),
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: 'system',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      version: '1.0.0',
    },
  };
}

/**
 * Generate unique element ID from properties
 */
function generateElementId(element: Omit<AuditElement, 'elementId' | 'metadata'>): string {
  const parts = [
    element.module,
    element.pageName.replace(/\s+/g, '_').toUpperCase(),
    element.objectType,
    element.objectName.replace(/\s+/g, '_').toUpperCase(),
  ];
  return parts.join('_');
}

/**
 * Build XPaths for various elements
 */
export const XPathBuilder = {
  // For Button
  button: (props: { text?: string; id?: string; dataTestId?: string }): string[] => {
    const xpaths: string[] = [];
    if (props.dataTestId) {
      xpaths.push(`//button[@data-testid="${props.dataTestId}"]`);
    }
    if (props.id) {
      xpaths.push(`//button[@id="${props.id}"]`);
    }
    if (props.text) {
      xpaths.push(`//button[contains(text(), "${props.text}")]`);
      xpaths.push(`//button[.//span[contains(text(), "${props.text}")]]`);
    }
    xpaths.push('//button');
    return xpaths;
  },

  // For Input
  input: (props: { 
    name?: string; 
    id?: string; 
    placeholder?: string;
    label?: string;
    type?: string;
  }): string[] => {
    const xpaths: string[] = [];
    if (props.id) {
      xpaths.push(`//input[@id="${props.id}"]`);
    }
    if (props.name) {
      xpaths.push(`//input[@name="${props.name}"]`);
    }
    if (props.placeholder) {
      xpaths.push(`//input[@placeholder="${props.placeholder}"]`);
    }
    if (props.label) {
      xpaths.push(`//label[contains(text(), "${props.label}")]/following-sibling::input`);
    }
    if (props.type) {
      xpaths.push(`//input[@type="${props.type}"]`);
    }
    return xpaths;
  },

  // For Link
  link: (props: { text?: string; href?: string; dataTestId?: string }): string[] => {
    const xpaths: string[] = [];
    if (props.dataTestId) {
      xpaths.push(`//a[@data-testid="${props.dataTestId}"]`);
    }
    if (props.href) {
      xpaths.push(`//a[@href="${props.href}"]`);
      xpaths.push(`//a[contains(@href, "${props.href}")]`);
    }
    if (props.text) {
      xpaths.push(`//a[contains(text(), "${props.text}")]`);
    }
    return xpaths;
  },

  // For Table
  table: (props: { id?: string; className?: string; dataTestId?: string }): string[] => {
    const xpaths: string[] = [];
    if (props.dataTestId) {
      xpaths.push(`//table[@data-testid="${props.dataTestId}"]`);
    }
    if (props.id) {
      xpaths.push(`//table[@id="${props.id}"]`);
    }
    if (props.className) {
      xpaths.push(`//table[contains(@class, "${props.className}")]`);
    }
    return xpaths;
  },

  // For Select/Dropdown
  select: (props: { name?: string; id?: string; label?: string }): string[] => {
    const xpaths: string[] = [];
    if (props.id) {
      xpaths.push(`//select[@id="${props.id}"]`);
    }
    if (props.name) {
      xpaths.push(`//select[@name="${props.name}"]`);
    }
    if (props.label) {
      xpaths.push(`//label[contains(text(), "${props.label}")]/following-sibling::select`);
    }
    return xpaths;
  },

  // For Menu
  menuItem: (props: { text: string; parentMenu?: string }): string[] => {
    const xpaths: string[] = [];
    if (props.parentMenu) {
      xpaths.push(`//nav[contains(@class, "${props.parentMenu}")]//a[contains(text(), "${props.text}")]`);
    }
    xpaths.push(`//a[contains(text(), "${props.text}")]`);
    xpaths.push(`//nav//a[.//span[contains(text(), "${props.text}")]]`);
    return xpaths;
  },
};

/**
 * Audit Trail Logger
 * For recording audit events
 */
export class AuditLogger {
  private config: AuditConfig;

  constructor(config: AuditConfig) {
    this.config = config;
  }

  /**
   * Record an audit event
   */
  async log(event: Omit<AuditEvent, 'eventId' | 'timestamp'>): Promise<void> {
    // Check if this module should be tracked
    if (!this.isModuleEnabled(event.element.module)) {
      return;
    }

    // Check if this action should be tracked
    if (!this.isActionEnabled(event.action)) {
      return;
    }

    // Mask sensitive data
    const sanitizedEvent = this.sanitizeEvent(event);

    // Create full audit event
    const fullEvent: AuditEvent = {
      ...sanitizedEvent,
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
    };

    // Send to audit API
    await this.sendToAuditAPI(fullEvent);
  }

  private isModuleEnabled(module: AppModule): boolean {
    return this.config.enabledModules.includes(module);
  }

  private isActionEnabled(action: AuditActionType): boolean {
    return this.config.enabledActions.includes(action);
  }

  private sanitizeEvent(event: Omit<AuditEvent, 'eventId' | 'timestamp'>): Omit<AuditEvent, 'eventId' | 'timestamp'> {
    const sanitized = { ...event };
    
    // Mask sensitive fields
    if (sanitized.inputValue && this.config.sensitiveFields.includes(sanitized.element.fieldName || '')) {
      sanitized.inputValue = '***MASKED***';
    }

    if (sanitized.newValue && typeof sanitized.newValue === 'object') {
      sanitized.newValue = this.maskSensitiveObject(sanitized.newValue);
    }

    return sanitized;
  }

  private maskSensitiveObject(obj: any): any {
    const masked = { ...obj };
    for (const field of this.config.sensitiveFields) {
      if (masked[field]) {
        masked[field] = '***MASKED***';
      }
    }
    return masked;
  }

  private generateEventId(): string {
    return `AUDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async sendToAuditAPI(event: AuditEvent): Promise<void> {
    try {
      await fetch('/orch/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error('Failed to send audit log:', error);
    }
  }
}

/**
 * React Hook for tracking user interactions
 */
export function useAuditTrack(
  element: AuditElement,
  logger: AuditLogger
) {
  return {
    // Track click event
    trackClick: async (user: AuditEvent['user'], result: AuditEvent['result'] = 'SUCCESS') => {
      await logger.log({
        user,
        element,
        action: 'CLICK',
        result,
        currentUrl: window.location.href,
        browser: getBrowserInfo(),
        sessionId: getSessionId(),
      });
    },

    // Track input event
    trackInput: async (user: AuditEvent['user'], value: string, result: AuditEvent['result'] = 'SUCCESS') => {
      await logger.log({
        user,
        element,
        action: 'INPUT',
        inputValue: value,
        result,
        currentUrl: window.location.href,
        browser: getBrowserInfo(),
        sessionId: getSessionId(),
      });
    },

    // Track form submit
    trackSubmit: async (
      user: AuditEvent['user'], 
      oldValue: any, 
      newValue: any, 
      result: AuditEvent['result'] = 'SUCCESS',
      errorMessage?: string
    ) => {
      await logger.log({
        user,
        element,
        action: 'SUBMIT',
        oldValue,
        newValue,
        result,
        errorMessage,
        currentUrl: window.location.href,
        browser: getBrowserInfo(),
        sessionId: getSessionId(),
      });
    },
  };
}

/**
 * Helper functions
 */
function getBrowserInfo(): AuditEvent['browser'] {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = 'Unknown';

  if (ua.includes('Chrome')) {
    name = 'Chrome';
    version = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
  } else if (ua.includes('Firefox')) {
    name = 'Firefox';
    version = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
  } else if (ua.includes('Safari')) {
    name = 'Safari';
    version = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
  }

  return {
    name,
    version,
    os: navigator.platform,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
  };
}

function getSessionId(): string {
  let sessionId = sessionStorage.getItem('audit_session_id');
  if (!sessionId) {
    sessionId = `SESSION_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('audit_session_id', sessionId);
  }
  return sessionId;
}

/**
 * Default Audit Configuration
 */
export const defaultAuditConfig: AuditConfig = {
  enabledModules: [
    'DASHBOARD',
    'API_REGISTRY',
    'DATA_CATALOG',
    'FLOW_MANAGER',
    'SYSTEM_LOGS',
    'AUDIT_TRAIL',
    'USER_MANAGEMENT',
    'SETTINGS',
  ],
  enabledActions: [
    'CLICK',
    'INPUT',
    'SELECT',
    'SUBMIT',
    'DELETE',
    'UPDATE',
    'CREATE',
    'NAVIGATE',
    'SEARCH',
    'FILTER',
    'LOGIN',
    'LOGOUT',
    'ERROR',
  ],
  excludedUsers: ['system', 'admin_bot'],
  excludedUrls: ['/health', '/api/health'],
  retentionDays: 365,
  sensitiveFields: [
    'password',
    'token',
    'apiKey',
    'secret',
    'creditCard',
    'ssn',
    'personalId',
  ],
  capturePayloads: true,
  captureScreenshots: false,
};
