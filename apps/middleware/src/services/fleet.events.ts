/**
 * In-process event bus for fleet activity originating in the middleware. The WebSocket hub
 * subscribes to `fleet.publish` here so dashboard clients can react live without any
 * Redis-side broadcast machinery in Sprint 10 (Sprint 14 adds the full Pub/Sub mesh).
 */

import { EventEmitter } from 'node:events';

let singleton: EventEmitter | null = null;

export function getFleetEvents(): EventEmitter {
  if (singleton) return singleton;
  singleton = new EventEmitter();
  singleton.setMaxListeners(50);
  return singleton;
}
