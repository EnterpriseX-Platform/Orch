'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { flowApi } from '@/lib/api'
import cuid from 'cuid'
import {
  ReactFlow,
  Background,
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
  MiniMap,
  Panel,
  useReactFlow,
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
  Plus,
  X,
  Copy,
  Trash2,
  Minus,
  Maximize2,
  LayoutGrid,
  Check,
  Rocket,
  Save,
  FlaskConical,
  Workflow as WorkflowIcon,
  Undo2,
  Redo2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'
import { confirmDialog } from '@/components/common/ConfirmDialog'

// Import Orch SDK
import { NodeRegistry, registerBuiltins } from '@orch/sdk'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif';

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
    triggers: '#0f62fe',     // Blue-500
    extract: '#8a3ffc',      // Violet-500
    integration: '#24a148',  // Emerald-500
    actions: '#ba4e00',      // Amber-500
    output: '#da1e28',       // Red-500
    logic: '#1192e8',        // Cyan-500
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
    { id: "extract", label: "Extract Fields", sub: "Parse Data", icon: "E", color: "#6929c4" },
    { id: "jsonPath", label: "JSON Path", sub: "Query JSON", icon: "J", color: "#6929c4" },
    { id: "xpath", label: "XPath", sub: "Query XML", icon: "X", color: "#6929c4" },
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
    color: '#24a148',
  },
  { 
    id: 'reliable', 
    label: 'Reliable', 
    sub: 'All via Kafka',
    desc: 'Queue all nodes through Kafka for guaranteed delivery and durability.',
    color: '#0f62fe',
  },
  { 
    id: 'custom', 
    label: 'Custom', 
    sub: 'Configurable',
    desc: 'Choose queue type per node. Advanced configuration required.',
    color: '#8a3ffc',
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
      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>
          Execution mode
        </label>
        <div style={{ display: 'flex', gap: 0, border: '1px solid #8d8d8d' }}>
          {(['sync', 'async'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => updateConfig('executionMode', mode)}
              style={{
                flex: 1, height: 32, fontSize: 13, cursor: 'pointer', border: 'none',
                fontFamily: FONT,
                background: currentMode === mode ? '#161616' : '#ffffff',
                color: currentMode === mode ? '#ffffff' : '#161616',
              }}
            >
              {mode === 'sync' ? 'Sync' : 'Async'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#6f6f6f', marginTop: 4 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Topic *</label>
              <input
                type="text"
                value={config.topic || ''}
                onChange={(e) => updateConfig('topic', e.target.value)}
                placeholder="e.g., payment-events"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Consumer Group</label>
              <input
                type="text"
                value={config.consumerGroup || ''}
                onChange={(e) => updateConfig('consumerGroup', e.target.value)}
                placeholder="e.g., flow-consumer"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
          </div>
        )
      
      case 'httpCall':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>URL *</label>
              <input
                type="text"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                placeholder="https://api.example.com/users"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Method</label>
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
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Response Type</label>
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
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Timeout (ms)</label>
              <input
                type="number"
                value={config.timeout || 10000}
                onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            {renderExecModeToggle()}
          </div>
        )

      case 'proxy':
      case 'callService':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Target URL</label>
              <input
                type="text"
                value={config.targetUrl || ''}
                onChange={(e) => updateConfig('targetUrl', e.target.value)}
                placeholder="${backendUrl} or https://api.example.com"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Method</label>
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
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Timeout (ms)</label>
              <input
                type="number"
                value={config.timeout || 30000}
                onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>

            {/* Forward Headers */}
            <div style={{ marginTop: 4 }}>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>
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
                    fontSize: 13, color: '#161616', cursor: 'pointer',
                    padding: '4px 0',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked ? fwd.filter(x => x !== h) : [...fwd, h]
                        updateConfig('forwardHeaders', next)
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    {h}
                  </label>
                )
              })}
            </div>

            {/* Custom Headers */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Custom Headers</label>
                <button
                  onClick={() => {
                    const headers = config.headers || {}
                    updateConfig('headers', { ...headers, '': '' })
                  }}
                  className="h-8 px-2 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8] inline-flex items-center gap-1"
                ><Plus className="w-4 h-4" /> Add</button>
              </div>
              {Object.entries(config.headers || {}).map(([key, val], i) => (
                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                  <input
                    placeholder="Key"
                    value={key}
                    onChange={(e) => {
                      const entries = Object.entries(config.headers || {})
                      entries[i] = [e.target.value, entries[i][1]]
                      updateConfig('headers', Object.fromEntries(entries))
                    }}
                    style={{ flex: 1, minWidth: 0, padding: '6px 10px' }}
                  />
                  <input
                    placeholder="Value"
                    value={val as string}
                    onChange={(e) => {
                      const entries = Object.entries(config.headers || {})
                      entries[i] = [entries[i][0], e.target.value]
                      updateConfig('headers', Object.fromEntries(entries))
                    }}
                    style={{ flex: 1, minWidth: 0, padding: '6px 10px' }}
                  />
                  <button
                    onClick={() => {
                      const entries = Object.entries(config.headers || {})
                      entries.splice(i, 1)
                      updateConfig('headers', Object.fromEntries(entries))
                    }}
                    aria-label="Remove header"
                    className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center text-[#da1e28] hover:bg-[#fff1f1]"
                  ><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            {renderExecModeToggle()}
          </div>
        )
      
      case 'eventLog':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Event Name</label>
              <input
                type="text"
                value={config.event || ''}
                onChange={(e) => updateConfig('event', e.target.value)}
                placeholder="e.g., PAYMENT_PROCESSED"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            {/* Message */}
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Message</label>
              <textarea
                value={config.message || ''}
                onChange={(e) => updateConfig('message', e.target.value)}
                placeholder="Log message (supports ${variables})"
                rows={3}
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Level</label>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Action *</label>
              <input
                type="text"
                value={config.action || ''}
                onChange={(e) => updateConfig('action', e.target.value)}
                placeholder="e.g., CREATE_PAYMENT"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Entity Type</label>
              <input
                type="text"
                value={config.entityType || ''}
                onChange={(e) => updateConfig('entityType', e.target.value)}
                placeholder="e.g., Payment"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Entity ID (template)</label>
              <input
                type="text"
                value={config.entityId || ''}
                onChange={(e) => updateConfig('entityId', e.target.value)}
                placeholder="${request.body.id}"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>PK XPath (JSONPath)</label>
              <input
                type="text"
                value={config.auditPkXPath || ''}
                onChange={(e) => updateConfig('auditPkXPath', e.target.value)}
                placeholder="$.id"
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div style={{ marginTop: 8, padding: 12, background: '#f4f4f4' }}>
              <div style={{ fontSize: 12, color: '#161616', fontWeight: 600, marginBottom: 8 }}>
                Array comparison (PUT/PATCH)
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Array Path</label>
                <input
                  type="text"
                  value={config.arrayPath || ''}
                  onChange={(e) => updateConfig('arrayPath', e.target.value)}
                  placeholder="$.orders"
                  style={{ width: '100%', padding: '6px 12px' }}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Array Key Field</label>
                <input
                  type="text"
                  value={config.arrayKeyField || ''}
                  onChange={(e) => updateConfig('arrayKeyField', e.target.value)}
                  placeholder="id (optional)"
                  style={{ width: '100%', padding: '6px 12px' }}
                />
              </div>
            </div>
            {renderExecModeToggle()}
          </div>
        )

      case 'response':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Status Code</label>
              <input
                type="number"
                value={config.statusCode || 200}
                onChange={(e) => updateConfig('statusCode', parseInt(e.target.value))}
                style={{ width: '100%', padding: '6px 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>Body Source</label>
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
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#161616', marginBottom: 12 }}>
        Configuration
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
const NODE_WIDTH = 184
const NODE_MIN_HEIGHT = 56

// Icon per node type (falls back to the letter badge from NODE_TYPES).
const NODE_ICONS: Record<string, LucideIcon> = {
  httpRequest: Globe, webhook: Webhook, kafka: Radio, schedule: Calendar,
  extract: Search, jsonPath: FileJson, xpath: FileText,
  eventLog: FileText, audit: Shield, database: Database, cache: HardDrive,
  httpCall: Globe2, proxy: ArrowLeftRight, callService: Layers, transform: RefreshCw,
  pubsub: Radio, script: Code,
  response: CheckCircle2, error: XCircle, end: Flag,
}

// Section (category) a node type belongs to, for the small uppercase label.
const NODE_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(NODE_TYPES).flatMap(([section, defs]) => (defs as any[]).map((d) => [d.id, section])),
)
const SECTION_LABEL: Record<string, string> = Object.fromEntries(SECTIONS.map((x) => [x.key, x.label]))

function NodeIcon({ type, letter, color, size = 28 }: { type: string; letter?: string; color: string; size?: number }) {
  const Icon = NODE_ICONS[type]
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `${color}14`, color,
    }}>
      {Icon ? <Icon style={{ width: size * 0.55, height: size * 0.55 }} /> : <span style={{ fontSize: 11, fontWeight: 700 }}>{letter}</span>}
    </div>
  )
}

const handleStyle = {
  width: 9,
  height: 9,
  background: '#ffffff',
  border: '1.5px solid #8d8d8d',
  borderRadius: '50%',
}

// ==================== NODE COMPONENT ====================
// Compact step card (robotfactory style): icon, small uppercase category,
// name, one-line summary. Selection = dark 2px outline, no colour flood.
const FlowNode = ({ data, selected }: any) => {
  const color = data.color || THEME.colors.triggers
  const execMode = data.config?.executionMode
  const section = SECTION_LABEL[NODE_SECTION[data.type]] || 'STEP'

  return (
    <div
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_MIN_HEIGHT,
        background: '#ffffff',
        border: `1px solid ${selected ? '#161616' : '#c6c6c6'}`,
        outline: selected ? '1px solid #161616' : 'none',
        cursor: 'grab',
        fontFamily: FONT,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
      }}
    >
      <NodeIcon type={data.type} letter={data.icon} color={color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, letterSpacing: 0.4, color: '#6f6f6f', lineHeight: '12px' }}>{section}</div>
        <div style={{
          fontSize: 13, color: '#161616', fontWeight: 600, lineHeight: '18px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{data.displayName || data.label}</div>
        <div style={{ fontSize: 11, color: '#6f6f6f', lineHeight: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.sub}
        </div>
      </div>

      {execMode === 'async' && (
        <span className="cds-tag" style={{
          position: 'absolute', top: -9, right: 8,
          fontSize: 10, lineHeight: '14px', padding: '1px 6px',
          color: '#8a3800', background: '#ffd8bd',
        }}>async</span>
      )}

      {/* Handles - 4 directions */}
      <Handle type="target" id="left" position={Position.Left} style={{ ...handleStyle, left: -5 }} />
      <Handle type="source" id="right" position={Position.Right} style={{ ...handleStyle, right: -5 }} />
      <Handle type="target" id="top" position={Position.Top} style={{ ...handleStyle, top: -5 }} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={{ ...handleStyle, bottom: -5 }} />
    </div>
  )
}

const nodeTypes = {
  flowNode: FlowNode,
}

// Zoom bar (bottom-left, inside <ReactFlow> so it can use the flow instance).
function ZoomBar() {
  const { zoomIn, zoomOut, fitView, getZoom } = useReactFlow()
  const [zoom, setZoom] = useState(100)
  useEffect(() => {
    const t = setInterval(() => setZoom(Math.round(getZoom() * 100)), 300)
    return () => clearInterval(t)
  }, [getZoom])
  const btn = 'h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8] text-[#161616]'
  return (
    <Panel position="bottom-left">
      <div className="flex items-center bg-white border border-[#c6c6c6]">
        <button className={btn} onClick={() => zoomOut()} aria-label="Zoom out"><Minus className="w-4 h-4" /></button>
        <span className="w-12 text-center text-[12px] tabular-nums text-[#161616]">{zoom}%</span>
        <button className={btn} onClick={() => zoomIn()} aria-label="Zoom in"><Plus className="w-4 h-4" /></button>
        <span className="w-px h-5 bg-[#e0e0e0]" />
        <button className={btn} onClick={() => fitView({ padding: 0.3, maxZoom: 1 })} aria-label="Fit to screen"><Maximize2 className="w-4 h-4" /></button>
      </div>
    </Panel>
  )
}

/** Left-to-right layered layout: depth from the roots, rows in order of discovery. */
function tidyLayout(nodes: Node[], edges: Edge[]): Node[] {
  const incoming = new Map<string, number>()
  nodes.forEach((n) => incoming.set(n.id, 0))
  edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) || 0) + 1))
  const depth = new Map<string, number>()
  const queue = nodes.filter((n) => !incoming.get(n.id)).map((n) => n.id)
  if (queue.length === 0 && nodes[0]) queue.push(nodes[0].id)
  queue.forEach((id) => depth.set(id, 0))
  while (queue.length) {
    const id = queue.shift()!
    for (const e of edges.filter((x) => x.source === id)) {
      if (!depth.has(e.target)) {
        depth.set(e.target, (depth.get(id) || 0) + 1)
        queue.push(e.target)
      }
    }
  }
  let maxDepth = Math.max(0, ...Array.from(depth.values()))
  nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, ++maxDepth) })
  const rows = new Map<number, number>()
  return nodes.map((n) => {
    const d = depth.get(n.id) || 0
    const r = rows.get(d) || 0
    rows.set(d, r + 1)
    return { ...n, position: { x: 80 + d * (NODE_WIDTH + 72), y: 80 + r * 112 } }
  })
}

