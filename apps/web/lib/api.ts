import { useAuthStore } from '@/stores/authStore'
import { ApiError, PaginatedResponse, PaginationParams } from '@/types'

const API_BASE_URL = '/orch/api'

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }

    // Add auth token if available
    const token = useAuthStore.getState().accessToken
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const config: RequestInit = {
      ...options,
      headers,
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        // Try to parse error, fallback to status text
        let errorMessage = `HTTP ${response.status}`
        let errorDetails: any = null
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorData.error || errorMessage
          errorDetails = errorData.details || null
        } catch {
          // If JSON parse fails, use status text
          errorMessage = response.statusText || errorMessage
        }
        const error = new Error(errorMessage) as any
        if (errorDetails) error.details = errorDetails
        throw error
      }

      // Handle empty responses
      if (response.status === 204) {
        return undefined as T
      }

      const data = await response.json()
      return data
    } catch (error) {
      if (error instanceof Error) {
        console.error('API request failed:', error.message)
        throw error
      }
      throw new Error('Network error - please check your connection')
    }
  }

  // Generic CRUD operations
  get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const queryString = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : ''
    return this.request<T>(`${endpoint}${queryString}`, { method: 'GET' })
  }

  post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  patch<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }
}

export const apiClient = new ApiClient()

// ==================== API ENDPOINTS ====================

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    apiClient.post('/auth/login', { username, password }),
  
  refresh: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),
  
  logout: () => apiClient.post('/auth/logout', {}),
  
  me: () => apiClient.get('/auth/me'),
}

// Data Catalog
export const datasetApi = {
  list: (params?: PaginationParams & { tree?: boolean }) =>
    apiClient.get<PaginatedResponse<any>>('/datasets', params),
  
  getById: (id: string) => apiClient.get<any>(`/datasets/${id}`),
  
  create: (data: any) => apiClient.post('/datasets', data),
  
  update: (id: string, data: any) => apiClient.put(`/datasets/${id}`, data),
  
  delete: (id: string) => apiClient.delete(`/datasets/${id}`),

  reorder: (data: { id: string; parentId: string | null; sortOrder: number }) =>
    apiClient.patch('/datasets/reorder', data),

  getCategories: () => apiClient.get<string[]>('/datasets/categories'),
}

// API Registration
export const apiRegistrationApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedResponse<any>>('/registers', params),
  
  getById: (id: string) => apiClient.get<any>(`/registers/${id}`),
  
  create: (data: any) => apiClient.post('/registers', data),
  
  update: (id: string, data: any) => apiClient.put(`/registers/${id}`, data),
  
  delete: (id: string) => apiClient.delete(`/registers/${id}`),
  
  test: (id: string, testData?: any) =>
    apiClient.post(`/registers/${id}/test`, testData),
  
  validateXPath: (expression: string, sampleData: any) =>
    apiClient.post('/registers/validate-xpath', { expression, sampleData }),
}

// Flow Integration
export const flowApi = {
  list: (params?: PaginationParams) =>
    apiClient.get<PaginatedResponse<any>>('/flows', params),
  
  getById: (id: string) => apiClient.get<any>(`/flows/${id}`),
  
  create: (data: any) => apiClient.post('/flows', data),
  
  update: (id: string, data: any) => apiClient.put(`/flows/${id}`, data),
  
  delete: (id: string) => apiClient.delete(`/flows/${id}`),
  
  validate: (data: any) => apiClient.post('/flows/validate', data),
  
  deploy: (id: string) => apiClient.post(`/flows/${id}/deploy`, {}),
  
  undeploy: (id: string) => apiClient.delete(`/flows/${id}/deploy`),
  
  getTemplates: () => apiClient.get('/flows/templates'),
  
  getTypes: () => apiClient.get('/flows/types'),
}

// Logs & Audit
export const logsApi = {
  list: (params?: PaginationParams & { apiId?: string; startDate?: string; endDate?: string }) =>
    apiClient.get<PaginatedResponse<any>>('/logs', params),
  
  getById: (id: string) => apiClient.get<any>(`/logs/${id}`),
  
  exportExcel: (params?: any) =>
    apiClient.get('/logs/export/excel', params),
  
  exportCsv: (params?: any) =>
    apiClient.get('/logs/export/csv', params),
}

// Event Logs — business events written by flow eventLog nodes (and, for
// proxy paths, gateway EventLogPattern matches). Reads the event_logs
// table via /api/events (the single canonical event_logs endpoint — the
// duplicate /api/event-logs route was merged into it). This is what the
// /orch/logs screen shows (api_logs is an ops/access-log concern off the UI).
export const eventLogsApi = {
  list: (params?: PaginationParams & { eventType?: string; level?: string; flowId?: string }) =>
    apiClient.get<PaginatedResponse<any>>('/events', params),
}

// Audit Trail
export const auditApi = {
  list: (params?: PaginationParams & { entityType?: string; action?: string; from?: string; to?: string }) =>
    apiClient.get<PaginatedResponse<any>>('/audit', params),
  
  getByEntity: (entityType: string, entityId: string) =>
    apiClient.get(`/audit/entity/${entityType}/${entityId}`),
  
  exportExcel: (params?: any) =>
    apiClient.get('/audit/export/excel', params),
  
  exportCsv: (params?: any) =>
    apiClient.get('/audit/export/csv', params),
}

