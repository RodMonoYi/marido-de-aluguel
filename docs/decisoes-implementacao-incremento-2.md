# Decisões de implementação do incremento 2

## Escopo

Fluxo privado demonstrativo:

`identidade sintética -> pedido rascunho -> publicação -> oportunidade elegível -> proposta
versionada -> aceite -> contrato aguardando pagamento`.

O objetivo é validar o núcleo transacional do marketplace sem integrar credenciais reais, KYC,
PSP, captura, booking, ledger ou repasse.

## Resultado observável

- o cliente sintético cria e publica um pedido com localização aproximada;
- o profissional sintético elegível visualiza a oportunidade sanitizada;
- o profissional envia e revisa uma proposta sem sobrescrever versões anteriores;
- o cliente compara a revisão vigente e registra aceite explícito;
- uma transação cria contrato, ordem de pagamento, hold de agenda, auditoria, idempotência e
  outbox;
- o contrato permanece `AWAITING_PAYMENT` e informa que checkout e cobrança não estão
  disponíveis;
- nenhum lançamento contábil, booking ou promessa de pagamento é criado.

## Decisões

| ID | Decisão | Motivo | Restrição/revisão |
|---|---|---|---|
| IMP-008 | `X-Demo-Actor-Id` identifica apenas atores sintéticos em desenvolvimento/teste | Permite testar RBAC e ABAC antes da escolha do IdP | A aplicação deve falhar fechada em produção; substituir após Q-19 |
| IMP-009 | Pedido começa em `DRAFT` e publicação é comando separado | Preserva validação, moderação futura e controle otimista | Criação e publicação não podem ser combinadas |
| IMP-010 | Oportunidades são privadas e filtradas por categoria, serviço e área ativa na mesma cidade/UF | Evita expor pedidos ou localização a visitante e profissional fora da região | `PUBLIC_SUMMARY`, raio geográfico e indexação permanecem desabilitados |
| IMP-011 | Revisões de proposta são append-only | Preserva negociação, evidência e versão aceita | Não existe `PATCH` destrutivo de revisão |
| IMP-012 | Aceite exige `Idempotency-Key`, `If-Match`, revisão vigente e texto versionado | Impede contrato duplicado, aceite obsoleto e consentimento implícito | Revalidar tudo no mesmo commit |
| IMP-013 | Snapshot contratual contém somente fatos aceitos, recebe SHA-256 e é protegido por trigger | Evita alteração silenciosa da evidência | A leitura recalcula o hash; correção gera novo fato |
| IMP-014 | Comissão de 15% é fixture `DEVELOPMENT_ONLY`, calculada no servidor | Permite demonstrar breakdown sem congelar monetização | Startup/uso proibido em produção; depende de Q-01, Q-02 e validação tributária |
| IMP-015 | Taxa do cliente é zero na fixture | Evita taxa oculta e segue o default seguro da especificação | Nenhum valor pode surgir depois do aceite |
| IMP-016 | Aceite cria `PaymentOrder(AWAITING_PAYMENT)`, mas não tentativa ou ledger | Ordem representa intenção de cobrança, não movimento econômico | PSP, captura e ledger dependem de Q-04 |
| IMP-017 | Hold tem TTL, estado próprio e expiração automática em lotes com `SKIP LOCKED`; booking não existe | Libera agenda sem depender de acesso e sem afirmar contratação confirmada | Leitura/aceite também expiram como defesa; booking só nasce após captura |
| IMP-018 | SQL explícito e transação em um único `PoolClient` | `pool.query()` não garante a mesma conexão entre `BEGIN` e `COMMIT` | Reavaliar camada de persistência após o spike |
| IMP-019 | `categoryId` representa provisoriamente a taxonomia do piloto | O incremento anterior ainda não possui subcategorias versionadas | Dívida obrigatória antes de expansão de catálogo |
| IMP-020 | Resultado idempotente fica retido por 24 horas | Limita retenção de texto livre, bairro e snapshot sem perder replay operacional | Após o TTL, a chave pode ser reclamada atomicamente; clientes devem usar chave nova |
| IMP-021 | Comandos de proposta bloqueiam pedido e depois propostas irmãs em ordem de ID | Evita deadlock por ordem inversa no aceite concorrente | `40P01` e `40001` retornam `409` repetível com a mesma chave |
| IMP-022 | Texto de aceite, hash SHA-256 e política comercial demonstrativa têm fonte canônica em `@marido/contracts` | Faz a UI, a validação e o snapshot referirem-se ao mesmo conteúdo, sem texto implícito | **VALIDAÇÃO JURÍDICA OBRIGATÓRIA** antes de substituir a fixture ou habilitar produção |
| IMP-023 | A web deriva uma chave idempotente estável do hash de comando e payload e guarda somente chave/checkpoint em `sessionStorage` | Uma resposta perdida não pode duplicar pedido, proposta, revisão ou contrato | Sucesso e erro 4xx definitivo limpam o estado; erro de rede, timeout e falha repetível o preservam |
| IMP-024 | Worker materializa `ServiceRequest.EXPIRED` e `Proposal.EXPIRED` com ator `SYSTEM`, auditoria e outbox | Estado temporal não pode existir somente como filtro de listagem ou cálculo da interface | A UI ainda bloqueia comandos pelo prazo efetivo durante o intervalo entre ciclos |

## Estados do incremento

| Agregado | Estados |
|---|---|
| Pedido | `DRAFT`, `PUBLISHED`, `CONVERTED`, `CANCELLED`, `EXPIRED` |
| Proposta | `SENT`, `VIEWED`, `NEGOTIATING`, `REVISED`, `CONVERTED`, `REJECTED`, `EXPIRED`, `CANCELLED` |
| Contrato | `AWAITING_PAYMENT`, `CANCELLED` |
| Ordem de pagamento | `AWAITING_PAYMENT`, `EXPIRED`, `CANCELLED` |
| Hold | `HOLD_ACTIVE`, `HOLD_EXPIRED`, `HOLD_RELEASED` |
| Booking | Não criado neste incremento |
| Ledger | Nenhum lançamento neste incremento |

