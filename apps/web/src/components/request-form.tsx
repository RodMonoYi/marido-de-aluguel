'use client';

import type { CategorySummary, CreateServiceRequestInput } from '@marido/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { DemoClientError } from '@/lib/demo-client';
import { createAndPublishServiceRequest } from '@/lib/request-command';

interface RequestFormProps {
  categories: CategorySummary[];
}

interface FormError {
  field?: string;
  message: string;
}

function amountToMinor(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : undefined;
}

function asIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

function validate(input: CreateServiceRequestInput): FormError[] {
  const errors: FormError[] = [];
  if (Date.parse(input.desiredWindow.endsAt) <= Date.parse(input.desiredWindow.startsAt)) {
    errors.push({ field: 'endTime', message: 'O horário final deve ser posterior ao inicial.' });
  }
  if (Date.parse(input.proposalDeadline) >= Date.parse(input.desiredWindow.startsAt)) {
    errors.push({
      field: 'proposalDeadline',
      message: 'O prazo para propostas deve terminar antes do início desejado.',
    });
  }
  if (
    input.budget?.minMinor !== undefined &&
    input.budget?.maxMinor !== undefined &&
    input.budget.minMinor !== null &&
    input.budget.maxMinor !== null &&
    input.budget.minMinor > input.budget.maxMinor
  ) {
    errors.push({
      field: 'budgetMax',
      message: 'O orçamento máximo deve ser maior ou igual ao mínimo.',
    });
  }
  return errors;
}

