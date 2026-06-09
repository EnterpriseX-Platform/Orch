'use client'

import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { flowApi } from '@/lib/api'
import cuid from 'cuid'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  Node,
  Edge,
  Connection,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Select, SelectOption } from '@/components/ui/select'
import { toast } from 'sonner'

// Import Lucide Icons
import {
  Globe,
  Webhook,
  Layers,
  Calendar,
  Search,
  FileJson,
  FileText,
  Database,
  Shield,
  HardDrive,
  ArrowLeftRight,
  Globe2,
  RefreshCw,
  Radio,
  Code,
  CheckCircle2,
  XCircle,
  Flag,
  LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
} from 'lucide-react'

// Import Orch SDK
import { NodeRegistry, registerBuiltins } from '@orch/sdk'

const FONT = "'Prompt', sans-serif";

// ==================== THEME COLORS ====================
// Dark Theme
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent)',
  colors: {
    triggers: '#3B82F6',     // Blue-500
    extract: '#8B5CF6',      // Violet-500
    integration: '#10B981',  // Emerald-500
    actions: '#F59E0B',      // Amber-500
    output: '#EF4444',       // Red-500
    logic: '#06B6D4',        // Cyan-500
  }
};

// ==================== NODE DEFINITIONS ====================
const NODE_TYPES = {
  triggers: [
    { id: "httpRequest", label: "HTTP Request", sub: "Incoming API", icon: "H", color: THEME.colors.triggers },
    { id: "webhook", label: "Webhook", sub: "Callback", icon: "W", color: THEME.colors.triggers },
    { id: "kafka", label: "Kafka", sub: "Consumer", icon: "K", color: THEME.colors.triggers },
    { id: "schedule", label: "Schedule", sub: "Cron Job", icon: "C", color: THEME.colors.triggers },
  ],
  extract: [
    { id: "extract", label: "Extract Fields", sub: "Parse Data", icon: "E", color: "#7C3AED" },
    { id: "jsonPath", label: "JSON Path", sub: "Query JSON", icon: "J", color: "#7C3AED" },
    { id: "xpath", label: "XPath", sub: "Query XML", icon: "X", color: "#7C3AED" },
  ],
  integration: [
    { id: "eventLog", label: "Event Log", sub: "System Event", icon: "L", color: THEME.colors.integration },
    { id: "audit", label: "Audit Trail", sub: "Security Log", icon: "A", color: THEME.colors.integration },
    { id: "database", label: "Database", sub: "SQL Query", icon: "D", color: THEME.colors.integration },
    { id: "cache", label: "Cache", sub: "Redis/Cache", icon: "C", color: THEME.colors.integration },
  ],
  actions: [
    { id: "httpCall", label: "HTTP Call", sub: "External API", icon: "C", color: THEME.colors.actions },
    { id: "proxy", label: "Proxy HTTP", sub: "Forward Request", icon: "P", color: THEME.colors.actions },
    { id: "callService", label: "Call Service", sub: "gRPC/REST", icon: "S", color: THEME.colors.actions },
    { id: "transform", label: "Transform", sub: "Map/Convert Data", icon: "T", color: THEME.colors.actions },
    { id: "pubsub", label: "Pub/Sub", sub: "Message Queue", icon: "Q", color: THEME.colors.actions },
    { id: "script", label: "Script", sub: "Custom Code", icon: "JS", color: THEME.colors.actions },
  ],
  output: [
    { id: "response", label: "HTTP Response", sub: "Return 200", icon: "R", color: THEME.colors.output },
    { id: "error", label: "Error Handler", sub: "Return Error", icon: "E", color: THEME.colors.output },
    { id: "end", label: "End Flow", sub: "Terminate", icon: "X", color: THEME.colors.output },
  ],
}

const SECTIONS = [
  { key: "triggers", label: "TRIGGERS" },
  { key: "extract", label: "EXTRACT" },
  { key: "integration", label: "INTEGRATION" },
  { key: "actions", label: "ACTIONS" },
  { key: "output", label: "OUTPUT" },
]

// Execution Strategy Options
const EXECUTION_STRATEGIES = [
  { 
    id: 'fast', 
    label: 'Fast', 
    sub: 'In-memory only',
    desc: 'Execute all nodes in memory without queueing. Fastest but no durability.',
    color: '#34D399',
  },
  { 
    id: 'reliable', 
    label: 'Reliable', 
    sub: 'All via Kafka',
    desc: 'Queue all nodes through Kafka for guaranteed delivery and durability.',
    color: '#60A5FA',
  },
  { 
    id: 'custom', 
    label: 'Custom', 
    sub: 'Configurable',
    desc: 'Choose queue type per node. Advanced configuration required.',
    color: '#A78BFA',
  },
]

const QUEUE_TYPES = [
  { value: 'kafka', label: 'Kafka' },
  { value: 'rabbitmq', label: 'RabbitMQ' },
  { value: 'sqs', label: 'AWS SQS' },
]

// ==================== SDK REGISTRY ====================
// Initialize SDK registry for future extensibility
const sdkRegistry = new NodeRegistry();
registerBuiltins(sdkRegistry);

// Log registered node types for debugging
console.log('[FlowBuilder] SDK Registry initialized with', sdkRegistry.listTypes().length, 'node types');

// ==================== NODE FACTORY ====================
// Standardized node creation - uses the same concept across the entire system
interface NodeDefinition {
  id: string;        // CUID
  label: string;
  sub: string;
  icon: string;
  color: string;
}

interface NodePosition {
  x: number;
  y: number;
}

interface FlowNodeData {
  type: string;           // Node type: httpRequest, proxy, eventLog, etc.
  label: string;
  sub: string;
  icon: string;
  color: string;
  config: Record<string, any>;  // Node-specific config
  id: string;             // Same as node id (CUID)
}

