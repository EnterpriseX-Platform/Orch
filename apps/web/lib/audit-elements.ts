/**
 * Audit Elements Configuration
 * Defines metadata for all UI elements in the system
 */

import { createAuditElement, XPathBuilder } from './audit';
import { AuditElement, AppModule, UIObjectType, AuditActionType } from '@/types/audit';

// ============================================
// API REGISTRY MODULE
// ============================================

export const ApiRegistryElements = {
  // Page: API List
  API_LIST_PAGE: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'API List',
    pageUrl: '/projects',
    objectType: 'PAGE' as UIObjectType,
    objectName: 'API List Page',
    xpaths: {
      primary: '//div[@data-page="api-list"]',
      alternatives: ['//h1[contains(text(), "APIs")]', '//div[contains(@class, "api-list")]'],
      dataTestId: 'page-api-list',
    },
    functionDescription: 'Page displaying all APIs in the system',
    allowedActions: ['NAVIGATE', 'SEARCH', 'FILTER', 'PAGINATE'] as AuditActionType[],
    requiresAuth: true,
    requiredRoles: ['admin', 'operator', 'viewer'],
  }),

  // Button: Register New API
  REGISTER_API_BUTTON: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'API List',
    pageUrl: '/projects',
    objectType: 'BUTTON' as UIObjectType,
    objectName: 'Register New API Button',
    xpaths: {
      primary: '//a[@href="/registers/new"]',
      alternatives: [
        '//button[contains(text(), "Register API")]',
        '//a[contains(text(), "Register API")]',
        '//button[.//span[contains(text(), "Register")]]',
      ],
      cssSelector: 'a[href="/registers/new"]',
      dataTestId: 'btn-register-api',
    },
    functionDescription: 'Button to open the new API registration form',
    allowedActions: ['CLICK', 'NAVIGATE'] as AuditActionType[],
    requiresAuth: true,
    requiredRoles: ['admin', 'operator'],
  }),

  // Search Box
  API_SEARCH_INPUT: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'API List',
    pageUrl: '/projects',
    objectType: 'INPUT_TEXT' as UIObjectType,
    objectName: 'API Search Input',
    fieldName: 'searchQuery',
    fieldDescription: 'Search field for APIs by name or endpoint',
    xpaths: {
      primary: '//input[@placeholder="Search APIs..."]',
      alternatives: [
        '//input[@name="search"]',
        '//input[@type="search"]',
        '//div[contains(@class, "search")]//input',
      ],
      dataTestId: 'input-api-search',
    },
    placeholder: 'Search APIs...',
    functionDescription: 'Search field for filtering the API list',
    allowedActions: ['INPUT', 'SEARCH'] as AuditActionType[],
    requiresAuth: true,
    validationRules: {
      maxLength: 100,
    },
  }),

  // Filter: Status
  STATUS_FILTER_SELECT: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'API List',
    pageUrl: '/projects',
    objectType: 'SELECT_DROPDOWN' as UIObjectType,
    objectName: 'Status Filter',
    fieldName: 'statusFilter',
    fieldDescription: 'API status filter',
    xpaths: {
      primary: '//select[@name="status"]',
      alternatives: [
        '//button[contains(text(), "All")]',
        '//div[contains(@class, "filter")]//select',
      ],
      dataTestId: 'select-status-filter',
    },
    allowedValues: ['all', 'active', 'inactive', 'draft'],
    functionDescription: 'Filter to display only APIs matching the selected status',
    allowedActions: ['SELECT', 'FILTER'] as AuditActionType[],
    requiresAuth: true,
  }),

  // API Table
  API_TABLE: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'API List',
    pageUrl: '/projects',
    objectType: 'TABLE' as UIObjectType,
    objectName: 'API List Table',
    xpaths: {
      primary: '//table',
      alternatives: [
        '//table[contains(@class, "data-table")]',
        '//div[contains(@class, "table")]//table',
      ],
      dataTestId: 'table-api-list',
    },
    functionDescription: 'Table displaying API list with status information and management actions',
    allowedActions: ['CLICK', 'SORT', 'PAGINATE'] as AuditActionType[],
    requiresAuth: true,
  }),

  // Action Menu (3 dots)
  API_ACTION_MENU: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'API List',
    pageUrl: '/projects',
    objectType: 'BUTTON' as UIObjectType,
    objectName: 'API Action Menu',
    xpaths: {
      primary: '//button[.//*[name()="svg" and contains(@class, "MoreHorizontal")]]',
      alternatives: [
        '//button[contains(@class, "action-menu")]',
        '//td//button[last()]',
      ],
      dataTestId: 'btn-action-menu',
    },
    functionDescription: 'Button to open the API management menu (edit, delete, view details)',
    allowedActions: ['CLICK'] as AuditActionType[],
    requiresAuth: true,
    requiredRoles: ['admin', 'operator'],
  }),

  // ============================================
  // Page: Register New API
  // ============================================

  API_FORM_PAGE: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'Register New API',
    pageUrl: '/projects',
    objectType: 'PAGE' as UIObjectType,
    objectName: 'API Registration Form',
    xpaths: {
      primary: '//form[@data-form="api-registration"]',
      alternatives: ['//h1[contains(text(), "Register")]', '//div[contains(@class, "api-form")]'],
      dataTestId: 'page-api-form',
    },
    functionDescription: 'Form page for registering a new API into the system',
    allowedActions: ['NAVIGATE', 'SUBMIT'] as AuditActionType[],
    requiresAuth: true,
    requiredRoles: ['admin', 'operator'],
  }),

  // Field: API Name
  API_NAME_INPUT: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'Register New API',
    pageUrl: '/projects',
    objectType: 'INPUT_TEXT' as UIObjectType,
    objectName: 'API Name Input',
    fieldName: 'name',
    fieldDescription: 'Name of the API',
    xpaths: {
      primary: '//input[@name="name"]',
      alternatives: [
        '//label[contains(text(), "API Name")]/following-sibling::input',
        '//input[@placeholder="e.g., Orders API"]',
      ],
      dataTestId: 'input-api-name',
    },
    placeholder: 'e.g., Orders API',
    functionDescription: 'Input field for the API name to register',
    allowedActions: ['INPUT'] as AuditActionType[],
    requiresAuth: true,
    validationRules: {
      required: true,
      minLength: 3,
      maxLength: 100,
    },
  }),

  // Field: Endpoint Path
  API_ENDPOINT_INPUT: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'Register New API',
    pageUrl: '/projects',
    objectType: 'INPUT_TEXT' as UIObjectType,
    objectName: 'Endpoint Path Input',
    fieldName: 'endpoint',
    fieldDescription: 'Path of the API endpoint',
    xpaths: {
      primary: '//input[@name="endpoint"]',
      alternatives: [
        '//input[@placeholder="orders"]',
        '//label[contains(text(), "Endpoint")]/following-sibling::*//input',
      ],
      dataTestId: 'input-api-endpoint',
    },
    placeholder: 'orders',
    functionDescription: 'Endpoint path appended after /api/v1/',
    allowedActions: ['INPUT'] as AuditActionType[],
    requiresAuth: true,
    validationRules: {
      required: true,
      pattern: '^[a-z0-9-]+$',
      minLength: 1,
      maxLength: 100,
    },
  }),

  // Field: HTTP Method
  API_METHOD_SELECT: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'Register New API',
    pageUrl: '/projects',
    objectType: 'SELECT_DROPDOWN' as UIObjectType,
    objectName: 'HTTP Method Select',
    fieldName: 'method',
    fieldDescription: 'HTTP method supported by the API',
    xpaths: {
      primary: '//select[@name="method"]',
      alternatives: ['//label[contains(text(), "Method")]/following-sibling::select'],
      dataTestId: 'select-api-method',
    },
    allowedValues: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    defaultValue: 'GET',
    functionDescription: 'Select the HTTP method supported by the API',
    allowedActions: ['SELECT'] as AuditActionType[],
    requiresAuth: true,
  }),

  // Field: Description
  API_DESCRIPTION_TEXTAREA: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'Register New API',
    pageUrl: '/projects',
    objectType: 'TEXTAREA' as UIObjectType,
    objectName: 'API Description Textarea',
    fieldName: 'description',
    fieldDescription: 'API description',
    xpaths: {
      primary: '//textarea[@name="description"]',
      alternatives: [
        '//textarea[@placeholder="Describe what this API does..."]',
        '//label[contains(text(), "Description")]/following-sibling::textarea',
      ],
      dataTestId: 'textarea-api-description',
    },
    placeholder: 'Describe what this API does...',
    functionDescription: 'Detailed description of the API functionality',
    allowedActions: ['INPUT'] as AuditActionType[],
    requiresAuth: true,
    validationRules: {
      maxLength: 500,
    },
  }),

  // Button: Submit
  API_SUBMIT_BUTTON: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'Register New API',
    pageUrl: '/projects',
    objectType: 'BUTTON' as UIObjectType,
    objectName: 'Register API Button',
    xpaths: {
      primary: '//button[@type="submit"]',
      alternatives: [
        '//button[contains(text(), "Register API")]',
        '//button[.//span[contains(text(), "Register")]]',
      ],
      dataTestId: 'btn-submit-api',
    },
    functionDescription: 'Button to submit the API registration form',
    allowedActions: ['CLICK', 'SUBMIT'] as AuditActionType[],
    requiresAuth: true,
    requiredRoles: ['admin', 'operator'],
  }),

  // Button: Cancel
  API_CANCEL_BUTTON: createAuditElement({
    module: 'API_REGISTRY' as AppModule,
    menuName: 'APIs',
    pageName: 'Register New API',
    pageUrl: '/projects',
    objectType: 'BUTTON' as UIObjectType,
    objectName: 'Cancel Button',
    xpaths: {
      primary: '//a[@href="/registers"][contains(text(), "Cancel")]',
      alternatives: ['//button[contains(text(), "Cancel")]'],
      dataTestId: 'btn-cancel',
    },
    functionDescription: 'Button to cancel and return to the list page',
    allowedActions: ['CLICK', 'NAVIGATE'] as AuditActionType[],
    requiresAuth: true,
  }),
};

