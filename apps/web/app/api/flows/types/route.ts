import { NextRequest, NextResponse } from 'next/server'
import { FlowTypeConfig } from '@/types'

const flowTypes: FlowTypeConfig[] = [
  {
    type: 'audit_trail',
    label: 'Audit Trail',
    description: 'Log API usage data to the Audit Trail database for retrospective review',
    icon: 'ClipboardList',
    color: '#10b981',
    defaultNodes: [
      {
        id: 'input',
        type: 'input',
        position: { x: 250, y: 0 },
        data: { label: 'API Request', type: 'input' },
      },
      {
        id: 'extract',
        type: 'extractNode',
        position: { x: 250, y: 100 },
        data: { label: 'Extract Fields', fields: [] },
      },
      {
        id: 'audit',
        type: 'auditNode',
        position: { x: 250, y: 200 },
        data: { label: 'Save Audit Log' },
      },
      {
        id: 'output',
        type: 'output',
        position: { x: 250, y: 300 },
        data: { label: 'Response', type: 'output' },
      },
    ],
    settingsSchema: {
      type: 'object',
      properties: {
        logLevel: {
          type: 'string',
          enum: ['info', 'warn', 'error'],
          default: 'info',
        },
        includeRequestBody: {
          type: 'boolean',
          default: true,
        },
        includeResponseBody: {
          type: 'boolean',
          default: false,
        },
        retentionDays: {
          type: 'number',
          default: 365,
        },
      },
    },
  },
  {
    type: 'event_stream',
    label: 'Event Stream (Kafka)',
    description: 'Send event data to Kafka topics for real-time consumption by other systems',
    icon: 'Radio',
    color: '#8b5cf6',
    defaultNodes: [
      {
        id: 'input',
        type: 'input',
        position: { x: 250, y: 0 },
        data: { label: 'API Request', type: 'input' },
      },
      {
        id: 'transform',
        type: 'transformNode',
        position: { x: 250, y: 100 },
        data: { label: 'Transform Data' },
      },
      {
        id: 'kafka',
        type: 'kafkaNode',
        position: { x: 250, y: 200 },
        data: { label: 'Send to Kafka', topic: '' },
      },
      {
        id: 'output',
        type: 'output',
        position: { x: 250, y: 300 },
        data: { label: 'Response', type: 'output' },
      },
    ],
    settingsSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Kafka topic name',
        },
        partitionKey: {
          type: 'string',
          description: 'Field to use as partition key',
        },
        acks: {
          type: 'string',
          enum: ['0', '1', 'all'],
          default: '1',
        },
      },
    },
  },
  {
    type: 'data_transform',
    label: 'Data Transform',
    description: 'Transform data formats from source systems to match defined standards',
    icon: 'Shuffle',
    color: '#f59e0b',
    defaultNodes: [
      {
        id: 'input',
        type: 'input',
        position: { x: 250, y: 0 },
        data: { label: 'API Request', type: 'input' },
      },
      {
        id: 'validate',
        type: 'validateNode',
        position: { x: 250, y: 100 },
        data: { label: 'Validate Input' },
      },
      {
        id: 'transform',
        type: 'transformNode',
        position: { x: 250, y: 200 },
        data: { label: 'Transform Data', mapping: {} },
      },
      {
        id: 'output',
        type: 'output',
        position: { x: 250, y: 300 },
        data: { label: 'Response', type: 'output' },
      },
    ],
    settingsSchema: {
      type: 'object',
      properties: {
        inputSchema: {
          type: 'object',
          description: 'Input validation schema',
        },
        outputSchema: {
          type: 'object',
          description: 'Output transformation schema',
        },
        strictMode: {
          type: 'boolean',
          default: true,
        },
      },
    },
  },
  {
    type: 'webhook',
    label: 'Webhook',
    description: 'Send data to external systems via HTTP Webhook',
    icon: 'Globe',
    color: '#3b82f6',
    defaultNodes: [
      {
        id: 'input',
        type: 'input',
        position: { x: 250, y: 0 },
        data: { label: 'API Request', type: 'input' },
      },
      {
        id: 'format',
        type: 'transformNode',
        position: { x: 250, y: 100 },
        data: { label: 'Format Payload' },
      },
      {
        id: 'webhook',
        type: 'webhookNode',
        position: { x: 250, y: 200 },
        data: { label: 'Call Webhook', url: '', method: 'POST' },
      },
      {
        id: 'output',
        type: 'output',
        position: { x: 250, y: 300 },
        data: { label: 'Response', type: 'output' },
      },
    ],
    settingsSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'Webhook URL',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          default: 'POST',
        },
        headers: {
          type: 'object',
          description: 'Custom headers',
        },
        retryCount: {
          type: 'number',
          default: 3,
        },
        timeout: {
          type: 'number',
          default: 30000,
        },
      },
    },
  },
  {
    type: 'notification',
    label: 'Notification',
    description: 'Send notifications via Email, LINE, or Slack',
    icon: 'Bell',
    color: '#ec4899',
    defaultNodes: [
      {
        id: 'input',
        type: 'input',
        position: { x: 250, y: 0 },
        data: { label: 'API Request', type: 'input' },
      },
      {
        id: 'condition',
        type: 'conditionNode',
        position: { x: 250, y: 100 },
        data: { label: 'Check Condition' },
      },
      {
        id: 'notify',
        type: 'notifyNode',
        position: { x: 250, y: 200 },
        data: { label: 'Send Notification', channel: 'email' },
      },
      {
        id: 'output',
        type: 'output',
        position: { x: 250, y: 300 },
        data: { label: 'Response', type: 'output' },
      },
    ],
    settingsSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          enum: ['email', 'line', 'slack', 'webhook'],
          default: 'email',
        },
        recipients: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of recipients',
        },
        template: {
          type: 'string',
          description: 'Message template',
        },
        throttleMinutes: {
          type: 'number',
          default: 0,
          description: 'Minimum minutes between notifications',
        },
      },
    },
  },
  {
    type: 'custom',
    label: 'Custom',
    description: 'Create a custom flow tailored to your specific needs',
    icon: 'Settings',
    color: '#6b7280',
    defaultNodes: [
      {
        id: 'input',
        type: 'input',
        position: { x: 250, y: 0 },
        data: { label: 'API Request', type: 'input' },
      },
      {
        id: 'output',
        type: 'output',
        position: { x: 250, y: 100 },
        data: { label: 'Response', type: 'output' },
      },
    ],
    settingsSchema: {
      type: 'object',
      properties: {},
    },
  },
]

// GET /api/flows/types - Get all flow types
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(flowTypes)
  } catch (error) {
    console.error('Error fetching flow types:', error)
    return NextResponse.json({ error: 'Failed to fetch flow types' }, { status: 500 })
  }
}
