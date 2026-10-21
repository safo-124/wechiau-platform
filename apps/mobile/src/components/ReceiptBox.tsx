import { colors } from '@wechiau/ui/theme';
import { useState } from 'react';
import { useSignedIn } from '@/auth/session';
import { useSmsRow } from '@/data/hooks';
import { sendReceipt } from '@/sms/receipts';
import { AppText } from './AppText';
import { Button } from './Button';
import { InfoBox } from './Tiles';

/** A queued SMS receipt, with a button to send it from the phone's SMS app. */
export function ReceiptBox({ smsId, farmerName, title }: { smsId: string; farmerName: string; title?: string }) {
  const { user, deviceId } = useSignedIn();
  const sms = useSmsRow(smsId);
  const [message, setMessage] = useState<string | null>(null);
  const sent = sms?.status === 'sent';

  async function send() {
    if (!sms) return;
    const result = await sendReceipt(sms as Record<string, unknown>, { userId: user.id, deviceId });
    setMessage(result === 'unavailable' ? 'This phone cannot send SMS. The receipt stays queued.' : null);
  }

  return (
    <InfoBox>
      <AppText variant="label" muted>
        {title ?? `SMS receipt to ${farmerName}`}
      </AppText>
      <AppText>{sms?.body}</AppText>
      <AppText variant="small" style={{ color: sent ? colors.green : colors.amber }}>
        {sent ? 'Opened in your SMS app' : 'Not sent yet'}
      </AppText>
      {message ? <AppText variant="small">{message}</AppText> : null}
      <Button label={sent ? 'Send again' : 'Send receipt by SMS'} kind="secondary" size="small" onPress={() => void send()} />
    </InfoBox>
  );
}
