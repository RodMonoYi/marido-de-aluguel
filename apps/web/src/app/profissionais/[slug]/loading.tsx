export default function ProfileLoading() {
  return (
    <div className="shell loading-shell" aria-busy="true" aria-label="Carregando perfil">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-block" />
      <div className="skeleton skeleton-block" />
    </div>
  );
}
