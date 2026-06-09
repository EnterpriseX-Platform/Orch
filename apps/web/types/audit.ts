/**
 * Audit Trail Metadata Types
 * For storing UI element data for Audit Trail
 */

// Trackable action types
export type AuditActionType = 
  | 'CLICK'           // Click button/link
  | 'INPUT'           // Type data
  | 'SELECT'          // Select from dropdown
  | 'CHECK'           // Check checkbox
  | 'NAVIGATE'        // Change page
  | 'SUBMIT'          // Submit form
  | 'DELETE'          // Delete data
  | 'UPDATE'          // Update data
  | 'CREATE'          // Create new
  | 'EXPORT'          // Download/export
  | 'IMPORT'          // Import data
  | 'SEARCH'          // Search
  | 'FILTER'          // Filter data
  | 'SORT'            // Sort
  | 'PAGINATE'        // Change page
  | 'LOGIN'           // Log in
  | 'LOGOUT'          // Log out
  | 'ERROR'           // Error occurred
  | 'API_CALL'        // Call API
  | 'FILE_UPLOAD'     // Upload file
  | 'FILE_DOWNLOAD';  // Download file

// System modules
export type AppModule = 
  | 'DASHBOARD'
  | 'API_REGISTRY'
  | 'DATA_CATALOG'
  | 'FLOW_MANAGER'
  | 'SYSTEM_LOGS'
  | 'AUDIT_TRAIL'
  | 'USER_MANAGEMENT'
  | 'SETTINGS';

// UI Object types
export type UIObjectType =
  | 'BUTTON'
  | 'LINK'
  | 'INPUT_TEXT'
  | 'INPUT_NUMBER'
  | 'INPUT_EMAIL'
  | 'INPUT_PASSWORD'
  | 'TEXTAREA'
  | 'SELECT_DROPDOWN'
  | 'SELECT_RADIO'
  | 'CHECKBOX'
  | 'DATE_PICKER'
  | 'FILE_INPUT'
  | 'TABLE'
  | 'TABLE_ROW'
  | 'TABLE_CELL'
  | 'MODAL'
  | 'DIALOG'
  | 'TAB'
  | 'ACCORDION'
  | 'MENU_ITEM'
  | 'BREADCRUMB'
  | 'PAGINATION'
  | 'SEARCH_BOX'
  | 'FILTER_CHIP'
  | 'CARD'
  | 'CHART'
  | 'GRAPH'
  | 'ICON'
  | 'IMAGE'
  | 'LABEL'
  | 'BADGE';

/**
 * Audit Element Metadata
 * Metadata for each UI element
 */
export interface AuditElement {
  // Unique element ID
  elementId: string;

  // Module this element belongs to
  module: AppModule;

  // Menu/page name
  menuName: string;

  // Page name
  pageName: string;

  // Page URL
  pageUrl: string;

  // Object type
  objectType: UIObjectType;

  // Object name (for display in audit)
  objectName: string;

  // Multiple XPaths for locating the element
  // Supports multiple formats for flexibility
  xpaths: {
    primary: string;      // Primary XPath
    alternatives: string[]; // Fallback XPaths (when primary is unavailable)
    cssSelector?: string;  // CSS selector (optional)
    dataTestId?: string;   // data-testid (optional)
  };

  // Function description
  functionDescription: string;

  // Field name (for input fields)
  fieldName?: string;

  // Field description (label)
  fieldDescription?: string;

  // Placeholder (for input)
  placeholder?: string;

  // Default value
  defaultValue?: string;

  // Allowed values (for select, radio)
  allowedValues?: string[];

  // Validation rules
  validationRules?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  
  // Actions that can be performed on this element
  allowedActions: AuditActionType[];

  // Access permissions (role-based)
  requiredRoles?: string[];

  // Whether authentication is required
  requiresAuth: boolean;

  // Additional information
  metadata?: {
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    updatedBy: string;
    version: string;
  };
}

/**
 * Audit Event Log
 * Data recorded when an action occurs
 */
export interface AuditEvent {
  // Event ID
  eventId: string;

  // Event timestamp
  timestamp: string;

  // User who performed the action
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    ipAddress: string;
    userAgent: string;
  };
  
  // Element that was interacted with
  element: AuditElement;

  // Action that occurred
  action: AuditActionType;

  // Value before change (for UPDATE)
  oldValue?: any;

  // Value after change
  newValue?: any;

  // Entered/selected value (for INPUT, SELECT)
  inputValue?: string;

  // Action result
  result: 'SUCCESS' | 'FAILED' | 'ERROR' | 'CANCELLED';

  // Error message (if any)
  errorMessage?: string;

  // HTTP status code (for API calls)
  httpStatusCode?: number;
  
  // Response time (ms)
  responseTime?: number;
  
  // URL where the event occurred
  currentUrl: string;
  
  // Referrer URL
  referrerUrl?: string;
  
  // Browser info
  browser: {
    name: string;
    version: string;
    os: string;
    screenResolution: string;
  };
  
  // Session ID
  sessionId: string;
  
  // Additional notes
  notes?: string;
}

/**
 * Audit Configuration
 * Configuration for the Audit system
 */
export interface AuditConfig {
  // Modules to track
  enabledModules: AppModule[];

  // Action types to track
  enabledActions: AuditActionType[];

  // Users to exclude from tracking (e.g. system or admin accounts)
  excludedUsers: string[];

  // URLs to exclude from tracking
  excludedUrls: string[];

  // Log retention period (days)
  retentionDays: number;

  // Sensitive fields configuration (values will be masked)
  sensitiveFields: string[];

  // Whether to capture request/response body
  capturePayloads: boolean;

  // Whether to capture screenshots
  captureScreenshots: boolean;
}
