import {
  calculateDemoProposalBreakdown,
  DEMO_COMMERCIAL_POLICY,
  type ProposalAmounts,
} from '@marido/contracts';

import { formatMoney } from '@/lib/format';

interface ProposalCommercialPreviewProps {
  amounts: ProposalAmounts;
}

export function ProposalCommercialPreview({ amounts }: ProposalCommercialPreviewProps) {
  let breakdown: ReturnType<typeof calculateDemoProposalBreakdown>;
  try {
    breakdown = calculateDemoProposalBreakdown(amounts);
  } catch {
    return (
      <p className="inline-error" role="alert">
        Os valores excedem o limite suportado. Reduza a composição antes de enviar.
      </p>
    );
  }
  const grossMinor = breakdown.laborMinor + breakdown.materialsMinor + breakdown.travelMinor;
  const commissionPercent = DEMO_COMMERCIAL_POLICY.professionalCommissionRateBps / 100;

  return (
    <section
      aria-label="Resumo comercial da proposta"
      aria-live="polite"
      className="proposal-commercial-preview"
    >
      <div className="proposal-total">
        <span>Total exibido ao cliente</span>
        <strong>{formatMoney(breakdown.customerTotalMinor)}</strong>
        <small>
          Fixture <code>DEVELOPMENT_ONLY</code>: política <code>{breakdown.policy.code}</code>,
          versão {breakdown.policy.version}.
        </small>
      </div>
      <dl className="proposal-commercial-details">
        <div>
          <dt>Preço base</dt>
          <dd>{formatMoney(grossMinor)}</dd>
        </div>
        <div>
          <dt>Taxa da plataforma para o cliente</dt>
          <dd>{formatMoney(breakdown.customerPlatformFeeMinor)}</dd>
        </div>
        <div>
          <dt>Comissão descontada do profissional ({commissionPercent}%)</dt>
          <dd>{formatMoney(breakdown.professionalCommissionMinor)}</dd>
        </div>
        <div>
          <dt>Líquido estimado do profissional</dt>
          <dd>{formatMoney(breakdown.professionalNetEstimateMinor)}</dd>
        </div>
      </dl>
      <p className="fieldset-help">
        A comissão incide sobre mão de obra, materiais e deslocamento. Esta regra é apenas
        demonstrativa e não autoriza cobrança, repasse ou uso em produção.
      </p>
    </section>
  );
}
