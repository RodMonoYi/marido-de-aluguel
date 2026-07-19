import Link from 'next/link';

import type { DemoActor } from '@/lib/demo-session';

interface DemoContextBarProps {
  actor: DemoActor;
}

export function DemoContextBar({ actor }: DemoContextBarProps) {
  const roleLabel = actor.role === 'CLIENT' ? 'cliente' : 'profissional';

  return (
    <aside className="demo-context-bar" aria-label="Contexto da demonstração">
      <div>
        <span className="demo-dot" aria-hidden="true" />
        <span>Modo demonstração</span>
      </div>
      <p>
        Você está atuando como <strong>{actor.displayName}</strong>, perfil {roleLabel} sintético.
      </p>
      <Link href="/entrar">Trocar perfil</Link>
    </aside>
  );
}
