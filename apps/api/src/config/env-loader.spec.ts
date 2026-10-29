import { getBackendEnvFilePath } from './env-loader';
import { resolve } from 'node:path';

describe('backend environment file', () => {
  it('resolves the API .env file independently of the process working directory', () => {
    expect(getBackendEnvFilePath()).toBe(resolve(__dirname, '..', '..', '.env'));
    expect(getBackendEnvFilePath()).toMatch(/[\\/]apps[\\/]api[\\/]\.env$/);
  });
});
