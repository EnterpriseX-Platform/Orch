// ==================== USER & AUTH ====================
export interface User {
  id: string
  username: string
  email: string
  firstName?: string
  lastName?: string
  department?: string
  roles: string[]
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
}

// ==================== DATA CATALOG ====================
export type DataCategory = 
  | 'transactional' 
  | 'reserved' 
  | 'transfer' 
  | 'performance' 
  | 'expenditure' 
  | 'procurement' 
  | 'master_data' 
  | 'other'

export type DataStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED'

export interface DataCatalog {
  id: string
  name: string
  nameEn?: string
  description?: string
  source: string
  category: DataCategory
  subCategory?: string
  schema?: Record<string, any>
  sampleData?: Record<string, any>
  updateFrequency?: string
  dataOwner?: string
  contactInfo?: string
  status: DataStatus
  isPublic: boolean
  createdBy: string
  creator?: User
  apis?: ApiRegistration[]
  createdAt: string
  updatedAt: string
}

export interface CreateDatasetInput {
  name: string
  nameEn?: string
  description?: string
  source: string
  category: DataCategory
  subCategory?: string
  schema?: Record<string, any>
  sampleData?: Record<string, any>
  updateFrequency?: string
  dataOwner?: string
  contactInfo?: string
  isPublic?: boolean
}

// ==================== PROJECT ====================
export interface Project {
  id: string
  name: string
  nameEn?: string
  slug: string
  description?: string
  image?: string
  themeColor?: string
  projectGroup?: string
  agency?: string
  tags?: string[]
  baseUrl: string
  proxyTargetUrl?: string | null
  authType?: string
  apiKey?: string
  apiKeyHeader?: string
  openApiSpec?: Record<string, any>
  openApiSpecUpdatedAt?: string
  owner?: string
  contactEmail?: string
  status: string
  apis?: ApiRegistration[]
  _count?: { apis: number }
  createdBy: string
  creator?: any
  createdAt: string
  updatedAt: string
}

// ==================== API REGISTRATION ====================
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type AuthType = 'NONE' | 'JWT' | 'API_KEY' | 'OAUTH2' | 'BASIC'
export type ApiStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'DEPRECATED'
export type ApiType = 'REST' | 'MICROFLOW'

export interface ApiRegistration {
  id: string
  name: string
  description?: string
  endpoint: string
  method: HttpMethod
  backendUrl: string
  apiType: ApiType
  routeType: RouteType
  routingKey?: string | null
  autoDiscoverFormats?: boolean
  projectId: string
  project?: Project
  authType?: AuthType | null
  apiKey?: string
  apiKeyHeader?: string
  dataCatalogId?: string | null
  dataCatalog?: DataCatalog
  rateLimitPerMin: number
  quotaPerDay?: number | null
  quotaPerMonth?: number | null
  flowId?: string | null
  flow?: FlowIntegration
  timeout: number
  retries: number
  // API Information
  version?: string
  tags?: string[]
  termsOfService?: string
  contactName?: string
  contactEmail?: string
  contactUrl?: string
  license?: string
  deprecated: boolean
  // Relations
  authConfig?: ApiAuthConfig
  headerMappings?: ApiHeaderMapping[]
  messageFormats?: MessageFormat[]
  status: ApiStatus
  createdBy: string
  creator?: User
  _count?: { apiLogs: number; messageFormats: number }
  createdAt: string
  updatedAt: string
}

export interface CreateApiInput {
  name: string
  description?: string
  endpoint: string
  method: HttpMethod
  backendUrl: string
  apiType?: ApiType
  routeType?: RouteType
  routingKey?: string
  autoDiscoverFormats?: boolean
  projectId: string
  authType?: AuthType
  apiKey?: string
  apiKeyHeader?: string
  dataCatalogId?: string
  rateLimitPerMin?: number
  flowId?: string
  timeout?: number
  retries?: number
  version?: string
  tags?: string[]
  termsOfService?: string
  contactName?: string
  contactEmail?: string
  contactUrl?: string
  license?: string
  deprecated?: boolean
}

// ==================== ROUTE TYPE ====================
export type RouteType = 'DEDICATED' | 'SHARED_ENDPOINT'

