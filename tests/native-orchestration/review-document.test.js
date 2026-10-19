import request from 'supertest';
import { ReviewOrigin } from '../../src/native/orchestration/review-origin.js';

describe('isolated Review document', () => {
    let review, validated;
    beforeEach(async () => {
        validated = 0;
        review = new ReviewOrigin({ authority: { validateLaunch: async () => { validated++; }, close() {} } });
        await review.start();
    });
    afterEach(async () => { await review.close(); });
    const launch = '/review?launchRef=' + 'a'.repeat(43);

    test('browser navigation gets a static, data-free document under a strict self-only CSP', async () => {
        const response = await request(review.origin).get(launch).set('Accept', 'text/html,application/xhtml+xml').expect(200);
        expect(response.type).toBe('text/html');
        expect(response.text).not.toMatch(/a{43}|csrf|nonce/i);
        expect(response.headers['content-security-policy']).toMatch(/default-src 'none'; script-src 'self'; style-src 'self'/);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(validated).toBe(0);
    });

    test('the JSON bootstrap stays the default and still validates the launch', async () => {
        const response = await request(review.origin).get(launch).set('Accept', 'application/json').expect(200);
        expect(response.body).toMatchObject({ schemaVersion: 1, authenticationRequired: true });
        expect(response.headers['content-security-policy']).toMatch(/^default-src 'none'; connect-src 'self'/);
        expect(validated).toBe(1);
        await request(review.origin).get(launch).expect(200).expect('Content-Type', /json/);
    });

    test('only the fixed document assets are served', async () => {
        const script = await request(review.origin).get('/review/assets/review.js').expect(200).expect('Content-Type', /javascript/);
        expect(script.text).toMatch(/review\/decide/);
        await request(review.origin).get('/review/assets/tokens.css').expect(200).expect('Content-Type', /css/);
        await request(review.origin).get('/review/webfonts/Serene/PlusJakartaSans%5Bwght%5D.ttf').expect(200);
        await request(review.origin).get('/review/assets/..%2F..%2Fpackage.json').expect(404);
        await request(review.origin).get('/review/assets/server.js').expect(404);
        await request(review.origin).get('/review/assets/review.js').set('Host', 'evil.example').expect(403);
    });
});
