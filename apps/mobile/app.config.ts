import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * One Expo project, three apps (v0.3 section 9). Pick one with APP_VARIANT:
 *   field   Gloria and field agents: farmers, collections, sales, cash
 *   vet     Gloria's vets: clinic days, vaccinations, cold chain, cases
 *   farmer  Member farmers: flock, money, reports by voice
 *
 * Each variant has its own name, icon and Android package, so all three can
 * be installed on the same phone and told apart. The package ids were settled
 * on 20 October 2026 and must never change: Android treats a new id as a
 * different app, and the old one's data stays behind.
 *
 * Icons: assets/images/<variant>/, drawn by scripts/make-icons.mjs (the
 * colours here must match it).
 */
const VARIANTS = {
  field: { name: 'Wechiau Field', androidPackage: 'com.wechiau.field', scheme: 'wechiau-field', color: '#1E5B3A' },
  vet: { name: 'Wechiau Vet', androidPackage: 'com.wechiau.vet', scheme: 'wechiau-vet', color: '#1F4F8F' },
  farmer: { name: 'Wechiau Farmer', androidPackage: 'com.wechiau.farmer', scheme: 'wechiau-farmer', color: '#C98A1B' },
} as const;

type Variant = keyof typeof VARIANTS;

/**
 * The project's id on Expo's build service, printed by `npx eas-cli@latest init`.
 * Not a secret. All three apps share it; each keeps its own signing key there.
 */
const EAS_PROJECT_ID: string | null = '14191676-cb75-4cdc-9c2c-dd25f912dedb';

function readVariant(): Variant {
  const value = process.env.APP_VARIANT ?? 'field';
  if (!(value in VARIANTS)) {
    throw new Error(`APP_VARIANT must be one of ${Object.keys(VARIANTS).join(', ')}; got "${value}"`);
  }
  return value as Variant;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appVariant = readVariant();
  const variant = VARIANTS[appVariant];
  const images = `./assets/images/${appVariant}`;

  return {
    ...config,
    name: variant.name,
    slug: 'wechiau',
    version: '0.1.0',
    orientation: 'portrait',
    icon: `${images}/icon.png`,
    scheme: variant.scheme,
    // The designs are light only.
    userInterfaceStyle: 'light',
    android: {
      package: variant.androidPackage,
      adaptiveIcon: {
        backgroundColor: variant.color,
        foregroundImage: `${images}/adaptive-foreground.png`,
        monochromeImage: `${images}/adaptive-monochrome.png`,
      },
      predictiveBackGestureEnabled: false,
    },
    // No iPhone build in the pilot; kept so the code base allows it later.
    ios: { bundleIdentifier: variant.androidPackage },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        { backgroundColor: variant.color, image: `${images}/splash.png`, imageWidth: 120 },
      ],
      'expo-sqlite',
      'expo-secure-store',
      [
        'expo-location',
        { locationWhenInUsePermission: "Saves the farm's location so vets and collectors can find it." },
      ],
      ['expo-image-picker', { cameraPermission: 'Takes photos of the flock during farm visits.', microphonePermission: false }],
      ['expo-audio', { microphonePermission: 'Records voice messages between farmers and the vets.' }],
      'expo-background-task',
      // The notification icon is the app's white glyph; Android colours it.
      ['expo-notifications', { icon: `${images}/adaptive-monochrome.png`, color: variant.color }],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      appVariant,
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  };
};
