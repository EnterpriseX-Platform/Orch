// ==========================================
// Orch SDK Types
// ==========================================

export type NodeCategory = 'trigger' | 'extract' | 'integration' | 'action' | 'output' | 'logic';

export interface NodeMetadata {
  nodeType: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
  version: string;
}

export interface NodeTypeDefinition extends NodeMetadata {
  configSchema?: Record<string, any>;
  defaultConfig?: Record<string, any>;
  configComponent?: string;
  validate?: (config: any) => ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    type: string;
    label: string;
    config: Record<string, any>;
    [key: string]: any;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string;   // For decision routing ("true"/"false"/custom handle)
  targetHandle?: string;   // Reserved for join semantics
  label?: string;          // For UI display on edges
  condition?: string;      // For edge-level conditions (future use)
}

export interface FlowDefinition {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  metadata?: Record<string, any>;
}

export interface NodeHandler {
  execute: (context: ExecutionContext, config: any, input: any) => Promise<any>;
}

export interface ExecutionContext {
  requestId: string;
  flowId: string;
  variables: Record<string, any>;
  request?: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: any;
  };
}

// Registry Types
export interface RegistryExport {
  nodeTypes: NodeTypeExport[];
  version: string;
  exportedAt: string;
}

export interface NodeTypeExport extends NodeMetadata {
  configSchema?: Record<string, any>;
}