// ============================================
// DATA CATALOG MODULE
// ============================================

export const DataCatalogElements = {
  // Page: Dataset List
  DATASET_LIST_PAGE: createAuditElement({
    module: 'DATA_CATALOG' as AppModule,
    menuName: 'Data Catalog',
    pageName: 'Dataset List',
    pageUrl: '/datasets',
    objectType: 'PAGE' as UIObjectType,
    objectName: 'Dataset List Page',
    xpaths: {
      primary: '//div[@data-page="dataset-list"]',
      alternatives: ['//h1[contains(text(), "Datasets")]'],
      dataTestId: 'page-dataset-list',
    },
    functionDescription: 'Page displaying all datasets',
    allowedActions: ['NAVIGATE', 'SEARCH', 'FILTER'] as AuditActionType[],
    requiresAuth: true,
  }),

  // Button: Add Dataset
  ADD_DATASET_BUTTON: createAuditElement({
    module: 'DATA_CATALOG' as AppModule,
    menuName: 'Data Catalog',
    pageName: 'Dataset List',
    pageUrl: '/datasets',
    objectType: 'BUTTON' as UIObjectType,
    objectName: 'Add Dataset Button',
    xpaths: {
      primary: '//a[@href="/datasets/new"]',
      alternatives: ['//button[contains(text(), "Add Dataset")]'],
      dataTestId: 'btn-add-dataset',
    },
    functionDescription: 'Button to add a new dataset',
    allowedActions: ['CLICK', 'NAVIGATE'] as AuditActionType[],
    requiresAuth: true,
  }),

  // Field: Dataset Name
  DATASET_NAME_INPUT: createAuditElement({
    module: 'DATA_CATALOG' as AppModule,
    menuName: 'Data Catalog',
    pageName: 'Add Dataset',
    pageUrl: '/datasets/new',
    objectType: 'INPUT_TEXT' as UIObjectType,
    objectName: 'Dataset Name Input',
    fieldName: 'name',
    fieldDescription: 'Dataset name',
    xpaths: {
      primary: '//input[@name="name"]',
      alternatives: ['//label[contains(text(), "Name")]/following-sibling::input'],
      dataTestId: 'input-dataset-name',
    },
    functionDescription: 'Input field for the dataset name',
    allowedActions: ['INPUT'] as AuditActionType[],
    requiresAuth: true,
    validationRules: {
      required: true,
      maxLength: 100,
    },
  }),
};

