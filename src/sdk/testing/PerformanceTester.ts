/**
 * Performance testing utilities for SDK
 * Measures and analyzes SDK performance characteristics
 */

import { DojoGameSDK } from '../DojoGameSDK';
import { MockDataGenerator } from './MockDataGenerator';

export interface PerformanceTestConfig {
  iterations: number;
  concurrency: number;
  warmupIterations: number;
  timeoutMs: number;
  memoryThresholdMB: number;
}

export interface PerformanceTestResult {
  testName: string;
  passed: boolean;
  metrics: PerformanceMetrics;
  details: any;
  recommendations: string[];
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number; // operations per second
  errorRate: number;
  memoryUsage: MemoryUsage;
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface PerformanceTestSuite {
  suiteName: string;
  tests: PerformanceTestResult[];
  overallPassed: boolean;
  totalDuration: number;
  summary: {
    averageResponseTime: number;
    totalOperations: number;
    overallThroughput: number;
    overallErrorRate: number;
  };
}

export class PerformanceTester {
  private sdk: DojoGameSDK;
  private mockGenerator: MockDataGenerator;
  private config: PerformanceTestConfig;

  constructor(sdk: DojoGameSDK, config?: Partial<PerformanceTestConfig>) {
    this.sdk = sdk;
    this.mockGenerator = new MockDataGenerator();
    
    this.config = {
      iterations: 100,
      concurrency: 5,
      warmupIterations: 10,
      timeoutMs: 30000,
      memoryThresholdMB: 100,
      ...config
    };
  }

  /**
   * Run complete performance test suite
   */
  async runPerformanceTestSuite(): Promise<PerformanceTestSuite> {
    const startTime = Date.now();
    console.log('⚡ Starting performance test suite...');

    // Warmup
    await this.warmup();

    const tests: PerformanceTestResult[] = [];

    // Run individual performance tests
    tests.push(await this.testSyncPerformance());
    tests.push(await this.testValidationPerformance());
    tests.push(await this.testBatchPerformance());
    tests.push(await this.testConcurrentOperations());
    tests.push(await this.testMemoryUsage());
    tests.push(await this.testErrorHandlingPerformance());
    tests.push(await this.testLargeDatasetPerformance());

    const totalDuration = Date.now() - startTime;
    const summary = this.calculateSummary(tests);

    const suite: PerformanceTestSuite = {
      suiteName: 'SDK Performance Test Suite',
      tests,
      overallPassed: tests.every(t => t.passed),
      totalDuration,
      summary
    };

    console.log(`⚡ Performance test suite completed in ${totalDuration}ms`);
    return suite;
  }

  /**
   * Test player data sync performance
   */
  async testSyncPerformance(): Promise<PerformanceTestResult> {
    console.log('📊 Testing sync performance...');
    
    const responseTimes: number[] = [];
    const errors: Error[] = [];
    const memoryBefore = process.memoryUsage();

    for (let i = 0; i < this.config.iterations; i++) {
      const playerId = `perf-test-player-${i}`;
      const startTime = Date.now();

      try {
        await this.sdk.syncPlayerData(playerId);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      } catch (error) {
        errors.push(error as Error);
        responseTimes.push(this.config.timeoutMs); // Use timeout as max response time
      }
    }

    const memoryAfter = process.memoryUsage();
    const metrics = this.calculateMetrics(responseTimes, errors, memoryBefore, memoryAfter);

    const passed = metrics.averageResponseTime < 2000 && metrics.errorRate < 0.05;

    return {
      testName: 'Sync Performance',
      passed,
      metrics,
      details: {
        iterations: this.config.iterations,
        successfulSyncs: responseTimes.length - errors.length,
        failedSyncs: errors.length
      },
      recommendations: this.generateSyncRecommendations(metrics)
    };
  }

