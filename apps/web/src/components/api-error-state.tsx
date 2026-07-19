interface ApiErrorStateProps {
  title?: string;
  correlationId?: string;
  description?: string;
}

export function ApiErrorState({
  title = 'Não foi possível carregar esta parte agora.',
  correlationId,
  description = 'Atualize a página em alguns instantes. Sua busca não será alterada.',
}: ApiErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <p className="eyebrow">Falha temporária</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {correlationId ? <code>Referência: {correlationId}</code> : null}
    </div>
  );
}