// ==================== MESSAGE FORMAT ====================
export type DiscriminatorSource = 'NONE' | 'BODY' | 'HEADER'
export type MessageFormatType = 'STANDARD' | 'MICROFLOW' | 'BATCH' | 'NOTIFICATION'

export interface MessageFormat {
  id: string
  name: string
  description?: string
  apiRegistrationId: string
  apiRegistration?: ApiRegistration
  flowId?: string | null
  flow?: FlowIntegration
  formatType: MessageFormatType
  discriminatorSource: DiscriminatorSource
  discriminatorField?: string
  discriminatorValue?: string
  auditEnabled: boolean
  auditFields?: Record<string, any>
  pkXPath?: string
  extractionConfig?: Record<string, any>
  fieldMappings?: Record<string, any>
  refIdPath?: string
  refNoPath?: string
  userIdPath?: string
  sourcePage?: string
  sourceFunction?: string
  sourceButton?: string
  sourceSystem?: string
  // NEW — Action Context (v2)
  code?: string
  actionType?: ActionType
  actionLabel?: string
  system?: string
  screenCode?: string
  screenName?: string
  tabName?: string
  techHints?: Record<string, any>
  status: ApiStatus
  createdBy: string
  creator?: User
  createdAt: string
  updatedAt: string
}

export type ActionType =
  | 'READ' | 'SEARCH'
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'CLONE'
  | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'SIGNOFF'
  | 'EXPORT' | 'DOWNLOAD'
  | 'COMMENT' | 'NOTIFY'
  | 'OTHER'

export interface CreateMessageFormatInput {
  name: string
  description?: string
  apiRegistrationId: string
  flowId?: string
  formatType?: MessageFormatType
  discriminatorSource?: DiscriminatorSource
  discriminatorField?: string
  discriminatorValue?: string
  auditEnabled?: boolean
  auditFields?: Record<string, any>
  pkXPath?: string
  extractionConfig?: Record<string, any>
  fieldMappings?: Record<string, any>
  refIdPath?: string
  refNoPath?: string
  userIdPath?: string
  sourcePage?: string
  sourceFunction?: string
  sourceButton?: string
  sourceSystem?: string
  // NEW — Action Context (v2)
  code?: string
  actionType?: ActionType
  actionLabel?: string
  system?: string
  screenCode?: string
  screenName?: string
  tabName?: string
  techHints?: Record<string, any>
}

// ==================== AUTH CONFIG ====================
export type AuthScheme = 'NONE' | 'JWT' | 'API_KEY' | 'OAUTH2' | 'BASIC' | 'CUSTOM'
export type OAuth2Flow = 'AUTHORIZATION_CODE' | 'CLIENT_CREDENTIALS' | 'IMPLICIT' | 'PASSWORD'
export type ApiKeyLocation = 'HEADER' | 'QUERY' | 'COOKIE'

export interface ApiAuthConfig {
  id: string
  apiRegistrationId: string
  authScheme: AuthScheme
  // JWT
  jwtIssuer?: string
  jwtAudience?: string
  jwtClaims?: Record<string, any>
  jwtAlgorithm?: string
  // OAuth2
  oauth2AuthUrl?: string
  oauth2TokenUrl?: string
  oauth2Scopes?: string[]
  oauth2Flow?: OAuth2Flow
  // API Key
  apiKeyLocation?: ApiKeyLocation
  apiKeyName?: string
  apiKeyValue?: string
  // Basic
  basicUsername?: string
  basicPassword?: string
  // Custom
  customAuthConfig?: Record<string, any>
  createdAt: string
  updatedAt: string
}

// ==================== HEADER MAPPING ====================
export type HeaderDirection = 'REQUEST' | 'RESPONSE'
export type HeaderAction = 'SET' | 'APPEND' | 'REMOVE' | 'PASSTHROUGH'

