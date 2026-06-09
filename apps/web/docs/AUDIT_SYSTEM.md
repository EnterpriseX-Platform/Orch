# Audit Trail System Documentation

The Audit Trail system for Orch.

## Overview

This system is designed to track and record every user action in the UI. It can:

- Define metadata for every UI element
- Track actions in real time
- Capture the user, the timestamp, and before/after values
- Support multiple XPath patterns for element identification

## File Structure

```
├── types/audit.ts           # Type definitions
├── lib/audit.ts             # Core utilities & logger
├── lib/audit-elements.ts    # UI element metadata
└── docs/AUDIT_SYSTEM.md     # This file
```

## Quick Start

### 1. Define Metadata for a UI Element

```typescript
import { createAuditElement } from '@/lib/audit';

const submitButton = createAuditElement({
  module: 'API_REGISTRY',
  menuName: 'APIs',
  pageName: 'Register New API',
  pageUrl: '/registers/new',
  objectType: 'BUTTON',
  objectName: 'Register API Button',
  xpaths: {
    primary: '//button[@data-testid="btn-submit"]',
    alternatives: [
      '//button[contains(text(), "Submit")]',
      '//button[@type="submit"]',
    ],
    dataTestId: 'btn-submit',
  },
  functionDescription: 'Submit button for the API registration form',
  allowedActions: ['CLICK', 'SUBMIT'],
  requiresAuth: true,
});
```

### 2. Use It in a React Component

```typescript
import { useAuditTrack, AuditLogger, defaultAuditConfig } from '@/lib/audit';
import { ApiRegistryElements } from '@/lib/audit-elements';

function MyComponent() {
  const auditLogger = new AuditLogger(defaultAuditConfig);
  const tracker = useAuditTrack(ApiRegistryElements.API_SUBMIT_BUTTON, auditLogger);

  const handleClick = async () => {
    await tracker.trackClick(currentUser, 'SUCCESS');
  };

  return (
    <button data-testid="btn-submit" onClick={handleClick}>
      Submit
    </button>
  );
}
```

## XPath Patterns

### Primary (data-testid)
```xpath
//button[@data-testid="btn-submit"]
//input[@data-testid="input-email"]
```

### Alternatives
```xpath
//button[contains(text(), "Submit")]
//input[@name="email"]
//label[contains(text(), "Email")]/following-sibling::input
```

## Modules & Elements

| Module | Elements |
|--------|----------|
| API_REGISTRY | API_LIST_PAGE, REGISTER_API_BUTTON, API_SEARCH_INPUT, API_TABLE, API_SUBMIT_BUTTON, ... |
| DATA_CATALOG | DATASET_LIST_PAGE, ADD_DATASET_BUTTON, DATASET_NAME_INPUT, ... |
| FLOW_MANAGER | FLOW_LIST_PAGE, CREATE_FLOW_BUTTON, ... |

## Action Types

- `CLICK`, `INPUT`, `SELECT`, `SUBMIT`
- `SEARCH`, `FILTER`, `NAVIGATE`
- `CREATE`, `UPDATE`, `DELETE`, `EXPORT`
- `LOGIN`, `LOGOUT`, `ERROR`

## Example Audit Log

```json
{
  "eventId": "AUDIT_1708876800000_abc123",
  "timestamp": "2024-02-25T10:00:00.000Z",
  "user": {
    "id": "user-001",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "ipAddress": "192.168.1.100"
  },
  "element": {
    "elementId": "API_REGISTRY_API_FORM_API_SUBMIT_BUTTON",
    "module": "API_REGISTRY",
    "objectName": "Register API Button"
  },
  "action": "SUBMIT",
  "newValue": {
    "name": "Orders API",
    "endpoint": "/api/v1/orders"
  },
  "result": "SUCCESS"
}
```
