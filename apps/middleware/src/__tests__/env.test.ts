import { afterEach, describe, expect, it } from 'vitest';
import { _resetEnvCacheForTests, validateEnv } from '../config/env';

describe('env flags', () => {
  const previousEnabled = process.env.ANTHROPIC_ENABLED;
  const previousKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (previousEnabled === undefined) delete process.env.ANTHROPIC_ENABLED;
    else process.env.ANTHROPIC_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    _resetEnvCacheForTests();
  });

  it('treats ANTHROPIC_ENABLED=false as off so an empty key can boot', () => {
    process.env.ANTHROPIC_ENABLED = 'false';
    delete process.env.ANTHROPIC_API_KEY;
    _resetEnvCacheForTests();
    expect(validateEnv().ANTHROPIC_ENABLED).toBe(false);
  });
});