// ==================== NODE CONFIG PANEL ====================
// Config panel for each node type
function NodeConfigPanel({ node, onChange }: { node: Node; onChange: (data: any) => void }) {
  const nodeType = node.data?.type as string
  const config = (node.data?.config as Record<string, any>) || {}
  
  const updateConfig = (key: string, value: any) => {
    onChange({
      ...node.data,
      config: { ...config, [key]: value }
    })
  }

  // Per-node execution mode toggle (for Custom strategy)
  const renderExecModeToggle = () => {
    const asyncNodes = ['eventLog', 'audit', 'pubsub', 'kafka']
    const isDefaultAsync = asyncNodes.includes(nodeType)
    const currentMode = config.executionMode || (isDefaultAsync ? 'async' : 'sync')

    return (
      <div style={{
        marginTop: 10, paddingTop: 10,
        borderTop: `1px solid ${THEME.borderLight}`,
      }}>
        <label style={{ fontSize: 11, color: THEME.text.muted, display: 'block', marginBottom: 4 }}>
          Execution Mode
        </label>
        <div style={{ display: 'flex', gap: 0, borderRadius: 3, overflow: 'hidden', border: `1px solid ${THEME.border}` }}>
          {(['sync', 'async'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => updateConfig('executionMode', mode)}
              style={{
                flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 600,
                letterSpacing: 0.5, cursor: 'pointer', border: 'none',
                fontFamily: FONT, transition: 'all 0.15s',
                background: currentMode === mode
                  ? (mode === 'async' ? '#F59E0B20' : `${THEME.accent}15`)
                  : THEME.bg,
                color: currentMode === mode
                  ? (mode === 'async' ? '#F59E0B' : THEME.accent)
                  : THEME.text.muted,
              }}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: THEME.text.muted, marginTop: 4 }}>
          {currentMode === 'async'
            ? 'Fire & forget — push to queue and continue'
            : 'Wait for completion before next node'}
        </div>
      </div>
    )
  }

  const renderConfigFields = () => {
    switch (nodeType) {
      case 'kafka':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Topic *</label>
              <input
                type="text"
                value={config.topic || ''}
                onChange={(e) => updateConfig('topic', e.target.value)}
                placeholder="e.g., payment-events"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Consumer Group</label>
              <input
                type="text"
                value={config.consumerGroup || ''}
                onChange={(e) => updateConfig('consumerGroup', e.target.value)}
                placeholder="e.g., flow-consumer"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
          </div>
        )
      
      case 'httpCall':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>URL *</label>
              <input
                type="text"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                placeholder="https://api.example.com/users"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Method</label>
              <div style={{ marginTop: 2 }}>
                <Select
                  value={config.method || 'GET'}
                  onChange={(value) => updateConfig('method', value)}
                  options={[
                    { value: 'GET', label: 'GET' },
                    { value: 'POST', label: 'POST' },
                    { value: 'PUT', label: 'PUT' },
                    { value: 'PATCH', label: 'PATCH' },
                    { value: 'DELETE', label: 'DELETE' },
                  ]}
                  size="sm"
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Response Type</label>
              <div style={{ marginTop: 2 }}>
                <Select
                  value={config.responseType || 'auto'}
                  onChange={(value) => updateConfig('responseType', value)}
                  options={[
                    { value: 'auto', label: 'Auto (JSON/Text)' },
                    { value: 'json', label: 'JSON Only' },
                    { value: 'text', label: 'Text/HTML' },
                  ]}
                  size="sm"
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Timeout (ms)</label>
              <input
                type="number"
                value={config.timeout || 10000}
                onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            {renderExecModeToggle()}
          </div>
        )

      case 'proxy':
      case 'callService':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Target URL</label>
              <input
                type="text"
                value={config.targetUrl || ''}
                onChange={(e) => updateConfig('targetUrl', e.target.value)}
                placeholder="${backendUrl} or https://api.example.com"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Method</label>
              <div style={{ marginTop: 2 }}>
                <Select
                  value={config.method || 'POST'}
                  onChange={(value) => updateConfig('method', value)}
                  options={[
                    { value: 'GET', label: 'GET' },
                    { value: 'POST', label: 'POST' },
                    { value: 'PUT', label: 'PUT' },
                    { value: 'PATCH', label: 'PATCH' },
                    { value: 'DELETE', label: 'DELETE' },
                  ]}
                  size="sm"
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Timeout (ms)</label>
              <input
                type="number"
                value={config.timeout || 30000}
                onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>

            {/* Forward Headers */}
            <div style={{ marginTop: 4 }}>
              <label style={{ fontSize: 11, color: THEME.text.muted, display: 'block', marginBottom: 4 }}>
                Forward Headers
              </label>
              {(['authorization', 'content-type', 'x-request-id', 'accept', 'x-forwarded-for', 'cookie'] as const).map(h => {
                // Defensive: legacy rows (or broken imports) can have
                // forwardHeaders saved as an object/string instead of
                // an array. Calling .includes on a non-array crashed
                // the whole Properties panel with "t.includes is not a function".
                const fwd: string[] = Array.isArray(config.forwardHeaders)
                  ? config.forwardHeaders
                  : ['authorization', 'content-type', 'x-request-id']
                const checked = fwd.includes(h)
                return (
                  <label key={h} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, color: THEME.text.secondary, cursor: 'pointer',
                    padding: '2px 0',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked ? fwd.filter(x => x !== h) : [...fwd, h]
                        updateConfig('forwardHeaders', next)
                      }}
                      style={{ width: 12, height: 12, accentColor: THEME.accent }}
                    />
                    {h}
                  </label>
                )
              })}
            </div>

            {/* Custom Headers */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 11, color: THEME.text.muted }}>Custom Headers</label>
                <button
                  onClick={() => {
                    const headers = config.headers || {}
                    updateConfig('headers', { ...headers, '': '' })
                  }}
                  style={{
                    fontSize: 10, color: THEME.accent, background: 'none',
                    border: 'none', cursor: 'pointer', fontFamily: FONT,
                  }}
                >+ Add</button>
              </div>
              {Object.entries(config.headers || {}).map(([key, val], i) => (
                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <input
                    placeholder="Key"
                    value={key}
                    onChange={(e) => {
                      const entries = Object.entries(config.headers || {})
                      entries[i] = [e.target.value, entries[i][1]]
                      updateConfig('headers', Object.fromEntries(entries))
                    }}
                    style={{
                      flex: 1, padding: '3px 5px', fontSize: 11,
                      border: `1px solid ${THEME.border}`, borderRadius: 2,
                    }}
                  />
                  <input
                    placeholder="Value"
                    value={val as string}
                    onChange={(e) => {
                      const entries = Object.entries(config.headers || {})
                      entries[i] = [entries[i][0], e.target.value]
                      updateConfig('headers', Object.fromEntries(entries))
                    }}
                    style={{
                      flex: 1, padding: '3px 5px', fontSize: 11,
                      border: `1px solid ${THEME.border}`, borderRadius: 2,
                    }}
                  />
                  <button
                    onClick={() => {
                      const entries = Object.entries(config.headers || {})
                      entries.splice(i, 1)
                      updateConfig('headers', Object.fromEntries(entries))
                    }}
                    style={{
                      fontSize: 11, color: '#EF4444', background: 'none',
                      border: 'none', cursor: 'pointer', padding: '0 4px',
                    }}
                  >×</button>
                </div>
              ))}
            </div>

            {renderExecModeToggle()}
          </div>
        )
      
      case 'eventLog':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Event Name</label>
              <input
                type="text"
                value={config.event || ''}
                onChange={(e) => updateConfig('event', e.target.value)}
                placeholder="e.g., PAYMENT_PROCESSED"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            {/* Message */}
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Message</label>
              <textarea
                value={config.message || ''}
                onChange={(e) => updateConfig('message', e.target.value)}
                placeholder="Log message (supports ${variables})"
                rows={3}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                  resize: 'vertical',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Level</label>
              <div style={{ marginTop: 2 }}>
                <Select
                  value={config.level || 'info'}
                  onChange={(value) => updateConfig('level', value)}
                  options={[
                    { value: 'debug', label: 'Debug' },
                    { value: 'info', label: 'Info' },
                    { value: 'warn', label: 'Warn' },
                    { value: 'error', label: 'Error' },
                  ]}
                  size="sm"
                />
              </div>
            </div>
            {renderExecModeToggle()}
          </div>
        )

      case 'audit':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Action *</label>
              <input
                type="text"
                value={config.action || ''}
                onChange={(e) => updateConfig('action', e.target.value)}
                placeholder="e.g., CREATE_PAYMENT"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Entity Type</label>
              <input
                type="text"
                value={config.entityType || ''}
                onChange={(e) => updateConfig('entityType', e.target.value)}
                placeholder="e.g., Payment"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Entity ID (template)</label>
              <input
                type="text"
                value={config.entityId || ''}
                onChange={(e) => updateConfig('entityId', e.target.value)}
                placeholder="${request.body.id}"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>PK XPath (JSONPath)</label>
              <input
                type="text"
                value={config.auditPkXPath || ''}
                onChange={(e) => updateConfig('auditPkXPath', e.target.value)}
                placeholder="$.id"
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            <div style={{ marginTop: 8, padding: '6px', background: THEME.borderLight, borderRadius: 3 }}>
              <div style={{ fontSize: 11, color: THEME.text.secondary, fontWeight: 600, marginBottom: 4 }}>
                ARRAY COMPARISON (PUT/PATCH)
              </div>
              <div>
                <label style={{ fontSize: 11, color: THEME.text.muted }}>Array Path</label>
                <input
                  type="text"
                  value={config.arrayPath || ''}
                  onChange={(e) => updateConfig('arrayPath', e.target.value)}
                  placeholder="$.orders"
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 12,
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 3,
                    marginTop: 2,
                  }}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <label style={{ fontSize: 11, color: THEME.text.muted }}>Array Key Field</label>
                <input
                  type="text"
                  value={config.arrayKeyField || ''}
                  onChange={(e) => updateConfig('arrayKeyField', e.target.value)}
                  placeholder="id (optional)"
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 12,
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 3,
                    marginTop: 2,
                  }}
                />
              </div>
            </div>
            {renderExecModeToggle()}
          </div>
        )

      case 'response':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Status Code</label>
              <input
                type="number"
                value={config.statusCode || 200}
                onChange={(e) => updateConfig('statusCode', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 12,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 3,
                  marginTop: 2,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: THEME.text.muted }}>Body Source</label>
              <div style={{ marginTop: 2 }}>
                <Select
                  value={config.bodySource || 'proxy.response'}
                  onChange={(value) => updateConfig('bodySource', value)}
                  options={[
                    { value: 'input', label: 'Input' },
                    { value: 'proxy.response', label: 'Proxy Response' },
                    { value: 'transform.output', label: 'Transform Output' },
                    { value: 'extracted', label: 'Extracted Fields' },
                  ]}
                  size="sm"
                />
              </div>
            </div>
          </div>
        )
      
      default:
        return (
          <div style={{ fontSize: 12, color: THEME.text.muted, fontStyle: 'italic' }}>
            No configuration required for this node type.
          </div>
        )
    }
  }

  return (
    <div style={{ 
      marginTop: 16, 
      paddingTop: 16, 
      borderTop: `1px solid ${THEME.borderLight}` 
    }}>
      <div style={{ 
        fontSize: 12, 
        fontWeight: 600, 
        color: THEME.text.secondary, 
        marginBottom: 10,
        letterSpacing: 0.5 
      }}>
        CONFIGURATION
      </div>
      {renderConfigFields()}
    </div>
  )
}