  /**
   * Test data validation performance
   */
  async testValidationPerformance(): Promise<PerformanceTestResult> {
    console.log('🔍 Testing validation performance...');
    
    const responseTimes: number[] = [];
    const errors: Error[] = [];
    const memoryBefore = process.memoryUsage();

    for (let i = 0; i < this.config.iterations; i++) {
      const testData = this.mockGenerator.generatePlayerData();
      const startTime = Date.now();

      try {
        await this.sdk.validator.validateStandardizedData(testData);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      } catch (error) {
        errors.push(error as Error);
        responseTimes.push(this.config.timeoutMs);
      }
    }

    const memoryAfter = process.memoryUsage();
    const metrics = this.calculateMetrics(responseTimes, errors, memoryBefore, memoryAfter);

    const passed = metrics.averageResponseTime < 100 && metrics.errorRate < 0.01;

    return {
      testName: 'Validation Performance',
      passed,
      metrics,
      details: {
        iterations: this.config.iterations,
        successfulValidations: responseTimes.length - errors.length,
        failedValidations: errors.length
      },
      recommendations: this.generateValidationRecommendations(metrics)
    };
  }

  /**
   * Test batch operation performance
   */
  async testBatchPerformance(): Promise<PerformanceTestResult> {
    console.log('📦 Testing batch performance...');
    
    const responseTimes: number[] = [];
    const errors: Error[] = [];
    const memoryBefore = process.memoryUsage();

    const batchSizes = [5, 10, 20, 50];
    
    for (const batchSize of batchSizes) {
      for (let i = 0; i < Math.floor(this.config.iterations / batchSizes.length); i++) {
        const playerIds = Array.from({ length: batchSize }, (_, idx) => `batch-perf-${batchSize}-${i}-${idx}`);
        const startTime = Date.now();

        try {
          await this.sdk.batchSyncPlayers(playerIds, Math.min(batchSize, 10));
          const responseTime = Date.now() - startTime;
          responseTimes.push(responseTime);
        } catch (error) {
          errors.push(error as Error);
          responseTimes.push(this.config.timeoutMs);
        }
      }
    }

    const memoryAfter = process.memoryUsage();
    const metrics = this.calculateMetrics(responseTimes, errors, memoryBefore, memoryAfter);

    const passed = metrics.averageResponseTime < 10000 && metrics.errorRate < 0.1;

    return {
      testName: 'Batch Performance',
      passed,
      metrics,
      details: {
        batchSizes,
        totalBatches: responseTimes.length,
        successfulBatches: responseTimes.length - errors.length,
        failedBatches: errors.length
      },
      recommendations: this.generateBatchRecommendations(metrics)
    };
  }

  /**
   * Test concurrent operations performance
   */
  async testConcurrentOperations(): Promise<PerformanceTestResult> {
    console.log('🔄 Testing concurrent operations...');
    
    const responseTimes: number[] = [];
    const errors: Error[] = [];
    const memoryBefore = process.memoryUsage();

    const concurrentBatches = Math.ceil(this.config.iterations / this.config.concurrency);

    for (let batch = 0; batch < concurrentBatches; batch++) {
      const promises: Promise<void>[] = [];

      for (let i = 0; i < this.config.concurrency; i++) {
        const playerId = `concurrent-perf-${batch}-${i}`;
        
        const promise = (async () => {
          const startTime = Date.now();
          try {
            await this.sdk.syncPlayerData(playerId);
            const responseTime = Date.now() - startTime;
            responseTimes.push(responseTime);
          } catch (error) {
            errors.push(error as Error);
            responseTimes.push(this.config.timeoutMs);
          }
        })();

        promises.push(promise);
      }

      await Promise.all(promises);
    }

    const memoryAfter = process.memoryUsage();
    const metrics = this.calculateMetrics(responseTimes, errors, memoryBefore, memoryAfter);

    const passed = metrics.averageResponseTime < 3000 && metrics.errorRate < 0.1;

    return {
      testName: 'Concurrent Operations',
      passed,
      metrics,
      details: {
        concurrency: this.config.concurrency,
        totalOperations: responseTimes.length,
        successfulOperations: responseTimes.length - errors.length,
        failedOperations: errors.length
      },
      recommendations: this.generateConcurrencyRecommendations(metrics)
    };
  }

