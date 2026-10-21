import { randomUUID } from 'node:crypto';
import { buildFarmerReport, buildMessage, type FarmerAccessResponse, type RowFactory } from '@wechiau/shared';
import { IDS, syncFields } from '@wechiau/shared/testing';
import { farmerRow, seedStaff } from './support/people.js';
import { createTestApp, resetDatabase, resetThrottle, type TestApp } from './support/test-app.js';

type Row = Record<string, unknown> & { id: string; updated_at: string };
const upsert = (table: string, row: Row) => ({ table, id: row.id, op: 'upsert' as const, data: row, updatedAt: row.updated_at });
const makeAs =
  (userId: string): RowFactory =>
  (fields) => ({ ...syncFields(userId), ...fields }) as ReturnType<RowFactory>;

/** The start of an .m4a file: an MP4 "ftyp" box, then some audio bytes. */
const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(200, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);

/** The farmer app (v0.3 phase 7): PIN from the field agent, reports with voice notes, and the chat with vets. */
describe('farmer app (e2e)', () => {
  let t: TestApp;
  let tokens: Awaited<ReturnType<typeof seedStaff>>;

  const as = (token: string) => ({
    post: (path: string) => t.http().post(path).set('Authorization', `Bearer ${token}`),
    get: (path: string) => t.http().get(path).set('Authorization', `Bearer ${token}`),
  });
  async function push(token: string, changes: ReturnType<typeof upsert>[]) {
    const res = await as(token).post('/api/sync/push').send({ deviceId: 'phone', changes }).expect(200);
    return res.body as { accepted: string[]; rejected: { id: string; reason: string }[] };
  }
  async function pull(token: string) {
    const res = await as(token).get('/api/sync/pull').expect(200);
    return res.body.changes as { table: string; id: string; data: Record<string, unknown> | null }[];
  }
  const signIn = (phone: string, password: string) => t.http().post('/api/auth/login').send({ phone, password, deviceId: 'ama-phone' });

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    resetThrottle(t);
    tokens = await seedStaff(t);
    await push(tokens.agent, [upsert('farmer', farmerRow(IDS.agent))]);
    await push(tokens.gloria, [
      upsert('vet_assignment', { ...syncFields(IDS.gloria), farmer_id: IDS.ama, vet_id: IDS.kofi, assigned_at: new Date().toISOString() } as Row),
    ]);
  });

  afterAll(async () => {
    await t.app.close();
  });

  async function setUpAma(): Promise<{ access: FarmerAccessResponse; token: string }> {
    const access = (await as(tokens.agent).post(`/api/farmers/${IDS.ama}/app-access`).expect(201)).body as FarmerAccessResponse;
    const login = await signIn('024 123 4567', access.pin).expect(200);
    return { access, token: login.body.token as string };
  }

  it('lets a field agent give a farmer a PIN, which signs them in to the farmer app', async () => {
    const { access, token } = await setUpAma();
    expect(access.pin).toMatch(/^\d{6}$/);
    expect(access.phone).toBe('+233241234567');
    const me = await as(token).get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ role: 'farmer', farmer_id: IDS.ama, name: 'Ama' });

    // Vets can't hand out PINs, and a wrong PIN is turned away like a wrong password.
    await as(tokens.kofi).post(`/api/farmers/${IDS.ama}/app-access`).expect(403);
    await signIn('0241234567', access.pin === '135790' ? '135791' : '135790').expect(401);
  });

  it('a new PIN signs the farmer out everywhere and the old PIN stops working', async () => {
    const { access: first, token } = await setUpAma();
    const second = (await as(tokens.agent).post(`/api/farmers/${IDS.ama}/app-access`).expect(201)).body as FarmerAccessResponse;
    expect(second.user_id).toBe(first.user_id);
    await as(token).get('/api/auth/me').expect(401);
    if (second.pin !== first.pin) await signIn('0241234567', first.pin).expect(401);
    await signIn('0241234567', second.pin).expect(200);
  });

  it('needs the farmer\'s own phone number', async () => {
    const edit = await push(tokens.agent, [upsert('farmer', { ...farmerRow(IDS.agent), phone: '+233200000003', updated_at: new Date(Date.now() + 2000).toISOString() })]);
    expect(edit.rejected).toEqual([]);
    const taken = await as(tokens.agent).post(`/api/farmers/${IDS.ama}/app-access`).expect(409);
    expect(taken.body.message).toContain("already used by Kofi's login");
  });

  it('carries a farmer\'s voice report to their vet, and the vet\'s reply back', async () => {
    const { access, token } = await setUpAma();

    // The farmer's phone sees their own farm and only their own vet among the staff.
    const first = await pull(token);
    expect(first.filter((c) => c.table === 'farmer').map((c) => c.id)).toEqual([IDS.ama]);
    const people = first.filter((c) => c.table === 'user').map((c) => c.data?.['name']);
    expect(people.map(String).sort((a, b) => a.localeCompare(b))).toEqual(['Ama', 'Kofi']);

    const voiceId = randomUUID();
    const photoId = randomUUID();
    const { healthCase, message } = buildFarmerReport(makeAs(access.user_id), {
      farmerId: IDS.ama,
      farmerUserId: access.user_id,
      voice: { uploadId: voiceId, seconds: 12 },
      photoUploadId: photoId,
    });
    const report = await push(token, [upsert('health_case', healthCase as Row), upsert('message', message as Row)]);
    expect(report.rejected).toEqual([]);

    // The voice note and the photo go up after the records; each must be the right kind of file.
    const upload = (id: string, bytes: Buffer, name: string) =>
      as(token).post(`/api/uploads/${id}`).field('table', 'message').field('row_id', message.id).attach('file', bytes, name);
    await upload(voiceId, JPEG, 'voice.m4a').expect(415);
    const sent = await upload(voiceId, M4A, 'voice.m4a').expect(201);
    expect(sent.body).toMatchObject({ content_type: 'audio/mp4' });
    await upload(photoId, JPEG, 'photo.jpg').expect(201);

    // The server gives the case to Ama's vet. Kofi sees it and can play the voice note.
    const stored = await t.prisma.healthCase.findUniqueOrThrow({ where: { id: healthCase.id } });
    expect(stored.assigned_vet_id).toBe(IDS.kofi);
    const forKofi = await pull(tokens.kofi);
    expect(forKofi.some((c) => c.table === 'message' && c.id === message.id)).toBe(true);
    const audio = await as(tokens.kofi).get(`/api/uploads/${voiceId}`).expect(200);
    expect(audio.headers['content-type']).toBe('audio/mp4');
    // Field agents are not part of the conversation.
    await as(tokens.agent).get(`/api/uploads/${voiceId}`).expect(404);

    const reply = buildMessage(makeAs(IDS.kofi), { farmerId: IDS.ama, senderId: IDS.kofi, from: 'staff', healthCaseId: healthCase.id, text: 'A vet will visit tomorrow' });
    expect((await push(tokens.kofi, [upsert('message', reply as Row)])).rejected).toEqual([]);
    const back = await pull(token);
    expect(back.find((c) => c.table === 'message' && c.id === reply.id)?.data).toMatchObject({ direction: 'to_farmer', body: 'A vet will visit tomorrow' });

    // A farmer can't write as a vet, or for another farm.
    const fake = buildMessage(makeAs(access.user_id), { farmerId: IDS.ama, senderId: IDS.kofi, from: 'staff', text: 'Pretending to be the vet' });
    expect((await push(token, [upsert('message', fake as Row)])).rejected).toHaveLength(1);
    const elsewhere = buildMessage(makeAs(access.user_id), { farmerId: IDS.naa, senderId: access.user_id, from: 'farmer', text: 'Not my farm' });
    expect((await push(token, [upsert('message', elsewhere as Row)])).rejected).toHaveLength(1);
  });
});
