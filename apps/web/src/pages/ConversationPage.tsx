import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationPage as Conversation } from '@wechiau/shared';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { Card, ErrorText, Loading } from '../components/ui';
import { dayTime, LANGUAGES } from '../format';

const seconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * One farmer's conversation with the vet team (Health › Messages): voice
 * notes to play, photos, written messages, and Gloria's written reply, which
 * reaches the farmer app at its next sync.
 */
export function ConversationPage() {
  const { farmerId = '' } = useParams();
  const client = useQueryClient();
  const [reply, setReply] = useState('');
  const { data, error, isPending } = useQuery({ queryKey: ['messages', farmerId], queryFn: () => api<Conversation>(`/dashboard/messages/${farmerId}`) });
  const send = useMutation({
    mutationFn: () => api<{ id: string }>(`/dashboard/messages/${farmerId}`, { method: 'POST', body: { body: reply } }),
    onSuccess: () => {
      setReply('');
      void client.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  if (isPending) return <Loading what="the messages" />;
  if (error) return <ErrorText error={error} />;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (reply.trim()) send.mutate();
  }

  const language = data.farmer.language ? (LANGUAGES[data.farmer.language] ?? data.farmer.language) : null;
  return (
    <>
      <Link to="/health" className="back-link">
        ‹ Health and vets
      </Link>
      <PageHeader title={`Messages with ${data.farmer.name}`}>
        {data.farmer.phone}
        {language ? ` · speaks ${language}` : ''} · {data.vetName ? `vet: ${data.vetName}` : 'no vet yet'}
      </PageHeader>

      <Card>
        {data.messages.length === 0 ? <p className="muted">No messages yet.</p> : null}
        <div className="thread">
          {data.messages.map((m) => (
            <div key={m.id} className={`bubble ${m.direction === 'from_farmer' ? 'bubble-farmer' : 'bubble-team'}`}>
              {m.audioId ? (
                <div className="voice">
                  <audio controls preload="none" src={`/api/uploads/${m.audioId}`} aria-label={`Voice note, ${seconds(m.audioSeconds ?? 0)}`} />
                  <span className="muted small">Voice {seconds(m.audioSeconds ?? 0)}</span>
                </div>
              ) : null}
              {m.transcript ? <p className="transcript">“{m.transcript}”</p> : null}
              {m.body ? <p>{m.body}</p> : null}
              {m.photoId ? (
                <a href={`/api/uploads/${m.photoId}`} target="_blank" rel="noreferrer">
                  <img src={`/api/uploads/${m.photoId}`} alt="Photo sent with the message" className="bubble-photo" />
                </a>
              ) : null}
              <span className="muted small">
                {m.senderName} · {dayTime(m.at)}
                {m.caseId ? ' · about a health case' : ''}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Reply to ${data.farmer.name}`}>
        <form onSubmit={submit} className="column">
          <label className="field">
            <span className="visually-hidden">Your reply</span>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={2000} placeholder="Write a short, plain reply. The vets can also reply by voice from the vet app." />
          </label>
          <ErrorText error={send.error} />
          <button className="button primary" type="submit" disabled={send.isPending || !reply.trim()}>
            {send.isPending ? 'Sending…' : 'Send reply'}
          </button>
          <p className="muted small">It reaches the farmer app the next time the farmer&apos;s phone syncs. Health decisions stay with the vets.</p>
        </form>
      </Card>
    </>
  );
}
