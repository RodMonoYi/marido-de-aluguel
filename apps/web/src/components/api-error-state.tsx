interface ApiErrorStateProps {
  title?: string;
  correlationId?: string;
}

export function ApiErrorState({
  title = 'Não foi possível carregar esta parte agora.',
  correlationId,
}: ApiErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <p className="eyebrow">Falha temporária</p>
      <h2>{title}</h2>
      <p>Atualize a página em alguns instantes. Sua busca não será alterada.</p>
      {correlationId ? <code>Referência: {correlationId}</code> : null}
    </div>
  );
}
