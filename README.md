# yc-finance-api

Cotações do Yuri Coimbra Finance: Yahoo Finance via edge function, com CORS.

`GET /api/quotes?group=global|b3|agro|crypto|fx|all` (grupo desconhecido: 400)

Cada item: `symbol`, `name`, `value`, `prev`, `delta`, `currency`, `unit`,
`stale`, `ts`.

- `delta`: variação do dia, em %, contra o fechamento do dia útil
  anterior (barras diárias do Yahoo; o "dia" é o do fuso da bolsa).
  Em ações e índices coincide com o número do Yahoo. Em futuros, câmbio
  e Nikkei o Yahoo troca a referência na liquidação (o algodão fica
  0,00% horas depois de cair 4,8%); aqui a referência é sempre o
  fechamento de ontem.
- Se a barra do dia anterior vier sem fechamento (buraco na série), usa
  o `chartPreviousClose` de `range=1d`, que é a referência do Yahoo.
  Sem nenhuma das duas, `delta` e `prev` vêm `null`; nunca 0 inventado.
- `stale: true`: última negociação com mais de 5 dias (contrato sem
  negócio). `value` é o último preço e `ts` diz quando; `delta` é `null`.
- Cripto: variação contra o preço de 24 h antes (abertura da barra de
  15 min).
- Unidades sem escala escondida: algodão em ¢/lb, soja e milho em
  ¢/bu, ouro US$/oz, Brent US$/bbl.
- Símbolo sem dados (contrato vencido) sai com `value: null` e
  `error: "falha"`.

Testes: `npm test`.