  /**
   * Test memory usage patterns
   */
  async testMemoryUsage(): Promise<PerformanceTestResult> {
    console.log('💾 Testing memory usage...');
    
    const memorySnapshots: MemoryUsage[] = [];
    const errors: Error[] = [];
    const responseTimes: number[] = [];

    // Take initial memory snapshot
    memorySnapshots.push(this.getMemoryUsage());

    // Perform operations and track memory
    for (let i = 0; i < this.config.iterations; i++) {
      const startTime = Date.now();
      
      try {
        const testData = this.mockGenerator.generateLargePlayerData();
        await this.sdk.validator.validateStandardizedData(testData);
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);

        // Take memory snapshot every 10 iterations
        if (i % 10 === 0) {
          memorySnapshots.push(this.getMemoryUsage());
        }
      } catch (error) {
        errors.push(error as Error);
        responseTimes.push(this.config.timeoutMs);
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Take final memory snapshot
    memorySnapshots.push(this.getMemoryUsage());

    const finalMemory = memorySnapshots[memorySnapshots.length - 1];
    const initialMemory = memorySnapshots[0];
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryGrowthMB = memoryGrowth / (1024 * 1024);

    const metrics = this.calculateMetrics(responseTimes, errors, initialMemory, finalMemory);
    const passed = memoryGrowthMB < this.config.memoryThresholdMB && metrics.errorRate < 0.05;

    return {
      testName: 'Memory Usage',
      passed,
      metrics,
      details: {
        initialMemoryMB: Math.round(initialMemory.heapUsed / (1024 * 1024)),
        finalMemoryMB: Math.round(finalMemory.heapUsed / (1024 * 1024)),
        memoryGrowthMB: Math.round(memoryGrowthMB),
        memoryThresholdMB: this.config.memoryThresholdMB,
        snapshots: memorySnapshots.length
      },
      recommendations: this.generateMemoryRecommendations(memoryGrowthMB, this.config.memoryThresholdMB)
    };
  }

  /**
   * Test error handling performance
   */
  async testErrorHandlingPerformance(): Promise<PerformanceTestResult> {
    console.log('⚠️ Testing error handling performance...');
    
    const responseTimes: number[] = [];
    const errors: Error[] = [];
    const memoryBefore = process.memoryUsage();

    // Test with invalid data to trigger errors
    for (let i = 0; i < Math.floor(this.config.iterations / 2); i++) {
      const startTime = Date.now();

      try {
        // Test with invalid player ID
        await this.sdk.syncPlayerData('');
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      } catch (error) {
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
        errors.push(error as Error);
      }
    }

    // Test with malformed data
    for (let i = 0; i < Math.floor(this.config.iterations / 2); i++) {
      const startTime = Date.now();

      try {
        const malformedData = this.mockGenerator.generateMalformedData();
        await this.sdk.validator.validateStandardizedData(malformedData as any);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      } catch (error) {
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
        errors.push(error as Error);
      }
    }

    const memoryAfter = process.memoryUsage();
    const metrics = this.calculateMetrics(responseTimes, errors, memoryBefore, memoryAfter);

    // For error handling, we expect errors but want fast response times
    const passed = metrics.averageResponseTime < 1000;

    return {
      testName: 'Error Handling Performance',
      passed,
      metrics,
      details: {
        totalTests: responseTimes.length,
        expectedErrors: errors.length,
        errorHandlingSpeed: metrics.averageResponseTime
      },
      recommendations: this.generateErrorHandlingRecommendations(metrics)
    };
  }

  /**
   * Test performance with large datasets
   */
  async testLargeDatasetPerformance(): Promise<PerformanceTestResult> {
    console.log('📈 Testing large dataset performance...');
    
    const responseTimes: number[] = [];
    const errors: Error[] = [];
    const memoryBefore = process.memoryUsage();

    const iterations = Math.min(this.config.iterations, 20); // Limit for large datasets

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();

      try {
        const largeData = this.mockGenerator.generateLargePlayerData();
        await this.sdk.validator.validateStandardizedData(largeData);
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      } catch (error) {
        errors.push(error as Error);
        responseTimes.push(this.config.timeoutMs);
      }
    }

    const memoryAfter = process.memoryUsage();
    const metrics = this.calculateMetrics(responseTimes, errors, memoryBefore, memoryAfter);

    const passed = metrics.averageResponseTime < 5000 && metrics.errorRate < 0.1;

    return {
      testName: 'Large Dataset Performance',
      passed,
      metrics,
      details: {
        iterations,
        averageDatasetSize: '~100 assets, ~50 achievements',
        successfulProcessing: responseTimes.length - errors.length,
        failedProcessing: errors.length
      },
      recommendations: this.generateLargeDatasetRecommendations(metrics)
    };
  }

  // Private helper methods

