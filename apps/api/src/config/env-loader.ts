import { config } from 'dotenv';
import { resolve } from 'node:path';

export function getBackendEnvFilePath(): string {
  return resolve(__dirname, '..', '..', '.env');
}

export function loadBackendEnvironment(): void {
  const result = config({ path: getBackendEnvFilePath() });
  const error = result.error as NodeJS.ErrnoException | undefined;
  if (error && error.code !== 'ENOENT') {
    throw error;
  }
}
