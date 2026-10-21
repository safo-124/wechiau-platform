/**
 * Design tokens from the approved designs (DESIGN_HANDOFF.md). Use these
 * everywhere instead of raw values.
 *
 * Colour rules: red means a problem or urgent and nothing else. Green means
 * good or done. Amber means coming up or owed.
 */
export const colors = {
  /** Primary actions, brand, active navigation. */
  green: '#1E5B3A',
  greenPressed: '#123A25',
  /** Progress bars and rings. */
  greenStrong: '#2E7D4F',
  /** Success and healthy backgrounds. */
  greenTint: '#E6F2EA',
  greenTrack: '#C9E3D2',

  /** Coming up, owed, warnings. */
  amber: '#7A4B00',
  amberTint: '#FDF1DC',
  amberBorder: '#E2C48F',

  /** Collect-eggs actions. */
  eggButton: '#C98A1B',
  eggButtonText: '#1B1200',

  /** Money and directions. */
  blue: '#1F4F8F',
  blueTint: '#E7EEF8',
  blueBorder: '#B9CBE6',

  /** Problems and urgent only. */
  red: '#B5362A',
  redTint: '#FBE9E6',
  redBorder: '#E8A79E',
  redRing: '#F3C9C3',

  text: '#1B2A21',
  textMuted: '#4A5A50',
  textNeutral: '#3B3B36',
  /** Inputs. */
  border: '#CFD8D2',
  /** Dividers. */
  divider: '#E3E8E5',
  dividerLight: '#EEF1EF',
  /** Info boxes. */
  neutralTint: '#F1F0EC',

  white: '#FFFFFF',
  /** App screens. */
  pageBg: '#FFFFFF',
  /** Web dashboard. */
  dashboardBg: '#F5F6F4',
} as const;

/** Background and text pairs used for tags, tiles and alerts. */
export const tones = {
  good: { background: colors.greenTint, text: colors.green },
  comingUp: { background: colors.amberTint, text: colors.amber },
  money: { background: colors.blueTint, text: colors.blue },
  problem: { background: colors.redTint, text: colors.red },
  neutral: { background: colors.neutralTint, text: colors.textNeutral },
} as const;
export type Tone = keyof typeof tones;

/** Atkinson Hyperlegible, weights 400 and 700. Names match @expo-google-fonts/atkinson-hyperlegible. */
export const fonts = {
  regular: 'AtkinsonHyperlegible_400Regular',
  bold: 'AtkinsonHyperlegible_700Bold',
  /** CSS font-family for the dashboard. */
  web: "'Atkinson Hyperlegible', sans-serif",
} as const;

/** Mobile sizes. Nothing below 12. */
export const fontSizes = {
  small: 13,
  label: 15,
  body: 16,
  bodyLarge: 18,
  title: 26,
  number: 40,
  numberLarge: 52,
} as const;

/** Dashboard sizes. */
export const dashboardFontSizes = {
  small: 13,
  body: 15,
  sectionTitle: 18,
  pageTitle: 30,
  cardNumber: 30,
} as const;

export const radii = {
  input: 12,
  tile: 16,
  card: 18,
  largeButton: 20,
  pill: 999,
} as const;

export const spacing = {
  screenPadding: 20,
  gap: 12,
  gapLarge: 18,
} as const;

export const touch = {
  /** Smallest tappable size. */
  minTarget: 44,
  /** Main actions are 64 to 92 tall. */
  mainAction: 64,
  mainActionLarge: 92,
} as const;

/** Phone frame the designs were drawn at. */
export const designFrame = { width: 390, height: 844 } as const;

export const theme = { colors, tones, fonts, fontSizes, dashboardFontSizes, radii, spacing, touch } as const;