export interface ApiHeaderMapping {
  id: string
  apiRegistrationId: string
  direction: HeaderDirection
  headerName: string
  headerValue: string
  action: HeaderAction
  condition?: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface CreateHeaderMappingInput {
  direction: HeaderDirection
  headerName: string
  headerValue: string
  action: HeaderAction
  condition?: string
  order?: number
}

// ==================== FLOW INTEGRATION ====================
export type ExecutionMode = 'sync' | 'async'
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL'

// Trigger Types - Flow entry points
export type TriggerType = 'http' | 'kafka_consumer' | 'scheduler' | 'webhook' | 'message_queue'

// Flow Categories
export type FlowCategory = 'api_gateway' | 'consumer' | 'hybrid'

// Node Types for Gateway Flow
export type TriggerNodeType = 'httpRequest' | 'kafkaTrigger' | 'schedulerTrigger' | 'webhookTrigger'
export type ProcessNodeType = 'appEventLog' | 'auditTrail' | 'callService' | 'transform' | 'condition' | 'delay'
export type OutputNodeType = 'httpResponse' | 'pushToKafka' | 'pushToQueue' | 'end'

export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, any>
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  type?: string
  animated?: boolean
}

export interface FlowIntegration {
  id: string
  name: string
  description?: string
  triggerType: TriggerType
  executionMode: ExecutionMode
  flowCategory: FlowCategory
  nodes: FlowNode[]
  edges: FlowEdge[]
  settings?: Record<string, any>
  apis?: ApiRegistration[]
  isActive: boolean
  lastExecutedAt?: string
  executionCount: number
  createdBy: string
  creator?: User
  executions?: FlowExecution[]
  createdAt: string
  updatedAt: string
}

export interface CreateFlowInput {
  name: string
  description?: string
  triggerType: TriggerType
  executionMode: ExecutionMode
  flowCategory?: FlowCategory
  nodes: FlowNode[]
  edges: FlowEdge[]
  settings?: Record<string, any>
}

export interface FlowExecution {
  id: string
  flowId: string
  flow?: FlowIntegration
  triggerApiId?: string
  requestId?: string
  status: ExecutionStatus
  startedAt: string
  completedAt?: string
  duration?: number
  inputData?: Record<string, any>
  outputData?: Record<string, any>
  errorMessage?: string
  nodeResults?: Record<string, any>
  createdAt: string
}

// Trigger Type Configuration
export interface TriggerTypeConfig {
  type: TriggerType
  label: string
  description: string
  icon: string
  color: string
  bgColor: string
  defaultExecutionMode: ExecutionMode
}

// Flow Type Configuration (for templates)
export interface FlowTypeConfig {
  type: string
  label: string
  description: string
  icon: string
  color: string
  defaultNodes: FlowNode[]
  settingsSchema: Record<string, any>
}

// Node Category for Palette
export interface NodeCategory {
  id: string
  label: string
  nodes: NodeTemplate[]
}

export interface NodeTemplate {
  type: string
  label: string
  description: string
  icon: string
  color: string
  bgColor: string
  category: 'trigger' | 'process' | 'output'
}

// ==================== API LOGS / AUDIT ====================
export interface ApiLog {
  id: string
  requestId: string
  apiId: string
  api?: ApiRegistration
  userId?: string
  userIp?: string
  userAgent?: string
  method: string
  path: string
  queryParams?: Record<string, any>
  requestHeaders?: Record<string, any>
  requestBody?: Record<string, any>
  statusCode: number
  responseHeaders?: Record<string, any>
  responseBody?: Record<string, any>
  duration: number
  extractedData?: Record<string, any>
  timestamp: string
}

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'VIEW' | 'EXPORT' | 'APPROVE' | 'REJECT'

export interface AuditLog {
  id: string
  action: AuditAction
  entityType: string
  entityId: string
  userId: string
  user?: User
  userIp?: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  changes?: Record<string, any>
  description?: string
  timestamp: string
}

// ==================== DASHBOARD ====================
export interface DashboardStats {
  totalApis: number
  activeApis: number
  totalRequests: number
  avgResponseTime: number
  errorRate: number
  requestsToday: number
  requestsThisWeek: number
  requestsThisMonth: number
}

export interface TimeSeriesData {
  timestamp: string
  value: number
}

export interface TopApiData {
  apiId: string
  apiName: string
  endpoint: string
  requestCount: number
  avgResponseTime: number
  errorRate: number
}

export interface DashboardData {
  stats: DashboardStats
  requestsOverTime: TimeSeriesData[]
  topApis: TopApiData[]
  statusDistribution: { status: string; count: number }[]
  methodDistribution: { method: string; count: number }[]
}

// ==================== COMMON ====================
export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, any>
}
