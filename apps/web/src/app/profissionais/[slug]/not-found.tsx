import Link from 'next/link';

export default function ProfileNotFound() {
  return (
    <div className="shell standalone-state">
      <p className="eyebrow">Perfil indisponível</p>
      <h1>Este profissional não aparece na busca pública.</h1>
      <p>O perfil pode ter sido pausado, removido ou ainda não estar publicado.</p>
      <Link className="button button-secondary" href="/buscar">
        Voltar para a busca
      </Link>
    </div>
  );
}