/**
 * Create node following the standard - uses CUID only
 * Does not accept "vnjoq" style IDs
 */
function createFlowNode(
  nodeDef: NodeDefinition,
  position: NodePosition,
  config: Record<string, any> = {}
): Node {
  const nodeId = cuid();  // CUID only

  // Validate node config using SDK registry
  const nodeType = sdkRegistry?.get?.(nodeDef.id)
  if (nodeType?.configSchema) {
    // Schema available for validation
  }

  return {
    id: nodeId,
    type: 'flowNode',
    position,
    data: {
      type: nodeDef.id,        // e.g., 'httpRequest', 'proxy', 'kafka'
      label: nodeDef.label,
      sub: nodeDef.sub,
      icon: nodeDef.icon,
      color: nodeDef.color,
      config,                   // Node-specific configuration
      id: nodeId,              // Reference to self
    },
  };
}

/**
 * Create a standard flow edge (top-to-bottom layout)
 */
function createFlowEdge(sourceId: string, targetId: string): Edge {
  return {
    id: cuid(),
    source: sourceId,
    target: targetId,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'step',
  };
}

// ==================== NODE CONSTANTS ====================
const NODE_WIDTH = 160
const NODE_MIN_HEIGHT = 48

const handleStyle = (color: string, isSource: boolean) => ({
  width: 8,
  height: 8,
  background: isSource ? color : THEME.panel,
  border: `1.5px solid ${isSource ? color : color + '60'}`,
})

// ==================== NODE COMPONENT ====================
const FlowNode = ({ data, selected }: any) => {
  const color = data.color || THEME.colors.triggers
  const execMode = data.config?.executionMode

  return (
    <div
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_MIN_HEIGHT,
        background: THEME.panel,
        border: `1px solid ${selected ? color : THEME.border}`,
        borderRadius: 4,
        cursor: 'grab',
        boxShadow: selected
          ? `0 0 0 2px ${color}20, 0 4px 12px ${color}15`
          : '0 1px 3px rgba(0,0,0,0.08)',
        fontFamily: FONT,
        transition: 'box-shadow 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Color stripe */}
      <div style={{ height: 3, background: color, borderRadius: '3px 3px 0 0' }} />

      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Icon box */}
        <div style={{
          width: 28,
          height: 22,
          background: `${color}12`,
          border: `1px solid ${color}35`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          borderRadius: 3,
        }}>
          <span style={{ color: color, fontSize: 11, fontWeight: 700 }}>{data.icon}</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, color: THEME.text.primary, fontWeight: 600, letterSpacing: 0.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{data.label}</div>
          <div style={{ fontSize: 11, color: THEME.text.muted, marginTop: 1 }}>{data.sub}</div>
        </div>
      </div>

      {/* Async badge */}
      {execMode === 'async' && (
        <div style={{
          position: 'absolute', top: 5, right: 5,
          fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
          color: '#F59E0B', background: '#F59E0B18',
          border: '1px solid #F59E0B40',
          padding: '1px 4px', borderRadius: 2,
        }}>ASYNC</div>
      )}

      {/* Handles - 4 directions */}
      <Handle type="target" id="left" position={Position.Left}
        style={{ ...handleStyle(color, false), left: -5 }} />
      <Handle type="source" id="right" position={Position.Right}
        style={{ ...handleStyle(color, true), right: -5 }} />
      <Handle type="target" id="top" position={Position.Top}
        style={{ ...handleStyle(color, false), top: -5 }} />
      <Handle type="source" id="bottom" position={Position.Bottom}
        style={{ ...handleStyle(color, true), bottom: -5 }} />
    </div>
  )
}

