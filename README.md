# yc-finance-api

Cotações do Yuri Coimbra Finance: Yahoo Finance via edge function, com CORS.

`GET /api/quotes?group=global|b3|agro|crypto|fx|all`

Cada item: `symbol`, `name`, `value`, `prev`, `delta`, `currency`, `unit`, `ts`.

- `delta` é a variação em % contra o fechamento anterior no critério do
  Yahoo (`chartPreviousClose` com `range=1d`, igual ao
  `regularMarketPreviousClose` do endpoint de cotação deles). Com range
  maior o Yahoo devolve o fechamento de antes do intervalo inteiro, por
  isso a API pede sempre `range=1d`. Sem fechamento anterior válido,
  `delta` e `prev` vêm `null`; nunca 0 inventado.
- Cripto (`h24`): variação contra o preço de 24 h antes.
- Soja e milho vêm do Yahoo em centavos por bushel e saem em US$/bu
  (`div: 100`). Algodão fica em ¢/lb.
- Símbolo sem dados (contrato vencido, por exemplo) sai com
  `value: null` e `error: "falha"`.

Testes: `npm test`.
