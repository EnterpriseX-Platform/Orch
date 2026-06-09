/**
 * Audit Trail Usage Example
 * Example usage of the Audit Trail system in React Components
 */

'use client';

import { useAuditTrack, AuditLogger, defaultAuditConfig } from '@/lib/audit';
import { ApiRegistryElements } from '@/lib/audit-elements';
import { AuditEvent } from '@/types/audit';

// ============================================
// Example 1: Usage with Form (API Registration)
// ============================================

export function ApiRegistrationForm() {
  const auditLogger = new AuditLogger(defaultAuditConfig);

  const nameTracker = useAuditTrack(ApiRegistryElements.API_NAME_INPUT, auditLogger);
  const endpointTracker = useAuditTrack(ApiRegistryElements.API_ENDPOINT_INPUT, auditLogger);
  const methodTracker = useAuditTrack(ApiRegistryElements.API_METHOD_SELECT, auditLogger);
  const descTracker = useAuditTrack(ApiRegistryElements.API_DESCRIPTION_TEXTAREA, auditLogger);
  const submitTracker = useAuditTrack(ApiRegistryElements.API_SUBMIT_BUTTON, auditLogger);

  const currentUser: AuditEvent['user'] = {
    id: 'user-123',
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    ipAddress: '192.168.1.100',
    userAgent: navigator.userAgent,
  };

  const handleNameChange = async (value: string) => {
    await nameTracker.trackInput(currentUser, value);
  };

  const handleSubmit = async (formData: any) => {
    try {
      await submitTracker.trackSubmit(currentUser, null, formData, 'SUCCESS');
      await fetch('/api/registers', { method: 'POST', body: JSON.stringify(formData) });
    } catch (error) {
      await submitTracker.trackSubmit(
        currentUser, null, formData, 'ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      handleSubmit(Object.fromEntries(formData));
    }}>
      <div>
        <label>{ApiRegistryElements.API_NAME_INPUT.fieldDescription}</label>
        <input
          name="name"
          data-testid={ApiRegistryElements.API_NAME_INPUT.xpaths.dataTestId}
          onChange={(e) => handleNameChange(e.target.value)}
        />
        <p>Required • Max {ApiRegistryElements.API_NAME_INPUT.validationRules?.maxLength} chars</p>
      </div>

      <button
        type="submit"
        data-testid={ApiRegistryElements.API_SUBMIT_BUTTON.xpaths.dataTestId}
      >
        {ApiRegistryElements.API_SUBMIT_BUTTON.objectName}
      </button>
    </form>
  );
}

// ============================================
// Example 2: XPath Examples
// ============================================

export function XPathExamples() {
  return {
    // Button XPath patterns
    submitButton: [
      '//button[@data-testid="btn-submit"]',           // Primary
      '//button[contains(text(), "Submit")]',          // By text
      '//button[@type="submit"]',                      // By type
      '//form//button[last()]',                        // Last button in form
    ],

    // Input XPath patterns
    emailInput: [
      '//input[@name="email"]',                        // By name
      '//input[@type="email"]',                        // By type
      '//input[@placeholder="Email"]',                 // By placeholder
      '//label[contains(text(), "Email")]/following-sibling::input', // By label
    ],

    // Link XPath patterns
    dashboardLink: [
      '//a[@href="/dashboard"]',                       // By href
      '//a[contains(text(), "Dashboard")]',            // By text
      '//nav//a[.//span[contains(text(), "Dashboard")]]', // By nested text
    ],

    // Table XPath patterns
    apiTable: [
      '//table[@data-testid="api-table"]',             // By test id
      '//table[contains(@class, "data-table")]',       // By class
      '//div[contains(@class, "table")]//table',       // Parent + child
    ],

    // Select XPath patterns
    statusSelect: [
      '//select[@name="status"]',                      // By name
      '//select[@id="status-filter"]',                 // By id
      '//label[contains(text(), "Status")]/following-sibling::select', // By label
    ],
  };
}
