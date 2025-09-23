import { AdapterRegistry } from './AdapterRegistry';
import { StandardizedGameData, PlayerGameData, GameAsset } from '../../types/core';
export interface ValidationRule {
    name: string;
    description: string;
    validate: (data: any) => Promise<ValidationResult>;
    severity: 'ERROR' | 'WARNING' | 'INFO';
}
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}
export interface ValidationError {
    field: string;
    message: string;
    code: string;
    value?: any;
}
export interface ValidationWarning {
    field: string;
    message: string;
    code: string;
    value?: any;
}
export interface ValidationConfig {
    enableOnChainValidation: boolean;
    enableCrossGameValidation: boolean;
    enableTimestampValidation: boolean;
    enableAssetValidation: boolean;
    enableAchievementValidation: boolean;
    maxTimestampDriftMs: number;
    cacheValidationResults: boolean;
    validationCacheTtlMs: number;
}
export declare class DataValidator {
    private adapterRegistry;
    private config;
    private validationRules;
    private validationCache;
    constructor(adapterRegistry: AdapterRegistry, config: ValidationConfig);
    validatePlayerData(data: PlayerGameData): Promise<ValidationResult>;
    validateStandardizedData(data: StandardizedGameData): Promise<ValidationResult>;
    validateAsset(gameId: string, asset: GameAsset): Promise<ValidationResult>;
    addValidationRule(rule: ValidationRule): void;
    removeValidationRule(name: string): void;
    getValidationRules(): ValidationRule[];
    clearCache(): void;
    private initializeValidationRules;
    private validateDataStructure;
    private validateAssets;
    private validateAchievements;
    private validateTimestamp;
    private validateAssetMetadata;
    private findAssetConflicts;
    private getCachedResult;
    private cacheResult;
}
//# sourceMappingURL=DataValidator.d.ts.map