const EDGE_STYLE = { stroke: '#8d8d8d', strokeWidth: 1.5 }
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: '#8d8d8d', width: 14, height: 14 }

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
  // Right panel: step inspector, "Add step" palette, or closed.
  const [panelMode, setPanelMode] = useState<'inspector' | 'palette' | null>(null)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  
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
        style: EDGE_STYLE,
        markerEnd: EDGE_MARKER,
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
      toast.success('Deployed to Orch Broker')
    },
    onError: (error: any) => {
      toast.error(`Deploy failed: ${error.message}`)
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
        style: EDGE_STYLE,
        markerEnd: EDGE_MARKER,
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
    setPanelMode('inspector')
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
    setPanelMode(null)
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

  // ---------- editor helpers (presentation only) ----------
  const snapshotOf = (ns: Node[], es: Edge[]) =>
    JSON.stringify({
      n: ns.map((n) => ({ id: n.id, p: n.position, d: (n.data as any)?.config, t: (n.data as any)?.displayName })),
      e: es.map((e) => [e.source, e.target, e.sourceHandle, e.targetHandle]),
      name: flowName,
      meta: [flowDescription, triggerType, executionMode, flowCategory, executionStrategy, customQueueType],
    })
  const currentSnapshot = snapshotOf(nodes, edges)
  // First render after load becomes the "saved" baseline.
  useEffect(() => {
    if (savedSnapshot !== null) return
    const loaded = !flowId || (flowData && nodes.length === (flowData.nodes?.length || 0))
    if (loaded) setSavedSnapshot(currentSnapshot)
  }, [savedSnapshot, flowData, flowId, nodes.length, currentSnapshot])

  // Pick edge handles by geometry for display (saved edges keep their data):
  // side-by-side steps join right→left, stacked steps bottom→top.
  const displayEdges = edges.map((e) => {
    const s = nodes.find((n) => n.id === e.source)
    const t = nodes.find((n) => n.id === e.target)
    if (!s || !t) return e
    const dx = t.position.x - s.position.x
    const dy = t.position.y - s.position.y
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    return {
      ...e,
      type: 'smoothstep',
      animated: false,
      sourceHandle: horizontal ? 'right' : 'bottom',
      targetHandle: horizontal ? 'left' : 'top',
    }
  })
  const isDirty = savedSnapshot !== null && savedSnapshot !== currentSnapshot

  // ---------- Undo / redo (snapshots of nodes+edges, debounced so a drag is one step) ----------
  const past = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const future = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const lastState = useRef<{ nodes: Node[]; edges: Edge[]; snap: string } | null>(null)
  const applyingHistory = useRef(false)
  const [, setHistoryTick] = useState(0)
  useEffect(() => {
    if (savedSnapshot === null) return
    const t = setTimeout(() => {
      if (applyingHistory.current) {
        applyingHistory.current = false
      } else if (lastState.current && lastState.current.snap !== currentSnapshot) {
        past.current.push({ nodes: lastState.current.nodes, edges: lastState.current.edges })
        if (past.current.length > 100) past.current.shift()
        future.current = []
      }
      lastState.current = { nodes, edges, snap: currentSnapshot }
      setHistoryTick((x) => x + 1)
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnapshot, savedSnapshot])

  const restore = (state: { nodes: Node[]; edges: Edge[] }) => {
    applyingHistory.current = true
    setNodes(state.nodes)
    setEdges(state.edges)
    setSelectedNode(null)
    setPanelMode((m) => (m === 'inspector' ? null : m))
  }
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push({ nodes, edges })
    restore(prev)
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push({ nodes, edges })
    restore(next)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Warn before leaving with unsaved changes (not when the user chose Discard).
  const allowLeave = useRef(false)
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeave.current) return
      e.preventDefault(); e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const discardChanges = async () => {
    const ok = await confirmDialog({
      title: 'Discard changes?',
      body: 'All unsaved changes will be lost and the flow returns to its last saved state.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      variant: 'danger',
    })
    if (ok) { allowLeave.current = true; window.location.reload() }
  }

  const saveWithFeedback = () =>
    handleSave()
      .then(() => {
        setSavedSnapshot(currentSnapshot)
        toast.success('Flow saved')
      })
      .catch((e: any) => toast.error(`Save failed: ${e?.message ?? e}`))

  const allNodeDefs = Object.entries(NODE_TYPES).flatMap(([section, defs]) =>
    (defs as any[]).map((d) => ({ ...d, section })),
  )
  const paletteMatches = allNodeDefs.filter((d) => {
    const q = paletteQuery.trim().toLowerCase()
    return !q || d.label.toLowerCase().includes(q) || d.sub.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
  })

  /** Add a step after the selected one (and connect it), else at the end of the canvas. */
  const addStep = (def: any) => {
    const anchor = selectedNode ? nodes.find((n) => n.id === selectedNode.id) : null
    const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), 0)
    const position = anchor
      ? { x: anchor.position.x + NODE_WIDTH + 72, y: anchor.position.y }
      : { x: nodes.length ? maxX + NODE_WIDTH + 72 : 120, y: 120 }
    // Drop to the next free row if another step already sits there.
    const taken = (p: { x: number; y: number }) =>
      nodes.some((n) => Math.abs(n.position.x - p.x) < NODE_WIDTH && Math.abs(n.position.y - p.y) < 90)
    while (taken(position)) position.y += 112
    const newNode = createFlowNode(
      { id: def.id, label: def.label, sub: def.sub, icon: def.icon, color: def.color },
      position,
    )
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), { ...newNode, selected: true }])
    if (anchor) {
      setEdges((eds) => addEdge({
        ...createFlowEdge(anchor.id, newNode.id),
        sourceHandle: 'right', targetHandle: 'left',
        style: EDGE_STYLE, markerEnd: EDGE_MARKER,
      }, eds))
    }
    setSelectedNode(newNode)
    setPanelMode('inspector')
    setPaletteQuery('')
  }

  const duplicateNode = () => {
    if (!selectedNode) return
    const copy = createFlowNode(
      {
        id: String(selectedNode.data.type), label: String(selectedNode.data.label), sub: String(selectedNode.data.sub),
        icon: String(selectedNode.data.icon), color: String(selectedNode.data.color),
      },
      { x: selectedNode.position.x + 40, y: selectedNode.position.y + 80 },
      JSON.parse(JSON.stringify((selectedNode.data as any).config || {})),
    )
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), { ...copy, selected: true }])
    setSelectedNode(copy)
  }

  const tidyUp = () => setNodes((nds) => tidyLayout(nds, edges))

  const VIEWS = [
    { id: 'designer', label: 'Designer' },
    { id: 'test', label: 'Test' },
    { id: 'deploy', label: 'Deploy' },
    { id: 'settings', label: 'Settings' },
  ]

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
      overflow: 'hidden',
    }}>
      {/* TOOLBAR (one row: name · state · views · actions) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 min-h-14 flex-shrink-0 bg-white border-b border-[#e0e0e0]">
        <WorkflowIcon className="w-5 h-5 flex-shrink-0 text-[#525252]" />
        {isEditingName ? (
          <input
            autoFocus
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(false) }}
            className="h-8 px-2 text-[16px] bg-[#f4f4f4] border-0 border-b-2 border-b-[#0f62fe] outline-none w-64"
          />
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            title="Click to rename"
            className="text-[16px] font-semibold text-[#161616] truncate min-w-[120px] max-w-[280px] hover:bg-[#e8e8e8] px-2 h-8"
          >
            {flowName}
          </button>
        )}
        <span className="text-[12px] whitespace-nowrap flex items-center gap-1.5" style={{ color: isDirty ? '#8a3800' : '#6f6f6f' }}>
          {isDirty ? <span className="w-1.5 h-1.5 rounded-full bg-[#f1c21b]" /> : <Check className="w-3.5 h-3.5" />}
          {isDirty ? 'Unsaved changes' : 'Saved'}
        </span>
        <div className="flex items-center">
          <button onClick={undo} disabled={!past.current.length} title="Undo (Ctrl/⌘+Z)" aria-label="Undo"
            className="h-8 w-8 inline-flex items-center justify-center text-[#161616] hover:bg-[#e8e8e8] disabled:text-[#c6c6c6] disabled:hover:bg-transparent">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={redo} disabled={!future.current.length} title="Redo (Shift+Ctrl/⌘+Z)" aria-label="Redo"
            className="h-8 w-8 inline-flex items-center justify-center text-[#161616] hover:bg-[#e8e8e8] disabled:text-[#c6c6c6] disabled:hover:bg-transparent">
            <Redo2 className="w-4 h-4" />
          </button>
          {isDirty && flowId && (
            <button onClick={discardChanges} className="h-8 px-2 text-[13px] text-[#da1e28] underline underline-offset-2 hover:bg-[#fff1f1]">
              Discard
            </button>
          )}
        </div>
        <span className="text-[12px] text-[#6f6f6f] whitespace-nowrap hidden xl:inline">· {nodes.length} steps · {edges.length} links</span>
        <span className="cds-tag text-[12px] px-2 leading-5 whitespace-nowrap" style={{
          background: isDeployed ? '#a7f0ba' : '#e0e0e0', color: isDeployed ? '#0e6027' : '#161616',
        }}>
          {isDeployed ? 'Deployed' : 'Draft'}
        </span>

        <div className="flex-1" />

        {/* View switcher + actions wrap together onto a second row when narrow */}
        <div className="flex items-center gap-3 flex-wrap">
        <div className="flex border border-[#8d8d8d]" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={activeTab === v.id}
              onClick={() => setActiveTab(v.id)}
              className="h-8 px-3 text-[13px] whitespace-nowrap transition-colors"
              style={activeTab === v.id
                ? { background: '#161616', color: '#ffffff' }
                : { background: '#ffffff', color: '#161616' }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button
          onClick={saveWithFeedback}
          disabled={saveMutation.isPending}
          className="h-8 px-3 text-[13px] flex items-center gap-2 border border-[#0f62fe] text-[#0f62fe] hover:bg-[#0f62fe] hover:text-white disabled:opacity-50 whitespace-nowrap"
        >
          <Save className="w-4 h-4" /> {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => setActiveTab('deploy')}
          className="h-8 px-3 text-[13px] flex items-center gap-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white whitespace-nowrap"
        >
          <Rocket className="w-4 h-4" /> Deploy
        </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* CANVAS */}
        {activeTab === 'designer' && (
          <div
            style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <ReactFlow
              nodes={nodes}
              edges={displayEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              edgesReconnectable
              onNodeClick={onNodeClick}
              onPaneClick={() => { if (panelMode === 'inspector') { setSelectedNode(null); setPanelMode(null) } }}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              style={{ background: '#f4f4f4' }}
              defaultEdgeOptions={{
                type: 'smoothstep',
                style: EDGE_STYLE,
                markerEnd: EDGE_MARKER,
              }}
            >
              <Background color="#c6c6c6" gap={16} size={1.2} />
              <ZoomBar />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor="#c6c6c6"
                maskColor="rgba(244,244,244,0.7)"
                style={{ background: '#ffffff', border: '1px solid #c6c6c6', width: 168, height: 104 }}
              />
              <Panel position="top-right">
                <div className="flex gap-2">
                  <button
                    onClick={tidyUp}
                    disabled={nodes.length < 2}
                    className="h-8 px-3 text-[13px] flex items-center gap-2 bg-white border border-[#8d8d8d] text-[#161616] hover:bg-[#e8e8e8] disabled:opacity-40"
                  >
                    <LayoutGrid className="w-4 h-4" /> Tidy up
                  </button>
                  <button
                    onClick={() => setPanelMode(panelMode === 'palette' ? null : 'palette')}
                    className="h-8 px-3 text-[13px] flex items-center gap-2 bg-[#161616] text-white hover:bg-[#393939]"
                  >
                    <Plus className="w-4 h-4" /> Add step
                  </button>
                </div>
              </Panel>
            </ReactFlow>

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto bg-white border border-[#e0e0e0] px-8 py-6 text-center max-w-sm">
                  <WorkflowIcon className="w-6 h-6 mx-auto mb-2 text-[#8d8d8d]" />
                  <p className="text-[14px] text-[#161616] font-semibold">Start building your flow</p>
                  <p className="text-[13px] text-[#525252] mt-1 mb-4">Add a trigger first, e.g. HTTP Request, then add the next steps from there</p>
                  <button
                    onClick={() => { setPaletteQuery(''); setPanelMode('palette') }}
                    className="h-8 px-3 text-[13px] inline-flex items-center gap-2 bg-[#0f62fe] text-white hover:bg-[#0353e9]"
                  >
                    <Plus className="w-4 h-4" /> Add step
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'test' && (
          <div className="flex-1 overflow-auto bg-[#f4f4f4] p-6">
            <div className="grid gap-4 lg:grid-cols-2 max-w-6xl">
              {/* Request */}
              <section className="bg-white border border-[#e0e0e0]">
                <div className="px-4 h-12 flex items-center border-b border-[#e0e0e0]">
                  <h2 className="text-[16px] text-[#161616]">Test request</h2>
                  <span className="ml-auto text-[12px] text-[#6f6f6f]">Sent through gateway /api/v1</span>
                </div>
                <div className="p-4 flex flex-col gap-4">
                  <div>
                    <div className="text-[12px] text-[#525252] mb-1">Method</div>
                    <div className="flex border border-[#8d8d8d] w-fit" role="radiogroup">
                      {['GET', 'POST', 'PUT', 'DELETE'].map((m) => (
                        <button key={m} role="radio" aria-checked={testMethod === m} onClick={() => setTestMethod(m)}
                          className="h-8 px-4 text-[13px]"
                          style={testMethod === m ? { background: '#161616', color: '#fff' } : { background: '#fff', color: '#161616' }}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#525252] mb-1">Path</label>
                    <input placeholder="/api/v1/..." value={testPath} onChange={(e) => setTestPath(e.target.value)}
                      style={{ width: '100%', padding: '6px 12px', fontFamily: 'var(--font-mono)' }} />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#525252] mb-1">Body (JSON)</label>
                    <textarea rows={10} value={testBody} onChange={(e) => setTestBody(e.target.value)} placeholder="{}"
                      style={{ width: '100%', padding: '8px 12px', fontFamily: 'var(--font-mono)', resize: 'vertical' }} />
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !testPath}
                      className="h-8 px-4 text-[13px] inline-flex items-center gap-2 bg-[#0f62fe] text-white hover:bg-[#0353e9] disabled:bg-[#c6c6c6] disabled:cursor-not-allowed">
                      <FlaskConical className="w-4 h-4" />
                      {testMutation.isPending ? 'Sending…' : 'Execute'}
                    </button>
                  </div>
                </div>
              </section>

              {/* Response */}
              <section className="bg-white border border-[#e0e0e0] min-w-0">
                <div className="px-4 h-12 flex items-center gap-3 border-b border-[#e0e0e0]">
                  <h2 className="text-[16px] text-[#161616]">Response</h2>
                  {testResponse && (() => {
                    const ok = !testResponse.error && testResponse.status >= 200 && testResponse.status < 300
                    return (
                      <span className="cds-tag text-[12px] px-2 leading-5" style={{
                        background: testResponse.error || testResponse.status >= 500 ? '#ffd7d9' : ok ? '#a7f0ba' : '#ffd8bd',
                        color: testResponse.error || testResponse.status >= 500 ? '#a2191f' : ok ? '#0e6027' : '#8a3800',
                      }}>
                        {testResponse.error ? 'Error' : `HTTP ${testResponse.status}`}
                      </span>
                    )
                  })()}
                </div>
                <div className="p-4">
                  {testResponse ? (
                    <pre className="text-[13px] bg-[#f4f4f4] p-3 overflow-auto max-h-[480px] text-[#161616]" style={{ fontFamily: 'var(--font-mono)' }}>
                      {JSON.stringify(testResponse.error ? { error: testResponse.error } : testResponse.data, null, 2)}
                    </pre>
                  ) : (
                    <p className="py-10 text-center text-[13px] text-[#6f6f6f]">Send a request on the left to see the response here</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'deploy' && (() => {
          const strategyInfo = EXECUTION_STRATEGIES.find(s => s.id === executionStrategy)!
          const asyncDefaults = ['eventLog', 'audit', 'pubsub', 'kafka']
          const modeOf = (n: any) => (n.data?.config?.executionMode || (asyncDefaults.includes(n.data?.type) ? 'async' : 'sync'))
          const asyncNodeCount = nodes.filter((n: any) => modeOf(n) === 'async').length
          const syncNodeCount = nodes.length - asyncNodeCount
          const deployNow = async () => {
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
          }
          const blocked = !flowId || deployMutation.isPending || nodes.length === 0

          const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
            <div className="flex items-center justify-between h-10 border-b border-[#e0e0e0] last:border-b-0 text-[14px]">
              <span className="text-[#525252]">{label}</span>
              <span className="text-[#161616]">{value}</span>
            </div>
          )
          const Card = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
            <section className="bg-white border border-[#e0e0e0]">
              <div className="px-4 h-12 flex items-center border-b border-[#e0e0e0]">
                <h2 className="text-[16px] text-[#161616]">{title}</h2>
                <span className="ml-auto">{right}</span>
              </div>
              <div className="px-4 py-2">{children}</div>
            </section>
          )

          return (
            <div className="flex-1 overflow-auto bg-[#f4f4f4] p-6">
              <div className="grid gap-4 lg:grid-cols-2 max-w-6xl items-start">
                <div className="flex flex-col gap-4">
                  <Card title={flowName} right={
                    <span className="cds-tag text-[12px] px-2 leading-5" style={{
                      background: isDeployed ? '#a7f0ba' : '#e0e0e0', color: isDeployed ? '#0e6027' : '#161616',
                    }}>{isDeployed ? 'Active' : 'Draft'}</span>
                  }>
                    {flowDescription && <p className="text-[13px] text-[#525252] py-2">{flowDescription}</p>}
                    <Row label="Flow ID" value={<code className="text-[12px]">{flowId ?? 'Not saved yet'}</code>} />
                    <Row label="Trigger" value={triggerType} />
                    <Row label="Execution mode" value={executionMode} />
                    <Row label="Category" value={flowCategory} />
                  </Card>

                  <Card title="Execution strategy">
                    <div className="flex border border-[#8d8d8d] my-2" role="radiogroup">
                      {EXECUTION_STRATEGIES.map(st => (
                        <button key={st.id} role="radio" aria-checked={executionStrategy === st.id}
                          onClick={() => setExecutionStrategy(st.id as any)}
                          className="flex-1 py-2 px-2 text-left"
                          style={executionStrategy === st.id ? { background: '#161616', color: '#fff' } : { background: '#fff', color: '#161616' }}>
                          <div className="text-[13px] font-semibold">{st.label}</div>
                          <div className="text-[12px] opacity-75 truncate">{st.sub}</div>
                        </button>
                      ))}
                    </div>
                    <p className="text-[13px] text-[#525252] py-2">{strategyInfo.desc}</p>
                    {executionStrategy === 'custom' && (
                      <div className="pb-2">
                        <Row label="Queue type" value={customQueueType.toUpperCase()} />
                        <Row label="Sync steps" value={syncNodeCount} />
                        <Row label="Async steps" value={asyncNodeCount} />
                      </div>
                    )}
                  </Card>
                </div>

                <div className="flex flex-col gap-4">
                  <Card title="Flow composition" right={<span className="text-[12px] text-[#6f6f6f]">{nodes.length} steps · {edges.length} links · {asyncNodeCount} async</span>}>
                    {nodes.length === 0 && <p className="py-4 text-[13px] text-[#6f6f6f]">No steps yet</p>}
                    {nodes.map((n: any) => (
                      <div key={n.id} className="flex items-center gap-3 h-10 border-b border-[#e0e0e0] last:border-b-0">
                        <NodeIcon type={String(n.data?.type)} letter={String(n.data?.icon)} color={String(n.data?.color)} size={24} />
                        <span className="text-[14px] text-[#161616] flex-1 truncate">{n.data?.displayName || n.data?.label}</span>
                        <span className="cds-tag text-[11px] px-2 leading-5" style={modeOf(n) === 'async'
                          ? { background: '#ffd8bd', color: '#8a3800' } : { background: '#e0e0e0', color: '#161616' }}>
                          {modeOf(n)}
                        </span>
                      </div>
                    ))}
                  </Card>

                  <section className="bg-white border border-[#e0e0e0] p-4">
                    <p className="text-[13px] text-[#525252] mb-3">
                      Save the flow → validate each step's required fields → send to Orch Broker
                    </p>
                    <button onClick={deployNow} disabled={blocked}
                      className="w-full h-12 px-4 text-[14px] inline-flex items-center justify-between bg-[#0f62fe] text-white hover:bg-[#0353e9] disabled:bg-[#c6c6c6] disabled:cursor-not-allowed">
                      {deployMutation.isPending ? 'Deploying…' : isDeployed ? 'Redeploy to broker' : 'Deploy to broker'}
                      <Rocket className="w-4 h-4" />
                    </button>
                    {!flowId && <p className="mt-2 text-[12px] text-[#da1e28]">Save the flow before deploying</p>}
                  </section>
                </div>
              </div>
            </div>
          )
        })()}

        {/* SETTINGS TAB CONTENT */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-auto bg-[#f4f4f4] p-6">
            <div style={{ maxWidth: 720 }}>
              {/* Page Header */}
              <div style={{ marginBottom: 16 }}>
                <h2 className="text-[20px] text-[#161616]" style={{ margin: 0 }}>Flow settings</h2>
                <p className="text-[13px] text-[#525252] mt-1" style={{ margin: 0 }}>
                  General flow settings and execution strategy
                </p>
              </div>

              {/* Section: General */}
              <div className="bg-white border border-[#e0e0e0] p-4 mb-4">
                <div className="text-[14px] font-semibold text-[#161616] mb-4">General</div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>
                    Description
                  </label>
                  <textarea
                    value={flowDescription}
                    onChange={(e) => setFlowDescription(e.target.value)}
                    placeholder="Flow description..."
                    rows={3}
                    style={{ width: '100%', padding: '8px 12px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>
                      Trigger type
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
                    <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>
                      Execution mode
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
                  <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>
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
              <div className="bg-white border border-[#e0e0e0] p-4 mb-4">
                <div className="text-[14px] font-semibold text-[#161616] mb-4">Execution strategy</div>

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

                <div className="text-[13px] text-[#525252] bg-[#f4f4f4] px-3 py-2">
                  {EXECUTION_STRATEGIES.find(s => s.id === executionStrategy)?.desc}
                </div>

                {executionStrategy === 'custom' && (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, color: '#525252', display: 'block', marginBottom: 4 }}>
                      Queue type
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

              <div className="flex justify-end gap-2">
                <button onClick={() => setActiveTab('designer')}
                  className="h-8 px-3 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8]">Back to designer</button>
                <button onClick={saveWithFeedback}
                  className="h-8 px-4 text-[13px] inline-flex items-center gap-2 bg-[#0f62fe] text-white hover:bg-[#0353e9]">
                  <Save className="w-4 h-4" /> Save settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT PANEL — step inspector or "Add step" palette */}
        {activeTab === 'designer' && panelMode && (
          <aside className="w-[360px] flex-shrink-0 bg-white border-l border-[#e0e0e0] flex flex-col min-h-0">
            {panelMode === 'palette' ? (
              <>
                <div className="flex items-start gap-3 px-4 py-3 border-b border-[#e0e0e0]">
                  <div className="w-9 h-9 flex items-center justify-center bg-[#f4f4f4]"><Plus className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] tracking-[0.32px] text-[#6f6f6f]">PALETTE</div>
                    <div className="text-[16px] font-semibold text-[#161616]">Add a step</div>
                  </div>
                  <button onClick={() => setPanelMode(selectedNode ? 'inspector' : null)} aria-label="Close"
                    className="h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8]"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-4 pt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6f6f6f]" />
                    <input
                      autoFocus
                      value={paletteQuery}
                      onChange={(e) => setPaletteQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && paletteMatches[0]) addStep(paletteMatches[0]) }}
                      placeholder="Search steps…"
                      className="w-full h-10 pl-9 pr-3 text-[14px] bg-[#f4f4f4] border-0 border-b border-b-[#8d8d8d] outline-none focus:border-b-[#0f62fe]"
                    />
                  </div>
                  <p className="text-[12px] text-[#525252] mt-2">
                    {selectedNode
                      ? <>After <strong className="text-[#161616]">{String(selectedNode.data.label)}</strong></>
                      : 'Placed at the end of the canvas'}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                  {SECTIONS.map(({ key, label }) => {
                    const items = paletteMatches.filter((d) => d.section === key)
                    if (!items.length) return null
                    return (
                      <div key={key} className="pb-1">
                        <div className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-[0.32px] text-[#6f6f6f]">{label}</div>
                        {items.map((d) => (
                          <button
                            key={d.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, d)}
                            onClick={() => addStep(d)}
                            className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-[#e8e8e8]"
                          >
                            <NodeIcon type={d.id} letter={d.icon} color={d.color} size={32} />
                            <span className="min-w-0">
                              <span className="block text-[14px] text-[#161616]">{d.label}</span>
                              <span className="block text-[12px] text-[#6f6f6f] truncate">{d.sub}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                  {paletteMatches.length === 0 && (
                    <p className="px-4 py-6 text-[13px] text-[#6f6f6f]">No steps match “{paletteQuery}”</p>
                  )}
                </div>
                <p className="px-4 py-3 border-t border-[#e0e0e0] text-[12px] text-[#6f6f6f]">
                  Enter adds the first match · drag onto the canvas · drag a port to connect steps
                </p>
              </>
            ) : selectedNode ? (
              <>
                <div className="flex items-start gap-3 px-4 py-3 border-b border-[#e0e0e0]">
                  <NodeIcon type={String(selectedNode.data.type)} letter={String(selectedNode.data.icon)} color={String(selectedNode.data.color)} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] tracking-[0.32px] text-[#6f6f6f]">
                      {SECTION_LABEL[NODE_SECTION[String(selectedNode.data.type)]] || 'STEP'}
                    </div>
                    <div className="text-[16px] font-semibold text-[#161616] truncate">{String(selectedNode.data.label)}</div>
                    <div className="text-[12px] text-[#6f6f6f]">{String(selectedNode.data.sub)}</div>
                  </div>
                  <button onClick={() => { setSelectedNode(null); setPanelMode(null) }} aria-label="Close"
                    className="h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8]"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="mb-5">
                    <label className="block text-[12px] text-[#525252] mb-1">Step name (shown on canvas)</label>
                    <input
                      value={String((selectedNode.data as any).displayName ?? '')}
                      placeholder={String(selectedNode.data.label)}
                      onChange={(e) => {
                        const newData = { ...selectedNode.data, displayName: e.target.value || undefined }
                        setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: newData } : n)))
                        setSelectedNode({ ...selectedNode, data: newData })
                      }}
                      style={{ width: '100%', padding: '6px 12px' }}
                    />
                  </div>
                  <NodeConfigPanel
                    node={selectedNode}
                    onChange={(newData) => {
                      setNodes((nds) => nds.map((n) =>
                        n.id === selectedNode.id ? { ...n, data: newData } : n
                      ))
                      setSelectedNode({ ...selectedNode, data: newData })
                    }}
                  />
                  {(() => {
                    const byId = (id: string) => nodes.find((n) => n.id === id)
                    const outs = edges.filter((e) => e.source === selectedNode.id).map((e) => byId(e.target)).filter(Boolean) as Node[]
                    const ins = edges.filter((e) => e.target === selectedNode.id).map((e) => byId(e.source)).filter(Boolean) as Node[]
                    const row = (n: Node, dir: 'in' | 'out') => (
                      <button key={dir + n.id} onClick={() => { setSelectedNode(n); setNodes((nds) => nds.map((x) => ({ ...x, selected: x.id === n.id }))) }}
                        className="w-full h-9 px-2 flex items-center gap-2 text-left text-[13px] text-[#161616] hover:bg-[#e8e8e8] border-b border-[#e0e0e0] last:border-b-0">
                        {dir === 'in' ? <ArrowLeft className="w-4 h-4 text-[#6f6f6f]" /> : <ArrowRight className="w-4 h-4 text-[#6f6f6f]" />}
                        <span className="truncate">{String((n.data as any).displayName || n.data.label)}</span>
                        <span className="ml-auto text-[11px] text-[#6f6f6f]">{SECTION_LABEL[NODE_SECTION[String(n.data.type)]]}</span>
                      </button>
                    )
                    return (
                      <div className="mt-6">
                        <div className="text-[14px] font-semibold text-[#161616] mb-2">Connections</div>
                        <div className="text-[12px] text-[#525252] mb-1">Receives from</div>
                        <div className="border border-[#e0e0e0] mb-3">
                          {ins.length ? ins.map((n) => row(n, 'in')) : <p className="px-2 py-2 text-[12px] text-[#6f6f6f]">— Start of flow —</p>}
                        </div>
                        <div className="text-[12px] text-[#525252] mb-1">Sends to</div>
                        <div className="border border-[#e0e0e0]">
                          {outs.length ? outs.map((n) => row(n, 'out')) : <p className="px-2 py-2 text-[12px] text-[#6f6f6f]">— No next step yet; use “Add next step” —</p>}
                        </div>
                      </div>
                    )
                  })()}
                  <div className="mt-6 pt-3 border-t border-[#e0e0e0] text-[11px] text-[#6f6f6f] font-mono break-all">
                    id: {selectedNode.id}
                  </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-3 border-t border-[#e0e0e0]">
                  <button onClick={() => setPanelMode('palette')}
                    className="h-8 px-3 text-[13px] flex items-center gap-2 bg-[#161616] text-white hover:bg-[#393939]">
                    <Plus className="w-4 h-4" /> Add next step
                  </button>
                  <div className="flex-1" />
                  <button onClick={duplicateNode}
                    className="h-8 px-3 text-[13px] flex items-center gap-2 border border-[#8d8d8d] hover:bg-[#e8e8e8]">
                    <Copy className="w-4 h-4" /> Duplicate
                  </button>
                  <button onClick={deleteNode}
                    className="h-8 px-3 text-[13px] flex items-center gap-2 border border-[#da1e28] text-[#da1e28] hover:bg-[#da1e28] hover:text-white">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </>
            ) : null}
          </aside>
        )}
      </div>
    </div>
  )
}