const nodeTypes = {
  flowNode: FlowNode,
}

interface FlowBuilderProps {
  flowId: string | null
}

export default function FlowBuilder({ flowId }: FlowBuilderProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [flowName, setFlowName] = useState('untitled-flow')
  const [isEditingName, setIsEditingName] = useState(false)
  const [activeTab, setActiveTab] = useState('designer')
  const [isDeployed, setIsDeployed] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showPalette, setShowPalette] = useState(true)
  
  // Flow Detail Fields
  const [flowDescription, setFlowDescription] = useState('')
  const [triggerType, setTriggerType] = useState<string>('HTTP')
  const [executionMode, setExecutionMode] = useState<string>('SYNC')
  const [flowCategory, setFlowCategory] = useState<string>('API_GATEWAY')

  // Execution Strategy State
  const [executionStrategy, setExecutionStrategy] = useState<'fast' | 'reliable' | 'custom'>('fast')
  const [customQueueType, setCustomQueueType] = useState<'kafka' | 'rabbitmq' | 'sqs'>('kafka')
  const [showStrategyPanel, setShowStrategyPanel] = useState(false)
  const [showFlowSettings, setShowFlowSettings] = useState(false)
  
  // Test state
  const [testMethod, setTestMethod] = useState('POST')
  const [testPath, setTestPath] = useState('')
  const [testBody, setTestBody] = useState('{}')
  const [testResponse, setTestResponse] = useState<any>(null)

  const { data: flowData, isLoading } = useQuery({
    queryKey: ['flow', flowId],
    queryFn: () => flowApi.getById(flowId!),
    enabled: !!flowId,
  })

  // Load flow data - only once when flowData changes
  useEffect(() => {
    if (flowData) {
      console.log('[FlowBuilder] Loading flow:', flowData.name, 'nodes:', flowData.nodes?.length || 0)
      setFlowName(flowData.name)
      setIsDeployed(flowData.isActive || false)
      setFlowDescription(flowData.description || '')
      setTriggerType(flowData.triggerType || 'HTTP')
      setExecutionMode(flowData.executionMode || 'SYNC')
      setFlowCategory(flowData.flowCategory || 'API_GATEWAY')

      // Load execution strategy
      const strategy = flowData.executionStrategy || 'fast'
      setExecutionStrategy(strategy as 'fast' | 'reliable' | 'custom')

      // Load custom queue config if exists
      if (flowData.customQueueConfig?.type) {
        setCustomQueueType(flowData.customQueueConfig.type)
      }
      
      // Get all node definitions for lookup
      const allNodeDefs = Object.values(NODE_TYPES).flat() as any[]
      
      const flowNodes = flowData.nodes?.map((n: any) => {
        // Validate: must be CUID format (cm...), warn if not
        const isValidCuid = n.id && n.id.startsWith('cm')
        if (!isValidCuid) {
          console.warn('[FlowBuilder] Warning: Node ID is not CUID format:', n.id)
        }
        
        // Try to find definition by type
        const nodeType = n.data?.type || n.type
        const def = allNodeDefs.find((t: any) => t.id === nodeType)
        
        // Uses the same concept as createFlowNode
        return {
          id: n.id,
          type: 'flowNode',
          position: n.position || { x: 100, y: 100 },
          data: {
            type: nodeType,           // Node type: httpRequest, proxy, kafka, etc.
            label: def?.label || n.data?.label || nodeType,
            sub: def?.sub || n.data?.sub || '',
            icon: def?.icon || n.data?.icon || 'N',
            color: def?.color || n.data?.color || 'var(--t-text-secondary)',
            config: n.data?.config || {},
            id: n.id,                 // Same as node id
          },
        }
      }) || []
      
      setNodes(flowNodes)
      // Ensure edges have sourceHandle/targetHandle for proper rendering
      const loadedEdges = (flowData.edges || []).map((e: any) => ({
        ...e,
        type: e.type === 'smoothstep' ? 'step' : (e.type || 'step'),
        sourceHandle: e.sourceHandle || 'bottom',
        targetHandle: e.targetHandle || 'top',
        style: { stroke: '#94A3B8', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8', width: 16, height: 16 },
      }))
      setEdges(loadedEdges)
    } else if (!flowId) {
      setFlowName('untitled-flow')
      setNodes([])
      setEdges([])
    }
  }, [flowData?.id]) // Only re-run when flow ID changes, not entire flowData object

  const saveMutation = useMutation({
    mutationFn: (data: any) => flowId ? flowApi.update(flowId, data) : flowApi.create(data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      if (!flowId && data?.id) router.push(`/flows/builder/${data.id}`)
    },
  })

  const deployMutation = useMutation({
    mutationFn: () => flowApi.deploy(flowId!),
    onSuccess: (data: any) => {
      setIsDeployed(true)
      queryClient.invalidateQueries({ queryKey: ['flow', flowId] })
      alert('Flow deployed successfully to orch-broker!')
    },
    onError: (error: any) => {
      alert(`Deploy failed: ${error.message}`)
    },
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      const url = `/api/v1${testPath}`
      const response = await fetch(url, {
        method: testMethod,
        headers: { 'Content-Type': 'application/json' },
        body: testMethod !== 'GET' ? testBody : undefined,
      })
      const data = await response.json()
      return { status: response.status, data }
    },
    onSuccess: (result) => {
      setTestResponse(result)
    },
    onError: (error: any) => {
      setTestResponse({ error: error.message })
    },
  })

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = createFlowEdge(params.source!, params.target!)
      setEdges((eds) => addEdge({
        ...newEdge,
        sourceHandle: params.sourceHandle || undefined,
        targetHandle: params.targetHandle || undefined,
        type: 'step',
        style: { stroke: '#94A3B8', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8', width: 16, height: 16 },
      }, eds))
    },
    [setEdges]
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds))
    },
    [setEdges]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onDragStart = (e: React.DragEvent, nodeData: any) => {
    e.dataTransfer.setData('node', JSON.stringify(nodeData))
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('node')
    if (!raw) return
    
    const data = JSON.parse(raw)
    
    // Use Node Factory - same standard across the entire system
    const newNode = createFlowNode(
      {
        id: data.id,
        label: data.label,
        sub: data.sub,
        icon: data.icon,
        color: data.color,
      },
      {
        x: e.nativeEvent.offsetX - 68,
        y: e.nativeEvent.offsetY - 22,
      }
    )
    
    console.log('[FlowBuilder] Created node:', {
      id: newNode.id,
      type: newNode.data.type,
      label: newNode.data.label,
    })
    
    setNodes((nds) => [...nds, newNode])
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const deleteNode = () => {
    if (!selectedNode) return
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === 'Delete' || e.key === 'Backspace') deleteNode()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteNode])

  const handleSave = (): Promise<any> => {
    const payload: any = {
      name: flowName,
      description: flowDescription || undefined,
      triggerType,
      executionMode,
      flowCategory,
      executionStrategy,
      nodes,
      edges,
      isActive: isDeployed,
    }

    // Add custom queue config if using custom strategy
    if (executionStrategy === 'custom') {
      payload.customQueueConfig = {
        type: customQueueType,
        config: {},
      }
    }

    return new Promise((resolve, reject) => {
      saveMutation.mutate(payload, {
        onSuccess: resolve,
        onError: reject,
      })
    })
  }

  if (isLoading) return (
    <div style={{
      height: '100%',
      background: THEME.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: FONT,
    }}>
      <div style={{ fontSize: 13, letterSpacing: 2, color: THEME.text.muted }}>LOADING...</div>
    </div>
  )

  return (
    <div style={{
      fontFamily: FONT,
      background: THEME.bg,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      color: THEME.text.primary,
      userSelect: 'none',
      overflow: 'hidden',
    }}>
      {/* TOP BAR */}
      <div style={{
        background: THEME.panel,
        borderBottom: `1px solid ${THEME.border}`,
        height: 42,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ width: 8, height: 8, background: THEME.accent, borderRadius: 1 }} />

        {isEditingName ? (
          <input
            autoFocus
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(false) }}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `1px solid ${THEME.accent}`,
              color: THEME.accent,
              fontFamily: FONT,
              fontSize: 14,
              outline: 'none',
              width: 140,
              fontWeight: 600,
            }}
          />
        ) : (
          <span
            onClick={() => setIsEditingName(true)}
            style={{ color: THEME.accent, fontSize: 14, cursor: 'text', fontWeight: 600 }}
          >
            {flowName}
          </span>
        )}

        <span style={{ color: THEME.border, fontSize: 13 }}>|</span>
        <span style={{ color: THEME.text.muted, fontSize: 13 }}>
          {nodes.length} nodes / {edges.length} edges
        </span>

        <button
          onClick={() => setShowPalette(!showPalette)}
          style={{
            padding: '3px 6px',
            background: showPalette ? `${THEME.accent}15` : 'transparent',
            border: `1px solid ${showPalette ? `${THEME.accent}50` : THEME.border}`,
            borderRadius: 4,
            color: showPalette ? THEME.accent : THEME.text.muted,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            cursor: 'pointer',
          }}
          title={showPalette ? 'Hide node palette' : 'Show node palette'}
        >
          {showPalette ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
        </button>

        <div style={{ flex: 1 }} />

        {['DESIGNER', 'TEST', 'DEPLOY', 'SETTINGS'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab.toLowerCase())}
            style={{
              background: activeTab === tab.toLowerCase() ? `${THEME.accent}10` : 'transparent',
              border: activeTab === tab.toLowerCase() ? `1px solid ${THEME.accent}50` : `1px solid ${THEME.border}`,
              color: activeTab === tab.toLowerCase() ? THEME.accent : THEME.text.muted,
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
              letterSpacing: 1,
              fontFamily: FONT,
              fontWeight: activeTab === tab.toLowerCase() ? 600 : 400,
              borderRadius: 3,
              transition: 'all 0.15s ease',
            }}
          >
            {tab}
          </button>
        ))}

        <div style={{ width: 1, height: 18, background: THEME.border, margin: '0 4px' }} />

        <button 
          onClick={handleSave}
          style={{
            background: 'transparent',
            border: `1px solid ${THEME.border}`,
            color: THEME.text.secondary,
            padding: '4px 12px',
            fontSize: 12,
            cursor: 'pointer',
            letterSpacing: 1,
            fontFamily: FONT,
            borderRadius: 3,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = THEME.accent;
            e.currentTarget.style.color = THEME.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = THEME.border;
            e.currentTarget.style.color = THEME.text.secondary;
          }}
        >
          SAVE
        </button>

        <button
          onClick={() => setActiveTab('test')}
          style={{
            background: THEME.accent,
            border: 'none',
            color: '#f8fafc',
            padding: '4px 14px',
            fontSize: 12,
            cursor: 'pointer',
            letterSpacing: 1,
            fontFamily: FONT,
            fontWeight: 600,
            borderRadius: 3,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#3B82F6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = THEME.accent;
          }}
        >
          TEST
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* SIDEBAR - Only show in designer */}
        {activeTab === 'designer' && showPalette && (
        <div style={{
          width: 180,
          background: THEME.panel,
          borderRight: `1px solid ${THEME.border}`,
          overflowY: 'auto',
          flexShrink: 0,
          transition: 'width 0.2s ease',
        }}>
          {SECTIONS.map(({ key, label }) => (
            <div key={key}>
              <div
                onClick={() => setCollapsed((p) => ({ ...p, [key]: !p[key] }))}
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  letterSpacing: 2,
                  color: THEME.text.muted,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: `1px solid ${THEME.borderLight}`,
                  background: THEME.bg,
                  fontWeight: 600,
                }}
              >
                <span>{label}</span>
                <span style={{ fontSize: 13 }}>{collapsed[key] ? '+' : '−'}</span>
              </div>
              {!collapsed[key] && (NODE_TYPES as any)[key]?.map((node: any) => (
                <div
                  key={node.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, node)}
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'grab',
                    borderBottom: `1px solid ${THEME.borderLight}`,
                    borderLeft: '3px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = THEME.bg;
                    e.currentTarget.style.borderLeftColor = node.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderLeftColor = 'transparent';
                  }}
                >
                  <div style={{
                    width: 26,
                    height: 20,
                    background: node.color + '12',
                    border: '1px solid ' + node.color + '40',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    borderRadius: 3,
                  }}>
                    <span style={{ color: node.color, fontSize: 11, fontWeight: 700 }}>{node.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: THEME.text.primary, fontWeight: 500 }}>{node.label}</div>
                    <div style={{ fontSize: 11, color: THEME.text.muted }}>{node.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          
        </div>
        )}

        {/* CANVAS */}
        {activeTab === 'designer' && (
          <div 
            style={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              edgesReconnectable
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ maxZoom: 0.85, padding: 0.4 }}
              minZoom={0.2}
              maxZoom={2}
              style={{ background: THEME.bg }}
              defaultEdgeOptions={{
                type: 'step',
                style: { stroke: '#94A3B8', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8', width: 16, height: 16 },
              }}
            >
              <Background
                color={THEME.text.muted}
                gap={20}
                size={1}
              />
              <Controls 
                style={{
                  background: THEME.panel,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 4,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              />
            </ReactFlow>

            {nodes.length === 0 && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 32, color: THEME.border, marginBottom: 8, fontWeight: 200 }}>+</div>
                <div style={{ fontSize: 12, letterSpacing: 2, color: THEME.text.muted }}>DRAG NODE TO CANVAS</div>
              </div>
            )}

            {/* Status bar */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 24,
              background: THEME.panel,
              borderTop: `1px solid ${THEME.border}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 16,
              fontFamily: FONT,
              fontSize: 12,
              color: THEME.text.muted,
              letterSpacing: 0.5,
            }}>
              <span>NODES: {nodes.length}</span>
              <span>EDGES: {edges.length}</span>
              {selectedNode && (
                <span style={{ color: THEME.colors.integration }}>
                  SELECTED: {selectedNode.id.toString().slice(0, 8).toUpperCase()}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <span style={{ color: THEME.text.muted }}>DEL to delete</span>
            </div>
          </div>
        )}

        {activeTab === 'test' && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexWrap: 'wrap' as const,
            padding: 'clamp(16px, 4vw, 40px)',
            gap: 24,
            background: THEME.bg,
            fontFamily: FONT,
            overflow: 'auto',
          }}>
            {/* Request Panel */}
            <div style={{
              flex: '1 1 320px',
              maxWidth: 480,
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 4,
              padding: 20,
              height: 'fit-content',
            }}>
              <div style={{ fontSize: 13, letterSpacing: 2, color: THEME.text.muted, marginBottom: 16, fontWeight: 600 }}>TEST REQUEST</div>
              
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {['GET', 'POST', 'PUT', 'DELETE'].map((m) => (
                  <button 
                    key={m} 
                    onClick={() => setTestMethod(m)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      background: testMethod === m ? THEME.accent : THEME.bg,
                      border: `1px solid ${testMethod === m ? THEME.accent : THEME.border}`,
                      color: testMethod === m ? '#f8fafc' : THEME.text.muted,
                      fontSize: 12,
                      letterSpacing: 1,
                      cursor: 'pointer',
                      fontFamily: FONT,
                      borderRadius: 3,
                      fontWeight: 500,
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              
              <input 
                placeholder="/api/v1/..."
                value={testPath}
                onChange={(e) => setTestPath(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: THEME.bg,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.primary,
                  fontSize: 13,
                  fontFamily: FONT,
                  marginBottom: 12,
                  outline: 'none',
                  borderRadius: 3,
                }}
              />
              
              <textarea 
                rows={8}
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                placeholder="{}"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: THEME.bg,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.primary,
                  fontSize: 13,
                  fontFamily: FONT,
                  resize: 'none',
                  marginBottom: 16,
                  outline: 'none',
                  borderRadius: 3,
                }}
              />
              
              <button 
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !testPath}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  background: THEME.accent,
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: 12,
                  letterSpacing: 1,
                  fontWeight: 600,
                  cursor: (testMutation.isPending || !testPath) ? 'not-allowed' : 'pointer',
                  fontFamily: FONT,
                  borderRadius: 3,
                  opacity: (testMutation.isPending || !testPath) ? 0.5 : 1,
                }}
              >
                {testMutation.isPending ? 'EXECUTING...' : 'EXECUTE'}
              </button>
            </div>

            {/* Response Panel */}
            <div style={{
              flex: '1 1 320px',
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 4,
              padding: 20,
              height: 'fit-content',
            }}>
              <div style={{ fontSize: 13, letterSpacing: 2, color: THEME.text.muted, marginBottom: 16, fontWeight: 600 }}>RESPONSE</div>
              
              {testResponse ? (
                <div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    marginBottom: 12,
                    padding: '8px 12px',
                    background: testResponse.error ? '#450a0a' : testResponse.status >= 200 && testResponse.status < 300 ? '#052e16' : '#422006',
                    borderRadius: 3,
                  }}>
                    <span style={{ 
                      fontSize: 14, 
                      fontWeight: 600,
                      color: testResponse.error ? '#ef4444' : testResponse.status >= 200 && testResponse.status < 300 ? '#22c55e' : '#eab308',
                    }}>
                      {testResponse.error ? 'ERROR' : `HTTP ${testResponse.status}`}
                    </span>
                  </div>
                  <pre style={{
                    fontSize: 13,
                    fontFamily: FONT,
                    background: THEME.bg,
                    padding: 12,
                    borderRadius: 3,
                    overflow: 'auto',
                    maxHeight: 400,
                    border: `1px solid ${THEME.border}`,
                    color: THEME.text.secondary,
                  }}>
                    {JSON.stringify(testResponse.error ? { error: testResponse.error } : testResponse.data, null, 2)}
                  </pre>
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px 0',
                  color: THEME.text.muted,
                  fontSize: 13,
                }}>
                  Execute a request to see the response
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'deploy' && (() => {
          const strategyInfo = EXECUTION_STRATEGIES.find(s => s.id === executionStrategy)!
          const asyncNodeCount = nodes.filter((n: any) => {
            const cfg = n.data?.config || {}
            const asyncDefaults = ['eventLog', 'audit', 'pubsub', 'kafka']
            const mode = cfg.executionMode || (asyncDefaults.includes(n.data?.type) ? 'async' : 'sync')
            return mode === 'async'
          }).length
          const syncNodeCount = nodes.length - asyncNodeCount

          const InfoRow = ({ label, value, color: c }: { label: string; value: string; color?: string }) => (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${THEME.borderLight}` }}>
              <span style={{ fontSize: 12, color: THEME.text.muted, letterSpacing: 0.5 }}>{label}</span>
              <span style={{ fontSize: 12, color: c || THEME.text.primary, fontWeight: 600 }}>{value}</span>
            </div>
          )

          return (
            <div style={{
              flex: 1,
              minHeight: 0,
              padding: 'clamp(12px, 2vw, 24px)',
              background: THEME.bg,
              fontFamily: FONT,
              overflowY: 'auto',
            }}>
              {/* Two-column responsive grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, maxWidth: 1100 }}>

                {/* Left Column: Header + Flow Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Header */}
                  <div style={{
                    background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 4,
                    padding: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: 2,
                        background: isDeployed ? '#10B981' : THEME.border,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text.primary }}>{flowName}</div>
                        <div style={{ fontSize: 12, color: THEME.text.muted, marginTop: 2 }}>
                          {flowDescription || 'No description'}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 11, fontWeight: 600, letterSpacing: 1,
                        padding: '4px 10px', borderRadius: 3,
                        background: isDeployed ? '#10B98118' : `${THEME.border}40`,
                        color: isDeployed ? '#10B981' : THEME.text.muted,
                        border: `1px solid ${isDeployed ? '#10B98140' : THEME.border}`,
                        flexShrink: 0,
                      }}>
                        {isDeployed ? 'ACTIVE' : 'DRAFT'}
                      </div>
                    </div>

                    <InfoRow label="Flow ID" value={flowId?.slice(0, 12).toUpperCase() + '...' || 'Not saved'} color={THEME.text.muted} />
                    <InfoRow label="Trigger Type" value={triggerType} />
                    <InfoRow label="Execution Mode" value={executionMode} />
                    <InfoRow label="Category" value={flowCategory} />
                  </div>

                  {/* Execution Strategy */}
                  <div style={{
                    background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 4,
                    padding: 20,
                  }}>
                    <div style={{ fontSize: 12, letterSpacing: 2, color: THEME.text.muted, marginBottom: 12, fontWeight: 600 }}>EXECUTION STRATEGY</div>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {EXECUTION_STRATEGIES.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setExecutionStrategy(s.id as any)}
                          style={{
                            flex: 1, padding: '10px 8px', borderRadius: 4, cursor: 'pointer',
                            border: `1px solid ${executionStrategy === s.id ? s.color + '60' : THEME.border}`,
                            background: executionStrategy === s.id ? s.color + '10' : THEME.bg,
                            fontFamily: FONT, transition: 'all 0.15s',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: executionStrategy === s.id ? s.color : THEME.text.secondary }}>
                            {s.label}
                          </div>
                          <div style={{ fontSize: 10, color: THEME.text.muted, marginTop: 2 }}>{s.sub}</div>
                        </button>
                      ))}
                    </div>

                    <div style={{
                      fontSize: 11, color: THEME.text.muted, padding: 8,
                      background: THEME.bg, borderRadius: 3,
                    }}>
                      {strategyInfo.desc}
                    </div>

                    {executionStrategy === 'custom' && (
                      <div style={{ marginTop: 10 }}>
                        <InfoRow label="Queue Type" value={customQueueType.toUpperCase()} color={strategyInfo.color} />
                        <InfoRow label="Sync Nodes" value={String(syncNodeCount)} />
                        <InfoRow label="Async Nodes" value={String(asyncNodeCount)} color="#F59E0B" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Flow Composition + Deploy */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Flow Composition */}
                  <div style={{
                    background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 4,
                    padding: 20,
                  }}>
                    <div style={{ fontSize: 12, letterSpacing: 2, color: THEME.text.muted, marginBottom: 12, fontWeight: 600 }}>FLOW COMPOSITION</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'NODES', value: nodes.length, color: THEME.accent },
                        { label: 'EDGES', value: edges.length, color: THEME.colors.integration },
                        { label: 'ASYNC', value: asyncNodeCount, color: '#F59E0B' },
                      ].map(item => (
                        <div key={item.label} style={{
                          textAlign: 'center', padding: '12px 8px',
                          background: THEME.bg, borderRadius: 4,
                          border: `1px solid ${THEME.borderLight}`,
                        }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                          <div style={{ fontSize: 10, letterSpacing: 1.5, color: THEME.text.muted, marginTop: 4 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Node list */}
                    <div style={{ marginTop: 12 }}>
                      {nodes.map((n: any, i: number) => {
                        const cfg = n.data?.config || {}
                        const asyncDefaults = ['eventLog', 'audit', 'pubsub', 'kafka']
                        const mode = cfg.executionMode || (asyncDefaults.includes(n.data?.type) ? 'async' : 'sync')
                        return (
                          <div key={n.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 8px', borderRadius: 3,
                            background: i % 2 === 0 ? 'transparent' : `${THEME.bg}60`,
                          }}>
                            <div style={{
                              width: 6, height: 6, borderRadius: 1,
                              background: n.data?.color || THEME.text.muted,
                            }} />
                            <span style={{ fontSize: 12, color: THEME.text.primary, flex: 1 }}>{n.data?.label}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
                              color: mode === 'async' ? '#F59E0B' : THEME.text.muted,
                            }}>
                              {mode.toUpperCase()}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Deploy Button */}
                  <button
                    onClick={async () => {
                      try {
                        await handleSave()

                        // Validate all nodes before deploying
                        const validationErrors: string[] = []
                        for (const node of nodes) {
                          const nodeData = node.data as any
                          const config = nodeData?.config || {}
                          const nodeType = nodeData?.type

                          // Basic required field checks
                          if (nodeType === 'eventLog' && !config.event && !config.message) {
                            validationErrors.push(`Node "${nodeData?.label || node.id}": Event name or message is required`)
                          }
                          if (nodeType === 'proxy' && !config.targetUrl && !config.serviceName) {
                            validationErrors.push(`Node "${nodeData?.label || node.id}": Target URL or service name is required`)
                          }
                          if (nodeType === 'audit' && !config.action) {
                            validationErrors.push(`Node "${nodeData?.label || node.id}": Audit action is required`)
                          }
                          if (nodeType === 'httpCall' && !config.url) {
                            validationErrors.push(`Node "${nodeData?.label || node.id}": URL is required`)
                          }
                        }

                        if (validationErrors.length > 0) {
                          toast.error(`Validation failed:\n${validationErrors.join('\n')}`)
                          return
                        }

                        deployMutation.mutate()
                      } catch (err) {
                        console.error('[FlowBuilder] Save failed, skipping deploy:', err)
                      }
                    }}
                    disabled={!flowId || deployMutation.isPending || nodes.length === 0}
                    style={{
                      width: '100%',
                      padding: '14px 0',
                      background: isDeployed ? 'transparent' : THEME.accent,
                      border: `1.5px solid ${THEME.accent}`,
                      color: isDeployed ? THEME.accent : '#f8fafc',
                      fontSize: 13,
                      letterSpacing: 1.5,
                      fontWeight: 700,
                      cursor: (!flowId || deployMutation.isPending || nodes.length === 0) ? 'not-allowed' : 'pointer',
                      fontFamily: FONT,
                      borderRadius: 4,
                      transition: 'all 0.15s ease',
                      opacity: (!flowId || deployMutation.isPending || nodes.length === 0) ? 0.5 : 1,
                    }}
                  >
                    {deployMutation.isPending ? 'DEPLOYING...' : isDeployed ? 'REDEPLOY TO BROKER' : 'DEPLOY TO BROKER'}
                  </button>

                  {!flowId && (
                    <div style={{ fontSize: 11, color: '#EF4444', textAlign: 'center' }}>
                      Save the flow first before deploying
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* SETTINGS TAB CONTENT */}
        {activeTab === 'settings' && (
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px',
            fontFamily: FONT,
            background: THEME.bg,
          }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              {/* Page Header */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <SettingsIcon className="w-5 h-5" style={{ color: THEME.accent }} />
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: THEME.text.primary, margin: 0, letterSpacing: 0.5 }}>
                    Flow Settings
                  </h2>
                </div>
                <p style={{ fontSize: 13, color: THEME.text.muted, margin: 0, lineHeight: 1.5 }}>
                  General flow settings and execution strategy
                </p>
              </div>

              {/* Section: General */}
              <div style={{
                background: THEME.panel,
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                padding: '18px 20px',
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.text.muted, letterSpacing: 2, marginBottom: 14 }}>
                  GENERAL
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: THEME.text.secondary, display: 'block', marginBottom: 5, fontWeight: 500 }}>
                    Description
                  </label>
                  <textarea
                    value={flowDescription}
                    onChange={(e) => setFlowDescription(e.target.value)}
                    placeholder="Flow description..."
                    rows={3}
                    style={{
                      width: '100%', padding: '8px 10px', fontSize: 13,
                      border: `1px solid ${THEME.border}`, borderRadius: 4,
                      background: THEME.bg, color: THEME.text.primary,
                      resize: 'vertical', fontFamily: FONT,
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: THEME.text.secondary, display: 'block', marginBottom: 5, fontWeight: 500 }}>
                      Trigger Type
                    </label>
                    <Select
                      value={triggerType}
                      onChange={(v) => setTriggerType(v)}
                      options={[
                        { value: 'HTTP', label: 'HTTP' },
                        { value: 'KAFKA_CONSUMER', label: 'Kafka Consumer' },
                        { value: 'SCHEDULER', label: 'Scheduler' },
                        { value: 'WEBHOOK', label: 'Webhook' },
                        { value: 'MESSAGE_QUEUE', label: 'Message Queue' },
                      ]}
                      size="sm"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: THEME.text.secondary, display: 'block', marginBottom: 5, fontWeight: 500 }}>
                      Execution Mode
                    </label>
                    <Select
                      value={executionMode}
                      onChange={(v) => setExecutionMode(v)}
                      options={[
                        { value: 'SYNC', label: 'Synchronous' },
                        { value: 'ASYNC', label: 'Asynchronous' },
                      ]}
                      size="sm"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, color: THEME.text.secondary, display: 'block', marginBottom: 5, fontWeight: 500 }}>
                    Category
                  </label>
                  <Select
                    value={flowCategory}
                    onChange={(v) => setFlowCategory(v)}
                    options={[
                      { value: 'API_GATEWAY', label: 'API Gateway' },
                      { value: 'CONSUMER', label: 'Consumer' },
                      { value: 'HYBRID', label: 'Hybrid' },
                    ]}
                    size="sm"
                  />
                </div>
              </div>

              {/* Section: Execution Strategy */}
              <div style={{
                background: THEME.panel,
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                padding: '18px 20px',
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.text.muted, letterSpacing: 2, marginBottom: 14 }}>
                  EXECUTION STRATEGY
                </div>

                <div style={{ marginBottom: 12 }}>
                  <Select
                    value={executionStrategy}
                    onChange={(value) => setExecutionStrategy(value as 'fast' | 'reliable' | 'custom')}
                    options={EXECUTION_STRATEGIES.map(s => ({
                      value: s.id,
                      label: `${s.label} - ${s.sub}`
                    }))}
                    size="sm"
                  />
                </div>

                <div style={{
                  fontSize: 12,
                  color: THEME.text.secondary,
                  padding: '10px 12px',
                  background: `${THEME.bg}80`,
                  border: `1px solid ${THEME.borderLight}`,
                  borderRadius: 4,
                  lineHeight: 1.5,
                }}>
                  {EXECUTION_STRATEGIES.find(s => s.id === executionStrategy)?.desc}
                </div>

                {executionStrategy === 'custom' && (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, color: THEME.text.secondary, display: 'block', marginBottom: 5, fontWeight: 500 }}>
                      Queue Type
                    </label>
                    <Select
                      value={customQueueType}
                      onChange={(value) => setCustomQueueType(value as 'kafka' | 'rabbitmq' | 'sqs')}
                      options={QUEUE_TYPES}
                      size="sm"
                    />
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setActiveTab('designer')}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${THEME.border}`,
                    color: THEME.text.secondary,
                    padding: '8px 18px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: FONT,
                    borderRadius: 4,
                    letterSpacing: 1,
                    fontWeight: 500,
                  }}
                >
                  BACK TO DESIGNER
                </button>
                <button
                  onClick={handleSave}
                  style={{
                    background: THEME.accent,
                    border: 'none',
                    color: '#fff',
                    padding: '8px 24px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: FONT,
                    borderRadius: 4,
                    letterSpacing: 1,
                  }}
                >
                  SAVE SETTINGS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PROPERTIES PANEL - Only in designer when node selected */}
        {activeTab === 'designer' && selectedNode && (
        <div style={{
          width: 220,
          background: THEME.panel,
          borderLeft: `1px solid ${THEME.border}`,
          flexShrink: 0,
          fontFamily: FONT,
          overflowY: 'auto',
        }}>
          <div style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${THEME.borderLight}`,
            fontSize: 12,
            letterSpacing: 2,
            color: THEME.text.muted,
            background: THEME.bg,
            fontWeight: 600,
          }}>
            PROPERTIES
          </div>

          {selectedNode ? (
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 32,
                  height: 24,
                  border: `1px solid ${String(selectedNode.data.color)}50`,
                  background: String(selectedNode.data.color) + '10',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 3,
                }}>
                  <span style={{ color: String(selectedNode.data.color), fontSize: 11, fontWeight: 700 }}>
                    {String(selectedNode.data.icon)}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: THEME.text.primary, fontWeight: 600 }}>{String(selectedNode.data.label)}</div>
                  <div style={{ fontSize: 11, color: THEME.text.muted }}>{String(selectedNode.data.sub)}</div>
                </div>
              </div>

              {[
                ['ID', selectedNode.id.toString().slice(0, 8).toUpperCase()],
                ['Type', String(selectedNode.data.label)],
                ['X', Math.round(selectedNode.position.x) + 'px'],
                ['Y', Math.round(selectedNode.position.y) + 'px'],
              ].map(([k, v]) => (
                <div key={k} style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: THEME.text.muted, letterSpacing: 0.5 }}>{k}</span>
                  <span style={{ fontSize: 12, color: String(selectedNode.data.color), fontWeight: 500 }}>{v}</span>
                </div>
              ))}

              {/* Node Config Panel */}
              <NodeConfigPanel 
                node={selectedNode} 
                onChange={(newData) => {
                  setNodes((nds) => nds.map((n) => 
                    n.id === selectedNode.id ? { ...n, data: newData } : n
                  ))
                  setSelectedNode({ ...selectedNode, data: newData })
                }}
              />

              <button
                onClick={deleteNode}
                style={{
                  width: '100%',
                  marginTop: 16,
                  background: 'transparent',
                  border: `1px solid ${THEME.colors.output}40`,
                  color: THEME.colors.output,
                  padding: '6px 0',
                  fontSize: 12,
                  letterSpacing: 1,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  borderRadius: 3,
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${THEME.colors.output}10`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                DELETE
              </button>
            </div>
          ) : (
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 13, color: THEME.text.muted }}>No node selected</div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
