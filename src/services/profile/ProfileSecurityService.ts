/**
 * Profile Security Service
 * Handles data encryption, privacy controls, and GDPR compliance
 */

import crypto from 'crypto';
import {
  DatabaseService,
  CacheService,
  EventService
} from '@/types/services';
import {
  UnifiedProfile,

  Timestamp
} from '@/types/core';

export interface SecurityConfig {
  encryptionKey: string;
  encryptionAlgorithm: string;
  saltRounds: number;
  dataRetentionDays: number;
  maxExportSize: number; // bytes
}

export interface PrivacySettings {
  dataProcessingConsent: boolean;
  marketingConsent: boolean;
  analyticsConsent: boolean;
  dataRetentionPeriod: number; // days
  allowDataExport: boolean;
  allowDataDeletion: boolean;
}

export interface DataExportRequest {
  id: string;
  playerId: string;
  requestedAt: Timestamp;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  downloadUrl?: string;
  expiresAt?: Timestamp;
  fileSize?: number;
}

export interface DataDeletionRequest {
  id: string;
  playerId: string;
  requestedAt: Timestamp;
  scheduledFor: Timestamp;
  status: 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  reason?: string;
}

export interface EncryptedData {
  data: string;
  iv: string;
  tag: string;
}

export class ProfileSecurityService {
  private readonly algorithm: string;
  private readonly key: Buffer;

  constructor(
    private database: DatabaseService,
    private cache: CacheService,
    private eventService: EventService,
    private config: SecurityConfig
  ) {
    this.algorithm = config.encryptionAlgorithm;
    this.key = Buffer.from(config.encryptionKey, 'hex');
    
    if (this.key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (256 bits)');
    }
  }

  /**
   * Encrypt sensitive data
   */
  encryptSensitiveData(data: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = (cipher as any).getAuthTag ? (cipher as any).getAuthTag().toString('hex') : '';
    
    return {
      data: encrypted,
      iv: iv.toString('hex'),
      tag
    };
  }

