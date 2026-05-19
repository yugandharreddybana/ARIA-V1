import { describe, it, expect } from 'vitest';
import {
  complianceScanSchema, complianceDecideSchema, gdprRedactSchema, auditExportSchema,
} from '../schemas/governance.schemas';

describe('governance schemas', () => {
  it('scan requires triggeredBy + diff', () => {
    expect(() => complianceScanSchema.parse({ triggeredBy: 'ci', diff: 'x' })).not.toThrow();
    expect(() => complianceScanSchema.parse({ triggeredBy: 'ci' })).toThrow();
  });

  it('decide enforces the three valid transitions', () => {
    expect(() => complianceDecideSchema.parse({ decidedBy: 'u', to: 'accepted'  })).not.toThrow();
    expect(() => complianceDecideSchema.parse({ decidedBy: 'u', to: 'rejected'  })).not.toThrow();
    expect(() => complianceDecideSchema.parse({ decidedBy: 'u', to: 'mitigated' })).not.toThrow();
    expect(() => complianceDecideSchema.parse({ decidedBy: 'u', to: 'whatever'  })).toThrow();
  });

  it('gdpr redact enforces enum reasons', () => {
    expect(() => gdprRedactSchema.parse({
      table: 'users', sourceId: 'u1', column: 'email',
      reason: 'gdpr-erasure', requestedBy: 'u',
    })).not.toThrow();
    expect(() => gdprRedactSchema.parse({
      table: 'users', sourceId: 'u1', column: 'email',
      reason: 'just-because', requestedBy: 'u',
    })).toThrow();
  });

  it('audit export enforces the 4 scopes', () => {
    expect(() => auditExportSchema.parse({ requestedBy: 'u', scope: 'all'  })).not.toThrow();
    expect(() => auditExportSchema.parse({ requestedBy: 'u', scope: 'pci'  })).toThrow();
  });

  it('rejects unknown keys via .strict()', () => {
    expect(() => complianceScanSchema.parse({
      triggeredBy: 'ci', diff: 'x', sneaky: 1,
    })).toThrow();
  });
});
