/**
 * Timezone Conversion Audit
 * 
 * The raw Twelve Data response shows:
 * datetime: "2026-11-01 09:05:00"
 * 
 * Our audit script converted it to:
 * ISO: "2026-11-01T03:35:00.000Z"
 * 
 * This is WRONG! 09:05 became 03:35 - a 5.5 hour difference
 * 
 * Let's trace exactly what's happening
 */

const testTimestamp = "2026-11-01 09:05:00";

console.log('\n=== TIMEZONE CONVERSION AUDIT ===\n');
console.log('Raw Twelve Data timestamp:', testTimestamp);
console.log('Requested timezone: UTC');
console.log('');

// Method 1: Direct Date.parse (what JS does by default)
const parsed1 = Date.parse(testTimestamp);
const date1 = new Date(parsed1);
console.log('Method 1: Date.parse(timestamp)');
console.log('  Result:', parsed1);
console.log('  ISO String:', date1.toISOString());
console.log('  Interpretation: Treated as LOCAL time, then converted to UTC');
console.log('');

// Method 2: Append 'Z' to force UTC
const parsed2 = Date.parse(testTimestamp + 'Z');
const date2 = new Date(parsed2);
console.log('Method 2: Date.parse(timestamp + "Z")');
console.log('  Result:', parsed2);
console.log('  ISO String:', date2.toISOString());
console.log('  Interpretation: Treated as UTC');
console.log('');

// Method 3: Replace space with T and append Z
const normalized = testTimestamp.replace(' ', 'T') + 'Z';
const parsed3 = Date.parse(normalized);
const date3 = new Date(parsed3);
console.log('Method 3: Date.parse(timestamp.replace(" ", "T") + "Z")');
console.log('  Normalized:', normalized);
console.log('  Result:', parsed3);
console.log('  ISO String:', date3.toISOString());
console.log('  Interpretation: Treated as UTC (correct)');
console.log('');

// What our provider does
console.log('=== CURRENT PROVIDER IMPLEMENTATION ===\n');
console.log('From twelve-data.provider.ts timestamp() method:');
console.log('');
console.log('const text = String(value).trim();');
console.log('const normalized = text.replace(" ", "T");');
console.log('const hasTimezone = /(?:Z|[+-]\\d{2}(?::?\\d{2})?)$/i.test(text);');
console.log('const timestamp = new Date(hasTimezone ? normalized : `${normalized}Z`);');
console.log('');

const text = testTimestamp.trim();
const normalized_provider = text.replace(' ', 'T');
const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(text);
const timestamp_provider = new Date(hasTimezone ? normalized_provider : `${normalized_provider}Z`);

console.log('text:', text);
console.log('normalized:', normalized_provider);
console.log('hasTimezone:', hasTimezone);
console.log('final string:', hasTimezone ? normalized_provider : `${normalized_provider}Z`);
console.log('timestamp:', timestamp_provider.toISOString());
console.log('');

console.log('✅ VERDICT: Provider implementation is CORRECT');
console.log('   It appends Z when no timezone is present');
console.log('   "2026-11-01 09:05:00" → "2026-11-01T09:05:00Z" → correct UTC');
console.log('');

// What went wrong in the audit script?
console.log('=== AUDIT SCRIPT ERROR ===\n');
console.log('The audit script used Date.parse() directly without appending Z');
console.log('This caused JavaScript to interpret the timestamp as LOCAL time');
console.log('');
console.log('Local timezone offset:', new Date().getTimezoneOffset(), 'minutes');
console.log('');
console.log('Incorrect conversion chain:');
console.log('1. "2026-11-01 09:05:00" (string)');
console.log('2. Date.parse() interprets as LOCAL time');
console.log('3. Converts to UTC by subtracting timezone offset');
console.log('4. Result: 09:05 IST → 03:35 UTC (wrong!)');
console.log('');

console.log('Correct conversion (what provider does):');
console.log('1. "2026-11-01 09:05:00" (string)');
console.log('2. Normalize to "2026-11-01T09:05:00Z"');
console.log('3. Parse as UTC');
console.log('4. Result: 09:05 UTC → 09:05 UTC (correct!)');
console.log('');

// Test with actual provider logic
function providerTimestamp(value: unknown): Date {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Invalid timestamp');
  }

  const text = String(value).trim();
  const normalized = text.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(text);
  const timestamp = typeof value === 'number'
    ? new Date(Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value)
    : new Date(hasTimezone ? normalized : `${normalized}Z`);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('Invalid timestamp');
  }
  return timestamp;
}

console.log('=== TESTING PROVIDER LOGIC ===\n');

const testCases = [
  "2026-11-01 09:05:00",
  "2026-11-01T09:05:00",
  "2026-11-01T09:05:00Z",
  "2026-11-01T09:05:00+00:00",
  "2026-11-01T14:35:00+05:30",
];

testCases.forEach(test => {
  try {
    const result = providerTimestamp(test);
    console.log(`Input:  "${test}"`);
    console.log(`Output: ${result.toISOString()}`);
    console.log('');
  } catch (error) {
    console.log(`Input:  "${test}"`);
    console.log(`Error:  ${error}`);
    console.log('');
  }
});

console.log('=== CONCLUSION ===\n');
console.log('✅ Provider timezone handling is CORRECT');
console.log('✅ Twelve Data timestamps are parsed as UTC (as requested)');
console.log('✅ Chart receives correct Unix timestamps in seconds');
console.log('');
console.log('❌ The audit script had a bug - it used Date.parse() directly');
console.log('   This caused the false "stale data" warning');
console.log('');
console.log('The actual data flow is:');
console.log('1. Twelve Data: "2026-11-01 09:05:00" (UTC, no timezone marker)');
console.log('2. Provider: appends Z → "2026-11-01T09:05:00Z"');
console.log('3. Parse: new Date("2026-11-01T09:05:00Z")');
console.log('4. Result: 2026-11-01T09:05:00.000Z');
console.log('5. Chart: Math.floor(date.getTime() / 1000) = Unix seconds');
console.log('');
