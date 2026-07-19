# Decisões de implementação do incremento 1

## Escopo

Fluxo público `Home -> Busca -> Perfil profissional -> Intenção restrita`.

O objetivo é validar linguagem, demanda e comparação sem depender de identidade, KYC ou
pagamento. A fatia seguinte será `pedido -> proposta versionada -> contrato aguardando
pagamento`, ainda sem captura ou ledger.

## Decisões

| ID | Decisão | Motivo | Revisão |
|---|---|---|---|
| IMP-001 | Node 24 LTS é o runtime-alvo | A especificação exige versão LTS | Rever no próximo LTS |
| IMP-002 | npm workspaces sem orquestrador adicional | npm já está disponível; três workspaces não justificam Turbo/Nx | Rever com 5+ apps/pacotes ou CI lento |
| IMP-003 | Monólito modular com `web`, `api` e `contracts` | Mantém fronteiras com baixa operação | ADR-001 |
| IMP-004 | SQL explícito sobre `pg` no primeiro corte | ORM ainda é decisão pendente; SQL evita escolha implícita | Spike antes de CRUD transacional |
| IMP-005 | PostgreSQL/PostGIS desde o início | Busca geográfica, constraints e concorrência não devem depender de SQLite | ADR-001/006/007 |
| IMP-006 | Dados sintéticos no seed | Não coletar PII antes de controles e bases aprovados | Substituir pelo onboarding homologado |
| IMP-007 | Sem imagens remotas no primeiro corte | Evita rastreamento, licença e dependência de CDN | Adotar mídia moderada e storage privado |

## Restrições

- A intenção salva contém somente IDs, ação enumerada e expiração de 30 minutos.
- A busca pública recebe cidade/bairro manual; não solicita geolocalização.
- A API nunca retorna telefone, e-mail, documento, endereço ou coordenada exata.
- O CTA não cria contrato nem pagamento.
- `NODE_ENV=production` bloqueia o seed.
