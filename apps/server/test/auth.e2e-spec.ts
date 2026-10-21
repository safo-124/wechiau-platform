import { loginResponseSchema, sessionUserSchema } from '@wechiau/shared';
import { IDS } from '@wechiau/shared/testing';
import { PHONES, seedStaff, TEST_PASSWORD } from './support/people.js';
import { createTestApp, resetDatabase, resetThrottle, type TestApp } from './support/test-app.js';

describe('signing in (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    resetThrottle(t);
    await seedStaff(t);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('signs a field agent in with their phone as people type it, and the token works', async () => {
    const response = await t
      .http()
      .post('/api/auth/login')
      .send({ phone: '020 000 0002', password: TEST_PASSWORD, deviceId: 'agent-phone' })
      .expect(200);
    const { token, user } = loginResponseSchema.parse(response.body);
    expect(user).toMatchObject({ id: IDS.agent, role: 'field_agent' });

    const me = await t.http().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(sessionUserSchema.parse(me.body).name).toBe('Agent One');
  });

  it('gives the same answer for a wrong password and an unknown phone', async () => {
    const wrong = await t
      .http()
      .post('/api/auth/login')
      .send({ phone: PHONES.agent, password: 'nope', deviceId: 'x' })
      .expect(401);
    const unknown = await t
      .http()
      .post('/api/auth/login')
      .send({ phone: '+233209999999', password: TEST_PASSWORD, deviceId: 'x' })
      .expect(401);
    expect(wrong.body.message).toBe('Phone number or password is wrong.');
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('turns away disabled accounts', async () => {
    await t.prisma.user.update({ where: { id: IDS.agent }, data: { status: 'disabled' } });
    await t
      .http()
      .post('/api/auth/login')
      .send({ phone: PHONES.agent, password: TEST_PASSWORD, deviceId: 'x' })
      .expect(403);
  });

  it('needs a valid token for everything except health and login', async () => {
    await t.http().get('/api/health').expect(200);
    await t.http().get('/api/sync/pull').expect(401);
    await t.http().get('/api/sync/pull').set('Authorization', 'Bearer not-a-real-token').expect(401);
  });

  it('stops a token working after logout or when the account is disabled', async () => {
    const token = await t.auth.createSession(IDS.agent, 'agent-phone');
    await t.http().post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);
    await t.http().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);

    const second = await t.auth.createSession(IDS.agent, 'agent-phone');
    await t.prisma.user.update({ where: { id: IDS.agent }, data: { status: 'disabled' } });
    await t.http().get('/api/auth/me').set('Authorization', `Bearer ${second}`).expect(401);
  });

  it('never stores the token itself', async () => {
    const token = await t.auth.createSession(IDS.agent, 'agent-phone');
    const sessions = await t.prisma.session.findMany();
    expect(sessions.some((s) => s.token_hash === token)).toBe(false);
  });
});
