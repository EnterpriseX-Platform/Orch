// ==========================================
// Built-in Node Type Definitions
// ==========================================

import type { NodeTypeDefinition } from './types';

export const BUILTIN_NODES: NodeTypeDefinition[] = [
  // ============ TRIGGERS ============
  {
    nodeType: 'httpRequest',
    category: 'trigger',
    label: 'HTTP Request',
    description: 'Incoming HTTP API request',
    icon: 'H',
    color: '#334155',
    version: '1.0.0',
  },
  {
    nodeType: 'webhook',
    category: 'trigger',
    label: 'Webhook',
    description: 'Incoming webhook callback',
    icon: 'W',
    color: '#334155',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        secret: { type: 'string', description: 'Webhook secret for HMAC validation' }
      }
    }
  },
  {
    nodeType: 'kafka',
    category: 'trigger',
    label: 'Kafka Consumer',
    description: 'Consume messages from Kafka topic',
    icon: 'K',
    color: '#334155',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Kafka topic name' },
        consumerGroup: { type: 'string', description: 'Consumer group ID' }
      },
      required: ['topic']
    }
  },
  {
    nodeType: 'schedule',
    category: 'trigger',
    label: 'Schedule',
    description: 'Cron-based scheduled execution',
    icon: 'C',
    color: '#334155',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        cron: { type: 'string', description: 'Cron expression (e.g., "0 */6 * * *")' },
        timezone: { type: 'string', default: 'UTC' }
      },
      required: ['cron']
    }
  },

  // ============ EXTRACT ============
  {
    nodeType: 'extract',
    category: 'extract',
    label: 'Extract Fields',
    description: 'Extract fields from request/response',
    icon: 'E',
    color: '#7C3AED',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              source: { type: 'string', enum: ['body', 'headers', 'query', 'context'] },
              path: { type: 'string' },
              default: { type: 'any' }
            },
            required: ['name']
          }
        }
      }
    }
  },
  {
    nodeType: 'jsonPath',
    category: 'extract',
    label: 'JSON Path',
    description: 'Query JSON data using JSONPath',
    icon: 'J',
    color: '#7C3AED',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'JSONPath expression (e.g., "$.data.items[0]")' },
        source: { type: 'string', enum: ['input', 'body', 'context'], default: 'input' }
      },
      required: ['expression']
    }
  },
  {
    nodeType: 'xpath',
    category: 'extract',
    label: 'XPath',
    description: 'Query XML data using XPath',
    icon: 'X',
    color: '#7C3AED',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'XPath expression' },
        namespaces: { type: 'object' }
      },
      required: ['expression']
    }
  },

  // ============ INTEGRATION ============
  {
    nodeType: 'eventLog',
    category: 'integration',
    label: 'Event Log',
    description: 'Log system events',
    icon: 'L',
    color: '#64748B',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        event: { type: 'string', description: 'Event name' },
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
        message: { type: 'string' },
        data: { type: 'any' }
      }
    }
  },
  {
    nodeType: 'audit',
    category: 'integration',
    label: 'Audit Trail',
    description: 'Record audit trail',
    icon: 'A',
    color: '#64748B',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Audit action (e.g., CREATE, UPDATE, DELETE)' },
        entityType: { type: 'string', default: 'Flow' },
        entityId: { type: 'string' },
        changes: { type: 'object' }
      },
      required: ['action']
    }
  },
  {
    nodeType: 'database',
    category: 'integration',
    label: 'Database',
    description: 'Execute database queries',
    icon: 'D',
    color: '#64748B',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query' },
        parameters: { type: 'array' },
        connection: { type: 'string', default: 'default' }
      },
      required: ['query']
    }
  },
  {
    nodeType: 'cache',
    category: 'integration',
    label: 'Cache',
    description: 'Redis/Cache operations',
    icon: 'C',
    color: '#64748B',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['get', 'set', 'delete'], default: 'get' },
        key: { type: 'string' },
        value: { type: 'any' },
        ttl: { type: 'number', description: 'Time to live in seconds', default: 300 }
      },
      required: ['operation', 'key']
    }
  },

  // ============ ACTIONS ============
  {
    nodeType: 'proxy',
    category: 'action',
    label: 'Proxy HTTP',
    description: 'Forward request to backend service',
    icon: 'P',
    color: '#059669',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        targetUrl: { type: 'string', description: 'Target URL (or use backend URL from API registration)' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        headers: { type: 'object' },
        timeout: { type: 'number', default: 30000 },
        useInput: { type: 'boolean', default: true }
      }
    }
  },
  {
    nodeType: 'callService',
    category: 'action',
    label: 'Call Service',
    description: 'Call internal gRPC/REST service',
    icon: 'S',
    color: '#059669',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name' },
        endpoint: { type: 'string', default: '/' },
        method: { type: 'string', default: 'POST' }
      },
      required: ['service']
    }
  },
  {
    nodeType: 'transform',
    category: 'action',
    label: 'Transform',
    description: 'Transform/map data structure',
    icon: 'T',
    color: '#059669',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        mappings: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              default: { type: 'any' },
              template: { type: 'string' }
            }
          }
        },
        template: { type: 'object' }
      }
    }
  },
  {
    nodeType: 'pubsub',
    category: 'action',
    label: 'Pub/Sub',
    description: 'Publish to message queue',
    icon: 'Q',
    color: '#059669',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic/queue name' },
        message: { type: 'any' },
        useInput: { type: 'boolean', default: true }
      },
      required: ['topic']
    }
  },
  {
    nodeType: 'httpCall',
    category: 'action',
    label: 'HTTP Call',
    description: 'Call external HTTP API',
    icon: 'H',
    color: '#8B5CF6',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body template' },
        timeout: { type: 'number', description: 'Timeout in ms' },
      },
      required: ['url', 'method'],
    },
  },
  {
    nodeType: 'script',
    category: 'action',
    label: 'Script',
    description: 'Execute custom code',
    icon: 'JS',
    color: '#059669',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['javascript', 'python', 'lua'], default: 'javascript' },
        code: { type: 'string', description: 'Script code' }
      },
      required: ['code']
    }
  },

  // ============ OUTPUT ============
  {
    nodeType: 'response',
    category: 'output',
    label: 'HTTP Response',
    description: 'Return HTTP response to client',
    icon: 'R',
    color: '#DC2626',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', default: 200 },
        bodySource: { type: 'string', enum: ['input', 'proxy.response', 'transform.output', 'extracted'], default: 'input' },
        bodyTemplate: { type: 'object' },
        headers: { type: 'object' }
      }
    }
  },
  {
    nodeType: 'error',
    category: 'output',
    label: 'Error Handler',
    description: 'Return error response',
    icon: 'E',
    color: '#DC2626',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', default: 500 },
        errorCode: { type: 'string', default: 'INTERNAL_ERROR' },
        message: { type: 'string' },
        details: { type: 'any' }
      }
    }
  },
  {
    nodeType: 'end',
    category: 'output',
    label: 'End Flow',
    description: 'Terminate flow execution',
    icon: 'X',
    color: '#DC2626',
    version: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true }
      }
    }
  },
];

/**
 * Register all built-in nodes to a registry
 */
export function registerBuiltins(registry: { register: (def: NodeTypeDefinition) => void }): void {
  for (const node of BUILTIN_NODES) {
    registry.register(node);
  }
}
