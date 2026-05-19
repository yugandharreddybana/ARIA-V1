import { describe, it, expect } from 'vitest';
import {
  registerAgentSchema, publishEventSchema, heartbeatSchema, shadowBranchSchema,
} from '../schemas/fleet.schemas';

describe('fleet schemas', () => {
  it('register accepts a minimal payload', () => {
    expect(() => registerAgentSchema.parse({ agentId: 'a', agentFamily: 'qa-e2e' })).not.toThrow();
  });

  it('register rejects unknown keys', () => {
    expect(() => registerAgentSchema.parse({ agentId: 'a', agentFamily: 'q', stowaway: 1 })).toThrow();
  });

  it('publish requires all five envelope fields', () => {
    expect(() => publishEventSchema.parse({
      epicId: 'e', topic: 'CONTRACT_DRAFTED', payload: '{}', agentId: 'a', signature: 'sig',
    })).not.toThrow();
    expect(() => publishEventSchema.parse({
      epicId: 'e', topic: 'X', payload: '{}', agentId: 'a',
    })).toThrow();
  });

  it('heartbeat enforces state enum', () => {
    expect(() => heartbeatSchema.parse({ agentId: 'a', state: 'broken' })).toThrow();
    expect(() => heartbeatSchema.parse({ agentId: 'a', state: 'waiting', waitingOn: 'b' })).not.toThrow();
  });

  it('shadow branch accepts only ticketRef + optional diff', () => {
    expect(() => shadowBranchSchema.parse({ ticketRef: 'JIRA-42' })).not.toThrow();
    expect(() => shadowBranchSchema.parse({ ticketRef: 'JIRA-42', extra: 'x' })).toThrow();
  });
});
