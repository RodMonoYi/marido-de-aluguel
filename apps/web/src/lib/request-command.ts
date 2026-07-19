import type { CreateServiceRequestInput, ServiceRequest } from '@marido/contracts';

import { demoMutation } from './demo-client';
import {
  clearIdempotencyKey,
  clearRequestDraftCheckpoint,
  isDefinitiveCommandFailure,
  loadRequestDraftCheckpoint,
  saveRequestDraftCheckpoint,
  stableIdempotencyKey,
  type RequestDraftCheckpoint,
} from './idempotent-command';

const CREATE_COMMAND = 'POST /api/demo/service-requests';

interface RequestCommandHooks {
  onDraft?: (draftId: string) => void;
  onStage?: (stage: 'creating' | 'publishing') => void;
}

export async function createAndPublishServiceRequest(
  input: CreateServiceRequestInput,
  hooks: RequestCommandHooks = {},
  mutate: typeof demoMutation = demoMutation,
) {
  const createPayload = { body: input };
  let checkpoint = await loadRequestDraftCheckpoint(CREATE_COMMAND, createPayload);

  if (!checkpoint) {
    hooks.onStage?.('creating');
    const idempotencyKey = await stableIdempotencyKey(CREATE_COMMAND, createPayload);
    let created;
    try {
      created = await mutate<ServiceRequest>('service-requests', input, {
        idempotencyKey,
      });
    } catch (error) {
      if (isDefinitiveCommandFailure(error)) {
        await clearIdempotencyKey(CREATE_COMMAND, createPayload).catch(() => undefined);
      }
      throw error;
    }
    const publishCommand = `POST /api/demo/service-requests/${created.data.id}/publish`;
    const publishPayload = {
      body: {},
      expectedVersion: created.data.version,
    };
    checkpoint = {
      draftId: created.data.id,
      version: created.data.version,
      publicationKey: await stableIdempotencyKey(publishCommand, publishPayload),
    };
    await saveRequestDraftCheckpoint(CREATE_COMMAND, createPayload, checkpoint);
  }

  hooks.onDraft?.(checkpoint.draftId);
  hooks.onStage?.('publishing');
  const publishCommand = `POST /api/demo/service-requests/${checkpoint.draftId}/publish`;
  const publishPayload = {
    body: {},
    expectedVersion: checkpoint.version,
  };
  try {
    const published = await publishRequest(checkpoint, mutate);
    await clearWorkflow(createPayload, publishCommand, publishPayload);
    return published;
  } catch (error) {
    if (isDefinitiveCommandFailure(error)) {
      await clearWorkflow(createPayload, publishCommand, publishPayload);
    }
    throw error;
  }
}

function publishRequest(checkpoint: RequestDraftCheckpoint, mutate: typeof demoMutation) {
  return mutate<ServiceRequest>(
    `service-requests/${checkpoint.draftId}/publish`,
    {},
    {
      idempotencyKey: checkpoint.publicationKey,
      ifMatch: `"${checkpoint.version}"`,
    },
  );
}

async function clearWorkflow(
  createPayload: unknown,
  publishCommand: string,
  publishPayload: unknown,
): Promise<void> {
  await Promise.allSettled([
    clearIdempotencyKey(CREATE_COMMAND, createPayload),
    clearIdempotencyKey(publishCommand, publishPayload),
    clearRequestDraftCheckpoint(CREATE_COMMAND, createPayload),
  ]);
}
