import type { BookingHold, ContractStatus, PaymentOrder } from '@marido/contracts';

import { formatDateTime, formatMoney } from '@/lib/format';

import { StatusChip } from './status-chip';

interface ContractPaymentNoticeProps {
  contractId: string;
  contractStatus: ContractStatus;
  paymentOrder: PaymentOrder;
  bookingHold: BookingHold | null;
}

export function ContractPaymentNotice({
  contractId,
  contractStatus,
  paymentOrder,
  bookingHold,
}: ContractPaymentNoticeProps) {
  const awaitingPayment =
    contractStatus === 'AWAITING_PAYMENT' &&
    paymentOrder.status === 'AWAITING_PAYMENT' &&
    bookingHold?.status === 'HOLD_ACTIVE';
  const holdDescription =
    bookingHold?.status === 'HOLD_ACTIVE'
      ? `Hold temporário até ${formatDateTime(bookingHold.expiresAt)}`
      : bookingHold?.status === 'HOLD_EXPIRED'
        ? 'Hold expirado'
        : bookingHold?.status === 'HOLD_RELEASED'
          ? 'Hold liberado'
          : 'Sem hold';

  return (
    <section
      className={`contract-payment-notice ${
        awaitingPayment ? '' : 'contract-payment-notice-closed'
      }`}
      aria-labelledby="payment-notice-title"
    >
      <div className="payment-notice-mark" aria-hidden="true">
        !
      </div>
      <div>
        <div className="payment-notice-heading">
          <div>
            <p className="eyebrow">Estado financeiro separado</p>
            <h2 id="payment-notice-title">
              {awaitingPayment
                ? 'Nenhuma cobrança foi realizada.'
                : 'Fluxo encerrado sem cobrança.'}
            </h2>
          </div>
          <StatusChip status={paymentOrder.status} />
        </div>
        {awaitingPayment ? (
          <p>
            A proposta foi aceita e o contrato <code>{contractId}</code> foi criado, mas a ordem de
            pagamento continua pendente. Não solicitamos cartão ou Pix, não recebemos valores e não
            existe pagamento aprovado.
          </p>
        ) : (
          <p>
            O contrato <code>{contractId}</code> foi cancelado e a ordem de pagamento está{' '}
            {paymentOrder.status === 'EXPIRED' ? 'expirada' : 'cancelada'}. Nenhum cartão ou Pix foi
            solicitado e nenhum valor foi recebido.
          </p>
        )}
        <dl className="payment-notice-facts">
          <div>
            <dt>{awaitingPayment ? 'Total aguardando etapa futura' : 'Valor não cobrado'}</dt>
            <dd>{formatMoney(paymentOrder.amount.amountMinor)}</dd>
          </div>
          <div>
            <dt>Checkout</dt>
            <dd>
              {awaitingPayment ? 'Não disponível neste incremento' : 'Encerrado sem pagamento'}
            </dd>
          </div>
          <div>
            <dt>Agenda</dt>
            <dd>{holdDescription}</dd>
          </div>
        </dl>
        <p className="hold-explanation">
          {awaitingPayment
            ? 'Um hold ativo apenas reserva temporariamente o período enquanto o fluxo é demonstrado. Ele não é booking confirmado e expira sem pagamento.'
            : 'O período não está mais reservado. Não houve booking confirmado, pagamento, ledger ou repasse.'}
        </p>
      </div>
    </section>
  );
}
