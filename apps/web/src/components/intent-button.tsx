'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface IntentButtonProps {
  professionalId: string;
  serviceId: string;
  professionalName: string;
  compact?: boolean;
}

export function IntentButton({
  professionalId,
  serviceId,
  professionalName,
  compact = false,
}: IntentButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [correlationId, setCorrelationId] = useState<string>();

  async function saveIntent(): Promise<void> {
    setState('saving');
    setCorrelationId(undefined);

    try {
      const response = await fetch('/api/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professionalId, serviceId }),
      });
      const body = (await response.json()) as {
        data?: { id?: string };
        meta?: { correlation_id?: string };
      };

      if (!response.ok || !body.data?.id) {
        setCorrelationId(body.meta?.correlation_id);
        setState('error');
        return;
      }

      router.push(`/entrar?intent=${encodeURIComponent(body.data.id)}`);
    } catch {
      setState('error');
    }
  }

  return (
    <div className={compact ? 'intent-action intent-action-compact' : 'intent-action'}>
      <button
        aria-busy={state === 'saving'}
        className="button button-primary"
        disabled={state === 'saving'}
        onClick={() => void saveIntent()}
        type="button"
      >
        {state === 'saving' ? 'Salvando intenção…' : 'Solicitar orçamento'}
      </button>
      <span className="intent-note">
        Você entra antes de enviar a solicitação a {professionalName}.
      </span>
      {state === 'error' ? (
        <p className="inline-error" role="alert">
          Não foi possível continuar. Tente novamente.
          {correlationId ? ` Referência: ${correlationId}` : ''}
        </p>
      ) : null}
    </div>
  );
}
