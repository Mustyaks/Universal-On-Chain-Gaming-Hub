/**
 * Simple test to verify our real-time synchronization implementation
 */

const { DataValidationService } = require('../DataValidationService');

// Simple test without Jest
async function testDataValidation() {
    console.log('Testing DataValidationService...');
    
    const config = {
        enableStrictValidation: false,
        maxDataAge: 300000,
        requiredFields: {
            gameData: ['playerId', 'gameId', 'lastUpdated'],
            assets: ['id', 'gameId', 'tokenId', 'contractAddress', 'owner'],
            achievements: ['id', 'gameId', 'playerId', 'title', 'earnedAt'],
            statistics: ['gameId', 'playerId']
        },
        assetValidation: {
            validateContractAddresses: false,
            validateOwnership: false,
            checkDuplicates: true
        },
        achievementValidation: {
            validateTimestamps: true,
            checkDuplicates: true,
            validateRarity: true
        }
    };
    
    const validationService = new DataValidationService(config);
    
    const mockGameData = {
        playerId: 'player123',
        gameId: 'dojo-chess',
        assets: [{
            id: 'asset1',
            gameId: 'dojo-chess',
            tokenId: '1',
            contractAddress: '0x123',
            assetType: 'NFT',
            metadata: {
                name: 'Chess Piece',
                description: 'A rare chess piece',
                image: 'https://example.com/image.png',
                attributes: []
            },
            owner: '0xabc',
            tradeable: true
        }],
        achievements: [{
            id: 'achievement1',
            gameId: 'dojo-chess',
            playerId: 'player123',
            achievementType: 'VICTORY',
            title: 'First Win',
            description: 'Won your first game',
            rarity: 'COMMON',
            earnedAt: Date.now() - 1000
        }],
        statistics: {
            gameId: 'dojo-chess',
            playerId: 'player123',
            playtime: 3600,
            level: 5,
            score: 1200,
            customStats: { wins: 10, losses: 5 }
        },
        lastUpdated: Date.now() - 1000
    };
    
    try {
        const result = await validationService.validateGameData(mockGameData);
        console.log('✅ Validation passed:', {
            isValid: result.isValid,
            score: result.score,
            errors: result.errors.length,
            warnings: result.warnings.length
        });
        
        if (result.errors.length > 0) {
            console.log('Errors:', result.errors);
        }
        
        return result.isValid;
    } catch (error) {
        console.error('❌ Validation failed:', error.message);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testDataValidation()
        .then(success => {
            console.log(success ? '✅ All tests passed!' : '❌ Tests failed!');
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = { testDataValidation };