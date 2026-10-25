import { writeFileSync } from 'node:fs';
import { startStub } from '../../scripts/provider-stub.mjs';

let close = async () => {};

export async function setup() {
  const stub = await startStub({ port: 0 });
  close = stub.close;
  writeFileSync('/tmp/aria-provider-stub.json', JSON.stringify({ port: stub.port, base: stub.base }));
}

export async function teardown() {
  await close();
}
