/**
 * Webhook management utilities for SDK
 * Handles webhook configuration and event delivery
 */

import { EventEmitter } from 'events';
import { WebhookConfig, SDKEvent } from '../types';

export class WebhookManager extends EventEmitter {
  private sdk: any;
  private webhookConfigs: Map<string, WebhookConfig> = new Map();
  private isActive: boolean = false;

  constructor(sdk: any) {
    super();
    this.sdk = sdk;
  }

  /**
   * Configure a webhook endpoint
   */
  async configure(config: WebhookConfig): Promise<void> {
    try {
      // Validate webhook configuration
      await this.validateWebhookConfig(config);
      
      // Store configuration
      const webhookId = this.generateWebhookId(config.url);
      this.webhookConfigs.set(webhookId, config);
      
      // Set up event listeners for configured events
      this.setupEventListeners(webhookId, config);
      
      this.isActive = true;
      
      console.log(`Webhook configured: ${config.url}`);
    } catch (error) {
      throw new Error(`Failed to configure webhook: ${error}`);
    }
  }

  /**
   * Remove webhook configuration
   */
  async removeWebhook(url: string): Promise<void> {
    const webhookId = this.generateWebhookId(url);
    const config = this.webhookConfigs.get(webhookId);
    
    if (config) {
      // Remove event listeners
      this.removeEventListeners(webhookId, config);
      
      // Remove configuration
      this.webhookConfigs.delete(webhookId);
      
      console.log(`Webhook removed: ${url}`);
    }
  }

  /**
   * Get all configured webhooks
   */
  getWebhooks(): WebhookConfig[] {
    return Array.from(this.webhookConfigs.values());
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(url: string): Promise<boolean> {
    try {
      const testPayload = {
        type: 'webhook_test',
        timestamp: Date.now(),
        data: {
          message: 'This is a test webhook from Universal Gaming Hub SDK'
        }
      };

      const response = await this.sendWebhook(url, testPayload);
      return response.ok;
    } catch (error) {
      console.error(`Webhook test failed for ${url}:`, error);
      return false;
    }
  }

  /**
   * Shutdown webhook manager
   */
  async shutdown(): Promise<void> {
    // Remove all event listeners
    this.webhookConfigs.forEach((config, webhookId) => {
      this.removeEventListeners(webhookId, config);
    });
    
    // Clear configurations
    this.webhookConfigs.clear();
    this.isActive = false;
    
    console.log('Webhook manager shutdown');
  }

  // Private methods

  private async validateWebhookConfig(config: WebhookConfig): Promise<void> {
    // Validate URL
    try {
      new URL(config.url);
    } catch {
      throw new Error('Invalid webhook URL');
    }

    // Validate events
    if (!config.events || config.events.length === 0) {
      throw new Error('At least one event must be specified');
    }

    const validEvents: SDKEvent[] = [
      'connected',
      'disconnected',
      'dataSync',
      'error',
      'playerUpdate',
      'assetChange',
      'achievementEarned'
    ];

    for (const event of config.events) {
      if (!validEvents.includes(event)) {
        throw new Error(`Invalid event: ${event}`);
      }
    }

    // Test webhook endpoint
    const isReachable = await this.testWebhook(config.url);
    if (!isReachable) {
      console.warn(`Webhook endpoint may not be reachable: ${config.url}`);
    }
  }

  private generateWebhookId(url: string): string {
    return Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  private setupEventListeners(webhookId: string, config: WebhookConfig): void {
    for (const event of config.events) {
      const handler = (data: any) => this.handleEvent(webhookId, event, data);
      this.sdk.on(event, handler);
      
      // Store handler reference for cleanup
      this.setMaxListeners(this.getMaxListeners() + 1);
    }
  }

  private removeEventListeners(_webhookId: string, config: WebhookConfig): void {
    for (const event of config.events) {
      this.sdk.removeAllListeners(event);
    }
  }

  private async handleEvent(webhookId: string, event: SDKEvent, data: any): Promise<void> {
    const config = this.webhookConfigs.get(webhookId);
    if (!config) {
      return;
    }

    try {
      const payload = {
        type: event,
        timestamp: Date.now(),
        gameId: this.sdk.config.gameId,
        data: data
      };

      await this.sendWebhookWithRetry(config, payload);
    } catch (error) {
      console.error(`Failed to send webhook for event ${event}:`, error);
      this.emit('webhookError', { webhookId, event, error });
    }
  }

  private async sendWebhookWithRetry(config: WebhookConfig, payload: any): Promise<void> {
    const maxRetries = config.retryConfig?.maxRetries || 3;
    const baseDelay = config.retryConfig?.baseDelayMs || 1000;
    const maxDelay = config.retryConfig?.maxDelayMs || 10000;
    const backoffMultiplier = config.retryConfig?.backoffMultiplier || 2;

    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.sendWebhook(config.url, payload, config.secret);
        
        if (response.ok) {
          return; // Success
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          throw error;
        }

        const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private async sendWebhook(url: string, payload: any, secret?: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'UniversalGamingHub-SDK/1.0.0'
    };

    // Add signature if secret is provided
    if (secret) {
      const signature = await this.generateSignature(JSON.stringify(payload), secret);
      headers['X-Hub-Signature-256'] = `sha256=${signature}`;
    }

    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeout: 10000
    } as any);
  }

  private async generateSignature(payload: string, secret: string): Promise<string> {
    // In a real implementation, you would use crypto to generate HMAC signature
    // For this example, we'll use a simple hash
    const encoder = new TextEncoder();
    const data = encoder.encode(payload + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get webhook delivery statistics
   */
  getWebhookStats(): {
    totalWebhooks: number;
    activeWebhooks: number;
    totalDeliveries: number;
    failedDeliveries: number;
  } {
    return {
      totalWebhooks: this.webhookConfigs.size,
      activeWebhooks: this.isActive ? this.webhookConfigs.size : 0,
      totalDeliveries: 0, // Would track in real implementation
      failedDeliveries: 0  // Would track in real implementation
    };
  }

  /**
   * Manually trigger webhook for testing
   */
  async triggerTestWebhook(url: string, eventType: SDKEvent, testData?: any): Promise<boolean> {
    try {
      const payload = {
        type: eventType,
        timestamp: Date.now(),
        gameId: this.sdk.config.gameId,
        data: testData || { test: true }
      };

      const response = await this.sendWebhook(url, payload);
      return response.ok;
    } catch (error) {
      console.error(`Manual webhook trigger failed:`, error);
      return false;
    }
  }
}