import { StandardizedGameData, GameAsset, Achievement, Timestamp } from '../../types/core';
export interface ValidationConfig {
    enableStrictValidation: boolean;
    maxDataAge: number;
    requiredFields: {
        gameData: string[];
        assets: string[];
        achievements: string[];
        statistics: string[];
    };
    assetValidation: {
        validateContractAddresses: boolean;
        validateOwnership: boolean;
        checkDuplicates: boolean;
    };
    achievementValidation: {
        validateTimestamps: boolean;
        checkDuplicates: boolean;
        validateRarity: boolean;
    };
}
export interface ValidationResult {
    isValid: boolean;
    score: number;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    metadata: ValidationMetadata;
}
export interface ValidationError {
    code: string;
    message: string;
    field?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    details?: Record<string, any>;
}
export interface ValidationWarning {
    code: string;
    message: string;
    field?: string;
    suggestion?: string;
}
export interface ValidationMetadata {
    validatedAt: Timestamp;
    validationDuration: number;
    dataAge: number;
    checksPerformed: string[];
}
export declare class DataValidationService {
    private config;
    private knownContractAddresses;
    private validatedAssets;
    constructor(config: ValidationConfig);
    validateGameData(data: StandardizedGameData): Promise<ValidationResult>;
    validateAsset(asset: GameAsset): Promise<ValidationResult>;
    validateAchievement(achievement: Achievement): Promise<ValidationResult>;
    addKnownContractAddress(address: string): void;
    removeKnownContractAddress(address: string): void;
    getValidationStats(): {
        knownContracts: number;
        validatedAssets: number;
        cacheSize: number;
    };
    private validateBasicStructure;
    private validateRequiredFields;
    private validateDataFreshness;
    private validateAssets;
    private validateAchievements;
    private validateStatistics;
    private validateCrossReferences;
    private validateContractAddress;
    private validateAssetOwnership;
    private validateAssetMetadata;
    private validateAchievementTimestamp;
    private validateAchievementRarity;
    private calculateValidationScore;
    private hasNestedProperty;
}
//# sourceMappingURL=DataValidationService.d.ts.map