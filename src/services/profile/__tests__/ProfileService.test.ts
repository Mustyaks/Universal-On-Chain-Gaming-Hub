/**
 * ProfileService Unit Tests
 */

import { ProfileServiceImpl } from '../ProfileService';
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

describe('ProfileService', () => {
  let profileService: ProfileServiceImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    profileService = new ProfileServiceImpl(mockDatabase, mockCache, mockEventService);
  });

  describe('createProfile', () => {
    it('should create a new profile successfully', async () => {
      const cartridgeId = 'test_cartridge_123';
      
      // Mock that profile doesn't exist
      mockDatabase.findOne.mockResolvedValue(null);
      mockDatabase.insertOne.mockResolvedValue('profile_id');

      const result = await profileService.createProfile(cartridgeId);

      expect(result).toMatchObject({
        cartridgeId,
        totalAchievements: 0,
        crossGameAssets: [],
        socialSettings: {
          profileVisibility: 'PUBLIC',
          showAchievements: true,
          showAssets: true,
          allowFriendRequests: true
        }
      });

      expect(mockDatabase.insertOne).toHaveBeenCalledWith('profiles', expect.any(Object));
      expect(mockCache.set).toHaveBeenCalled();
      expect(mockEventService.emit).toHaveBeenCalledWith('profile:created', expect.any(Object));
    });

    it('should throw error if profile already exists', async () => {
      const cartridgeId = 'existing_cartridge';
      const existingProfile = { playerId: 'existing_player', cartridgeId };
      
      mockDatabase.findOne.mockResolvedValue(existingProfile);

      await expect(profileService.createProfile(cartridgeId))
        .rejects.toThrow('Profile already exists for Cartridge ID: existing_cartridge');
    });
  });

  describe('getProfile', () => {
    it('should return cached profile if available', async () => {
      const playerId = 'test_player';
      const cachedProfile: UnifiedProfile = {
        playerId,
        cartridgeId: 'test_cartridge',
        displayName: 'Test Player',
        avatar: 'test_avatar.png',
        totalAchievements: 5,
        crossGameAssets: [],
        socialSettings: {
          profileVisibility: 'PUBLIC',
          showAchievements: true,
          showAssets: true,
          allowFriendRequests: true
        },
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValue(cachedProfile);

      const result = await profileService.getProfile(playerId);

      expect(result).toEqual(cachedProfile);
      expect(mockDatabase.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from database if not cached', async () => {
      const playerId = 'test_player';
      const dbProfile: UnifiedProfile = {
        playerId,
        cartridgeId: 'test_cartridge',
        displayName: 'Test Player',
        avatar: 'test_avatar.png',
        totalAchievements: 5,
        crossGameAssets: [],
        socialSettings: {
          profileVisibility: 'PUBLIC',
          showAchievements: true,
          showAssets: true,
          allowFriendRequests: true
        },
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValue(null);
      mockDatabase.findOne.mockResolvedValue(dbProfile);

      const result = await profileService.getProfile(playerId);

      expect(result).toEqual(dbProfile);
      expect(mockCache.set).toHaveBeenCalledWith(`profile:${playerId}`, dbProfile, 3600);
    });

    it('should throw error if profile not found', async () => {
      const playerId = 'nonexistent_player';
      
      mockCache.get.mockResolvedValue(null);
      mockDatabase.findOne.mockResolvedValue(null);

      await expect(profileService.getProfile(playerId))
        .rejects.toThrow('Profile not found for player ID: nonexistent_player');
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const playerId = 'test_player';
      const existingProfile: UnifiedProfile = {
        playerId,
        cartridgeId: 'test_cartridge',
        displayName: 'Old Name',
        avatar: 'old_avatar.png',
        totalAchievements: 5,
        crossGameAssets: [],
        socialSettings: {
          profileVisibility: 'PUBLIC',
          showAchievements: true,
          showAssets: true,
          allowFriendRequests: true
        },
        createdAt: Date.now()
      };

      const updates = {
        displayName: 'New Name',
        avatar: 'https://example.com/new_avatar.png'
      };

      mockCache.get.mockResolvedValue(existingProfile);

      await profileService.updateProfile(playerId, updates);

      expect(mockDatabase.updateOne).toHaveBeenCalledWith('profiles', playerId, updates);
      expect(mockCache.delete).toHaveBeenCalledWith(`profile:${playerId}`);
      expect(mockEventService.emit).toHaveBeenCalledWith('profile:updated', {
        playerId,
        updates
      });
    });

    it('should validate display name length', async () => {
      const playerId = 'test_player';
      const existingProfile: UnifiedProfile = {
        playerId,
        cartridgeId: 'test_cartridge',
        displayName: 'Test Player',
        avatar: 'test_avatar.png',
        totalAchievements: 5,
        crossGameAssets: [],
        socialSettings: {
          profileVisibility: 'PUBLIC',
          showAchievements: true,
          showAssets: true,
          allowFriendRequests: true
        },
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValue(existingProfile);

      // Test too long name
      await expect(profileService.updateProfile(playerId, {
        displayName: 'a'.repeat(51)
      })).rejects.toThrow('Display name cannot exceed 50 characters');

      // Test too short name
      await expect(profileService.updateProfile(playerId, {
        displayName: 'ab'
      })).rejects.toThrow('Display name must be at least 3 characters');
    });

    it('should validate avatar URL', async () => {
      const playerId = 'test_player';
      const existingProfile: UnifiedProfile = {
        playerId,
        cartridgeId: 'test_cartridge',
        displayName: 'Test Player',
        avatar: 'test_avatar.png',
        totalAchievements: 5,
        crossGameAssets: [],
        socialSettings: {
          profileVisibility: 'PUBLIC',
          showAchievements: true,
          showAssets: true,
          allowFriendRequests: true
        },
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValue(existingProfile);

      await expect(profileService.updateProfile(playerId, {
        avatar: 'invalid-url'
      })).rejects.toThrow('Avatar must be a valid URL');
    });
  });

  describe('searchProfiles', () => {
    it('should search profiles by display name', async () => {
      const searchQuery = 'test';
      const mockProfiles: UnifiedProfile[] = [
        {
          playerId: 'player1',
          cartridgeId: 'cartridge1',
          displayName: 'Test Player 1',
          avatar: 'avatar1.png',
          totalAchievements: 5,
          crossGameAssets: [],
          socialSettings: {
            profileVisibility: 'PUBLIC',
            showAchievements: true,
            showAssets: true,
            allowFriendRequests: true
          },
          createdAt: Date.now()
        }
      ];

      mockDatabase.findMany.mockResolvedValue(mockProfiles);

      const result = await profileService.searchProfiles(searchQuery);

      expect(result).toEqual(mockProfiles);
      expect(mockDatabase.findMany).toHaveBeenCalledWith(
        'profiles',
        {
          $or: [
            { displayName: { $regex: searchQuery, $options: 'i' } },
            { playerId: { $regex: searchQuery, $options: 'i' } }
          ]
        },
        { limit: 20, sort: { createdAt: -1 } }
      );
    });

    it('should filter out private profiles', async () => {
      const searchQuery = 'test';
      const mockProfiles: UnifiedProfile[] = [
        {
          playerId: 'player1',
          cartridgeId: 'cartridge1',
          displayName: 'Public Player',
          avatar: 'avatar1.png',
          totalAchievements: 5,
          crossGameAssets: [],
          socialSettings: {
            profileVisibility: 'PUBLIC',
            showAchievements: true,
            showAssets: true,
            allowFriendRequests: true
          },
          createdAt: Date.now()
        },
        {
          playerId: 'player2',
          cartridgeId: 'cartridge2',
          displayName: 'Private Player',
          avatar: 'avatar2.png',
          totalAchievements: 3,
          crossGameAssets: [],
          socialSettings: {
            profileVisibility: 'PRIVATE',
            showAchievements: false,
            showAssets: false,
            allowFriendRequests: false
          },
          createdAt: Date.now()
        }
      ];

      mockDatabase.findMany.mockResolvedValue(mockProfiles);

      const result = await profileService.searchProfiles(searchQuery);

      expect(result).toHaveLength(1);
      expect(result[0]?.displayName).toBe('Public Player');
    });
  });
});