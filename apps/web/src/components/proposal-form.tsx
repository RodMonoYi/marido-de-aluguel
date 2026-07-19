'use client';

import {
  DEMO_CANCELLATION_POLICY,
  type Proposal,
  type ProposalRevisionInput,
  type ServiceRequest,
} from '@marido/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { DemoClientError, demoMutation } from '@/lib/demo-client';
import {
  clearIdempotencyKey,
  isDefinitiveCommandFailure,
  stableIdempotencyKey,
} from '@/lib/idempotent-command';

import { ProposalCommercialPreview } from './proposal-commercial-preview';

interface ProposalFormProps {
  request: ServiceRequest;
  existingProposal?: Proposal;
}

interface FormError {
  field?: string;
  message: string;
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function reaisToMinor(value: string): number {
  const number = Number(value.replace(',', '.'));
  const amountMinor = Math.round(number * 100);
  return Number.isFinite(number) && number >= 0 && Number.isSafeInteger(amountMinor)
    ? amountMinor
    : 0;
}

function bahiaIso(value: string): string {
  return new Date(`${value}:00-03:00`).toISOString();
}

function localDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Bahia',
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function minorToInput(value: number): string {
  return (value / 100).toFixed(2);
}

export function ProposalForm({ request, existingProposal }: ProposalFormProps) {
  const router = useRouter();
  const errorSummary = useRef<HTMLDivElement>(null);
  const revision = existingProposal?.currentRevision;
  const [labor, setLabor] = useState(
    revision ? minorToInput(revision.breakdown.laborMinor) : '250.00',
  );
  const [materials, setMaterials] = useState(
    revision ? minorToInput(revision.breakdown.materialsMinor) : '0.00',
  );
  const [travel, setTravel] = useState(
    revision ? minorToInput(revision.breakdown.travelMinor) : '0.00',
  );
  const [state, setState] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [errors, setErrors] = useState<FormError[]>([]);
  const previewAmounts = {
    laborMinor: reaisToMinor(labor),
    materialsMinor: reaisToMinor(materials),
    travelMinor: reaisToMinor(travel),
    currency: 'BRL',
  } as const;
  const totalMinor =
    previewAmounts.laborMinor + previewAmounts.materialsMinor + previewAmounts.travelMinor;

  useEffect(() => {
    if (errors.length > 0) {
      errorSummary.current?.focus();
    }
  }, [errors]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors([]);
    setState('submitting');
    const form = new FormData(event.currentTarget);

    const input: ProposalRevisionInput = {
      scope: String(form.get('scope') ?? '').trim(),
      included: lines(form.get('included')),
      excluded: lines(form.get('excluded')),
      amounts: {
        laborMinor: reaisToMinor(String(form.get('labor') ?? '0')),
        materialsMinor: reaisToMinor(String(form.get('materials') ?? '0')),
        travelMinor: reaisToMinor(String(form.get('travel') ?? '0')),
        currency: 'BRL',
      },
      schedule: {
        startsAt: bahiaIso(String(form.get('scheduledStart') ?? '')),
        endsAt: bahiaIso(String(form.get('scheduledEnd') ?? '')),
        timezone: 'America/Bahia',
      },
      validUntil: bahiaIso(String(form.get('validUntil') ?? '')),
      guaranteeOffer: String(form.get('guaranteeOffer') ?? '').trim() || null,
    };

    const localErrors: FormError[] = [];
    if (input.included.length === 0) {
      localErrors.push({
        field: 'included',
        message: 'Informe ao menos um item incluído na proposta.',
      });
    }
    if (Date.parse(input.schedule.endsAt) <= Date.parse(input.schedule.startsAt)) {
      localErrors.push({
        field: 'scheduledEnd',
        message: 'O término previsto deve ser posterior ao início.',
      });
    }
    if (totalMinor <= 0 || !Number.isSafeInteger(totalMinor)) {
      localErrors.push({
        field: 'labor',
        message: 'O total da proposta deve ser maior que zero e respeitar o limite suportado.',
      });
    }
    if (localErrors.length > 0) {
      setErrors(localErrors);
      setState('idle');
      return;
    }

    const path = existingProposal
      ? `proposals/${existingProposal.id}/revisions`
      : `service-requests/${request.id}/proposals`;
    const command = `POST /api/demo/${path}`;
    const commandPayload = {
      body: input,
      ...(existingProposal ? { expectedVersion: existingProposal.version } : {}),
    };
    try {
      await demoMutation<Proposal>(path, input, {
        idempotencyKey: await stableIdempotencyKey(command, commandPayload),
        ...(existingProposal ? { ifMatch: `"${existingProposal.version}"` } : {}),
      });
      await clearIdempotencyKey(command, commandPayload).catch(() => undefined);
      setState('success');
      router.refresh();
    } catch (error) {
      if (isDefinitiveCommandFailure(error)) {
        await clearIdempotencyKey(command, commandPayload).catch(() => undefined);
      }
      const clientError =
        error instanceof DemoClientError
          ? error
          : new DemoClientError(
              'Não foi possível enviar a proposta.',
              500,
              'UNEXPECTED_ERROR',
              true,
            );
      setErrors([
        ...clientError.fields.map((field) => ({
          field: field.field,
          message: `Revise o campo ${field.field}.`,
        })),
        {
          message: `${clientError.message}${
            clientError.code === 'PROPOSAL_VERSION_CONFLICT'
              ? ' A proposta foi alterada; recarregue antes de revisar.'
              : ''
          }${clientError.correlationId ? ` Referência: ${clientError.correlationId}.` : ''}`,
        },
      ]);
      setState('idle');
    }
  }

  return (
    <form className="marketplace-form proposal-form" onSubmit={(event) => void submit(event)}>
      {errors.length > 0 ? (
        <div
          aria-labelledby="proposal-error-title"
          className="form-error-summary"
          ref={errorSummary}
          role="alert"
          tabIndex={-1}
        >
          <strong id="proposal-error-title">A proposta ainda não foi enviada</strong>
          <ul>
            {errors.map((error, index) => (
              <li key={`${error.field ?? 'form'}-${index}`}>
                {error.field ? <a href={`#${error.field}`}>{error.message}</a> : error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {state === 'success' ? (
        <div className="form-success" role="status">
          <strong>{existingProposal ? 'Nova revisão enviada.' : 'Proposta enviada.'}</strong>
          <span>
            O cliente verá esta versão completa. Versões anteriores permanecem no histórico.
          </span>
        </div>
      ) : null}

      <fieldset>
        <legend>Escopo da proposta</legend>
        <p className="fieldset-help">
          Responda ao pedido sem incluir telefone, Pix ou endereço. Cada revisão cria uma nova
          versão.
        </p>
        <div className="form-grid">
          <div className="field-group field-span-full">
            <label htmlFor="scope">Como o serviço será realizado</label>
            <textarea
              defaultValue={revision?.scope ?? ''}
              id="scope"
              maxLength={4000}
              minLength={20}
              name="scope"
              placeholder="Explique preparação, execução e entrega."
              required
              rows={6}
            />
          </div>
          <div className="field-group">
            <label htmlFor="included">Itens incluídos</label>
            <textarea
              defaultValue={revision?.included.join('\n') ?? ''}
              id="included"
              name="included"
              placeholder={'Montagem completa\nProteção do piso\nConferência final'}
              required
              rows={5}
            />
            <span className="field-hint">Um item por linha.</span>
          </div>
          <div className="field-group">
            <label htmlFor="excluded">Itens não incluídos</label>
            <textarea
              defaultValue={revision?.excluded.join('\n') ?? ''}
              id="excluded"
              name="excluded"
              placeholder={'Fixação em parede\nRetirada de embalagem'}
              rows={5}
            />
            <span className="field-hint">Um item por linha.</span>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Composição do preço</legend>
        <div className="form-grid form-grid-three">
          <div className="field-group">
            <label htmlFor="labor">Mão de obra</label>
            <div className="money-input">
              <span aria-hidden="true">R$</span>
              <input
                id="labor"
                inputMode="decimal"
                min="0"
                name="labor"
                onChange={(event) => setLabor(event.target.value)}
                required
                step="0.01"
                value={labor}
              />
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="materials">Materiais</label>
            <div className="money-input">
              <span aria-hidden="true">R$</span>
              <input
                id="materials"
                inputMode="decimal"
                min="0"
                name="materials"
                onChange={(event) => setMaterials(event.target.value)}
                required
                step="0.01"
                value={materials}
              />
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="travel">Deslocamento</label>
            <div className="money-input">
              <span aria-hidden="true">R$</span>
              <input
                id="travel"
                inputMode="decimal"
                min="0"
                name="travel"
                onChange={(event) => setTravel(event.target.value)}
                required
                step="0.01"
                value={travel}
              />
            </div>
          </div>
        </div>
        <ProposalCommercialPreview amounts={previewAmounts} />
      </fieldset>

      <fieldset>
        <legend>Agenda e validade</legend>
        <div className="form-grid form-grid-three">
          <div className="field-group">
            <label htmlFor="scheduledStart">Início previsto</label>
            <input
              defaultValue={localDateTime(
                revision?.schedule.startsAt ?? request.desiredWindow.startsAt,
              )}
              id="scheduledStart"
              name="scheduledStart"
              required
              type="datetime-local"
            />
          </div>
          <div className="field-group">
            <label htmlFor="scheduledEnd">Término previsto</label>
            <input
              defaultValue={localDateTime(
                revision?.schedule.endsAt ?? request.desiredWindow.endsAt,
              )}
              id="scheduledEnd"
              name="scheduledEnd"
              required
              type="datetime-local"
            />
          </div>
          <div className="field-group">
            <label htmlFor="validUntil">Proposta válida até</label>
            <input
              defaultValue={localDateTime(revision?.validUntil ?? request.proposalDeadline)}
              id="validUntil"
              name="validUntil"
              required
              type="datetime-local"
            />
          </div>
        </div>
        <p className="timezone-note">Agenda informada em America/Bahia.</p>
      </fieldset>

      <fieldset>
        <legend>Políticas desta proposta</legend>
        <div className="form-grid">
          <div className="generated-policy-card">
            <span className="role-label">Política da plataforma</span>
            <strong>{DEMO_CANCELLATION_POLICY.label}</strong>
            <p>
              Código <code>{DEMO_CANCELLATION_POLICY.code}</code>, versão{' '}
              {DEMO_CANCELLATION_POLICY.version}. Esta política será aplicada pela API à nova
              revisão e não pode ser substituída em texto livre.
            </p>
          </div>
          <div className="field-group">
            <label htmlFor="guaranteeOffer">Garantia voluntária, se oferecida</label>
            <textarea
              defaultValue={
                revision?.policies.guarantee?.text ??
                'Garantia de 30 dias para ajustes diretamente relacionados à montagem.'
              }
              id="guaranteeOffer"
              maxLength={1000}
              minLength={10}
              name="guaranteeOffer"
              rows={4}
            />
          </div>
        </div>
      </fieldset>

      <div className="form-submit-panel">
        <div>
          <strong>
            {existingProposal
              ? `Criar revisão ${existingProposal.currentRevision.version + 1}`
              : 'Enviar versão 1'}
          </strong>
          <span>A versão enviada não será sobrescrita ou apagada.</span>
        </div>
        <button
          aria-busy={state === 'submitting'}
          className="button button-primary"
          disabled={state === 'submitting'}
          type="submit"
        >
          {state === 'submitting'
            ? 'Enviando proposta…'
            : existingProposal
              ? 'Enviar proposta revisada'
              : 'Enviar proposta'}
        </button>
      </div>
    </form>
  );
}
