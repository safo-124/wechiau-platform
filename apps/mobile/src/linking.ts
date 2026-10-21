import { Linking } from 'react-native';

/** Opens the phone's map app at the farm's GPS position (design rule: directions use GPS). */
export function openDirections(lat: number, lng: number, label: string): void {
  void Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`);
}

export function callPhone(phone: string): void {
  void Linking.openURL(`tel:${phone}`);
}