export function RequestForm({ categories }: RequestFormProps) {
  const router = useRouter();
  const errorSummary = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'creating' | 'publishing'>('idle');
  const [errors, setErrors] = useState<FormError[]>([]);
  const [draftId, setDraftId] = useState<string>();
  const isSubmitting = state !== 'idle';

  useEffect(() => {
    if (errors.length > 0) {
      errorSummary.current?.focus();
    }
  }, [errors]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors([]);

    const form = new FormData(event.currentTarget);
    const date = String(form.get('desiredDate') ?? '');
    const startTime = String(form.get('startTime') ?? '');
    const endTime = String(form.get('endTime') ?? '');
    const deadline = String(form.get('proposalDeadline') ?? '');
    const minMinor = amountToMinor(form.get('budgetMin'));
    const maxMinor = amountToMinor(form.get('budgetMax'));

    const input: CreateServiceRequestInput = {
      categoryId: String(form.get('categoryId') ?? ''),
      title: String(form.get('title') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      locationApprox: {
        city: String(form.get('city') ?? '').trim(),
        state: 'BA',
        district: String(form.get('district') ?? '').trim() || null,
      },
      desiredWindow: {
        startsAt: asIso(date, startTime),
        endsAt: asIso(date, endTime),
        timezone: 'America/Bahia',
      },
      urgency: String(form.get('urgency')) as CreateServiceRequestInput['urgency'],
      budget:
        minMinor === undefined && maxMinor === undefined
          ? null
          : {
              ...(minMinor === undefined ? {} : { minMinor }),
              ...(maxMinor === undefined ? {} : { maxMinor }),
              currency: 'BRL',
            },
      visibility: 'PRIVATE_MATCHED',
      proposalDeadline: new Date(`${deadline}:00-03:00`).toISOString(),
    };

    const validationErrors = validate(input);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      const published = await createAndPublishServiceRequest(input, {
        onDraft: setDraftId,
        onStage: (stage) => {
          setState(stage);
        },
      });
      router.push(`/pedidos/${published.data.id}`);
      router.refresh();
    } catch (error) {
      const clientError =
        error instanceof DemoClientError
          ? error
          : new DemoClientError('Não foi possível criar o pedido.', 500, 'UNEXPECTED_ERROR', true);
      const mappedFields = clientError.fields.map((field) => ({
        field: field.field,
        message: `Revise o campo ${field.field}.`,
      }));
      setErrors([
        ...mappedFields,
        {
          message: `${clientError.message}${
            clientError.correlationId ? ` Referência: ${clientError.correlationId}.` : ''
          }`,
        },
      ]);
      setState('idle');
    }
  }

  return (
    <form className="marketplace-form" onSubmit={(event) => void submit(event)}>
      {errors.length > 0 ? (
        <div
          aria-labelledby="request-error-title"
          className="form-error-summary"
          ref={errorSummary}
          role="alert"
          tabIndex={-1}
        >
          <strong id="request-error-title">Revise antes de publicar</strong>
          <ul>
            {errors.map((error, index) => (
              <li key={`${error.field ?? 'form'}-${index}`}>
                {error.field ? <a href={`#${error.field}`}>{error.message}</a> : error.message}
              </li>
            ))}
          </ul>
          {draftId ? (
            <p>
              O rascunho <code>{draftId}</code> foi criado, mas ainda não está publicado.
            </p>
          ) : null}
        </div>
      ) : null}

      <fieldset>
        <legend>1. O que precisa ser feito</legend>
        <p className="fieldset-help">
          Descreva o resultado esperado. Não inclua telefone, endereço completo ou dados pessoais.
        </p>
        <div className="form-grid">
          <div className="field-group field-span-full">
            <label htmlFor="categoryId">Categoria</label>
            <select id="categoryId" name="categoryId" required>
              <option value="">Selecione uma categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group field-span-full">
            <label htmlFor="title">Título do pedido</label>
            <input
              id="title"
              maxLength={120}
              minLength={10}
              name="title"
              placeholder="Ex.: Montar guarda-roupa de seis portas"
              required
            />
            <span className="field-hint">Entre 10 e 120 caracteres.</span>
          </div>
          <div className="field-group field-span-full">
            <label htmlFor="description">Descrição</label>
            <textarea
              id="description"
              maxLength={2000}
              minLength={20}
              name="description"
              placeholder="Informe dimensões, condições do ambiente e o que espera que esteja incluído."
              required
              rows={6}
            />
            <span className="field-hint">
              Fotos e documentos entram em um incremento posterior.
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>2. Região aproximada</legend>
        <p className="fieldset-help">
          O profissional verá somente cidade e bairro. O endereço completo não é coletado aqui.
        </p>
        <div className="form-grid">
          <div className="field-group">
            <label htmlFor="city">Cidade</label>
            <input
              autoComplete="address-level2"
              defaultValue="Salvador"
              id="city"
              maxLength={80}
              minLength={2}
              name="city"
              required
            />
          </div>
          <div className="field-group">
            <label htmlFor="district">Bairro</label>
            <input
              autoComplete="address-level3"
              id="district"
              maxLength={80}
              minLength={2}
              name="district"
              placeholder="Ex.: Pituba"
            />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>3. Data e prazo</legend>
        <div className="form-grid form-grid-three">
          <div className="field-group">
            <label htmlFor="desiredDate">Data desejada</label>
            <input id="desiredDate" name="desiredDate" required type="date" />
          </div>
          <div className="field-group">
            <label htmlFor="startTime">A partir de</label>
            <input id="startTime" name="startTime" required type="time" />
          </div>
          <div className="field-group">
            <label htmlFor="endTime">Até</label>
            <input id="endTime" name="endTime" required type="time" />
          </div>
          <div className="field-group field-span-two">
            <label htmlFor="proposalDeadline">Receber propostas até</label>
            <input id="proposalDeadline" name="proposalDeadline" required type="datetime-local" />
          </div>
          <div className="field-group">
            <label htmlFor="urgency">Urgência</label>
            <select defaultValue="FLEXIBLE" id="urgency" name="urgency">
              <option value="FLEXIBLE">Data flexível</option>
              <option value="WITHIN_7_DAYS">Preciso em até 7 dias</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>
        </div>
        <p className="timezone-note">Datas exibidas no fuso de Salvador: America/Bahia.</p>
      </fieldset>

      <fieldset>
        <legend>4. Faixa de orçamento opcional</legend>
        <div className="form-grid">
          <div className="field-group">
            <label htmlFor="budgetMin">Mínimo em reais</label>
            <div className="money-input">
              <span aria-hidden="true">R$</span>
              <input id="budgetMin" inputMode="decimal" min="0" name="budgetMin" step="0.01" />
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="budgetMax">Máximo em reais</label>
            <div className="money-input">
              <span aria-hidden="true">R$</span>
              <input id="budgetMax" inputMode="decimal" min="0" name="budgetMax" step="0.01" />
            </div>
          </div>
        </div>
        <p className="fieldset-help">
          A faixa orienta propostas, mas não representa preço contratado.
        </p>
      </fieldset>

      <div className="form-submit-panel">
        <div>
          <strong>Publicação privada e direcionada</strong>
          <span>
            Apenas profissionais elegíveis recebem a oportunidade; não publicamos o endereço.
          </span>
        </div>
        <button
          aria-busy={isSubmitting}
          className="button button-primary"
          disabled={isSubmitting}
          type="submit"
        >
          {state === 'creating'
            ? 'Criando rascunho…'
            : state === 'publishing'
              ? 'Publicando pedido…'
              : 'Criar e publicar pedido'}
        </button>
      </div>
    </form>
  );
}
