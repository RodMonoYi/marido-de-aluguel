INSERT INTO catalog.categories
  (id, slug, name, description, icon_key, status, risk_level, display_order)
VALUES
  ('019b0000-0000-7000-8000-000000000001', 'eletrica', 'Elétrica', 'Instalações, reparos e diagnósticos residenciais.', 'bolt', 'ACTIVE', 'MODERATE', 10),
  ('019b0000-0000-7000-8000-000000000002', 'hidraulica', 'Hidráulica', 'Vazamentos, torneiras, descargas e manutenção.', 'drop', 'ACTIVE', 'MODERATE', 20),
  ('019b0000-0000-7000-8000-000000000003', 'pintura', 'Pintura', 'Pintura interna, externa e pequenos acabamentos.', 'paint', 'ACTIVE', 'LOW', 30),
  ('019b0000-0000-7000-8000-000000000004', 'montagem-de-moveis', 'Montagem de móveis', 'Montagem, desmontagem e ajustes em móveis.', 'chair', 'ACTIVE', 'LOW', 40),
  ('019b0000-0000-7000-8000-000000000005', 'limpeza', 'Limpeza', 'Limpeza residencial, pós-obra e organização.', 'sparkle', 'ACTIVE', 'LOW', 50),
  ('019b0000-0000-7000-8000-000000000006', 'jardinagem', 'Jardinagem', 'Manutenção de jardins, poda leve e plantio.', 'leaf', 'ACTIVE', 'LOW', 60)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon_key = EXCLUDED.icon_key,
  status = EXCLUDED.status,
  risk_level = EXCLUDED.risk_level,
  display_order = EXCLUDED.display_order,
  updated_at = now();

INSERT INTO catalog.professional_profiles
  (
    id, slug, display_name, initials, headline, bio, city, state,
    rating_average, review_count, completed_services, response_time_label,
    availability_label, cancellation_policy, guarantee_policy, status
  )
