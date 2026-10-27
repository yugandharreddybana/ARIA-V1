import { describe, expect, it } from 'vitest';
import { githubFullName } from '../services/githubClient.service';

describe('githubFullName', () => {
  it('turns a short repo label plus GitHub URL into owner/name', () => {
    expect(githubFullName('demo-app', 'https://github.com/acme/demo-app')).toBe('acme/demo-app');
    expect(githubFullName('acme/demo-app', 'https://github.com/acme/demo-app')).toBe('acme/demo-app');
    expect(githubFullName('https://github.com/acme/demo-app.git', null)).toBe('acme/demo-app');
  });
});
