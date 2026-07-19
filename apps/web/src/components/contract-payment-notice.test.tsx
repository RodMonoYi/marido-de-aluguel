import type { BookingHold, PaymentOrder } from '@marido/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContractPaymentNotice } from './contract-payment-notice';

const paymentOrder: PaymentOrder = {
  id: '019b0000-0000-7000-8000-000000000801',
  contractId: '019b0000-0000-7000-8000-000000000701',
  status: 'AWAITING_PAYMENT',
  amount: { amountMinor: 25000, currency: 'BRL' },
  checkoutAvailable: false,
  createdAt: '2026-07-19T14:00:00.000-03:00',
};

const bookingHold: BookingHold = {
  id: '019b0000-0000-7000-8000-000000000901',
  contractId: '019b0000-0000-7000-8000-000000000701',
  status: 'HOLD_ACTIVE',
  schedule: {
    startsAt: '2026-07-25T12:00:00.000-03:00',
    endsAt: '2026-07-25T15:00:00.000-03:00',
    timezone: 'America/Bahia',
  },
  expiresAt: '2026-07-19T14:30:00.000-03:00',
  createdAt: '2026-07-19T14:00:00.000-03:00',
};

describe('ContractPaymentNotice', () => {
  it('states that the accepted proposal did not trigger a charge', () => {
    render(
      <ContractPaymentNotice
        bookingHold={bookingHold}
        contractId={paymentOrder.contractId}
        contractStatus="AWAITING_PAYMENT"
        paymentOrder={paymentOrder}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Nenhuma cobrança foi realizada.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Não disponível neste incremento')).toBeInTheDocument();
    expect(screen.getByText(/não é booking confirmado/i)).toBeInTheDocument();
    expect(screen.getByText('R$ 250,00')).toBeInTheDocument();
  });

  it('does not describe an expired order as pending', () => {
    render(
      <ContractPaymentNotice
        bookingHold={{ ...bookingHold, status: 'HOLD_EXPIRED' }}
        contractId={paymentOrder.contractId}
        contractStatus="CANCELLED"
        paymentOrder={{ ...paymentOrder, status: 'EXPIRED' }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Fluxo encerrado sem cobrança.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ordem de pagamento está expirada/i)).toBeInTheDocument();
    expect(screen.queryByText(/continua pendente/i)).not.toBeInTheDocument();
  });
});
