import { BaseGameAdapter, GameAdapterConfig, GameFeature } from '../GameAdapter';
import { StandardizedGameData, GameAsset } from '../../../types/core';
export interface DojoGameConfig extends GameAdapterConfig {
    worldAddress: string;
    systemAddresses: {
        assets: string;
        achievements: string;
        player: string;
    };
}
export declare class DojoGameAdapter extends BaseGameAdapter {
    private dojoConfig;
    private wsConnection;
    constructor(config: DojoGameConfig);
    get version(): string;
    get supportedFeatures(): GameFeature[];
    normalize(rawData: any): Promise<StandardizedGameData>;
    fetchRawPlayerData(playerId: string): Promise<any>;
    validateAsset(asset: GameAsset): Promise<boolean>;
    connectToGameNetwork(): Promise<void>;
    disconnectFromGameNetwork(): Promise<void>;
    protected performHealthCheck(): Promise<void>;
    private fetchPlayerInfo;
    private fetchPlayerAssets;
    private fetchPlayerAchievements;
    private fetchAssetFromContract;
    private handleWebSocketMessage;
    private parsePlayerData;
    private parseAssetArray;
    private parseAchievementArray;
    private parseAssetData;
}
//# sourceMappingURL=DojoGameAdapter.d.ts.map