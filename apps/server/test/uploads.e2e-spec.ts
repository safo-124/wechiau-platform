import { uploadRef, uploadResponseSchema } from '@wechiau/shared';
import { IDS, syncFields, testId } from '@wechiau/shared/testing';
import { addAmaLogin, farmerRow, seedStaff } from './support/people.js';
import { createTestApp, resetDatabase, type TestApp } from './support/test-app.js';

/** Enough of a JPEG to be recognised: the file starts with FF D8 FF. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('a small test photo')]);

describe('visit photos (e2e)', () => {
  let t: TestApp;
  let tokens: Awaited<ReturnType<typeof seedStaff>>;

  const visitWithPhoto = (photoId: string) =>
    ({
      ...syncFields(IDS.agent),
      farmer_id: IDS.ama,
      visited_at: '2026-10-20T09:00:00.000Z',
      deaths: 0,
      suspected_cause: null,
      notes: null,
      photo_uri: uploadRef(photoId),
    }) as Record<string, unknown> & { id: string; updated_at: string };

  async function pushVisit(photoId: string) {
    const visit = visitWithPhoto(photoId);
    await t
      .http()
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ deviceId: 'agent-phone', changes: [{ table: 'visit', id: visit.id, op: 'upsert', data: visit, updatedAt: visit.updated_at }] })
      .expect(200);
    return visit;
  }

  const upload = (token: string, photoId: string, rowId: string, bytes: Buffer = JPEG) =>
    t
      .http()
      .post(`/api/uploads/${photoId}`)
      .set('Authorization', `Bearer ${token}`)
      .field('table', 'visit')
      .field('row_id', rowId)
      .attach('file', bytes, { filename: 'photo.jpg', contentType: 'image/jpeg' });

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    tokens = await seedStaff(t);
    const ama = farmerRow(IDS.agent);
    await t
      .http()
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ deviceId: 'agent-phone', changes: [{ table: 'farmer', id: ama.id, op: 'upsert', data: ama, updatedAt: ama.updated_at }] })
      .expect(200);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('the agent who logged the visit uploads its photo, and a vet can see it', async () => {
    const photoId = testId();
    const visit = await pushVisit(photoId);

    const stored = await upload(tokens.agent, photoId, visit.id).expect(201);
    expect(uploadResponseSchema.parse(stored.body)).toEqual({ id: photoId, size: JPEG.length, content_type: 'image/jpeg' });

    const fetched = await t
      .http()
      .get(`/api/uploads/${photoId}`)
      .set('Authorization', `Bearer ${tokens.kofi}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(fetched.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(fetched.body as Buffer, JPEG)).toBe(0);
  });

  it('sending the same photo again is fine; a different file under the same id is not', async () => {
    const photoId = testId();
    const visit = await pushVisit(photoId);
    await upload(tokens.agent, photoId, visit.id).expect(201);
    await upload(tokens.agent, photoId, visit.id).expect(201);
    const other = Buffer.concat([JPEG, Buffer.from('changed')]);
    await upload(tokens.agent, photoId, visit.id, other).expect(409);
  });

  it('waits for the visit to sync before taking its photo', async () => {
    const response = await upload(tokens.agent, testId(), testId()).expect(409);
    expect(response.body.message).toBe('The record for this file has not synced yet. It will be sent again later.');
  });

  it('only takes photos from the person who logged the visit', async () => {
    const photoId = testId();
    const visit = await pushVisit(photoId);
    await upload(tokens.otherAgent, photoId, visit.id).expect(403);
  });

  it('only takes the file the visit points at', async () => {
    const visit = await pushVisit(testId());
    await upload(tokens.agent, testId(), visit.id).expect(400);
  });

  it('turns away files that are not photos', async () => {
    const photoId = testId();
    const visit = await pushVisit(photoId);
    await upload(tokens.agent, photoId, visit.id, Buffer.from('not a picture at all')).expect(415);
  });

  it('a farmer sees photos of their own farm only', async () => {
    const photoId = testId();
    const visit = await pushVisit(photoId);
    await upload(tokens.agent, photoId, visit.id).expect(201);
    const ama = await addAmaLogin(t);
    await t.http().get(`/api/uploads/${photoId}`).set('Authorization', `Bearer ${ama}`).expect(200);

    // Naa's visit photo is invisible to Ama: it looks the same as a missing file.
    const naa = farmerRow(IDS.agent, { id: IDS.naa, name: 'Naa' }) as Record<string, unknown> & { id: string; updated_at: string };
    await t
      .http()
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ deviceId: 'agent-phone', changes: [{ table: 'farmer', id: naa.id, op: 'upsert', data: naa, updatedAt: naa.updated_at }] })
      .expect(200);
    const naaPhoto = testId();
    const naaVisit = { ...visitWithPhoto(naaPhoto), farmer_id: IDS.naa };
    await t
      .http()
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ deviceId: 'agent-phone', changes: [{ table: 'visit', id: naaVisit.id, op: 'upsert', data: naaVisit, updatedAt: naaVisit.updated_at }] })
      .expect(200);
    await upload(tokens.agent, naaPhoto, naaVisit.id).expect(201);
    await t.http().get(`/api/uploads/${naaPhoto}`).set('Authorization', `Bearer ${ama}`).expect(404);
  });

  it('needs a sign-in to upload or fetch', async () => {
    await t.http().get(`/api/uploads/${testId()}`).expect(401);
    await t.http().post(`/api/uploads/${testId()}`).expect(401);
  });
});
