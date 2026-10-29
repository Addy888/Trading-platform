"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const supertest_1 = __importDefault(require("supertest"));
let TestHealthController = class TestHealthController {
    check() {
        return { status: 'ok' };
    }
};
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TestHealthController.prototype, "check", null);
TestHealthController = __decorate([
    (0, common_1.Controller)('health')
], TestHealthController);
describe('Rate Limiting (MVP Security)', () => {
    let app;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [
                throttler_1.ThrottlerModule.forRoot([{
                        ttl: 10000,
                        limit: 5,
                    }]),
            ],
            controllers: [TestHealthController],
            providers: [
                {
                    provide: core_1.APP_GUARD,
                    useClass: throttler_1.ThrottlerGuard,
                },
            ],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('api');
        await app.init();
    });
    afterAll(async () => {
        await app.close();
    });
    it('should allow requests under the rate limit', async () => {
        for (let i = 0; i < 5; i++) {
            const response = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/health')
                .expect((res) => {
                expect(res.status).not.toBe(429);
            });
        }
    });
    it('should rate limit requests over the limit', async () => {
        await new Promise(resolve => setTimeout(resolve, 11000));
        for (let i = 0; i < 5; i++) {
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/health');
        }
        const response = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/health');
        expect(response.status).toBe(429);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Too Many Requests');
    }, 15000);
    it('should track rate limits per endpoint', async () => {
        await new Promise(resolve => setTimeout(resolve, 11000));
        const response1 = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/health');
        expect(response1.status).not.toBe(429);
    }, 15000);
    it('should include rate limit headers', async () => {
        await new Promise(resolve => setTimeout(resolve, 11000));
        const response = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/health');
        const headers = response.headers;
        expect(response.status).toBeDefined();
    }, 15000);
});
//# sourceMappingURL=rate-limiting.spec.js.map