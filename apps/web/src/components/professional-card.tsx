import type { ProfessionalCard as ProfessionalCardData } from '@marido/contracts';
import Link from 'next/link';

import { formatServicePrice } from '@/lib/format';

import { ArrowIcon, PinIcon, ShieldIcon } from './icons';

interface ProfessionalCardProps {
  professional: ProfessionalCardData;
}

export function ProfessionalCard({ professional }: ProfessionalCardProps) {
  return (
    <article className="professional-card">
      <div className="profile-avatar" aria-hidden="true">
        {professional.initials}
      </div>
      <div className="professional-card-main">
        <div className="professional-card-heading">
          <div>
            <p className="service-kicker">{professional.primaryService.category.name}</p>
            <h3>
              <Link href={`/profissionais/${professional.slug}`}>{professional.displayName}</Link>
            </h3>
          </div>
          <div className="rating-summary">
            {professional.rating.average === null ? (
              <span>Sem avaliações ainda</span>
            ) : (
              <>
                <strong>{professional.rating.average.toFixed(1)}</strong>
                <span>
                  de 5, {professional.rating.count}{' '}
                  {professional.rating.count === 1 ? 'avaliação' : 'avaliações'}
                </span>
              </>
            )}
          </div>
        </div>
        <p className="professional-headline">{professional.headline}</p>
        <div className="inline-facts">
          <span>
            <PinIcon />
            {professional.regionLabel}
          </span>
          <span>{professional.completedServices} serviços concluídos</span>
        </div>
        {professional.badges.length > 0 ? (
          <ul className="badge-list" aria-label="Verificações específicas">
            {professional.badges.map((badge) => (
              <li key={badge.code}>
                <ShieldIcon />
                {badge.label}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="professional-card-offer">
          <div>
            <span className="muted-label">Serviço em destaque</span>
            <strong>{professional.primaryService.name}</strong>
            <span>{formatServicePrice(professional.primaryService)}</span>
          </div>
          <Link
            aria-label={`Ver perfil de ${professional.displayName}`}
            className="text-link"
            href={`/profissionais/${professional.slug}`}
          >
            Ver perfil
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </article>
  );
}
