"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataValidationService = void 0;
class DataValidationService {
    constructor(config) {
        this.knownContractAddresses = new Set();
        this.validatedAssets = new Map();
        this.config = config;
    }
    async validateGameData(data) {
        const startTime = Date.now();
        const result = {
            isValid: true,
            score: 100,
            errors: [],
            warnings: [],
            metadata: {
                validatedAt: startTime,
                validationDuration: 0,
                dataAge: startTime - data.lastUpdated,
                checksPerformed: []
            }
        };
        try {
            await this.validateBasicStructure(data, result);
            await this.validateRequiredFields(data, result);
            await this.validateDataFreshness(data, result);
            if (data.assets && data.assets.length > 0) {
                await this.validateAssets(data.assets, result);
            }
            if (data.achievements && data.achievements.length > 0) {
                await this.validateAchievements(data.achievements, result);
            }
            if (data.statistics) {
                await this.validateStatistics(data.statistics, result);
            }
            await this.validateCrossReferences(data, result);
            this.calculateValidationScore(result);
        }
        catch (error) {
            result.errors.push({
                code: 'VALIDATION_ERROR',
                message: `Validation process failed: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'CRITICAL'
            });
            result.isValid = false;
            result.score = 0;
        }
        result.metadata.validationDuration = Date.now() - startTime;
        return result;
    }
    async validateAsset(asset) {
        const startTime = Date.now();
        const result = {
            isValid: true,
            score: 100,
            errors: [],
            warnings: [],
            metadata: {
                validatedAt: startTime,
                validationDuration: 0,
                dataAge: 0,
                checksPerformed: ['asset_validation']
            }
        };
        if (!asset.id || !asset.gameId || !asset.tokenId) {
            result.errors.push({
                code: 'MISSING_ASSET_FIELDS',
                message: 'Asset missing required fields (id, gameId, tokenId)',
                severity: 'CRITICAL'
            });
        }
        if (this.config.assetValidation.validateContractAddresses) {
            await this.validateContractAddress(asset.contractAddress, result);
        }
        if (this.config.assetValidation.validateOwnership) {
            await this.validateAssetOwnership(asset, result);
        }
        await this.validateAssetMetadata(asset.metadata, result);
        this.calculateValidationScore(result);
        result.metadata.validationDuration = Date.now() - startTime;
        return result;
    }
    async validateAchievement(achievement) {
        const startTime = Date.now();
        const result = {
            isValid: true,
            score: 100,
            errors: [],
            warnings: [],
            metadata: {
                validatedAt: startTime,
                validationDuration: 0,
                dataAge: Date.now() - achievement.earnedAt,
                checksPerformed: ['achievement_validation']
            }
        };
        if (!achievement.id || !achievement.gameId || !achievement.playerId) {
            result.errors.push({
                code: 'MISSING_ACHIEVEMENT_FIELDS',
                message: 'Achievement missing required fields (id, gameId, playerId)',
                severity: 'CRITICAL'
            });
        }
        if (this.config.achievementValidation.validateTimestamps) {
            await this.validateAchievementTimestamp(achievement, result);
        }
        if (this.config.achievementValidation.validateRarity) {
            await this.validateAchievementRarity(achievement, result);
        }
        this.calculateValidationScore(result);
        result.metadata.validationDuration = Date.now() - startTime;
        return result;
    }
    addKnownContractAddress(address) {
        this.knownContractAddresses.add(address.toLowerCase());
    }
    removeKnownContractAddress(address) {
        this.knownContractAddresses.delete(address.toLowerCase());
    }
    getValidationStats() {
        return {
            knownContracts: this.knownContractAddresses.size,
            validatedAssets: this.validatedAssets.size,
            cacheSize: this.validatedAssets.size
        };
    }
    async validateBasicStructure(data, result) {
        result.metadata.checksPerformed.push('basic_structure');
        if (!data.playerId || typeof data.playerId !== 'string') {
            result.errors.push({
                code: 'INVALID_PLAYER_ID',
                message: 'Invalid or missing playerId',
                field: 'playerId',
                severity: 'CRITICAL'
            });
        }
        if (!data.gameId || typeof data.gameId !== 'string') {
            result.errors.push({
                code: 'INVALID_GAME_ID',
                message: 'Invalid or missing gameId',
                field: 'gameId',
                severity: 'CRITICAL'
            });
        }
        if (!data.lastUpdated || typeof data.lastUpdated !== 'number') {
            result.errors.push({
                code: 'INVALID_TIMESTAMP',
                message: 'Invalid or missing lastUpdated timestamp',
                field: 'lastUpdated',
                severity: 'HIGH'
            });
        }
    }
    async validateRequiredFields(data, result) {
        result.metadata.checksPerformed.push('required_fields');
        for (const field of this.config.requiredFields.gameData) {
            if (!this.hasNestedProperty(data, field)) {
                result.errors.push({
                    code: 'MISSING_REQUIRED_FIELD',
                    message: `Missing required field: ${field}`,
                    field,
                    severity: 'HIGH'
                });
            }
        }
    }
    async validateDataFreshness(data, result) {
        result.metadata.checksPerformed.push('data_freshness');
        const dataAge = Date.now() - data.lastUpdated;
        if (dataAge > this.config.maxDataAge) {
            const severity = dataAge > this.config.maxDataAge * 2 ? 'HIGH' : 'MEDIUM';
            result.warnings.push({
                code: 'STALE_DATA',
                message: `Data is ${Math.round(dataAge / 1000)}s old, exceeds max age of ${Math.round(this.config.maxDataAge / 1000)}s`,
                field: 'lastUpdated',
                suggestion: 'Consider refreshing data from source'
            });
        }
    }
    async validateAssets(assets, result) {
        result.metadata.checksPerformed.push('assets_validation');
        const assetIds = new Set();
        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            if (!asset)
                continue;
            if (this.config.assetValidation.checkDuplicates) {
                if (assetIds.has(asset.id)) {
                    result.errors.push({
                        code: 'DUPLICATE_ASSET',
                        message: `Duplicate asset ID found: ${asset.id}`,
                        field: `assets[${i}].id`,
                        severity: 'MEDIUM'
                    });
                }
                assetIds.add(asset.id);
            }
            for (const field of this.config.requiredFields.assets) {
                if (!this.hasNestedProperty(asset, field)) {
                    result.errors.push({
                        code: 'MISSING_ASSET_FIELD',
                        message: `Asset ${asset.id} missing required field: ${field}`,
                        field: `assets[${i}].${field}`,
                        severity: 'HIGH'
                    });
                }
            }
        }
    }
    async validateAchievements(achievements, result) {
        result.metadata.checksPerformed.push('achievements_validation');
        const achievementIds = new Set();
        for (let i = 0; i < achievements.length; i++) {
            const achievement = achievements[i];
            if (!achievement)
                continue;
            if (this.config.achievementValidation.checkDuplicates) {
                if (achievementIds.has(achievement.id)) {
                    result.errors.push({
                        code: 'DUPLICATE_ACHIEVEMENT',
                        message: `Duplicate achievement ID found: ${achievement.id}`,
                        field: `achievements[${i}].id`,
                        severity: 'MEDIUM'
                    });
                }
                achievementIds.add(achievement.id);
            }
            for (const field of this.config.requiredFields.achievements) {
                if (!this.hasNestedProperty(achievement, field)) {
                    result.errors.push({
                        code: 'MISSING_ACHIEVEMENT_FIELD',
                        message: `Achievement ${achievement.id} missing required field: ${field}`,
                        field: `achievements[${i}].${field}`,
                        severity: 'HIGH'
                    });
                }
            }
        }
    }
    async validateStatistics(statistics, result) {
        result.metadata.checksPerformed.push('statistics_validation');
        for (const field of this.config.requiredFields.statistics) {
            if (!this.hasNestedProperty(statistics, field)) {
                result.errors.push({
                    code: 'MISSING_STATISTICS_FIELD',
                    message: `Statistics missing required field: ${field}`,
                    field: `statistics.${field}`,
                    severity: 'MEDIUM'
                });
            }
        }
        if (typeof statistics.playtime !== 'number' || statistics.playtime < 0) {
            result.warnings.push({
                code: 'INVALID_PLAYTIME',
                message: 'Playtime should be a non-negative number',
                field: 'statistics.playtime'
            });
        }
        if (typeof statistics.level !== 'number' || statistics.level < 1) {
            result.warnings.push({
                code: 'INVALID_LEVEL',
                message: 'Level should be a positive number',
                field: 'statistics.level'
            });
        }
    }
    async validateCrossReferences(data, result) {
        result.metadata.checksPerformed.push('cross_references');
        if (data.assets) {
            for (let i = 0; i < data.assets.length; i++) {
                const asset = data.assets[i];
                if (!asset)
                    continue;
                if (asset.gameId !== data.gameId) {
                    result.warnings.push({
                        code: 'MISMATCHED_GAME_ID',
                        message: `Asset ${asset.id} has different gameId than parent data`,
                        field: `assets[${i}].gameId`
                    });
                }
            }
        }
        if (data.achievements) {
            for (let i = 0; i < data.achievements.length; i++) {
                const achievement = data.achievements[i];
                if (!achievement)
                    continue;
                if (achievement.playerId !== data.playerId) {
                    result.errors.push({
                        code: 'MISMATCHED_PLAYER_ID',
                        message: `Achievement ${achievement.id} has different playerId than parent data`,
                        field: `achievements[${i}].playerId`,
                        severity: 'HIGH'
                    });
                }
                if (achievement.gameId !== data.gameId) {
                    result.errors.push({
                        code: 'MISMATCHED_GAME_ID',
                        message: `Achievement ${achievement.id} has different gameId than parent data`,
                        field: `achievements[${i}].gameId`,
                        severity: 'HIGH'
                    });
                }
            }
        }
    }
    async validateContractAddress(address, result) {
        if (!address || typeof address !== 'string') {
            result.errors.push({
                code: 'INVALID_CONTRACT_ADDRESS',
                message: 'Contract address is missing or invalid',
                field: 'contractAddress',
                severity: 'HIGH'
            });
            return;
        }
        if (!this.knownContractAddresses.has(address.toLowerCase())) {
            result.warnings.push({
                code: 'UNKNOWN_CONTRACT',
                message: `Contract address ${address} is not in known contracts list`,
                field: 'contractAddress',
                suggestion: 'Verify contract address is correct'
            });
        }
    }
    async validateAssetOwnership(asset, result) {
        if (!asset.owner || typeof asset.owner !== 'string') {
            result.errors.push({
                code: 'INVALID_OWNER',
                message: 'Asset owner is missing or invalid',
                field: 'owner',
                severity: 'HIGH'
            });
        }
    }
    async validateAssetMetadata(metadata, result) {
        if (!metadata) {
            result.warnings.push({
                code: 'MISSING_METADATA',
                message: 'Asset metadata is missing',
                field: 'metadata'
            });
            return;
        }
        if (!metadata.name || typeof metadata.name !== 'string') {
            result.warnings.push({
                code: 'MISSING_ASSET_NAME',
                message: 'Asset metadata missing name',
                field: 'metadata.name'
            });
        }
    }
    async validateAchievementTimestamp(achievement, result) {
        const now = Date.now();
        if (achievement.earnedAt > now) {
            result.errors.push({
                code: 'FUTURE_ACHIEVEMENT',
                message: 'Achievement earned date is in the future',
                field: 'earnedAt',
                severity: 'HIGH'
            });
        }
        if (now - achievement.earnedAt > 10 * 365 * 24 * 60 * 60 * 1000) {
            result.warnings.push({
                code: 'VERY_OLD_ACHIEVEMENT',
                message: 'Achievement earned date is very old',
                field: 'earnedAt'
            });
        }
    }
    async validateAchievementRarity(achievement, result) {
        const validRarities = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
        if (!validRarities.includes(achievement.rarity)) {
            result.errors.push({
                code: 'INVALID_RARITY',
                message: `Invalid achievement rarity: ${achievement.rarity}`,
                field: 'rarity',
                severity: 'MEDIUM'
            });
        }
    }
    calculateValidationScore(result) {
        let score = 100;
        for (const error of result.errors) {
            switch (error.severity) {
                case 'CRITICAL':
                    score -= 25;
                    break;
                case 'HIGH':
                    score -= 15;
                    break;
                case 'MEDIUM':
                    score -= 10;
                    break;
                case 'LOW':
                    score -= 5;
                    break;
            }
        }
        score -= result.warnings.length * 2;
        result.score = Math.max(0, score);
        result.isValid = result.errors.filter(e => e.severity === 'CRITICAL').length === 0 && score >= 70;
    }
    hasNestedProperty(obj, path) {
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current === null || current === undefined || !(key in current)) {
                return false;
            }
            current = current[key];
        }
        return current !== null && current !== undefined;
    }
}
exports.DataValidationService = DataValidationService;
//# sourceMappingURL=DataValidationService.js.map