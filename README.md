# Marketplace de serviços locais

Implementação incremental da plataforma especificada em
[`docs/especificacao-marketplace-servicos-locais.md`](docs/especificacao-marketplace-servicos-locais.md).

O primeiro incremento implementa descoberta pública:

- home responsiva;
- busca por serviço, categoria e cidade;
- perfil público sem endereço ou contato protegido;
- intenção opaca para futura retomada após autenticação;

O segundo incremento implementa um fluxo privado exclusivamente demonstrativo:

- seleção de cliente ou profissional sintético;
- pedido em rascunho e publicação privada;
- oportunidades sanitizadas e elegíveis por categoria, cidade e UF;
- proposta com revisões append-only;
- composição comercial completa antes do envio e do aceite;
- comparação e aceite explícito, com texto e hash canônicos da revisão vigente;
- snapshot contratual imutável;
- contrato e ordem separados em `AWAITING_PAYMENT`;
- hold de agenda com expiração automática;
- expiração auditada de pedidos e propostas;
- idempotência no servidor e no navegador, controle otimista, auditoria e outbox.

A API é REST versionada e a persistência usa PostgreSQL/PostGIS com dados exclusivamente
sintéticos. Pagamento real, identidade real, KYC/KYB, booking, ledger e repasse não estão
habilitados. Esses fluxos dependem dos gates jurídicos, tributários, operacionais e de
fornecedores registrados na especificação.

## Pré-requisitos

- Node.js 24 LTS;
- npm 11;
- Docker com Compose.

## Executar

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

- Web: `http://localhost:5174`
- API: `http://localhost:3000/api/v1`
- OpenAPI interativo: `http://localhost:3000/api/docs`

`DEMO_MODE=true` é obrigatório para a jornada privada e é proibido quando
`NODE_ENV=production`.

## Jornada demonstrativa

1. Acesse `http://localhost:5174/entrar` e escolha **Marina Souza**, cliente sintética.
2. Crie e publique um pedido em `/pedidos/novo`.
3. Troque para **Casa em Ordem**, profissional sintético, pela barra de contexto.
4. Abra a oportunidade, envie uma proposta e, se necessário, crie uma nova revisão.
5. Volte ao contexto da cliente, compare as propostas e aceite a revisão vigente.
6. Consulte o contrato criado em `AWAITING_PAYMENT`.

O checkout permanece indisponível. Após o TTL do hold, o worker de manutenção registra a
expiração e apresenta contrato cancelado, ordem expirada e ausência de cobrança. A leitura
autorizada e um novo aceite no mesmo recurso também aplicam a expiração como defesa adicional.
O mesmo worker materializa pedidos e propostas vencidos como `EXPIRED`; a interface calcula o
estado efetivo pelos prazos para bloquear comandos também entre dois ciclos do worker.

Em falha de rede ou timeout, a web reutiliza a mesma chave idempotente por comando e payload. No
fluxo do pedido, o identificador e a versão do rascunho ficam em `sessionStorage` sem armazenar o
conteúdo do formulário, permitindo retomar somente a publicação após uma resposta ambígua.

## Verificar

```bash
npm run check
npm run test:integration
```

O teste de integração cria um banco temporário para validar locks e dupla reserva e executa o
cenário geográfico no PostgreSQL local. Execute as migrações antes do teste.

Os dados do seed são fictícios. O script exige `NODE_ENV=development|test` e `DEMO_MODE=true`.

## Contratos e decisões

- Contrato HTTP: [`contracts/http/openapi.v1.yaml`](contracts/http/openapi.v1.yaml)
- Incremento 1:
  [`docs/decisoes-implementacao-incremento-1.md`](docs/decisoes-implementacao-incremento-1.md)
- Incremento 2:
  [`docs/decisoes-implementacao-incremento-2.md`](docs/decisoes-implementacao-incremento-2.md)
