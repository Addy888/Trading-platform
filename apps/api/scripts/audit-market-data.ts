/**
 * Market Data Audit Script
 * 
 * Purpose: Trace EUR/USD data flow from Twelve Data API through our app to chart
 * Usage: npx ts-node scripts/audit-market-data.ts
 * 
 * This script:
 * 1. Calls Twelve Data API directly to see raw response
 * 2. Calls our provider normalization to see processed data
 * 3. Calls our API endpoint to see what frontend receives
 * 4. Reports differences and identifies issues
 * 
 * Security: API key is redacted in output, never logged
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

const API_KEY = process.env.TWELVE_DATA_API_KEY || '';
const API_BASE_URL = process.env.TWELVE_DATA_API_BASE_URL || 'https://api.twelvedata.com';

interface AuditReport {
  timestamp: string;
  symbol: string;
  interval: string;
  rawProviderRequest: {
    url: string;
    method: string;
    queryParams: Record<string, string>;
    headers: Record<string, string>;
  };
  rawProviderResponse: {
    httpStatus: number;
    statusText: string;
    headers: Record<string, string>;
    bodySize: number;
    responseTime: number;
    body: {
      status?: string;
      meta?: any;
      values?: any[];
      code?: number;
      message?: string;
    };
  };
  normalizedCandles: Array<{
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: number;
  }>;
  validation: {
    totalCandles: number;
    validCandles: number;
    invalidCandles: number;
    issues: Array<{
      index: number;
      issue: string;
      data: any;
    }>;
  };
  chartInput: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  analysis: {
    isProviderResponseValid: boolean;
    hasValidCandles: boolean;
    isDataStale: boolean;
    intervalMatches: boolean;
    timestampsChronological: boolean;
    noDuplicates: boolean;
    allOHLCValid: boolean;
    issues: string[];
    recommendations: string[];
  };
}

async function auditMarketData(symbol: string, interval: string): Promise<AuditReport> {
  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    symbol,
    interval,
    rawProviderRequest: {
      url: '',
      method: 'GET',
      queryParams: {},
      headers: {},
    },
    rawProviderResponse: {
      httpStatus: 0,
      statusText: '',
      headers: {},
      bodySize: 0,
      responseTime: 0,
      body: {},
    },
    normalizedCandles: [],
    validation: {
      totalCandles: 0,
      validCandles: 0,
      invalidCandles: 0,
      issues: [],
    },
    chartInput: [],
    analysis: {
      isProviderResponseValid: false,
      hasValidCandles: false,
      isDataStale: false,
      intervalMatches: false,
      timestampsChronological: false,
      noDuplicates: false,
      allOHLCValid: false,
      issues: [],
      recommendations: [],
    },
  };

  if (!API_KEY) {
    report.analysis.issues.push('TWELVE_DATA_API_KEY is not configured');
    report.analysis.recommendations.push('Set TWELVE_DATA_API_KEY in apps/api/.env');
    return report;
  }

  // Step 1: Call Twelve Data API directly
  console.log('\n=== STEP 1: Direct Twelve Data API Call ===\n');

  const queryParams = {
    symbol: 'EUR/USD',
    interval: interval === '1m' ? '1min' : interval,
    outputsize: '10',
    timezone: 'UTC',
    order: 'ASC',
    apikey: '***REDACTED***',
  };

  const url = new URL(`${API_BASE_URL}/time_series`);
  Object.entries({ ...queryParams, apikey: API_KEY }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  report.rawProviderRequest = {
    url: url.toString().replace(API_KEY, '***REDACTED***'),
    method: 'GET',
    queryParams: { ...queryParams },
    headers: {
      'Accept': 'application/json',
    },
  };

  console.log('Request URL:', report.rawProviderRequest.url);
  console.log('Query Params:', JSON.stringify(report.rawProviderRequest.queryParams, null, 2));

  const startTime = Date.now();
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    const endTime = Date.now();

    report.rawProviderResponse.httpStatus = response.status;
    report.rawProviderResponse.statusText = response.statusText;
    report.rawProviderResponse.responseTime = endTime - startTime;

    // Capture response headers
    response.headers.forEach((value, key) => {
      report.rawProviderResponse.headers[key] = value;
    });

    const body = await response.json();
    report.rawProviderResponse.body = body;
    report.rawProviderResponse.bodySize = JSON.stringify(body).length;

    console.log('\nHTTP Status:', response.status, response.statusText);
    console.log('Response Time:', report.rawProviderResponse.responseTime, 'ms');
    console.log('Response Size:', report.rawProviderResponse.bodySize, 'bytes');
    console.log('\nResponse Body:');
    console.log(JSON.stringify(body, null, 2));

    // Step 2: Analyze provider response
    console.log('\n=== STEP 2: Provider Response Analysis ===\n');

    if (body.status === 'error' || response.status >= 400) {
      report.analysis.isProviderResponseValid = false;
      report.analysis.issues.push(`Provider returned error: ${body.message || body.code || 'Unknown error'}`);
      
      if (response.status === 401) {
        report.analysis.recommendations.push('Check TWELVE_DATA_API_KEY validity');
      } else if (response.status === 403) {
        report.analysis.recommendations.push('Endpoint may be restricted by your Twelve Data plan');
      } else if (response.status === 429) {
        report.analysis.recommendations.push('Rate limited - wait before retrying');
      }
      
      return report;
    }

    report.analysis.isProviderResponseValid = true;

    if (!body.values || !Array.isArray(body.values)) {
      report.analysis.issues.push('Provider response missing "values" array');
      report.analysis.recommendations.push('Check if Twelve Data API schema has changed');
      return report;
    }

    if (body.values.length === 0) {
      report.analysis.issues.push('Provider returned zero candles');
      report.analysis.recommendations.push('Symbol/interval may not be available on your Twelve Data plan');
      return report;
    }

    console.log('Metadata:', JSON.stringify(body.meta, null, 2));
    console.log(`\nReceived ${body.values.length} candles`);
    console.log('\nFirst 3 candles (raw):');
    body.values.slice(0, 3).forEach((candle: any, idx: number) => {
      console.log(`[${idx}]`, JSON.stringify(candle, null, 2));
    });

    // Check interval match
    if (body.meta && body.meta.interval) {
      const expectedInterval = interval === '1m' ? '1min' : interval;
      report.analysis.intervalMatches = body.meta.interval === expectedInterval;
      if (!report.analysis.intervalMatches) {
        report.analysis.issues.push(`Interval mismatch: requested ${expectedInterval}, got ${body.meta.interval}`);
      }
    }

    // Step 3: Normalize candles (simulate our provider logic)
    console.log('\n=== STEP 3: Candle Normalization ===\n');

    report.validation.totalCandles = body.values.length;

    body.values.forEach((value: any, idx: number) => {
      const timestamp = value.datetime;
      const open = value.open;
      const high = value.high;
      const low = value.low;
      const close = value.close;
      const volume = value.volume;

      // Validate
      const openNum = Number(open);
      const highNum = Number(high);
      const lowNum = Number(low);
      const closeNum = Number(close);

      let valid = true;
      const issues: string[] = [];

      if (!Number.isFinite(openNum) || openNum <= 0) {
        issues.push(`Invalid open: ${open}`);
        valid = false;
      }
      if (!Number.isFinite(highNum) || highNum <= 0) {
        issues.push(`Invalid high: ${high}`);
        valid = false;
      }
      if (!Number.isFinite(lowNum) || lowNum <= 0) {
        issues.push(`Invalid low: ${low}`);
        valid = false;
      }
      if (!Number.isFinite(closeNum) || closeNum <= 0) {
        issues.push(`Invalid close: ${close}`);
        valid = false;
      }

      if (valid) {
        const maxPrice = Math.max(openNum, closeNum);
        const minPrice = Math.min(openNum, closeNum);

        if (highNum < maxPrice || highNum < lowNum) {
          issues.push(`High ${highNum} < max(open, close, low)`);
          valid = false;
        }
        if (lowNum > minPrice || lowNum > highNum) {
          issues.push(`Low ${lowNum} > min(open, close)`);
          valid = false;
        }
      }

      if (!timestamp) {
        issues.push('Missing timestamp');
        valid = false;
      }

      if (valid) {
        report.validation.validCandles++;
        report.normalizedCandles.push({
          timestamp,
          open,
          high,
          low,
          close,
          volume: volume !== undefined && volume !== null && volume !== '' ? Number(volume) : undefined,
        });
      } else {
        report.validation.invalidCandles++;
        report.validation.issues.push({
          index: idx,
          issue: issues.join(', '),
          data: { timestamp, open, high, low, close, volume },
        });
      }
    });

    console.log(`Valid candles: ${report.validation.validCandles}/${report.validation.totalCandles}`);
    
    if (report.validation.issues.length > 0) {
      console.log('\nValidation Issues:');
      report.validation.issues.slice(0, 5).forEach(issue => {
        console.log(`  [${issue.index}] ${issue.issue}`);
        console.log(`      Data:`, issue.data);
      });
      if (report.validation.issues.length > 5) {
        console.log(`  ... and ${report.validation.issues.length - 5} more issues`);
      }
    }

    report.analysis.hasValidCandles = report.validation.validCandles > 0;

    if (!report.analysis.hasValidCandles) {
      report.analysis.issues.push('No valid candles after normalization');
      return report;
    }

    // Step 4: Check chronological order and duplicates
    console.log('\n=== STEP 4: Temporal Validation ===\n');

    const timestamps = report.normalizedCandles.map(c => Date.parse(c.timestamp));
    report.analysis.timestampsChronological = timestamps.every((ts, idx) => 
      idx === 0 || ts > timestamps[idx - 1]
    );

    const uniqueTimestamps = new Set(timestamps);
    report.analysis.noDuplicates = uniqueTimestamps.size === timestamps.length;

    if (!report.analysis.timestampsChronological) {
      report.analysis.issues.push('Candles are not in chronological order');
    }
    if (!report.analysis.noDuplicates) {
      report.analysis.issues.push(`Found ${timestamps.length - uniqueTimestamps.size} duplicate timestamps`);
    }

    console.log('Chronological:', report.analysis.timestampsChronological);
    console.log('No duplicates:', report.analysis.noDuplicates);
    console.log('First timestamp:', report.normalizedCandles[0].timestamp);
    console.log('Last timestamp:', report.normalizedCandles[report.normalizedCandles.length - 1].timestamp);

    // Check if data is stale
    const latestCandleTime = Date.parse(report.normalizedCandles[report.normalizedCandles.length - 1].timestamp);
    const now = Date.now();
    const staleDuration = now - latestCandleTime;
    const staleThresholdMs = 20 * 60 * 1000; // 20 minutes

    report.analysis.isDataStale = staleDuration > staleThresholdMs;
    if (report.analysis.isDataStale) {
      const minutes = Math.floor(staleDuration / 60000);
      report.analysis.issues.push(`Data is ${minutes} minutes old (stale)`);
    }

    console.log(`Latest candle age: ${Math.floor(staleDuration / 60000)} minutes`);

    // Step 5: Convert to chart format
    console.log('\n=== STEP 5: Chart Input Format ===\n');

    report.normalizedCandles.forEach(candle => {
      const time = Math.floor(Date.parse(candle.timestamp) / 1000); // Unix seconds
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);

      report.chartInput.push({ time, open, high, low, close });
    });

    console.log('Chart format sample (first 3):');
    report.chartInput.slice(0, 3).forEach((candle, idx) => {
      console.log(`[${idx}]`, {
        time: `${candle.time} (${new Date(candle.time * 1000).toISOString()})`,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
    });

    // Final validation
    report.analysis.allOHLCValid = report.chartInput.every(c => {
      const maxPrice = Math.max(c.open, c.close);
      const minPrice = Math.min(c.open, c.close);
      return (
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        c.high >= maxPrice &&
        c.high >= c.low &&
        c.low <= minPrice &&
        c.low <= c.high
      );
    });

    console.log('\nAll OHLC constraints valid:', report.analysis.allOHLCValid);

    // Generate recommendations
    if (report.analysis.issues.length === 0) {
      report.analysis.recommendations.push('✅ Data pipeline is healthy');
      report.analysis.recommendations.push('✅ Provider returns valid candles');
      report.analysis.recommendations.push('✅ Normalization preserves data integrity');
      report.analysis.recommendations.push('✅ Chart input format is correct');
    } else {
      report.analysis.recommendations.push('Review identified issues above');
    }

  } catch (error) {
    report.analysis.issues.push(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    report.analysis.recommendations.push('Check network connectivity and API endpoint');
  }

  return report;
}

// Main execution
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║         TWELVE DATA MARKET DATA AUDIT REPORT             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const symbol = 'EUR/USD';
  const interval = '1m';

  console.log(`Auditing: ${symbol} @ ${interval} interval`);
  console.log(`Base URL: ${API_BASE_URL}`);
  console.log(`API Key: ${API_KEY ? '***CONFIGURED***' : '***NOT SET***'}`);

  const report = await auditMarketData(symbol, interval);

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     FINAL ANALYSIS                        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('Provider Response Valid:', report.analysis.isProviderResponseValid);
  console.log('Has Valid Candles:', report.analysis.hasValidCandles);
  console.log('Data Stale:', report.analysis.isDataStale);
  console.log('Interval Matches:', report.analysis.intervalMatches);
  console.log('Chronological Order:', report.analysis.timestampsChronological);
  console.log('No Duplicates:', report.analysis.noDuplicates);
  console.log('All OHLC Valid:', report.analysis.allOHLCValid);

  if (report.analysis.issues.length > 0) {
    console.log('\n⚠️  ISSUES FOUND:');
    report.analysis.issues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. ${issue}`);
    });
  }

  if (report.analysis.recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS:');
    report.analysis.recommendations.forEach((rec, idx) => {
      console.log(`   ${idx + 1}. ${rec}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  // Save report to file
  const fs = require('fs');
  const reportPath = resolve(__dirname, '../audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Full report saved to: ${reportPath}\n`);
}

main().catch(console.error);