  private async warmup(): Promise<void> {
    console.log('🔥 Warming up...');
    
    for (let i = 0; i < this.config.warmupIterations; i++) {
      try {
        await this.sdk.syncPlayerData(`warmup-player-${i}`);
      } catch (error) {
        // Ignore warmup errors
      }
    }
  }

  private calculateMetrics(
    responseTimes: number[], 
    errors: Error[], 
    memoryBefore: MemoryUsage, 
    memoryAfter: MemoryUsage
  ): PerformanceMetrics {
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    const totalOperations = responseTimes.length;
    const totalTime = responseTimes.reduce((sum, time) => sum + time, 0);

    return {
      averageResponseTime: totalOperations > 0 ? totalTime / totalOperations : 0,
      minResponseTime: sortedTimes[0] || 0,
      maxResponseTime: sortedTimes[sortedTimes.length - 1] || 0,
      p50ResponseTime: this.getPercentile(sortedTimes, 50),
      p95ResponseTime: this.getPercentile(sortedTimes, 95),
      p99ResponseTime: this.getPercentile(sortedTimes, 99),
      throughput: totalOperations > 0 ? (totalOperations * 1000) / totalTime : 0,
      errorRate: totalOperations > 0 ? errors.length / totalOperations : 0,
      memoryUsage: memoryAfter
    };
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private getMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    };
  }

  private calculateSummary(tests: PerformanceTestResult[]) {
    const totalOperations = tests.reduce((sum, test) => {
      return sum + (test.details.iterations || test.details.totalOperations || 0);
    }, 0);

    const totalResponseTime = tests.reduce((sum, test) => {
      return sum + (test.metrics.averageResponseTime * (test.details.iterations || test.details.totalOperations || 1));
    }, 0);

    const totalErrors = tests.reduce((sum, test) => {
      return sum + (test.details.failedSyncs || test.details.failedOperations || test.details.expectedErrors || 0);
    }, 0);

    return {
      averageResponseTime: totalOperations > 0 ? totalResponseTime / totalOperations : 0,
      totalOperations,
      overallThroughput: totalOperations > 0 ? (totalOperations * 1000) / totalResponseTime : 0,
      overallErrorRate: totalOperations > 0 ? totalErrors / totalOperations : 0
    };
  }

  // Recommendation generators

  private generateSyncRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.averageResponseTime > 2000) {
      recommendations.push('Consider optimizing data fetching and processing');
    }
    
    if (metrics.errorRate > 0.05) {
      recommendations.push('Improve error handling and retry mechanisms');
    }
    
    if (metrics.p95ResponseTime > 5000) {
      recommendations.push('Investigate and optimize slow sync operations');
    }
    
    return recommendations;
  }

  private generateValidationRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.averageResponseTime > 100) {
      recommendations.push('Optimize validation algorithms');
    }
    
    if (metrics.errorRate > 0.01) {
      recommendations.push('Review validation logic for edge cases');
    }
    
    return recommendations;
  }

  private generateBatchRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.averageResponseTime > 10000) {
      recommendations.push('Consider reducing batch sizes or increasing concurrency');
    }
    
    if (metrics.errorRate > 0.1) {
      recommendations.push('Improve batch error handling and partial failure recovery');
    }
    
    return recommendations;
  }

  private generateConcurrencyRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.averageResponseTime > 3000) {
      recommendations.push('Consider reducing concurrency level or optimizing resource usage');
    }
    
    if (metrics.errorRate > 0.1) {
      recommendations.push('Improve concurrent operation error handling');
    }
    
    return recommendations;
  }

  private generateMemoryRecommendations(memoryGrowthMB: number, thresholdMB: number): string[] {
    const recommendations: string[] = [];
    
    if (memoryGrowthMB > thresholdMB) {
      recommendations.push('Investigate memory leaks and optimize memory usage');
    }
    
    if (memoryGrowthMB > thresholdMB * 0.8) {
      recommendations.push('Consider implementing more aggressive garbage collection');
    }
    
    return recommendations;
  }

  private generateErrorHandlingRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.averageResponseTime > 1000) {
      recommendations.push('Optimize error detection and handling speed');
    }
    
    return recommendations;
  }

  private generateLargeDatasetRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.averageResponseTime > 5000) {
      recommendations.push('Consider implementing streaming or chunked processing for large datasets');
    }
    
    if (metrics.errorRate > 0.1) {
      recommendations.push('Improve large dataset error handling and recovery');
    }
    
    return recommendations;
  }
}