"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataValidator = void 0;
const ErrorHandler_1 = require("./ErrorHandler");
class DataValidator {
    constructor(adapterRegistry, config) {
        this.validationRules = [];
        this.validationCache = new Map();
        this.adapterRegistry = adapterRegistry;
        this.config = config;
        this.initializeValidationRules();
    }
    async validatePlayerData(data) {
        const cacheKey = `${data.gameId}:${data.playerId}:${data.syncedAt}`;
        if (this.config.cacheValidationResults) {
            const cached = this.getCachedResult(cacheKey);
            if (cached) {
                return cached;
            }
        }
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };
        try {
            for (const rule of this.validationRules) {
                const ruleResult = await rule.validate(data);
                result.errors.push(...ruleResult.errors);
                result.warnings.push(...ruleResult.warnings);
                if (!ruleResult.isValid && rule.severity === 'ERROR') {
                    result.isValid = false;
                }
            }
            if (this.config.cacheValidationResults) {
                this.cacheResult(cacheKey, result);
            }
            return result;
        }
        catch (error) {
            const gameError = ErrorHandler_1.ErrorHandler.classifyError(error);
            result.isValid = false;
            result.errors.push({
                field: 'validation',
                message: `Validation failed: ${gameError.message}`,
                code: 'VALIDATION_ERROR',
                value: error
            });
            return result;
        }
    }
    async validateStandardizedData(data) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };
        const structureResult = await this.validateDataStructure(data);
        result.errors.push(...structureResult.errors);
        result.warnings.push(...structureResult.warnings);
        if (!structureResult.isValid) {
            result.isValid = false;
        }
        if (this.config.enableAssetValidation && data.assets) {
            const assetResult = await this.validateAssets(data.gameId, data.assets);
            result.errors.push(...assetResult.errors);
            result.warnings.push(...assetResult.warnings);
            if (!assetResult.isValid) {
                result.isValid = false;
            }
        }
        if (this.config.enableAchievementValidation && data.achievements) {
            const achievementResult = await this.validateAchievements(data.gameId, data.achievements);
            result.errors.push(...achievementResult.errors);
            result.warnings.push(...achievementResult.warnings);
            if (!achievementResult.isValid) {
                result.isValid = false;
            }
        }
        if (this.config.enableTimestampValidation) {
            const timestampResult = this.validateTimestamp(data.lastUpdated);
            result.errors.push(...timestampResult.errors);
            result.warnings.push(...timestampResult.warnings);
            if (!timestampResult.isValid) {
                result.isValid = false;
            }
        }
        return result;
    }
    async validateAsset(gameId, asset) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };
        if (!asset.id) {
            result.errors.push({
                field: 'id',
                message: 'Asset ID is required',
                code: 'MISSING_ASSET_ID'
            });
            result.isValid = false;
        }
        if (!asset.tokenId) {
            result.errors.push({
                field: 'tokenId',
                message: 'Token ID is required',
                code: 'MISSING_TOKEN_ID'
            });
            result.isValid = false;
        }
        if (!asset.contractAddress) {
            result.errors.push({
                field: 'contractAddress',
                message: 'Contract address is required',
                code: 'MISSING_CONTRACT_ADDRESS'
            });
            result.isValid = false;
        }
        if (!asset.owner) {
            result.errors.push({
                field: 'owner',
                message: 'Asset owner is required',
                code: 'MISSING_OWNER'
            });
            result.isValid = false;
        }
        if (this.config.enableOnChainValidation && result.isValid) {
            const adapter = this.adapterRegistry.getAdapter(gameId);
            if (adapter) {
                try {
                    const isValidOnChain = await adapter.validateAsset(asset);
                    if (!isValidOnChain) {
                        result.errors.push({
                            field: 'onChainValidation',
                            message: 'Asset validation failed on-chain',
                            code: 'ON_CHAIN_VALIDATION_FAILED',
                            value: asset
                        });
                        result.isValid = false;
                    }
                }
                catch (error) {
                    result.warnings.push({
                        field: 'onChainValidation',
                        message: `On-chain validation error: ${error.message}`,
                        code: 'ON_CHAIN_VALIDATION_ERROR',
                        value: error
                    });
                }
            }
        }
        if (asset.metadata) {
            const metadataResult = this.validateAssetMetadata(asset.metadata);
            result.errors.push(...metadataResult.errors);
            result.warnings.push(...metadataResult.warnings);
            if (!metadataResult.isValid) {
                result.isValid = false;
            }
        }
        return result;
    }
    addValidationRule(rule) {
        this.validationRules.push(rule);
    }
    removeValidationRule(name) {
        this.validationRules = this.validationRules.filter(rule => rule.name !== name);
    }
    getValidationRules() {
        return [...this.validationRules];
    }
    clearCache() {
        this.validationCache.clear();
    }
    initializeValidationRules() {
        this.validationRules.push({
            name: 'basic_structure',
            description: 'Validates basic data structure requirements',
            severity: 'ERROR',
            validate: async (data) => {
                const result = { isValid: true, errors: [], warnings: [] };
                if (!data.playerId) {
                    result.errors.push({
                        field: 'playerId',
                        message: 'Player ID is required',
                        code: 'MISSING_PLAYER_ID'
                    });
                    result.isValid = false;
                }
                if (!data.gameId) {
                    result.errors.push({
                        field: 'gameId',
                        message: 'Game ID is required',
                        code: 'MISSING_GAME_ID'
                    });
                    result.isValid = false;
                }
                if (!data.normalizedData) {
                    result.errors.push({
                        field: 'normalizedData',
                        message: 'Normalized data is required',
                        code: 'MISSING_NORMALIZED_DATA'
                    });
                    result.isValid = false;
                }
                return result;
            }
        });
        if (this.config.enableCrossGameValidation) {
            this.validationRules.push({
                name: 'cross_game_consistency',
                description: 'Validates data consistency across games',
                severity: 'WARNING',
                validate: async (data) => {
                    const result = { isValid: true, errors: [], warnings: [] };
                    const allAdapters = this.adapterRegistry.getAllAdapters();
                    for (const adapter of allAdapters) {
                        if (adapter.gameId === data.gameId)
                            continue;
                        try {
                            const otherGameData = await adapter.fetchPlayerData(data.playerId);
                            const conflicts = this.findAssetConflicts(data.normalizedData.assets, otherGameData.normalizedData.assets);
                            for (const conflict of conflicts) {
                                result.warnings.push({
                                    field: 'assets',
                                    message: `Asset conflict detected with game ${adapter.gameId}`,
                                    code: 'CROSS_GAME_ASSET_CONFLICT',
                                    value: conflict
                                });
                            }
                        }
                        catch (error) {
                        }
                    }
                    return result;
                }
            });
        }
    }
    async validateDataStructure(data) {
        const result = { isValid: true, errors: [], warnings: [] };
        if (!data.playerId) {
            result.errors.push({
                field: 'playerId',
                message: 'Player ID is required',
                code: 'MISSING_PLAYER_ID'
            });
            result.isValid = false;
        }
        if (!data.gameId) {
            result.errors.push({
                field: 'gameId',
                message: 'Game ID is required',
                code: 'MISSING_GAME_ID'
            });
            result.isValid = false;
        }
        if (!Array.isArray(data.assets)) {
            result.errors.push({
                field: 'assets',
                message: 'Assets must be an array',
                code: 'INVALID_ASSETS_TYPE'
            });
            result.isValid = false;
        }
        if (!Array.isArray(data.achievements)) {
            result.errors.push({
                field: 'achievements',
                message: 'Achievements must be an array',
                code: 'INVALID_ACHIEVEMENTS_TYPE'
            });
            result.isValid = false;
        }
        return result;
    }
    async validateAssets(gameId, assets) {
        const result = { isValid: true, errors: [], warnings: [] };
        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            const assetResult = await this.validateAsset(gameId, asset);
            assetResult.errors.forEach(error => {
                error.field = `assets[${i}].${error.field}`;
            });
            assetResult.warnings.forEach(warning => {
                warning.field = `assets[${i}].${warning.field}`;
            });
            result.errors.push(...assetResult.errors);
            result.warnings.push(...assetResult.warnings);
            if (!assetResult.isValid) {
                result.isValid = false;
            }
        }
        return result;
    }
    async validateAchievements(gameId, achievements) {
        const result = { isValid: true, errors: [], warnings: [] };
        for (let i = 0; i < achievements.length; i++) {
            const achievement = achievements[i];
            if (!achievement.id) {
                result.errors.push({
                    field: `achievements[${i}].id`,
                    message: 'Achievement ID is required',
                    code: 'MISSING_ACHIEVEMENT_ID'
                });
                result.isValid = false;
            }
            if (!achievement.title) {
                result.errors.push({
                    field: `achievements[${i}].title`,
                    message: 'Achievement title is required',
                    code: 'MISSING_ACHIEVEMENT_TITLE'
                });
                result.isValid = false;
            }
            if (!achievement.earnedAt || achievement.earnedAt <= 0) {
                result.errors.push({
                    field: `achievements[${i}].earnedAt`,
                    message: 'Valid earned timestamp is required',
                    code: 'INVALID_EARNED_TIMESTAMP'
                });
                result.isValid = false;
            }
        }
        return result;
    }
    validateTimestamp(timestamp) {
        const result = { isValid: true, errors: [], warnings: [] };
        const now = Date.now();
        const drift = Math.abs(now - timestamp);
        if (drift > this.config.maxTimestampDriftMs) {
            if (timestamp > now) {
                result.errors.push({
                    field: 'lastUpdated',
                    message: 'Timestamp is in the future',
                    code: 'FUTURE_TIMESTAMP',
                    value: timestamp
                });
                result.isValid = false;
            }
            else {
                result.warnings.push({
                    field: 'lastUpdated',
                    message: 'Timestamp is significantly old',
                    code: 'OLD_TIMESTAMP',
                    value: timestamp
                });
            }
        }
        return result;
    }
    validateAssetMetadata(metadata) {
        const result = { isValid: true, errors: [], warnings: [] };
        if (!metadata.name) {
            result.warnings.push({
                field: 'metadata.name',
                message: 'Asset name is recommended',
                code: 'MISSING_ASSET_NAME'
            });
        }
        if (!metadata.description) {
            result.warnings.push({
                field: 'metadata.description',
                message: 'Asset description is recommended',
                code: 'MISSING_ASSET_DESCRIPTION'
            });
        }
        if (metadata.attributes && !Array.isArray(metadata.attributes)) {
            result.errors.push({
                field: 'metadata.attributes',
                message: 'Attributes must be an array',
                code: 'INVALID_ATTRIBUTES_TYPE'
            });
            result.isValid = false;
        }
        return result;
    }
    findAssetConflicts(assets1, assets2) {
        const conflicts = [];
        for (const asset1 of assets1) {
            for (const asset2 of assets2) {
                if (asset1.tokenId === asset2.tokenId &&
                    asset1.contractAddress === asset2.contractAddress &&
                    asset1.owner !== asset2.owner) {
                    conflicts.push({
                        asset1: asset1.id,
                        asset2: asset2.id,
                        tokenId: asset1.tokenId,
                        contractAddress: asset1.contractAddress
                    });
                }
            }
        }
        return conflicts;
    }
    getCachedResult(key) {
        const cached = this.validationCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.config.validationCacheTtlMs) {
            return cached.result;
        }
        return null;
    }
    cacheResult(key, result) {
        this.validationCache.set(key, {
            result,
            timestamp: Date.now()
        });
    }
}
exports.DataValidator = DataValidator;
//# sourceMappingURL=DataValidator.js.map