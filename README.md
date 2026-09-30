# yc-finance-api

Cotações do Yuri Coimbra Finance: Yahoo Finance via edge function, com CORS.

`GET /api/quotes?group=global|b3|agro|crypto|fx|all`

Cada item: `symbol`, `name`, `value`, `prev`, `delta`, `currency`, `unit`, `ts`.

- `delta` é a variação em % contra o último fechamento de um pregão
  anterior ao dia da cotação (fuso da bolsa). Sem fechamento anterior
  válido, `delta` e `prev` vêm `null`; nunca 0 inventado.
- Cripto (`h24`): variação contra o preço de 24 h antes.
- Soja e milho vêm do Yahoo em centavos por bushel e saem em US$/bu
  (`div: 100`). Algodão fica em ¢/lb.
- Símbolo sem dados (contrato vencido, por exemplo) sai com
  `value: null` e `error: "falha"`.

Testes: `npm test`.