  /**
   * Decrypt sensitive data
   */
  decryptSensitiveData(encryptedData: EncryptedData): string {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    
    if (encryptedData.tag) {
      (decipher as any).setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    }
    
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Update privacy settings for a player
   */
  async updatePrivacySettings(playerId: string, settings: Partial<PrivacySettings>): Promise<void> {
    // Get current privacy settings
    const currentSettings = await this.getPrivacySettings(playerId);
    const updatedSettings = { ...currentSettings, ...settings };

    // Validate settings
    this.validatePrivacySettings(updatedSettings);

    // Encrypt sensitive settings
    const encryptedSettings = this.encryptSensitiveData(JSON.stringify(updatedSettings));

    // Store in database
    await this.database.updateOne('privacy_settings', playerId, {
      playerId,
      encryptedSettings,
      updatedAt: Date.now()
    });

    // Invalidate cache
    await this.cache.delete(`privacy_settings:${playerId}`);

    // Emit privacy settings updated event
    this.eventService.emit('privacy:settings_updated', {
      playerId,
      settings: updatedSettings
    });

    // Handle consent changes
    await this.handleConsentChanges(playerId, currentSettings, updatedSettings);
  }

  /**
   * Get privacy settings for a player
   */
  async getPrivacySettings(playerId: string): Promise<PrivacySettings> {
    // Try cache first
    const cacheKey = `privacy_settings:${playerId}`;
    const cached = await this.cache.get<PrivacySettings>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get from database
    const record = await this.database.findOne('privacy_settings', { playerId }) as any;
    
    if (!record) {
      // Return default settings
      return this.getDefaultPrivacySettings();
    }

    // Decrypt settings
    const decryptedData = this.decryptSensitiveData(record.encryptedSettings);
    const settings = JSON.parse(decryptedData) as PrivacySettings;

    // Cache for 1 hour
    await this.cache.set(cacheKey, settings, 3600);

    return settings;
  }

  /**
   * Apply privacy filters to profile data
   */
  async applyPrivacyFilters(profile: UnifiedProfile, viewerPlayerId?: string): Promise<UnifiedProfile> {
    await this.getPrivacySettings(profile.playerId);
    const socialSettings = profile.socialSettings;

    // If viewer is the profile owner, return full data
    if (viewerPlayerId === profile.playerId) {
      return profile;
    }

    // Apply visibility filters
    const filteredProfile = { ...profile };

    // Check profile visibility
    if (socialSettings.profileVisibility === 'PRIVATE') {
      throw new Error('Profile is private');
    }

    if (socialSettings.profileVisibility === 'FRIENDS_ONLY') {
      const isFriend = await this.checkFriendship(profile.playerId, viewerPlayerId);
      if (!isFriend) {
        throw new Error('Profile is only visible to friends');
      }
    }

    // Filter achievements
    if (!socialSettings.showAchievements) {
      filteredProfile.totalAchievements = 0;
    }

    // Filter assets
    if (!socialSettings.showAssets) {
      filteredProfile.crossGameAssets = [];
    }

    return filteredProfile;
  }

  /**
   * Request data export (GDPR compliance)
   */
  async requestDataExport(playerId: string): Promise<string> {
    // Check if player has export permission
    const privacySettings = await this.getPrivacySettings(playerId);
    if (!privacySettings.allowDataExport) {
      throw new Error('Data export is not allowed for this account');
    }

    // Check for existing pending requests
    const existingRequest = await this.database.findOne<DataExportRequest>(
      'data_export_requests',
      { playerId, status: { $in: ['PENDING', 'PROCESSING'] } }
    );

    if (existingRequest) {
      throw new Error('Data export request already in progress');
    }

    // Create export request
    const requestId = this.generateRequestId();
    const exportRequest: DataExportRequest = {
      id: requestId,
      playerId,
      requestedAt: Date.now(),
      status: 'PENDING'
    };

    await this.database.insertOne('data_export_requests', exportRequest);

    // Queue export processing
    this.eventService.emit('data_export:requested', { requestId, playerId });

    return requestId;
  }

  /**
   * Process data export request
   */
  async processDataExport(requestId: string): Promise<void> {
    const request = await this.database.findOne<DataExportRequest>(
      'data_export_requests',
      { id: requestId }
    );

    if (!request) {
      throw new Error('Export request not found');
    }

    try {
      // Update status to processing
      await this.database.updateOne('data_export_requests', requestId, {
        status: 'PROCESSING'
      });

      // Collect all player data
      const playerData = await this.collectPlayerData(request.playerId);

      // Generate export file
      const exportData = JSON.stringify(playerData, null, 2);
      const fileSize = Buffer.byteLength(exportData, 'utf8');

      // Check size limit
      if (fileSize > this.config.maxExportSize) {
        throw new Error('Export data exceeds maximum size limit');
      }

      // Store export file (in a real implementation, this would be stored in cloud storage)
      const downloadUrl = await this.storeExportFile(requestId, exportData);
      const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

      // Update request with download info
      await this.database.updateOne('data_export_requests', requestId, {
        status: 'COMPLETED',
        downloadUrl,
        expiresAt,
        fileSize
      });

      // Emit completion event
      this.eventService.emit('data_export:completed', {
        requestId,
        playerId: request.playerId,
        downloadUrl
      });

    } catch (error) {
      // Update status to failed
      await this.database.updateOne('data_export_requests', requestId, {
        status: 'FAILED'
      });

      console.error(`Data export failed for request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Request data deletion (GDPR compliance)
   */
  async requestDataDeletion(playerId: string, reason?: string): Promise<string> {
    // Check if player has deletion permission
    const privacySettings = await this.getPrivacySettings(playerId);
    if (!privacySettings.allowDataDeletion) {
      throw new Error('Data deletion is not allowed for this account');
    }

    // Check for existing pending requests
    const existingRequest = await this.database.findOne<DataDeletionRequest>(
      'data_deletion_requests',
      { playerId, status: { $in: ['PENDING', 'SCHEDULED', 'PROCESSING'] } }
    );

    if (existingRequest) {
      throw new Error('Data deletion request already in progress');
    }

    // Schedule deletion (30 days grace period)
    const requestId = this.generateRequestId();
    const scheduledFor = Date.now() + (30 * 24 * 60 * 60 * 1000);

    const deletionRequest: DataDeletionRequest = {
      id: requestId,
      playerId,
      requestedAt: Date.now(),
      scheduledFor,
      status: 'SCHEDULED',
      reason: reason || ''
    };

    await this.database.insertOne('data_deletion_requests', deletionRequest);

    // Emit deletion scheduled event
    this.eventService.emit('data_deletion:scheduled', {
      requestId,
      playerId,
      scheduledFor
    });

    return requestId;
  }

  /**
   * Cancel data deletion request
   */
  async cancelDataDeletion(requestId: string, playerId: string): Promise<void> {
    const request = await this.database.findOne<DataDeletionRequest>(
      'data_deletion_requests',
      { id: requestId, playerId }
    );

    if (!request) {
      throw new Error('Deletion request not found');
    }

    if (request.status === 'PROCESSING' || request.status === 'COMPLETED') {
      throw new Error('Cannot cancel deletion request in current status');
    }

    await this.database.updateOne('data_deletion_requests', requestId, {
      status: 'CANCELLED'
    });

    this.eventService.emit('data_deletion:cancelled', { requestId, playerId });
  }

  /**
   * Process scheduled data deletions
   */
  async processScheduledDeletions(): Promise<void> {
    const now = Date.now();
    const scheduledDeletions = await this.database.findMany<DataDeletionRequest>(
      'data_deletion_requests',
      {
        status: 'SCHEDULED',
        scheduledFor: { $lte: now }
      }
    );

    for (const deletion of scheduledDeletions) {
      try {
        await this.executeDataDeletion(deletion.id);
      } catch (error) {
        console.error(`Failed to execute data deletion ${deletion.id}:`, error);
      }
    }
  }

  /**
   * Execute data deletion
   */
  private async executeDataDeletion(requestId: string): Promise<void> {
    const request = await this.database.findOne<DataDeletionRequest>(
      'data_deletion_requests',
      { id: requestId }
    );

    if (!request) {
      throw new Error('Deletion request not found');
    }

    try {
      // Update status to processing
      await this.database.updateOne('data_deletion_requests', requestId, {
        status: 'PROCESSING'
      });

      // Delete all player data
      await this.deleteAllPlayerData(request.playerId);

      // Update status to completed
      await this.database.updateOne('data_deletion_requests', requestId, {
        status: 'COMPLETED'
      });

      // Emit completion event
      this.eventService.emit('data_deletion:completed', {
        requestId,
        playerId: request.playerId
      });

    } catch (error) {
      console.error(`Data deletion failed for request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Collect all player data for export
   */
  private async collectPlayerData(playerId: string): Promise<any> {
    const [profile, gameProfiles, assets, achievements, socialConnections, privacySettings] = await Promise.all([
      this.database.findOne('profiles', { playerId }),
      this.database.findMany('game_profiles', { playerId }),
      this.database.findMany('game_assets', { owner: playerId }),
      this.database.findMany('achievements', { playerId }),
      this.database.findMany('social_connections', { playerId }),
      this.getPrivacySettings(playerId)
    ]);

    return {
      profile,
      gameProfiles,
      assets,
      achievements,
      socialConnections,
      privacySettings,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Delete all player data
   */
  private async deleteAllPlayerData(playerId: string): Promise<void> {
    const collections = [
      'profiles',
      'game_profiles',
      'game_assets',
      'achievements',
      'social_connections',
      'privacy_settings',
      'sessions'
    ];

    // Delete from all collections
    await Promise.all(collections.map(collection =>
      this.database.deleteOne(collection, playerId)
    ));

    // Clear all caches
    const cachePatterns = [
      `profile:${playerId}`,
      `privacy_settings:${playerId}`,
      `aggregated:${playerId}`,
      `cross_game_assets:${playerId}`
    ];

    await Promise.all(cachePatterns.map(pattern =>
      this.cache.delete(pattern)
    ));
  }

  /**
   * Store export file (placeholder implementation)
   */
  private async storeExportFile(requestId: string, _data: string): Promise<string> {
    // In a real implementation, this would upload to cloud storage
    // For now, return a placeholder URL
    return `https://exports.example.com/${requestId}.json`;
  }

  /**
   * Check friendship between two players
   */
  private async checkFriendship(playerId: string, viewerPlayerId?: string): Promise<boolean> {
    if (!viewerPlayerId) return false;

    const friendship = await this.database.findOne('social_connections', {
      $or: [
        { playerId, friendId: viewerPlayerId, status: 'ACCEPTED' },
        { playerId: viewerPlayerId, friendId: playerId, status: 'ACCEPTED' }
      ]
    });

    return !!friendship;
  }

  /**
   * Handle consent changes
   */
  private async handleConsentChanges(
    playerId: string,
    oldSettings: PrivacySettings,
    newSettings: PrivacySettings
  ): Promise<void> {
    // Handle analytics consent withdrawal
    if (oldSettings.analyticsConsent && !newSettings.analyticsConsent) {
      this.eventService.emit('privacy:analytics_consent_withdrawn', { playerId });
    }

    // Handle marketing consent withdrawal
    if (oldSettings.marketingConsent && !newSettings.marketingConsent) {
      this.eventService.emit('privacy:marketing_consent_withdrawn', { playerId });
    }

    // Handle data processing consent withdrawal
    if (oldSettings.dataProcessingConsent && !newSettings.dataProcessingConsent) {
      this.eventService.emit('privacy:data_processing_consent_withdrawn', { playerId });
    }
  }

  /**
   * Validate privacy settings
   */
  private validatePrivacySettings(settings: PrivacySettings): void {
    if (settings.dataRetentionPeriod < 30) {
      throw new Error('Data retention period must be at least 30 days');
    }

    if (settings.dataRetentionPeriod > this.config.dataRetentionDays) {
      throw new Error(`Data retention period cannot exceed ${this.config.dataRetentionDays} days`);
    }
  }

  /**
   * Get default privacy settings
   */
  private getDefaultPrivacySettings(): PrivacySettings {
    return {
      dataProcessingConsent: false,
      marketingConsent: false,
      analyticsConsent: false,
      dataRetentionPeriod: 365,
      allowDataExport: true,
      allowDataDeletion: true
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
  }
}