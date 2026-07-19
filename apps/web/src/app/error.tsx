'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only the opaque digest is exposed; error content may contain implementation details.
    if (error.digest) {
      console.error(`Application error digest: ${error.digest}`);
    }
  }, [error.digest]);

  return (
    <div className="shell standalone-state">
      <p className="eyebrow">Falha temporária</p>
      <h1>Não foi possível carregar esta página.</h1>
      <p>Tente novamente. Nenhum pedido ou pagamento foi criado.</p>
      <button className="button button-secondary" onClick={reset} type="button">
        Tentar novamente
      </button>
    </div>
  );
}
