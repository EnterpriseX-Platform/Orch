// ==========================================
// Frontend Node Registry
// ==========================================

import type { 
  NodeTypeDefinition, 
  NodeMetadata, 
  ValidationResult,
  RegistryExport 
} from './types';

export class NodeRegistry {
  private handlers: Map<string, NodeTypeDefinition> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  constructor() {
    // Initialize category maps
    this.categories.set('trigger', new Set());
    this.categories.set('extract', new Set());
    this.categories.set('integration', new Set());
    this.categories.set('action', new Set());
    this.categories.set('output', new Set());
  }

  /**
   * Register a new node type
   */
  register(definition: NodeTypeDefinition): void {
    const { nodeType, category } = definition;
    
    if (this.handlers.has(nodeType)) {
      console.warn(`[NodeRegistry] Node type '${nodeType}' already registered. Overwriting...`);
    }

    this.handlers.set(nodeType, definition);
    
    // Add to category
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(nodeType);
    
    console.log(`[NodeRegistry] Registered: ${nodeType} (${category})`);
  }

  /**
   * Unregister a node type
   */
  unregister(nodeType: string): boolean {
    const def = this.handlers.get(nodeType);
    if (!def) return false;

    this.handlers.delete(nodeType);
    this.categories.get(def.category)?.delete(nodeType);
    
    console.log(`[NodeRegistry] Unregistered: ${nodeType}`);
    return true;
  }

  /**
   * Get node type definition
   */
  get(nodeType: string): NodeTypeDefinition | undefined {
    return this.handlers.get(nodeType);
  }

  /**
   * Check if node type exists
   */
  has(nodeType: string): boolean {
    return this.handlers.has(nodeType);
  }

  /**
   * List all registered node types
   */
  listTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get all node types by category
   */
  getByCategory(category: string): NodeTypeDefinition[] {
    const types = this.categories.get(category);
    if (!types) return [];
    
    return Array.from(types)
      .map(type => this.handlers.get(type)!)
      .filter(Boolean);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get all registered definitions
   */
  getAll(): NodeTypeDefinition[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Validate node configuration
   */
  validateConfig(nodeType: string, config: any): ValidationResult {
    const def = this.handlers.get(nodeType);
    if (!def) {
      return {
        valid: false,
        errors: [{ field: 'nodeType', message: `Unknown node type: ${nodeType}` }]
      };
    }

    // Use custom validator if provided
    if (def.validate) {
      return def.validate(config);
    }

    // Basic validation - check required fields from schema
    const errors: { field: string; message: string }[] = [];
    const schema = def.configSchema;
    
    if (schema?.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (config[field] === undefined || config[field] === null) {
          errors.push({ field, message: `${field} is required` });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Get default configuration for a node type
   */
  getDefaultConfig(nodeType: string): Record<string, any> | undefined {
    const def = this.handlers.get(nodeType);
    return def?.defaultConfig;
  }

  /**
   * Load from broker export
   */
  loadFromBroker(exportData: RegistryExport): void {
    console.log(`[NodeRegistry] Loading ${exportData.nodeTypes.length} node types from broker`);
    
    for (const nodeType of exportData.nodeTypes) {
      this.register({
        nodeType: nodeType.nodeType,
        category: nodeType.category as any,
        label: nodeType.label,
        description: nodeType.description,
        icon: nodeType.icon,
        color: nodeType.color,
        version: nodeType.version,
        configSchema: nodeType.configSchema,
      });
    }
  }

  /**
   * Export for serialization
   */
  export(): NodeTypeDefinition[] {
    return this.getAll();
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.handlers.clear();
    for (const set of this.categories.values()) {
      set.clear();
    }
  }

  /**
   * Get registry statistics
   */
  stats(): { total: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    
    for (const [cat, types] of this.categories) {
      byCategory[cat] = types.size;
    }

    return {
      total: this.handlers.size,
      byCategory
    };
  }
}

// Singleton instance
let globalRegistry: NodeRegistry | null = null;

export function getGlobalRegistry(): NodeRegistry {
  if (!globalRegistry) {
    globalRegistry = new NodeRegistry();
  }
  return globalRegistry;
}

export function setGlobalRegistry(registry: NodeRegistry): void {
  globalRegistry = registry;
}
