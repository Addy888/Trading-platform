import { loadBackendEnvironment } from '../../../config/env-loader';
import { OandaProvider } from './oanda.provider';

const originalEnvironment = {
  token: process.env.OANDA_API_TOKEN,
  accountId: process.env.OANDA_ACCOUNT_ID,
  environment: process.env.OANDA_ENVIRONMENT,
};

loadBackendEnvironment();

const credentialsConfigured = Boolean(
  process.env.OANDA_API_TOKEN?.trim(),
);
const accountIdConfigured = Boolean(
  process.env.OANDA_ACCOUNT_ID?.trim() &&
  !/^(YOUR_|<)/i.test(process.env.OANDA_ACCOUNT_ID.trim()),
);

(originalEnvironment.token === undefined
  ? delete process.env.OANDA_API_TOKEN
  : process.env.OANDA_API_TOKEN = originalEnvironment.token);
(originalEnvironment.accountId === undefined
  ? delete process.env.OANDA_ACCOUNT_ID
  : process.env.OANDA_ACCOUNT_ID = originalEnvironment.accountId);
(originalEnvironment.environment === undefined
  ? delete process.env.OANDA_ENVIRONMENT
  : process.env.OANDA_ENVIRONMENT = originalEnvironment.environment);

(credentialsConfigured ? describe : describe.skip)('OANDA live connectivity', () => {
  it('validates access and fetches genuine EUR/USD M1 candles without an account ID', async () => {
    loadBackendEnvironment();
    const provider = new OandaProvider();
    try {
      await provider.validateCredentials();
      const candles = await provider.getTimeSeries('EUR_USD', '1m', 5);
      expect(candles.length).toBeGreaterThan(0);
      expect(candles.every((candle) =>
        candle.timestamp instanceof Date &&
        candle.open.isFinite() &&
        candle.high.isFinite() &&
        candle.low.isFinite() &&
        candle.close.isFinite(),
      )).toBe(true);
    } finally {
      if (originalEnvironment.token === undefined) delete process.env.OANDA_API_TOKEN;
      else process.env.OANDA_API_TOKEN = originalEnvironment.token;
      if (originalEnvironment.accountId === undefined) delete process.env.OANDA_ACCOUNT_ID;
      else process.env.OANDA_ACCOUNT_ID = originalEnvironment.accountId;
      if (originalEnvironment.environment === undefined) delete process.env.OANDA_ENVIRONMENT;
      else process.env.OANDA_ENVIRONMENT = originalEnvironment.environment;
    }
  });

  if (accountIdConfigured) {
    it('loads account instruments when an account ID is configured', async () => {
      loadBackendEnvironment();
      try {
        const instruments = await new OandaProvider().getAvailableInstruments();
        expect(instruments).toContain('EUR_USD');
      } finally {
        if (originalEnvironment.token === undefined) delete process.env.OANDA_API_TOKEN;
        else process.env.OANDA_API_TOKEN = originalEnvironment.token;
        if (originalEnvironment.accountId === undefined) delete process.env.OANDA_ACCOUNT_ID;
        else process.env.OANDA_ACCOUNT_ID = originalEnvironment.accountId;
        if (originalEnvironment.environment === undefined) delete process.env.OANDA_ENVIRONMENT;
        else process.env.OANDA_ENVIRONMENT = originalEnvironment.environment;
      }
    });
  }
});
