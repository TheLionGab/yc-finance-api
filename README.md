# yc-finance-api

Cotações do Yuri Coimbra Finance: Yahoo Finance via edge function, com CORS.

`GET /api/quotes?group=global|b3|agro|crypto|fx|all` (grupo desconhecido: 400)

Cada item: `symbol`, `name`, `value`, `prev`, `delta`, `currency`, `unit`,
`stale`, `ts`.

- `delta`: variação em %, com referência por tipo de instrumento
  (`meta.instrumentType` do Yahoo):
  - ação, índice e demais: contra o fechamento anterior do Yahoo
    (`chartPreviousClose` de `range=1d`), o mesmo número do site deles;
  - futuro com negócio há menos de 1 h (sessão noturna incluída):
    idem, ou seja, contra a última liquidação;
  - futuro parado há mais de 1 h e câmbio: contra o fechamento do dia
    útil anterior (barras diárias). O Yahoo troca a referência na
    liquidação (o algodão ficaria 0,00% horas depois de cair 4,8%) e a
    do câmbio às 23:00 UTC. Barra anterior sem fechamento (buraco na
    série): cai para a referência do Yahoo, nunca para dois dias atrás;
  - cripto: contra o preço de 24 h antes (abertura da barra de 15 min).
  Sem referência válida, `delta` e `prev` vêm `null`; nunca 0 inventado.
- `stale: true`: última negociação com mais de 5 dias (contrato sem
  negócio). `value` é o último preço e `ts` diz quando; `delta` é `null`.
- Unidades sem escala escondida: algodão em ¢/lb, soja e milho em
  ¢/bu, ouro US$/oz, Brent US$/bbl.
- Símbolo sem dados (contrato vencido) sai com `value: null` e
  `error: "falha"`.

Testes: `npm test`.
