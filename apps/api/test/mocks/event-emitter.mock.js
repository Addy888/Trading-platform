"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitterModule = exports.EventEmitter2 = void 0;
class EventEmitter2 {
    constructor() {
        this.on = jest.fn();
        this.emit = jest.fn();
        this.once = jest.fn();
        this.removeListener = jest.fn();
        this.removeAllListeners = jest.fn();
        this.listeners = jest.fn().mockReturnValue([]);
        this.listenerCount = jest.fn().mockReturnValue(0);
    }
}
exports.EventEmitter2 = EventEmitter2;
exports.EventEmitterModule = {
    forRoot: jest.fn().mockReturnValue({
        module: class MockEventEmitterModule {
        },
        providers: [],
        exports: [],
    }),
};
//# sourceMappingURL=event-emitter.mock.js.map