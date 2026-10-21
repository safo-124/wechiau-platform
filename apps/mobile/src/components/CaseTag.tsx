import type { Tone } from '@wechiau/ui/theme';
import { TRIAGE_LABELS } from '@wechiau/shared';
import { Tag } from './Tiles';

const TONES: Record<string, Tone> = { urgent: 'problem', medium: 'comingUp', low: 'money' };

/** Urgency as a coloured tag. A suggestion the vet hasn't confirmed says so. */
export function CaseTag({ status, triage, suggested }: { status: string | null; triage: string | null; suggested: string | null }) {
  if (status === 'closed') return <Tag tone="neutral" label="Closed" />;
  if (triage) return <Tag tone={TONES[triage] ?? 'neutral'} label={TRIAGE_LABELS[triage as keyof typeof TRIAGE_LABELS]} />;
  if (suggested) return <Tag tone={TONES[suggested] ?? 'neutral'} label={`AI: ${TRIAGE_LABELS[suggested as keyof typeof TRIAGE_LABELS].toLowerCase()}`} />;
  return <Tag tone="neutral" label="Not checked yet" />;
}
