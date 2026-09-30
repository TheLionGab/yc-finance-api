# yc-finance-api

Cotações do Yuri Coimbra Finance: Yahoo Finance via edge function, com CORS.

`GET /api/quotes?group=global|b3|agro|crypto|fx|all` (grupo desconhecido: 400)

Cada item: `symbol`, `name`, `value`, `prev`, `delta`, `currency`, `unit`,
`stale`, `ts`.

- `delta`: variação em %.
  - Padrão (ações, índices, câmbio, ouro, Brent): contra o fechamento
    anterior do Yahoo (`chartPreviousClose` de `range=1d`), o mesmo
    número do site deles. No câmbio o Yahoo troca a referência às
    23:00 UTC e à noite a variação fica perto de 0%; a página usa a
    AwesomeAPI antes, e esta serve de reserva.
  - Contratos agrícolas (`dayChange`, mês explícito): se o último
    negócio foi no pregão diurno (06:00 a 18:00 ET) e foi a partir da
    liquidação (14:00 ET) ou está parado há mais de 1 h, contra o
    fechamento do dia útil anterior
    (barras diárias). O Yahoo troca a referência na liquidação e o
    algodão ficaria 0,00% horas depois de cair 4,8%. Série com buraco
    ou sem barras: `null`. Negócio à noite pertence ao pregão seguinte:
    vale a referência do Yahoo (contra a liquidação), parado ou não.
  - Cripto: contra o preço de 24 h antes (abertura da barra de 15 min).
  Sem referência válida, `delta` e `prev` vêm `null`; nunca 0 inventado.
- `stale: true`: última negociação com mais de 5 dias (contrato sem
  negócio). `value` é o último preço e `ts` diz quando; `delta` é `null`.
- Unidades sem escala escondida: algodão e óleo de soja em ¢/lb, soja,
  milho e trigo em ¢/bu, farelo de soja em US$/t curta (tonelada curta,
  907 kg), ouro US$/oz, Brent US$/bbl.
- Chicago (CBOT) no grupo `agro`: soja, milho, trigo, farelo e óleo de
  soja, todos com mês explícito (`dayChange`). Contrato vencido sai da
  lista, como o resto.
- Símbolo sem dados (contrato vencido) sai com `value: null` e
  `error: "falha"`.

Testes: `npm test`.
