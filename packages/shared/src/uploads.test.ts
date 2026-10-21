import { describe, expect, it } from 'vitest';
import { visitSchema } from './schemas/index.js';
import { IDS, syncFields } from './test-fixtures.js';
import { parseUploadRef, uploadRef } from './uploads.js';

describe('upload references', () => {
  it('round-trip an id', () => {
    expect(parseUploadRef(uploadRef(IDS.ama))).toBe(IDS.ama);
  });

  it('ignore anything that is not an upload reference', () => {
    expect(parseUploadRef('file:///photo.jpg')).toBeNull();
    expect(parseUploadRef('upload:not-a-uuid')).toBeNull();
    expect(parseUploadRef(null)).toBeNull();
  });

  it('are the only photos a visit accepts', () => {
    const visit = {
      ...syncFields(IDS.agent),
      farmer_id: IDS.ama,
      visited_at: '2026-10-20T09:00:00.000Z',
      deaths: 0,
      suspected_cause: null,
      notes: null,
    };
    expect(visitSchema.safeParse({ ...visit, photo_uri: uploadRef(IDS.ama) }).success).toBe(true);
    expect(visitSchema.safeParse({ ...visit, photo_uri: null }).success).toBe(true);
    expect(visitSchema.safeParse({ ...visit, photo_uri: 'file:///data/photo.jpg' }).success).toBe(false);
  });
});