// ============================================
// FLOW MANAGER MODULE
// ============================================

export const FlowManagerElements = {
  // Page: Flow List
  FLOW_LIST_PAGE: createAuditElement({
    module: 'FLOW_MANAGER' as AppModule,
    menuName: 'Flow Manager',
    pageName: 'Flow List',
    pageUrl: '/flows',
    objectType: 'PAGE' as UIObjectType,
    objectName: 'Flow List Page',
    xpaths: {
      primary: '//div[@data-page="flow-list"]',
      alternatives: ['//h1[contains(text(), "Flows")]'],
      dataTestId: 'page-flow-list',
    },
    functionDescription: 'Page displaying integration flows',
    allowedActions: ['NAVIGATE'] as AuditActionType[],
    requiresAuth: true,
  }),

  // Button: Create Flow
  CREATE_FLOW_BUTTON: createAuditElement({
    module: 'FLOW_MANAGER' as AppModule,
    menuName: 'Flow Manager',
    pageName: 'Flow List',
    pageUrl: '/flows',
    objectType: 'BUTTON' as UIObjectType,
    objectName: 'Create Flow Button',
    xpaths: {
      primary: '//a[@href="/flows/builder"]',
      alternatives: ['//button[contains(text(), "Create Flow")]'],
      dataTestId: 'btn-create-flow',
    },
    functionDescription: 'Button to create a new flow',
    allowedActions: ['CLICK', 'NAVIGATE'] as AuditActionType[],
    requiresAuth: true,
  }),
};

// ============================================
// DASHBOARD MODULE
// ============================================

