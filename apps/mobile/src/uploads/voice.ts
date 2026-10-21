/**
 * Voice notes: recorded small (mono AAC, 32 kbit/s, about 4 KB a second, so a
 * minute is about 240 KB on a weak signal), then moved into the app's own
 * folder so the note survives until it has gone up. Works with no network.
 */
import { File, Paths } from 'expo-file-system';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, type RecordingOptions } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { uploadsDirectory } from './photos';

/** Long enough to describe a sick flock; short enough to send on a weak signal. */
export const MAX_VOICE_SECONDS = 120;

export const VOICE_RECORDING: RecordingOptions = {
  ...RecordingPresets.LOW_QUALITY,
  numberOfChannels: 1,
  sampleRate: 22050,
  bitRate: 32000,
};

export const VOICE_CONTENT_TYPE = 'audio/mp4';

/** Where a voice note lives on this phone, whether or not it is there. */
export function localVoice(id: string): File {
  return new File(Paths.document, 'uploads', `${id}.m4a`);
}

export interface RecordedVoice {
  id: string;
  uri: string;
  seconds: number;
}

export class MicrophonePermissionError extends Error {}

/** Asks for the microphone and lets the phone record. */
export async function getReadyToRecord(): Promise<void> {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) throw new MicrophonePermissionError('Microphone permission was not given. You can allow it in the phone settings.');
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
}

/** After recording: lets the speaker play normally again. */
export async function doneRecording(): Promise<void> {
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
}

/** Moves a finished recording into the uploads folder under a new upload id. */
export function keepRecording(recordedUri: string, seconds: number): RecordedVoice {
  const id = randomUUID();
  uploadsDirectory();
  const destination = localVoice(id);
  new File(recordedUri).move(destination);
  return { id, uri: destination.uri, seconds };
}

/** For a voice note that was recorded but not sent. */
export function discardVoice(id: string): void {
  const file = localVoice(id);
  if (file.exists) file.delete();
}
