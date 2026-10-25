import { describe, expect, it } from 'vitest';
import { buildKnowledgeMap, MOCK_REPO_FILES, MOCK_REPO_PATHS } from '../services/knowledgeMap';

describe('buildKnowledgeMap', () => {
  it('finds the stack, signup, login, homepage, and data entities from structure', () => {
    const map = buildKnowledgeMap(MOCK_REPO_PATHS, MOCK_REPO_FILES);
    expect(map.techStack.map((tech) => tech.name)).toEqual(expect.arrayContaining(['Next.js', 'React', 'PostgreSQL']));
    expect(map.flows.map((flow) => flow.flowKey)).toEqual(expect.arrayContaining(['signup', 'login', 'homepage']));
    expect(map.dataModel.map((entity) => entity.name)).toEqual(expect.arrayContaining(['User', 'Session']));
    expect(map.summary.toLowerCase()).toContain('signup');
  });
});
