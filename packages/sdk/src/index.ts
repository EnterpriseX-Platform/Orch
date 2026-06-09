// ==========================================
// Orch SDK - Main Export
// ==========================================

export { NodeRegistry, getGlobalRegistry, setGlobalRegistry } from './registry';
export { OrchClient } from './client';
export { BUILTIN_NODES, registerBuiltins } from './builtins';

export type {
  NodeCategory,
  NodeMetadata,
  NodeTypeDefinition,
  ValidationResult,
  ValidationError,
  FlowNode,
  FlowEdge,
  FlowDefinition,
  NodeHandler,
  ExecutionContext,
  RegistryExport,
  NodeTypeExport,
} from './types';

// Version
export const VERSION = '1.0.0';

// Convenience re-export
export { NodeRegistry as default } from './registry';
