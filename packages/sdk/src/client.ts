// ==========================================
// Orch SDK Client
// API client for communicating with broker
// ==========================================

import type { RegistryExport, FlowDefinition } from './types';

export interface SdkConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export class OrchClient {
  private config: SdkConfig;

  constructor(config: SdkConfig) {
    this.config = {
      timeout: 30000,
      ...config
    };
  }

  /**
   * Fetch node types from broker
   */
  async fetchNodeTypes(): Promise<RegistryExport> {
    const response = await fetch(`${this.config.baseUrl}/nodes/export`, {
      headers: this.getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch node types: ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Validate node configuration
   */
  async validateNodeConfig(nodeType: string, config: any): Promise<{ valid: boolean; errors?: any[] }> {
    const response = await fetch(`${this.config.baseUrl}/nodes/${nodeType}/validate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(config)
    });
    
    if (!response.ok) {
      throw new Error(`Validation failed: ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Deploy a flow
   */
  async deployFlow(flowId: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/deploy/flows/${flowId}`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`Deploy failed: ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Undeploy a flow
   */
  async undeployFlow(flowId: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/deploy/flows/${flowId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`Undeploy failed: ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Execute a test request
   */
  async execute(method: string, path: string, body?: any): Promise<any> {
    const options: RequestInit = {
      method,
      headers: this.getHeaders()
    };
    
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${this.config.baseUrl}/api/v1${path}`, options);
    return response.json();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    return headers;
  }
}
