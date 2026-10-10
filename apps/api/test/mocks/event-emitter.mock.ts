/**
 * Mock for @nestjs/event-emitter
 * Used in Jest tests to avoid ES module issues
 */

export class EventEmitter2 {
  on = jest.fn();
  emit = jest.fn();
  once = jest.fn();
  removeListener = jest.fn();
  removeAllListeners = jest.fn();
  listeners = jest.fn().mockReturnValue([]);
  listenerCount = jest.fn().mockReturnValue(0);
}

export const EventEmitterModule = {
  forRoot: jest.fn().mockReturnValue({
    module: class MockEventEmitterModule {},
    providers: [],
    exports: [],
  }),
};
