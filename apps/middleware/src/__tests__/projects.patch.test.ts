import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';

async function signup(email: string) {
  const res = await request(app).post('/api/auth/signup').send({ name: 'Owner', email, password: 'Test1234!' });
  expect(res.status).toBe(201);
  return { Authorization: `Bearer ${res.body.accessToken as string}` };
}

describe('PATCH /api/projects/:id', () => {
  it('renames a project in the caller workspace and rejects everyone else', async () => {
    const owner = await signup(`rename-${Date.now()}@aria.dev`);
    const created = await request(app).post('/api/projects').set(owner).send({ name: 'Before', description: 'shop' });
    expect(created.status).toBe(201);
    const id = created.body.project.id as string;

    const renamed = await request(app).patch(`/api/projects/${id}`).set(owner).send({ name: 'After' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.project.name).toBe('After');
    expect(renamed.body.project.description).toBe('shop');

    const listed = await request(app).get('/api/projects').set(owner);
    expect(listed.body.projects.find((project: { id: string }) => project.id === id).name).toBe('After');

    const other = await signup(`other-${Date.now()}@aria.dev`);
    const hidden = await request(app).patch(`/api/projects/${id}`).set(other).send({ name: 'Stolen' });
    expect(hidden.status).toBe(404);

    const empty = await request(app).patch(`/api/projects/${id}`).set(owner).send({});
    expect(empty.status).toBe(400);
    const blank = await request(app).patch(`/api/projects/${id}`).set(owner).send({ name: '  ' });
    expect(blank.status).toBe(400);
    const extra = await request(app).patch(`/api/projects/${id}`).set(owner).send({ name: 'Nope', status: 'archived' });
    expect(extra.status).toBe(400);
  });
});
