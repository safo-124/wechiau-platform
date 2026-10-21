/**
 * The farmer form's rules, shared by "Register a farmer" and "Edit farmer".
 * Plain logic, no React Native, so it is tested in Node.
 */
import { normalizeDigitalAddress, normalizeGhanaPhone, type Language } from '@wechiau/shared';

export interface FarmerFormValues {
  name: string;
  phone: string;
  language: Language | null;
  /** As typed: a whole number. */
  birds: string;
  landmark: string;
  address: string;
  location: { lat: number; lng: number } | null;
  consent: boolean;
}

export type FarmerFormField = 'name' | 'phone' | 'language' | 'birds' | 'address';

export interface FarmerFormData {
  name: string;
  phone: string;
  language: Language;
  birds: number;
  landmark: string | null;
  digital_address: string | null;
  lat: number | null;
  lng: number | null;
  consent_training: boolean;
}

export type FarmerFormResult =
  | { ok: true; data: FarmerFormData }
  | { ok: false; errors: Partial<Record<FarmerFormField, string>> };

export const EMPTY_FARMER_FORM: FarmerFormValues = {
  name: '',
  phone: '',
  language: null,
  birds: '',
  landmark: '',
  address: '',
  location: null,
  consent: false,
};

export function validateFarmerForm(values: FarmerFormValues): FarmerFormResult {
  const errors: Partial<Record<FarmerFormField, string>> = {};
  const name = values.name.trim();
  const phone = normalizeGhanaPhone(values.phone);
  const typedAddress = values.address.trim();
  const address = typedAddress ? normalizeDigitalAddress(typedAddress) : null;
  const birds = values.birds.trim();

  if (!name) errors.name = "Enter the farmer's name.";
  if (!phone) errors.phone = 'Enter a Ghana phone number, like 024 123 4567.';
  if (!values.language) errors.language = 'Choose the language the farmer prefers.';
  if (!/^\d+$/.test(birds)) errors.birds = 'Enter how many birds, as a number.';
  if (typedAddress && !address) errors.address = 'A digital address looks like XX-000-0001.';

  if (Object.keys(errors).length > 0 || !phone || !values.language) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      phone,
      language: values.language,
      birds: Number(birds),
      landmark: values.landmark.trim() || null,
      digital_address: address,
      lat: values.location?.lat ?? null,
      lng: values.location?.lng ?? null,
      consent_training: values.consent,
    },
  };
}

/** Turns a saved phone number back into how people write it: +233241234567 → 024 123 4567. */
export function displayPhone(stored: string | null | undefined): string {
  if (!stored) return '';
  const local = stored.startsWith('+233') ? `0${stored.slice(4)}` : stored;
  return local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local;
}