VALUES
  (
    '019b0000-0000-7000-8000-000000000101', 'ana-reis-eletrica', 'Ana Reis', 'AR',
    'Elétrica residencial com diagnóstico explicado',
    'Atendimento residencial focado em reparos, instalações e revisão preventiva. O escopo é registrado antes do início e qualquer mudança depende de novo aceite.',
    'Salvador', 'BA', 4.90, 48, 71, 'Costuma responder em até 1 hora',
    'Próximos horários nesta semana', 'Reagendamento sem custo com 24 horas de antecedência.',
    'Garantia de 90 dias sobre a mão de obra descrita no orçamento.', 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000102', 'casa-em-ordem-montagens', 'Casa em Ordem', 'CO',
    'Montagem cuidadosa, ambiente organizado',
    'Montagem e desmontagem de móveis residenciais com checklist de peças, proteção do piso e conferência final junto ao cliente.',
    'Salvador', 'BA', 4.80, 36, 54, 'Costuma responder em até 2 horas',
    'Disponibilidade indicativa amanhã', 'Cancelamento gratuito até 24 horas antes.',
    'Garantia de 30 dias para ajustes relacionados à montagem.', 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000103', 'joao-lima-hidraulica', 'João Lima', 'JL',
    'Reparos hidráulicos sem surpresa no escopo',
    'Diagnóstico de vazamentos aparentes, troca de componentes e manutenção de pontos hidráulicos. Materiais são discriminados no orçamento.',
    'Salvador', 'BA', 4.70, 29, 43, 'Costuma responder em até 1 hora',
    'Agenda indicativa para os próximos 3 dias', 'Reagendamento com 12 horas de antecedência.',
    'Garantia conforme o componente e o serviço descritos na proposta.', 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000104', 'atelie-da-cor', 'Ateliê da Cor', 'AC',
    'Pintura residencial com preparação detalhada',
    'Planejamento de pintura interna, preparação de superfícies e acabamento. A visita técnica paga é contratada separadamente quando necessária.',
    'Lauro de Freitas', 'BA', 4.90, 61, 88, 'Costuma responder no mesmo dia',
    'Visitas indicativas a partir da próxima semana', 'Cancelamento da visita conforme antecedência exibida no aceite.',
    'Garantia voluntária definida por superfície e material no orçamento.', 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000105', 'brisa-limpeza', 'Brisa Limpeza', 'BL',
    'Limpeza residencial com checklist combinado',
    'Serviços de limpeza residencial e pós-obra leve. Produtos, duração e cômodos atendidos são informados antes da contratação.',
    'Salvador', 'BA', NULL, 0, 0, 'Costuma responder em até 3 horas',
    'Novos horários nesta semana', 'Reagendamento sem custo com 24 horas de antecedência.',
    NULL, 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000106', 'verde-perto-jardinagem', 'Verde Perto', 'VP',
    'Jardinagem para varandas e pequenos jardins',
    'Manutenção periódica, poda leve, replantio e orientação de cuidados. Serviços de risco elevado não fazem parte da oferta.',
    'Camaçari', 'BA', 4.60, 18, 27, 'Costuma responder no mesmo dia',
    'Consulte os próximos períodos', 'Reagendamento com 24 horas de antecedência.',
    'Garantia limitada ao serviço descrito, sem garantia de sobrevivência de plantas.', 'PUBLISHED'
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  initials = EXCLUDED.initials,
  headline = EXCLUDED.headline,
  bio = EXCLUDED.bio,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  rating_average = EXCLUDED.rating_average,
  review_count = EXCLUDED.review_count,
  completed_services = EXCLUDED.completed_services,
  response_time_label = EXCLUDED.response_time_label,
  availability_label = EXCLUDED.availability_label,
  cancellation_policy = EXCLUDED.cancellation_policy,
  guarantee_policy = EXCLUDED.guarantee_policy,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO catalog.services
  (
    id, professional_id, category_id, slug, name, summary, pricing_model,
    price_from_minor, unit_label, modalities, duration_minutes, is_featured, status
  )
VALUES
  (
    '019b0000-0000-7000-8000-000000000201', '019b0000-0000-7000-8000-000000000101',
    '019b0000-0000-7000-8000-000000000001', 'visita-eletrica-residencial',
    'Visita elétrica residencial', 'Diagnóstico inicial e orçamento registrado antes de qualquer serviço adicional.',
    'FIXED', 12000, 'por visita', ARRAY['AT_CLIENT'], 60, true, 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000202', '019b0000-0000-7000-8000-000000000102',
    '019b0000-0000-7000-8000-000000000004', 'montagem-de-movel',
    'Montagem de móvel', 'Montagem com conferência de peças, proteção do ambiente e ajuste final.',
    'STARTING_AT', 9000, 'por móvel', ARRAY['AT_CLIENT'], 90, true, 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000203', '019b0000-0000-7000-8000-000000000103',
    '019b0000-0000-7000-8000-000000000002', 'diagnostico-hidraulico',
    'Diagnóstico hidráulico', 'Avaliação de vazamento aparente e definição do reparo necessário.',
    'FIXED', 11000, 'por visita', ARRAY['AT_CLIENT'], 60, true, 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000204', '019b0000-0000-7000-8000-000000000104',
    '019b0000-0000-7000-8000-000000000003', 'pintura-de-ambiente',
    'Pintura de ambiente', 'Preparação e pintura conforme medidas, superfície e material definidos na proposta.',
    'CUSTOM_QUOTE', NULL, 'por orçamento', ARRAY['AT_CLIENT'], NULL, true, 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000205', '019b0000-0000-7000-8000-000000000105',
    '019b0000-0000-7000-8000-000000000005', 'limpeza-residencial',
    'Limpeza residencial', 'Checklist de ambientes e tarefas definido antes do agendamento.',
    'STARTING_AT', 15000, 'por diária', ARRAY['AT_CLIENT'], 240, true, 'PUBLISHED'
  ),
  (
    '019b0000-0000-7000-8000-000000000206', '019b0000-0000-7000-8000-000000000106',
    '019b0000-0000-7000-8000-000000000006', 'manutencao-de-jardim',
    'Manutenção de jardim', 'Poda leve, limpeza e cuidado de pequenos jardins conforme avaliação.',
    'STARTING_AT', 14000, 'por visita', ARRAY['AT_CLIENT'], 120, true, 'PUBLISHED'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  summary = EXCLUDED.summary,
  pricing_model = EXCLUDED.pricing_model,
  price_from_minor = EXCLUDED.price_from_minor,
  unit_label = EXCLUDED.unit_label,
  modalities = EXCLUDED.modalities,
  duration_minutes = EXCLUDED.duration_minutes,
  is_featured = EXCLUDED.is_featured,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO catalog.professional_badges
  (professional_id, code, label, status, verified_at)
VALUES
  ('019b0000-0000-7000-8000-000000000101', 'IDENTITY_CONFIRMED', 'Identidade confirmada', 'ACTIVE', now() - interval '120 days'),
  ('019b0000-0000-7000-8000-000000000101', 'PHONE_CONFIRMED', 'Telefone confirmado', 'ACTIVE', now() - interval '120 days'),
  ('019b0000-0000-7000-8000-000000000102', 'IDENTITY_CONFIRMED', 'Identidade confirmada', 'ACTIVE', now() - interval '90 days'),
  ('019b0000-0000-7000-8000-000000000102', 'PHONE_CONFIRMED', 'Telefone confirmado', 'ACTIVE', now() - interval '90 days'),
  ('019b0000-0000-7000-8000-000000000103', 'IDENTITY_CONFIRMED', 'Identidade confirmada', 'ACTIVE', now() - interval '75 days'),
  ('019b0000-0000-7000-8000-000000000104', 'IDENTITY_CONFIRMED', 'Identidade confirmada', 'ACTIVE', now() - interval '160 days'),
  ('019b0000-0000-7000-8000-000000000104', 'PHONE_CONFIRMED', 'Telefone confirmado', 'ACTIVE', now() - interval '160 days'),
  ('019b0000-0000-7000-8000-000000000106', 'PHONE_CONFIRMED', 'Telefone confirmado', 'ACTIVE', now() - interval '45 days')
ON CONFLICT (professional_id, code) DO UPDATE SET
  label = EXCLUDED.label,
  status = EXCLUDED.status,
  verified_at = EXCLUDED.verified_at;

INSERT INTO catalog.service_areas
  (id, professional_id, region_label, city, state, status)
VALUES
  ('019b0000-0000-7000-8000-000000000301', '019b0000-0000-7000-8000-000000000101', 'Salvador e região próxima', 'Salvador', 'BA', 'ACTIVE'),
  ('019b0000-0000-7000-8000-000000000302', '019b0000-0000-7000-8000-000000000102', 'Salvador', 'Salvador', 'BA', 'ACTIVE'),
  ('019b0000-0000-7000-8000-000000000303', '019b0000-0000-7000-8000-000000000103', 'Salvador', 'Salvador', 'BA', 'ACTIVE'),
  ('019b0000-0000-7000-8000-000000000304', '019b0000-0000-7000-8000-000000000104', 'Lauro de Freitas e Salvador', 'Lauro de Freitas', 'BA', 'ACTIVE'),
  ('019b0000-0000-7000-8000-000000000305', '019b0000-0000-7000-8000-000000000105', 'Salvador', 'Salvador', 'BA', 'ACTIVE'),
  ('019b0000-0000-7000-8000-000000000306', '019b0000-0000-7000-8000-000000000106', 'Camaçari e região próxima', 'Camaçari', 'BA', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET
  region_label = EXCLUDED.region_label,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  status = EXCLUDED.status;