Esses estados não são sincronizados por igualdade. Cada agregado responde a uma pergunta
distinta e só muda por regra explícita.

## Invariantes

- papel e vínculo profissional vêm do banco; nunca do corpo ou do papel escolhido na interface;
- cliente e profissional não descobrem recursos para os quais não possuem acesso;
- endereço completo, contato, documento e coordenada exata não entram no pedido;
- categoria, elegibilidade, prazo, revisão e agenda são revalidados no servidor;
- elegibilidade privada exige categoria/serviço publicados e área ativa na mesma cidade e UF;
- o profissional possui no máximo uma proposta ativa por pedido;
- a revisão aceita é a revisão vigente e ainda válida;
- agenda proposta fica dentro da janela solicitada;
- um pedido gera no máximo um contrato;
- repetição da mesma chave e corpo devolve o resultado original;
- reutilização da chave com corpo diferente retorna conflito;
- aceite concorrente cria no máximo um contrato e um hold ativo;
- todo estado expirado retornado pela API já foi persistido;
- evidência contratual não pode ser alterada ou removida e o hash é verificado na leitura;
- payload de replay idempotente expira e é removido em lote após 24 horas;
- valores monetários são inteiros seguros na API e `bigint` no banco;
- total, comissão e líquido são derivados pelo servidor;
- total do cliente, taxa zero do cliente, comissão, líquido estimado e base de incidência são
  exibidos ao profissional antes do envio e ao cliente antes do aceite;
- política de cancelamento vem de fixture versionada; garantia é identificada como oferta do
  profissional;
- o checkbox apresenta o texto canônico integral; versão, texto e hash entram no snapshot;
- retries ambíguos da web mantêm comando, payload, chave e, no pedido, o mesmo rascunho;
- pedidos e propostas vencidos transitam para `EXPIRED` por evento de sistema auditável;
- auditoria e outbox não recebem descrição, bairro, política textual ou escopo;
- nenhuma resposta usa “pago”, “confirmado” ou “garantido” antes de fato financeiro confiável.

## Correções de inconsistência

### Ledger simulado no walking skeleton

A especificação menciona evento/ledger simulado como parte do walking skeleton. Isso conflita com
a regra de que o ledger registra fatos econômicos imutáveis.

**Decisão:** não criar lançamento, nem mesmo simulado. A ordem `AWAITING_PAYMENT` é persistida
separadamente e deixa explícito que não houve captura.

### Contrato sem PSP

Aceitar proposta cria obrigação condicionada ao pagamento, mas não contratação confirmada.

**Decisão:** usar `Contract(AWAITING_PAYMENT)` e `PaymentOrder(AWAITING_PAYMENT)`. Não criar
`Booking`, comprovante, recebível ou repasse.

### Política comercial pendente

O breakdown precisa ser demonstrável, mas take rate, base da comissão e incidência ainda são
hipóteses.

**Decisão:** fixture sintética, versionada e bloqueada em produção. Nenhuma decisão comercial ou
tributária é inferida deste código.

## Dependências bloqueadoras de produção

- **VALIDAÇÃO JURÍDICA OBRIGATÓRIA:** texto de aceite, contrato, cancelamento, garantia e relação de
  consumo;
- **VALIDAÇÃO CONTÁBIL/TRIBUTÁRIA OBRIGATÓRIA:** natureza e base da comissão, documentos e
  conciliação;
- **VALIDAÇÃO COM PROVEDOR DE PAGAMENTO:** split, captura, refund, chargeback, recebedor, hold e
  portabilidade;
- **VALIDAÇÃO OPERACIONAL:** elegibilidade, expiração, suporte, recurso e tratamento de conflito;
- Q-04 para PSP;
- Q-13 e Q-17 para risco e repasse;
- Q-19 para IdP/IAM.

## Critérios de aceite

1. Pedido rascunho só é publicado pelo cliente dono e com versão vigente.
2. Profissional inelegível não descobre o pedido.
3. Nova revisão preserva integralmente a anterior.
4. Revisão obsoleta ou expirada não pode ser aceita.
5. Aceite repetido com mesma chave devolve os mesmos IDs.
6. Aceites concorrentes geram no máximo um contrato; conflito repetível retorna `409`.
7. Snapshot e hash permanecem iguais após mudanças posteriores e adulteração falha fechada.
8. Profissional fora da cidade/UF não descobre, propõe nem aceita uma oportunidade privada.
9. Terceiro recebe `404` ao consultar pedido, proposta ou contrato protegido.
10. Contrato e ordem informam `AWAITING_PAYMENT`; checkout permanece indisponível.
11. Hold vencido é persistido como expirado automaticamente, sem estado apenas projetado.
12. Não existe `Booking`, tentativa PSP ou lançamento de ledger.
13. API, web e seed recusam configuração demonstrativa incompatível com o ambiente.
14. Testes, lint, tipos, build, migração e seed passam com Node.js 24.
15. Texto e hash do aceite aceitos pela API são os mesmos exibidos pela web e congelados no
    snapshot.
16. Comissão, taxa do cliente, total e líquido estimado aparecem antes de enviar ou aceitar.
17. Falha ambígua entre criar e publicar retoma o mesmo rascunho e a mesma chave.
18. Pedido ou proposta vencida recebe estado `EXPIRED`, auditoria e outbox; a web não oferece
    revisão ou aceite.