export const DashboardElements = {
  DASHBOARD_PAGE: createAuditElement({
    module: 'DASHBOARD' as AppModule,
    menuName: 'Overview',
    pageName: 'Dashboard',
    pageUrl: '/dashboard',
    objectType: 'PAGE' as UIObjectType,
    objectName: 'Dashboard Page',
    xpaths: {
      primary: '//div[@data-page="dashboard"]',
      alternatives: ['//h1[contains(text(), "Welcome")]'],
      dataTestId: 'page-dashboard',
    },
    functionDescription: 'Dashboard page showing system overview',
    allowedActions: ['NAVIGATE'] as AuditActionType[],
    requiresAuth: true,
  }),

  // Stat Cards
  API_COUNT_CARD: createAuditElement({
    module: 'DASHBOARD' as AppModule,
    menuName: 'Overview',
    pageName: 'Dashboard',
    pageUrl: '/dashboard',
    objectType: 'CARD' as UIObjectType,
    objectName: 'API Count Card',
    xpaths: {
      primary: '//a[contains(@href, "/registers")]//div[contains(@class, "stat-card")]',
      alternatives: ['//div[contains(text(), "Total APIs")]'],
      dataTestId: 'card-api-count',
    },
    functionDescription: 'Card displaying the total API count',
    allowedActions: ['CLICK', 'NAVIGATE'] as AuditActionType[],
    requiresAuth: true,
  }),
};

// ============================================
// SYSTEM LOGS MODULE
// ============================================

export const SystemLogsElements = {
  LOGS_PAGE: createAuditElement({
    module: 'SYSTEM_LOGS' as AppModule,
    menuName: 'System Logs',
    pageName: 'Logs',
    pageUrl: '/logs',
    objectType: 'PAGE' as UIObjectType,
    objectName: 'System Logs Page',
    xpaths: {
      primary: '//div[@data-page="logs"]',
      alternatives: ['//h1[contains(text(), "Logs")]'],
      dataTestId: 'page-logs',
    },
    functionDescription: 'Page displaying system logs',
    allowedActions: ['NAVIGATE', 'SEARCH', 'FILTER'] as AuditActionType[],
    requiresAuth: true,
    requiredRoles: ['admin'],
  }),

  EXPORT_LOGS_BUTTON: createAuditElement({
    module: 'SYSTEM_LOGS' as AppModule,
    menuName: 'System Logs',
    pageName: 'Logs',
    pageUrl: '/logs',
    objectType: 'BUTTON' as UIObjectType,
    objectName: 'Export Logs Button',
    xpaths: {
      primary: '//button[contains(text(), "Export")]',
      alternatives: ['//button[.//*[name()="svg" and contains(@class, "Download")]]'],
      dataTestId: 'btn-export-logs',
    },
    functionDescription: 'Button to export logs to a file',
    allowedActions: ['CLICK', 'EXPORT'] as AuditActionType[],
    requiresAuth: true,
    requiredRoles: ['admin'],
  }),
};

// ============================================
// AUDIT TRAIL MODULE
// ============================================

export const AuditTrailElements = {
  AUDIT_PAGE: createAuditElement({
    module: 'AUDIT_TRAIL' as AppModule,
    menuName: 'Audit Trail',
    pageName: 'Audit Logs',
    pageUrl: '/audit',
    objectType: 'PAGE' as UIObjectType,
    objectName: 'Audit Trail Page',
    xpaths: {
      primary: '//div[@data-page="audit"]',
      alternatives: ['//h1[contains(text(), "Audit")]'],
      dataTestId: 'page-audit',
    },
    functionDescription: 'Page displaying audit trail logs',
    allowedActions: ['NAVIGATE', 'SEARCH', 'FILTER', 'EXPORT'] as AuditActionType[],
    requiresAuth: true,
    requiredRoles: ['admin'],
  }),
};

// ============================================
// Export all elements
// ============================================

export const AllAuditElements = {
  ...ApiRegistryElements,
  ...DataCatalogElements,
  ...FlowManagerElements,
  ...DashboardElements,
  ...SystemLogsElements,
  ...AuditTrailElements,
};

/**
 * Find an element by elementId
 */
export function findAuditElement(elementId: string): AuditElement | undefined {
  return Object.values(AllAuditElements).find(el => el.elementId === elementId);
}

/**
 * Find elements by module
 */
export function findElementsByModule(module: AppModule): AuditElement[] {
  return Object.values(AllAuditElements).filter(el => el.module === module);
}

/**
 * Find elements by page
 */
export function findElementsByPage(pageName: string): AuditElement[] {
  return Object.values(AllAuditElements).filter(el => el.pageName === pageName);
}

/**
 * Find an element by XPath
 */
export function findElementByXPath(xpath: string): AuditElement | undefined {
  return Object.values(AllAuditElements).find(el => 
    el.xpaths.primary === xpath || 
    el.xpaths.alternatives.includes(xpath)
  );
}
