# Marketplace de serviços locais

Primeiro incremento da plataforma especificada em
[`docs/especificacao-marketplace-servicos-locais.md`](docs/especificacao-marketplace-servicos-locais.md).

O recorte atual implementa descoberta pública:

- home responsiva;
- busca por serviço, categoria e cidade;
- perfil público sem endereço ou contato protegido;
- intenção opaca para futura retomada após autenticação;
- API REST versionada;
- PostgreSQL/PostGIS com dados exclusivamente sintéticos.

Pagamentos, identidade real, KYC/KYB e contratação não estão habilitados. Esses fluxos
dependem dos gates jurídicos, tributários, operacionais e de fornecedores registrados na
especificação.

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

## Verificar

```bash
npm run check
```

Os dados do seed são fictícios e o script se recusa a executar com `NODE_ENV=production`.
