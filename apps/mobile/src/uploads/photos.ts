/**
 * Taking a photo: the camera, then a resize to keep uploads small on a weak
 * signal (1280 px wide, JPEG), then a copy into the app's own folder so it
 * survives until it has gone up. Works with no network.
 */
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const MAX_WIDTH = 1280;

export function uploadsDirectory(): Directory {
  const dir = new Directory(Paths.document, 'uploads');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Where a photo lives on this phone, whether or not it is there. */
export function localPhoto(id: string): File {
  return new File(Paths.document, 'uploads', `${id}.jpg`);
}

export interface TakenPhoto {
  id: string;
  uri: string;
}

export class CameraPermissionError extends Error {}

/** Opens the camera. Returns null if the person backs out. */
export async function takePhoto(): Promise<TakenPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new CameraPermissionError('Camera permission was not given. You can allow it in the phone settings.');

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH, height: null });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6 });

  const id = randomUUID();
  uploadsDirectory();
  const destination = localPhoto(id);
  new File(saved.uri).move(destination);
  return { id, uri: destination.uri };
}

/** For a photo that was taken but not kept (retaken, or the form was left). */
export function discardPhoto(id: string): void {
  const file = localPhoto(id);
  if (file.exists) file.delete();
}
