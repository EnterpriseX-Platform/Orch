import { prisma } from '@/lib/prisma'

/**
 * Generate an OpenAPI 3.0.3 specification from a Project's data.
 * Fetches the Project with all its APIs (including authConfig,
 * headerMappings, messageFormats), then builds a compliant OpenAPI spec object.
 */
export async function generateOpenApiSpec(projectId: string): Promise<Record<string, any>> {
  const projectData = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      apis: {
        include: {
          authConfig: true,
          headerMappings: {
            orderBy: { order: 'asc' },
          },
          messageFormats: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!projectData) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const apis = projectData.apis

  // --- info ---
  const firstApiWithVersion = apis.find((a) => a.version)
  const firstApiWithContact = apis.find((a) => a.contactName || a.contactEmail || a.contactUrl)
  const firstApiWithLicense = apis.find((a) => a.license)
  const firstApiWithTerms = apis.find((a) => a.termsOfService)

  const info: Record<string, any> = {
    title: projectData.nameEn || projectData.name,
    version: firstApiWithVersion?.version || '1.0.0',
  }

  if (projectData.description) {
    info.description = projectData.description
  }

  // contact — prefer Project-level, fall back to first API with contact info
  const contactObj: Record<string, string> = {}
  if (projectData.owner) contactObj.name = projectData.owner
  if (projectData.contactEmail) contactObj.email = projectData.contactEmail
  if (firstApiWithContact) {
    if (!contactObj.name && firstApiWithContact.contactName) contactObj.name = firstApiWithContact.contactName
    if (!contactObj.email && firstApiWithContact.contactEmail) contactObj.email = firstApiWithContact.contactEmail
    if (firstApiWithContact.contactUrl) contactObj.url = firstApiWithContact.contactUrl
  }
  if (Object.keys(contactObj).length > 0) {
    info.contact = contactObj
  }

  // license
  if (firstApiWithLicense?.license) {
    info.license = { name: firstApiWithLicense.license }
  }

  // termsOfService
  if (firstApiWithTerms?.termsOfService) {
    info.termsOfService = firstApiWithTerms.termsOfService
  }

  // --- servers ---
  const servers = [
    {
      url: projectData.baseUrl,
      description: projectData.name,
    },
  ]

  // --- paths ---
  const paths: Record<string, any> = {}

  // Collect unique security schemes across all APIs
  const securitySchemes: Record<string, any> = {}

  for (const api of apis) {
    const method = api.method.toLowerCase()
    const endpoint = api.endpoint

    if (!paths[endpoint]) {
      paths[endpoint] = {}
    }

    const operation: Record<string, any> = {
      summary: api.name,
      operationId: api.id,
    }

    if (api.description) {
      operation.description = api.description
    }

    // tags
    const tags = api.tags as string[] | null
    if (tags && Array.isArray(tags) && tags.length > 0) {
      operation.tags = tags
    }

    if (api.deprecated) {
      operation.deprecated = true
    }

    // parameters — from headerMappings where direction=REQUEST and action!=REMOVE
    const requestHeaders = (api.headerMappings || []).filter(
      (h) => h.direction === 'REQUEST' && h.action !== 'REMOVE'
    )
    if (requestHeaders.length > 0) {
      operation.parameters = requestHeaders.map((h) => ({
        name: h.headerName,
        in: 'header',
        description: h.action === 'PASSTHROUGH' ? `Passthrough header` : `Header value: ${h.headerValue}`,
        required: false,
        schema: { type: 'string' },
      }))
    }

    // security — from authConfig
    const authConfig = api.authConfig
    if (authConfig && authConfig.authScheme !== 'NONE') {
      const scheme = authConfig.authScheme

      if (scheme === 'JWT') {
        securitySchemes['bearerAuth'] = {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        }
        operation.security = [{ bearerAuth: [] }]
      } else if (scheme === 'API_KEY') {
        const inLocation = authConfig.apiKeyLocation
          ? authConfig.apiKeyLocation.toLowerCase()
          : 'header'
        securitySchemes['apiKeyAuth'] = {
          type: 'apiKey',
          in: inLocation,
          name: authConfig.apiKeyName || 'X-API-Key',
        }
        operation.security = [{ apiKeyAuth: [] }]
      } else if (scheme === 'OAUTH2') {
        const flows: Record<string, any> = {}
        const oauth2Flow = authConfig.oauth2Flow
        const scopes: Record<string, string> = {}
        if (authConfig.oauth2Scopes && Array.isArray(authConfig.oauth2Scopes)) {
          for (const s of authConfig.oauth2Scopes as string[]) {
            scopes[s] = s
          }
        }

        if (oauth2Flow === 'AUTHORIZATION_CODE') {
          flows.authorizationCode = {
            authorizationUrl: authConfig.oauth2AuthUrl || '',
            tokenUrl: authConfig.oauth2TokenUrl || '',
            scopes,
          }
        } else if (oauth2Flow === 'CLIENT_CREDENTIALS') {
          flows.clientCredentials = {
            tokenUrl: authConfig.oauth2TokenUrl || '',
            scopes,
          }
        } else if (oauth2Flow === 'IMPLICIT') {
          flows.implicit = {
            authorizationUrl: authConfig.oauth2AuthUrl || '',
            scopes,
          }
        } else if (oauth2Flow === 'PASSWORD') {
          flows.password = {
            tokenUrl: authConfig.oauth2TokenUrl || '',
            scopes,
          }
        }

        securitySchemes['oauth2Auth'] = {
          type: 'oauth2',
          flows,
        }
        operation.security = [{ oauth2Auth: Object.keys(scopes) }]
      } else if (scheme === 'BASIC') {
        securitySchemes['basicAuth'] = {
          type: 'http',
          scheme: 'basic',
        }
        operation.security = [{ basicAuth: [] }]
      }
    }

    // requestBody — for POST, PUT, PATCH
    const methodsWithBody = ['POST', 'PUT', 'PATCH']
    if (methodsWithBody.includes(api.method)) {
      const contentTypes: Record<string, any> = {}

      if (api.messageFormats && api.messageFormats.length > 0) {
        // Build content schema from message formats with field details
        const formatSchemas = api.messageFormats.map((mf) => {
          const schema: Record<string, any> = {
            type: 'object',
            title: mf.name,
            description: mf.description || mf.name,
          }

          // Add format type as x-extension
          if ((mf as any).formatType) {
            schema['x-format-type'] = (mf as any).formatType
          }

          // Build properties from fieldMappings if available
          const fieldMappings = mf.fieldMappings as any[] | null
          if (fieldMappings && Array.isArray(fieldMappings) && fieldMappings.length > 0) {
            const properties: Record<string, any> = {}
            for (const field of fieldMappings) {
              const fieldName = field.fieldName || field.sourceField || field.targetField
              if (fieldName) {
                const prop: Record<string, any> = {
                  type: field.fieldType === 'number' ? 'number'
                    : field.fieldType === 'boolean' ? 'boolean'
                    : field.fieldType === 'array' ? 'array'
                    : field.fieldType === 'object' ? 'object'
                    : 'string',
                }
                if (field.fieldPath) {
                  prop['x-field-path'] = field.fieldPath
                }
                if (field.isNestedJson) {
                  prop['x-nested-json'] = true
                }
                properties[fieldName] = prop
              }
            }
            if (Object.keys(properties).length > 0) {
              schema.properties = properties
            }
          }

          // Add discriminator info
          if (mf.discriminatorField && mf.discriminatorValue) {
            schema['x-discriminator'] = {
              source: mf.discriminatorSource,
              field: mf.discriminatorField,
              value: mf.discriminatorValue,
            }
          }

          // Add search key paths
          const searchKeys: Record<string, string> = {}
          if ((mf as any).refIdPath) searchKeys.refIdPath = (mf as any).refIdPath
          if ((mf as any).refNoPath) searchKeys.refNoPath = (mf as any).refNoPath
          if ((mf as any).userIdPath) searchKeys.userIdPath = (mf as any).userIdPath
          if (Object.keys(searchKeys).length > 0) {
            schema['x-search-keys'] = searchKeys
          }

          // Add audit fields
          const auditFields = mf.auditFields as any[] | null
          if (auditFields && Array.isArray(auditFields) && auditFields.length > 0) {
            schema['x-audit-fields'] = auditFields
          }

          return schema
        })

        if (formatSchemas.length === 1) {
          contentTypes['application/json'] = { schema: formatSchemas[0] }
        } else {
          contentTypes['application/json'] = {
            schema: { oneOf: formatSchemas },
          }
        }
      } else {
        contentTypes['application/json'] = {
          schema: { type: 'object' },
        }
      }

      operation.requestBody = {
        content: contentTypes,
      }
    }

    // responses
    const responses: Record<string, any> = {
      '200': { description: 'Success' },
    }

    // Add 401 if auth is configured
    if (authConfig && authConfig.authScheme !== 'NONE') {
      responses['401'] = { description: 'Unauthorized' }
    }

    responses['500'] = { description: 'Internal Server Error' }

    operation.responses = responses

    paths[endpoint][method] = operation
  }

  // --- Build final spec ---
  const spec: Record<string, any> = {
    openapi: '3.0.3',
    info,
    servers,
    paths,
  }

  // Only add components if there are security schemes
  if (Object.keys(securitySchemes).length > 0) {
    spec.components = {
      securitySchemes,
    }
  }

  return spec
}
