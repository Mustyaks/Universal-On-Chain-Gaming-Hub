/**
 * ProfileSecurityService Unit Tests
 */

import { ProfileSecurityService, PrivacySettings } from '../ProfileSecurityService';
import { DatabaseService, CacheService, EventService } from '@/types/services';
import { UnifiedProfile } from '@/types/core';

// Mock implementations
const mockDatabase: jest.Mocked<DatabaseService> = {
    findOne: jest.fn(),
    findMany: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn()
};

const mockCache: jest.Mocked<CacheService> = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn()
};

const mockEventService: jest.Mocked<EventService> = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
};

const mockConfig = {
    encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // 64 hex chars = 32 bytes
    encryptionAlgorithm: 'aes-256-gcm',
    saltRounds: 12,
    dataRetentionDays: 730,
    maxExportSize: 10 * 1024 * 1024 // 10MB
};

describe('ProfileSecurityService', () => {
    let securityService: ProfileSecurityService;

    beforeEach(() => {
        jest.clearAllMocks();
        securityService = new ProfileSecurityService(
            mockDatabase,
            mockCache,
            mockEventService,
            mockConfig
        );
    });

    describe('encryption/decryption', () => {
        it('should encrypt and decrypt data correctly', () => {
            const originalData = 'sensitive information';

            const encrypted = securityService.encryptSensitiveData(originalData);
            expect(encrypted.data).toBeDefined();
            expect(encrypted.iv).toBeDefined();
            expect(encrypted.data).not.toBe(originalData);

            const decrypted = securityService.decryptSensitiveData(encrypted);
            expect(decrypted).toBe(originalData);
        });

        it('should produce different encrypted data for same input', () => {
            const originalData = 'test data';

            const encrypted1 = securityService.encryptSensitiveData(originalData);
            const encrypted2 = securityService.encryptSensitiveData(originalData);

            // Should be different due to random IV
            expect(encrypted1.data).not.toBe(encrypted2.data);
            expect(encrypted1.iv).not.toBe(encrypted2.iv);

            // But both should decrypt to the same original data
            expect(securityService.decryptSensitiveData(encrypted1)).toBe(originalData);
            expect(securityService.decryptSensitiveData(encrypted2)).toBe(originalData);
        });
    });

    describe('updatePrivacySettings', () => {
        it('should update privacy settings successfully', async () => {
            const playerId = 'test_player';
            const currentSettings: PrivacySettings = {
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            };

            const updates: Partial<PrivacySettings> = {
                marketingConsent: true,
                analyticsConsent: true
            };

            // Mock getting current settings
            mockCache.get.mockResolvedValue(null);
            mockDatabase.findOne.mockResolvedValue({
                playerId,
                encryptedSettings: securityService.encryptSensitiveData(JSON.stringify(currentSettings))
            });

            await securityService.updatePrivacySettings(playerId, updates);

            expect(mockDatabase.updateOne).toHaveBeenCalledWith(
                'privacy_settings',
                playerId,
                expect.objectContaining({
                    playerId,
                    encryptedSettings: expect.any(Object),
                    updatedAt: expect.any(Number)
                })
            );

            expect(mockCache.delete).toHaveBeenCalledWith(`privacy_settings:${playerId}`);
            expect(mockEventService.emit).toHaveBeenCalledWith('privacy:settings_updated', {
                playerId,
                settings: expect.objectContaining(updates)
            });
        });

        it('should validate privacy settings', async () => {
            const playerId = 'test_player';
            const invalidSettings: Partial<PrivacySettings> = {
                dataRetentionPeriod: 15 // Less than minimum 30 days
            };

            mockCache.get.mockResolvedValue(null);
            mockDatabase.findOne.mockResolvedValue(null);

            await expect(securityService.updatePrivacySettings(playerId, invalidSettings))
                .rejects.toThrow('Data retention period must be at least 30 days');
        });
    });

    describe('getPrivacySettings', () => {
        it('should return cached settings if available', async () => {
            const playerId = 'test_player';
            const cachedSettings: PrivacySettings = {
                dataProcessingConsent: true,
                marketingConsent: true,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            };

            mockCache.get.mockResolvedValue(cachedSettings);

            const result = await securityService.getPrivacySettings(playerId);

            expect(result).toEqual(cachedSettings);
            expect(mockDatabase.findOne).not.toHaveBeenCalled();
        });

        it('should return default settings if none exist', async () => {
            const playerId = 'test_player';

            mockCache.get.mockResolvedValue(null);
            mockDatabase.findOne.mockResolvedValue(null);

            const result = await securityService.getPrivacySettings(playerId);

            expect(result).toEqual({
                dataProcessingConsent: false,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            });
        });

        it('should decrypt and return database settings', async () => {
            const playerId = 'test_player';
            const settings: PrivacySettings = {
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: true,
                dataRetentionPeriod: 730,
                allowDataExport: true,
                allowDataDeletion: false
            };

            const encryptedSettings = securityService.encryptSensitiveData(JSON.stringify(settings));

            mockCache.get.mockResolvedValue(null);
            mockDatabase.findOne.mockResolvedValue({
                playerId,
                encryptedSettings
            });

            const result = await securityService.getPrivacySettings(playerId);

            expect(result).toEqual(settings);
            expect(mockCache.set).toHaveBeenCalledWith(`privacy_settings:${playerId}`, settings, 3600);
        });
    });

    describe('applyPrivacyFilters', () => {
        const mockProfile: UnifiedProfile = {
            playerId: 'test_player',
            cartridgeId: 'test_cartridge',
            displayName: 'Test Player',
            avatar: 'avatar.png',
            totalAchievements: 10,
            crossGameAssets: [
                {
                    gameId: 'game1',
                    assets: [],
                    totalValue: 1000
                }
            ],
            socialSettings: {
                profileVisibility: 'PUBLIC',
                showAchievements: true,
                showAssets: true,
                allowFriendRequests: true
            },
            createdAt: Date.now()
        };

        it('should return full profile for profile owner', async () => {
            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            });

            const result = await securityService.applyPrivacyFilters(mockProfile, 'test_player');

            expect(result).toEqual(mockProfile);
        });

        it('should throw error for private profile', async () => {
            const privateProfile = {
                ...mockProfile,
                socialSettings: {
                    ...mockProfile.socialSettings,
                    profileVisibility: 'PRIVATE' as const
                }
            };

            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            });

            await expect(securityService.applyPrivacyFilters(privateProfile, 'other_player'))
                .rejects.toThrow('Profile is private');
        });

        it('should filter achievements when showAchievements is false', async () => {
            const filteredProfile = {
                ...mockProfile,
                socialSettings: {
                    ...mockProfile.socialSettings,
                    showAchievements: false
                }
            };

            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            });

            const result = await securityService.applyPrivacyFilters(filteredProfile, 'other_player');

            expect(result.totalAchievements).toBe(0);
        });

        it('should filter assets when showAssets is false', async () => {
            const filteredProfile = {
                ...mockProfile,
                socialSettings: {
                    ...mockProfile.socialSettings,
                    showAssets: false
                }
            };

            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            });

            const result = await securityService.applyPrivacyFilters(filteredProfile, 'other_player');

            expect(result.crossGameAssets).toEqual([]);
        });
    });

    describe('requestDataExport', () => {
        it('should create data export request successfully', async () => {
            const playerId = 'test_player';

            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            });

            mockDatabase.findOne.mockResolvedValue(null); // No existing request
            mockDatabase.insertOne.mockResolvedValue('request_id');

            const requestId = await securityService.requestDataExport(playerId);

            expect(requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
            expect(mockDatabase.insertOne).toHaveBeenCalledWith(
                'data_export_requests',
                expect.objectContaining({
                    id: requestId,
                    playerId,
                    status: 'PENDING'
                })
            );
            expect(mockEventService.emit).toHaveBeenCalledWith('data_export:requested', {
                requestId,
                playerId
            });
        });

        it('should throw error if export not allowed', async () => {
            const playerId = 'test_player';

            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: false,
                allowDataDeletion: true
            });

            await expect(securityService.requestDataExport(playerId))
                .rejects.toThrow('Data export is not allowed for this account');
        });

        it('should throw error if request already exists', async () => {
            const playerId = 'test_player';

            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            });

            mockDatabase.findOne.mockResolvedValue({
                id: 'existing_request',
                playerId,
                status: 'PENDING'
            });

            await expect(securityService.requestDataExport(playerId))
                .rejects.toThrow('Data export request already in progress');
        });
    });

    describe('requestDataDeletion', () => {
        it('should create data deletion request successfully', async () => {
            const playerId = 'test_player';
            const reason = 'No longer using the service';

            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: true
            });

            mockDatabase.findOne.mockResolvedValue(null); // No existing request
            mockDatabase.insertOne.mockResolvedValue('request_id');

            const requestId = await securityService.requestDataDeletion(playerId, reason);

            expect(requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
            expect(mockDatabase.insertOne).toHaveBeenCalledWith(
                'data_deletion_requests',
                expect.objectContaining({
                    id: requestId,
                    playerId,
                    status: 'SCHEDULED',
                    reason
                })
            );
            expect(mockEventService.emit).toHaveBeenCalledWith('data_deletion:scheduled', {
                requestId,
                playerId,
                scheduledFor: expect.any(Number)
            });
        });

        it('should throw error if deletion not allowed', async () => {
            const playerId = 'test_player';

            mockCache.get.mockResolvedValue({
                dataProcessingConsent: true,
                marketingConsent: false,
                analyticsConsent: false,
                dataRetentionPeriod: 365,
                allowDataExport: true,
                allowDataDeletion: false
            });

            await expect(securityService.requestDataDeletion(playerId))
                .rejects.toThrow('Data deletion is not allowed for this account');
        });
    });
});