// Dashboard
export const dashboardApi = {
  getStats: () => apiClient.get('/dashboard'),

  getMetrics: (period: 'day' | 'week' | 'month' | 'year' = 'day') =>
    apiClient.get('/dashboard', { period }),

  getTopApis: (limit: number = 10) =>
    apiClient.get('/dashboard', { limit }),
}

// Projects
export const projectApi = {
  list: (params?: PaginationParams & { status?: string; search?: string; projectGroup?: string; agency?: string }) =>
    apiClient.get<PaginatedResponse<any>>('/projects', params),

  getById: (id: string) => apiClient.get<any>(`/projects/${id}`),

  create: (data: any) => apiClient.post('/projects', data),

  update: (id: string, data: any) => apiClient.put(`/projects/${id}`, data),

  delete: (id: string) => apiClient.delete(`/projects/${id}`),

  getOpenApiSpec: (id: string) => apiClient.get<any>(`/projects/${id}/openapi`),

  regenerateOpenApiSpec: (id: string) => apiClient.post(`/projects/${id}/openapi`, {}),
}

// Message Formats
export const messageFormatApi = {
  list: (params?: PaginationParams & { apiRegistrationId?: string; search?: string }) =>
    apiClient.get<PaginatedResponse<any>>('/message/formats', params),

  getById: (id: string) => apiClient.get<any>(`/message/formats/${id}`),

  create: (data: any) => apiClient.post('/message/formats', data),

  update: (id: string, data: any) => apiClient.put(`/message/formats/${id}`, data),

  delete: (id: string) => apiClient.delete(`/message/formats/${id}`),

  generateFields: (jsonSample: any) =>
    apiClient.post('/message/formats/generate-fields', { jsonSample }),

  // List ScreenButtons that bind to a given format — used by the
  // MessageFormat modal's "Call Sites" panel.
  callSites: (formatId: string) =>
    apiClient.get<{ data: any[] }>(`/message/formats/${formatId}/call-sites`),
}

// Auth Config (nested under registers)
export const authConfigApi = {
  get: (apiId: string) => apiClient.get<any>(`/registers/${apiId}/auth`),

  upsert: (apiId: string, data: any) => apiClient.put(`/registers/${apiId}/auth`, data),

  delete: (apiId: string) => apiClient.delete(`/registers/${apiId}/auth`),
}

// Header Mappings (nested under registers)
export const headerMappingApi = {
  list: (apiId: string) => apiClient.get<any[]>(`/registers/${apiId}/headers`),

  create: (apiId: string, data: any) => apiClient.post(`/registers/${apiId}/headers`, data),

  bulkUpdate: (apiId: string, mappings: any[]) =>
    apiClient.put(`/registers/${apiId}/headers`, { mappings }),

  delete: (apiId: string, headerId: string) =>
    apiClient.delete(`/registers/${apiId}/headers?headerId=${headerId}`),
}

// ── Library APIs (Phase 4 — MessageFormat library + override) ──

export const fieldMappingApi = {
  list: (params?: { projectId?: string }) =>
    apiClient.get<{ data: any[] }>('/field-mappings', params),
  getById: (id: string) => apiClient.get<{ data: any }>(`/field-mappings/${id}`),
  create:  (data: any) => apiClient.post('/field-mappings', data),
  update:  (id: string, data: any) => apiClient.patch(`/field-mappings/${id}`, data),
  delete:  (id: string) => apiClient.delete(`/field-mappings/${id}`),
}

export const auditConfigApi = {
  list: (params?: { projectId?: string }) =>
    apiClient.get<{ data: any[] }>('/audit-configs', params),
  getById: (id: string) => apiClient.get<{ data: any }>(`/audit-configs/${id}`),
  create:  (data: any) => apiClient.post('/audit-configs', data),
  update:  (id: string, data: any) => apiClient.patch(`/audit-configs/${id}`, data),
  delete:  (id: string) => apiClient.delete(`/audit-configs/${id}`),
}

export const screenApi = {
  list: (params?: { projectId?: string; clientId?: string; system?: string }) =>
    apiClient.get<{ data: any[] }>('/screens', params),
  getById: (id: string) => apiClient.get<{ data: any }>(`/screens/${id}`),
  create:  (data: any) => apiClient.post('/screens', data),
  update:  (id: string, data: any) => apiClient.patch(`/screens/${id}`, data),
  delete:  (id: string) => apiClient.delete(`/screens/${id}`),

  // ScreenButton CRUD (nested)
  buttons: {
    create: (screenId: string, data: any) =>
      apiClient.post(`/screens/${screenId}/buttons`, data),
    update: (screenId: string, buttonId: string, data: any) =>
      apiClient.patch(`/screens/${screenId}/buttons/${buttonId}`, data),
    delete: (screenId: string, buttonId: string) =>
      apiClient.delete(`/screens/${screenId}/buttons/${buttonId}`),
  },
}

// Client (consumer app) — project-scoped
export const clientAppApi = {
  list:    (projectId: string) =>
    apiClient.get<{ data: any[] }>(`/projects/${projectId}/clients`),
  getById: (projectId: string, clientId: string) =>
    apiClient.get<{ data: any }>(`/projects/${projectId}/clients/${clientId}`),
  create:  (projectId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/clients`, data),
  update:  (projectId: string, clientId: string, data: any) =>
    apiClient.patch(`/projects/${projectId}/clients/${clientId}`, data),
  delete:  (projectId: string, clientId: string) =>
    apiClient.delete(`/projects/${projectId}/clients/${clientId}`),
}
