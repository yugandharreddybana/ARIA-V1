import { describe, it, expect } from 'vitest';
import { renderHover } from '../server';

describe('LSP server hover rendering', () => {
  it('renders a full markdown card when every field is present', () => {
    const md = renderHover({
      symbol: 'getUserById',
      filePath: 'src/backend/user.ts',
      summary:  'Fetches a user by id, including profile.',
      module:   'api-service: user + account management',
      domain:   'user-authentication: OAuth 2.0 + JWT RS256 (ADR-0042)',
      decisions: [{ adrId: 'ADR-0042', title: 'Auth protocol', summary: 'JWT RS256' }],
      latencyMs: 87,
    });
    expect(md).toContain('**getUserById**');
    expect(md).toContain('Fetches a user by id');
    expect(md).toContain('**module:**');
    expect(md).toContain('ADR-0042');
    expect(md).toContain('87 ms');
  });

  it('skips empty sections gracefully', () => {
    const md = renderHover({
      symbol: 'noop', filePath: 'x.ts',
      summary: null, module: null, domain: null, decisions: [], latencyMs: 0,
    });
    expect(md).toContain('**noop**');
    expect(md).not.toContain('**module:**');
    expect(md).not.toContain('**governing ADRs:**');
  });
});
