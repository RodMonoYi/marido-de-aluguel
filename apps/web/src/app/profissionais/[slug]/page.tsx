import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { IntentButton } from '@/components/intent-button';
import { PinIcon, ShieldIcon } from '@/components/icons';
import { ApiClientError, getProfessional } from '@/lib/api';
import { formatServicePrice, modalityLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const professional = await getProfessional(slug);
    return {
      title: `${professional.displayName} | ${professional.primaryService.category.name}`,
      description: professional.headline,
      alternates: {
        canonical: `/profissionais/${professional.slug}`,
      },
    };
  } catch {
    return {
      title: 'Perfil indisponível',
      robots: { index: false, follow: false },
    };
  }
}

export default async function ProfessionalProfilePage({ params }: { params: RouteParams }) {
  const { slug } = await params;
  let professional;
  try {
    professional = await getProfessional(slug);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="profile-page">
      <div className="shell">
        <p className="breadcrumb profile-breadcrumb">
          <Link href="/">Início</Link>
          <span aria-hidden="true">/</span>
          <Link href="/buscar">Busca</Link>
          <span aria-hidden="true">/</span>
          {professional.displayName}
        </p>
        <header className="profile-hero">
          <div className="profile-avatar profile-avatar-large" aria-hidden="true">
            {professional.initials}
          </div>
          <div>
            <p className="service-kicker">{professional.primaryService.category.name}</p>
            <h1>{professional.displayName}</h1>
            <p className="profile-headline">{professional.headline}</p>
            <div className="inline-facts">
              <span>
                <PinIcon />
                {professional.regionLabel}
              </span>
              <span>{professional.completedServices} serviços concluídos</span>
              <span>{professional.responseTimeLabel}</span>
            </div>
          </div>
          <div className="profile-rating">
            {professional.rating.average === null ? (
              <>
                <strong>Novo perfil</strong>
                <span>Sem avaliações ainda</span>
              </>
            ) : (
              <>
                <strong>{professional.rating.average.toFixed(1)}</strong>
                <span>de 5</span>
                <small>
                  {professional.rating.count}{' '}
                  {professional.rating.count === 1 ? 'avaliação' : 'avaliações'}
                </small>
              </>
            )}
          </div>
        </header>

        <div className="profile-layout">
          <div className="profile-main">
            <section className="profile-section" aria-labelledby="about-title">
              <p className="eyebrow">Sobre o trabalho</p>
              <h2 id="about-title">Experiência e forma de atender</h2>
              <p className="long-copy">{professional.bio}</p>
              {professional.badges.length > 0 ? (
                <ul className="profile-badges" aria-label="Verificações específicas">
                  {professional.badges.map((badge) => (
                    <li key={badge.code}>
                      <ShieldIcon />
                      <div>
                        <strong>{badge.label}</strong>
                        <span>Este selo confirma somente o item descrito.</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="neutral-notice">
                  Este perfil ainda não exibe verificações específicas.
                </p>
              )}
            </section>

            <section className="profile-section" aria-labelledby="services-title">
              <p className="eyebrow">Serviços publicados separadamente</p>
              <h2 id="services-title">Escolha o serviço para pedir orçamento</h2>
              <div className="service-list">
                {professional.services.map((service) => (
                  <article className="service-card" key={service.id}>
                    <div className="service-card-heading">
                      <div>
                        <span>{service.category.name}</span>
                        <h3>{service.name}</h3>
                      </div>
                      <strong>{formatServicePrice(service)}</strong>
                    </div>
                    <p>{service.summary}</p>
                    <ul className="service-facts">
                      {service.modalities.map((modality) => (
                        <li key={modality}>{modalityLabel(modality)}</li>
                      ))}
                      {service.durationMinutes ? (
                        <li>Duração estimada: {service.durationMinutes} minutos</li>
                      ) : (
                        <li>Duração definida no orçamento</li>
                      )}
                    </ul>
                    <IntentButton
                      compact
                      professionalId={professional.id}
                      professionalName={professional.displayName}
                      serviceId={service.id}
                    />
                  </article>
                ))}
              </div>
            </section>

            <section className="profile-section" aria-labelledby="area-title">
              <p className="eyebrow">Localização protegida</p>
              <h2 id="area-title">Área aproximada de atendimento</h2>
              <ul className="area-list">
                {professional.serviceAreas.map((area) => (
                  <li key={area}>
                    <PinIcon />
                    {area}
                  </li>
                ))}
              </ul>
              <p className="privacy-note">
                O endereço exato do cliente e os dados de contato não aparecem nesta página.
              </p>
            </section>

            <section className="profile-section policy-grid" aria-labelledby="policies-title">
              <div>
                <p className="eyebrow">Antes de solicitar</p>
                <h2 id="policies-title">Políticas informadas</h2>
              </div>
              <div>
                <h3>Cancelamento e reagendamento</h3>
                <p>{professional.policies.cancellation}</p>
              </div>
              <div>
                <h3>Garantia oferecida pelo profissional</h3>
                <p>
                  {professional.policies.guarantee ??
                    'Nenhuma garantia voluntária foi publicada para este perfil.'}
                </p>
              </div>
            </section>
          </div>

          <aside className="profile-sidebar" aria-label="Resumo para solicitar orçamento">
            <p className="eyebrow">Próximo passo</p>
            <h2>{professional.primaryService.name}</h2>
            <strong className="sidebar-price">
              {formatServicePrice(professional.primaryService)}
            </strong>
            <p>{professional.availabilityLabel}. O horário será revalidado antes de contratar.</p>
            <IntentButton
              professionalId={professional.id}
              professionalName={professional.displayName}
              serviceId={professional.primaryService.id}
            />
            <ul className="sidebar-assurances">
              <li>Sem telefone ou WhatsApp exposto</li>
              <li>Condições revalidadas antes do aceite</li>
              <li>Pagamento ainda não habilitado neste incremento</li>
            </ul>
          </aside>
        </div>
      </div>
      <div className="mobile-profile-action">
        <IntentButton
          compact
          professionalId={professional.id}
          professionalName={professional.displayName}
          serviceId={professional.primaryService.id}
        />
      </div>
    </div>
  );
}
