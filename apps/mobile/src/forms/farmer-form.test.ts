import { describe, expect, it } from 'vitest';
import { displayPhone, EMPTY_FARMER_FORM, validateFarmerForm, type FarmerFormValues } from './farmer-form';

const ama: FarmerFormValues = {
  ...EMPTY_FARMER_FORM,
  name: '  Ama ',
  phone: '024 123 4567',
  language: 'dga',
  birds: '42',
  landmark: 'near the borehole ',
  address: 'xx-000-0001',
};

describe('validateFarmerForm', () => {
  it('cleans up what was typed', () => {
    const result = validateFarmerForm(ama);
    expect(result).toEqual({
      ok: true,
      data: {
        name: 'Ama',
        phone: '+233241234567',
        language: 'dga',
        birds: 42,
        landmark: 'near the borehole',
        digital_address: 'XX-000-0001',
        lat: null,
        lng: null,
        consent_training: false,
      },
    });
  });

  it('allows a missing landmark and digital address', () => {
    const result = validateFarmerForm({ ...ama, landmark: ' ', address: '' });
    expect(result.ok && result.data.landmark).toBeNull();
    expect(result.ok && result.data.digital_address).toBeNull();
  });

  it('says what is wrong with each field', () => {
    const result = validateFarmerForm({ ...EMPTY_FARMER_FORM, phone: '12345', birds: 'forty', address: 'Missing' });
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "Enter the farmer's name.",
        phone: 'Enter a Ghana phone number, like 024 123 4567.',
        language: 'Choose the language the farmer prefers.',
        birds: 'Enter how many birds, as a number.',
        address: 'A digital address looks like XX-000-0001.',
      },
    });
  });

  it('keeps the farm location when there is one', () => {
    const result = validateFarmerForm({ ...ama, location: { lat: 10.35, lng: -2.47 } });
    expect(result.ok && [result.data.lat, result.data.lng]).toEqual([10.35, -2.47]);
  });
});

describe('displayPhone', () => {
  it('shows saved numbers the way people write them', () => {
    expect(displayPhone('+233241234567')).toBe('024 123 4567');
    expect(displayPhone(null)).toBe('');
  });

  it('round-trips through the form', () => {
    const result = validateFarmerForm({ ...ama, phone: displayPhone('+233241234567') });
    expect(result.ok && result.data.phone).toBe('+233241234567');
  });
});
