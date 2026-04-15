---
name: btc-floop-bybit-cycle
description: >-
  Runs a 5m BTCUSDT and DOGEUSDT perp cycle using TradingView FLOOP dashboard
  (green/red background zones: at most one long per green zone, one short per
  red zone), grades setups A/A+/B, sizes margin to 20% equity per symbol at
  effective max leverage (min of 100x and exchange max per symbol), and
  places/manages Limit orders via Bybit MCP as source of truth. Use when the
  user triggers the scheduled trading cycle, asks for FLOOP BTC/DOGE analysis,
  or wants position management rules applied after TV read.
---

# BTC + DOGE FLOOP -> Bybit (5m) - cykl agenta (źródło prawdy: Bybit MCP)

- **Wykres / sygnał:** TradingView Desktop (MCP `tradingview`), symbole **`BYBIT:BTCUSDT.P`** i **`BYBIT:DOGEUSDT.P`**, interwał **5m**, wskaźnik **FLOOP** musi być **widoczny**.
- **Zlecenia i pozycja:** wyłącznie **Bybit MCP** (`category: linear`, symbole `BTCUSDT` i `DOGEUSDT`). Panel TradingView z podpiętym Bybit jest pomocniczy - agent **nie** polega na nim przy rozmiarze ani SL/TP.

## Zakres cyklu (2 symbole)

W każdym przebiegu wykonaj ten sam pipeline dla obu symboli, w tej kolejności:

1. `BYBIT:BTCUSDT.P` -> Bybit `BTCUSDT`
2. `BYBIT:DOGEUSDT.P` -> Bybit `DOGEUSDT`

Każdy symbol oceniaj i egzekwuj **niezależnie** (osobny setup, osobna **strefa FLOOP**, osobne zarządzanie pozycją).

## Konfiguracja wykresu (przed odczytem)

**Szablon / zapisany układ (layout):** skill **zakłada** jeden zapisany layout w TradingView z FLOOP i resztą narzędzi pod ten workflow. **Domyślna nazwa układu:** **`Bloop`**. Na starcie cyklu wywołaj **`layout_switch`** z parametrem **`name`** równym tej nazwie (MCP dopasowuje zapisany layout z konta; lista: `layout_list`). Po załadowaniu układ ustawia m.in. symbol bazowy i TF zapisane w TV — **nadal** musisz ustawić aktywny instrument cyklu (`chart_set_symbol` dla BTC lub DOGE).

**Zakładki (tabs):** MCP zwraca `tab_list` z **indeksem** i URL wykresu; tytuły kart są zwykle ogólne (**„TradingView”**), więc **nie ma** niezawodnego wyboru „karty o nazwie Bloop” — wybór szablonu to **`layout_switch`**, nie `tab_switch`. **`tab_switch`** używaj tylko gdy **ręcznie** ustalisz mapowanie indeks → layout (np. zawsze karta `1` = wykres roboczy); wtedy: `tab_list` → `tab_switch` z **`index`**, potem ewentualnie `layout_switch` na **`Bloop`**.

1. **`layout_switch`** → `name: "Bloop"` (lub inna nazwa, którą podmienisz w tym skillu / która występuje w `layout_list`).
2. **`chart_set_symbol`** → `BYBIT:BTCUSDT.P` lub `BYBIT:DOGEUSDT.P` (kolejność całego cyklu: najpierw BTC, potem DOGE).
3. **`chart_set_timeframe`** → `5` (jeśli layout już ma 5m, krok jest idempotentny).
4. **`chart_get_state`** — potwierdź symbol, TF i że study **FLOOP** jest na liście.

Przy błędzie `layout_switch` (brak layoutu / timeout): opisz problem; jeśli aktywny wykres już spełnia pkt 4, możesz **kontynuować** z ostrzeżeniem.

## Krok 1: Połączenie i dane z TradingView

Równolegle (lub kolejno przy błędach sieci):

1. `data_get_pine_tables` z `study_filter: "FLOOP"`
2. `data_get_pine_labels` z `study_filter: "FLOOP"`, `max_labels: 10`
3. `data_get_study_values`
4. `data_get_ohlcv` z `count: 20`, `summary: true`
5. **`capture_screenshot`** z `region: "chart"` — odczyt **tła FLOOP** (pionowe **zielone** vs **czerwone / brązowe** strefy na świecach 5m). To jest **źródło prawdy** co do aktualnej strefy kolorystycznej i jej granic (zmiana koloru tła = **nowa strefa**).

**Jeśli** którekolwiek wywołanie zwróci błąd (`CDP connection failed`, `ECONNREFUSED`, `success: false`, itp.) -> **zakończ cykl**; zapisz krótki log (np. w odpowiedzi użytkownikowi / notatce). Bez powiadomień zewnętrznych.

## Krok 2: Parsowanie dashboardu FLOOP

Z tabeli / etykiet odczytaj spójnie:

- **Bias:** BULLISH / BEARISH
- **Quality:** HIGH / MEDIUM / WEAK + wynik **X/14**
- **CHOP GATE:** OPEN / BLOCKED
- **ADX:** wartość liczbowa
- **EMA Alignment:** ALIGNED / nie
- **Conviction:** High / Low
- **MTF:** kierunki 1m, 5m, 15m, 1h, 4h (strzałki w górę / w dół z dashboardu)

**Tło FLOOP (strefy kolorystyczne):** wskaźnik maluje **tło** wykresu na **zielono** (kontekst long / „zielona strefa”) i na **czerwono lub brązowo** (kontekst short / „czerwona strefa”). Etykiety **LONG** / **SHORT** na wykresie zwykle pojawiają się przy **początku** danej fazy — do reguł liczy się **ciągły kolor tła** aż do **następnej zmiany** koloru (granica strefy). Przy rozbieżności między tabelą **Bias** a **kolorem tła** na screenie — **priorytet: wizualne tło** (tabela może lagować o świecę).

**Wiersz typu `ADX off | CI` + ptaszek + wartość (np. 54.3) — częsty błąd parsowania:**

- **`CI`** to **Choppiness Index** (warunek chop/trendu), **nie** ADX. Ptasek przy **CI** oznacza spełnienie progu CI w FLOOP, **a nie** „ADX > 25”.
- **`ADX off`** **nie** znaczy automatycznie „ADX poniżej 25”: często oznacza **wyłączony filtr / gate ADX** w dashboardzie. **Nie odrzucaj A/A+** wyłącznie dlatego, że widzisz słowo `off`, jeśli Twoja wersja FLOOP tak oznacza bypass ADX.
- Do twardej reguły **ADX > 25** użyj **liczbowej wartości ADX** z tabeli FLOOP lub z `data_get_study_values` (osobny study ADX), gdy jest dostępna. Gdy **nie ma liczby** i UI jednoznacznie traktuje ADX jako wyłączony — **nie blokuj** wejścia samym tekstem `ADX off`. Gdy ADX jest **włączony** w ustawieniach a liczby brak w MCP — **doprecyzuj z użytkownikiem** lub ponów odczyt tabeli, zamiast zakładać fail.

## Krok 3: Reguły setupu (logika A / A+ / B)

**Ciche zakończenie (brak nowego zlecenia):**

- CHOP GATE **BLOCKED**, **lub**
- Quality **WEAK** (**< 8/14**), **lub**
- Setup **B** (Quality MEDIUM 8-11 + CHOP OPEN)

**Setupy (tylko A i A+ rozpatrujemy pod nowe wejście):**

| Setup | Warunki |
|--------|---------|
| **A+** | Quality HIGH (>=12/14) + CHOP OPEN + ADX > 25 + MTF zgodne z kierunkiem + **volume spike** >= **2x** średni wolumen z `data_get_ohlcv` (ostatnia świeca vs średnia z poprzednich ~19) |
| **A** | Quality HIGH (>=12/14) + CHOP OPEN + ADX > 25 + MTF zgodne |
| **B** | (jak wyżej) -> **cicho** |

Warunek **ADX > 25** dotyczy sytuacji, gdy w FLOOP **włączony** jest gate ADX i masz **liczbę** (lub jednoznaczny sygnał z dokumentacji wskaźnika). Gdy gate ADX jest **wyłączony** (`ADX off` = bypass) — **nie** traktuj braku liczby jako naruszenia tej linijki tabeli.

**MTF zgodne** = kierunek handlu (LONG = BULLISH bias) jest spójny z dominującym kierunkiem na 1m-4h zgodnie z odczytem FLOOP (brak twardego sprzeciwu na 1h i 4h).

## Krok 4: Poziomy TP / SL (domyślne z analizy volatility, per symbol)

Bazuj na ostatnim **close** z OHLCV / `quote_get`:

### BTCUSDT

| Parametr | LONG | SHORT |
|----------|------|-------|
| **SL** | **entry - 151 USDT** (~1.25x ATR14, patrz reference) | **entry + 151 USDT** |
| **TP start** | **entry + 331 USDT** (~2.2R) | **entry - 331 USDT** |

### DOGEUSDT

| Parametr | LONG | SHORT |
|----------|------|-------|
| **SL** | **entry - 0.00030 USDT** (~1.25x ATR14, patrz reference) | **entry + 0.00030 USDT** |
| **TP start** | **entry + 0.00067 USDT** (~2.2R) | **entry - 0.00067 USDT** |

**TP a prowizje (obowiązkowe minimum):** **TP nie może być bliżej ceny wejścia** niż wymaga warunek **„100% zysku po prowizjach”** — tj. zysk **netto** (po prowizjach od wejścia i od wyjścia po planowanym TP) ma być **≥** zysk **brutto** liczony tylko z odległości **TP start** ze skilla (pełne ~2.2R w USDT na pozycji, bez pomniejszania o fee).

1. **G** = `qty * |TP_start - entry|` (planowany zysk brutto w USDT; `qty` i `entry` jak na koncie).
2. **Prowizja:** na każdą nogę przyjmij **notional × fee_rate**; **fee_rate** domyślnie **0.055%** (taker orientacyjnie), chyba że znasz **fee tier** z konta / API — wtedy podstaw rzeczywistą stawkę. **Round-trip:** suma prowizji z **wejścia** i **wyjścia** przy cenach `entry` i **kandydującym TP** (notional na nogę = `qty * cena`).
3. Ustal **TP faktyczne** tak, żeby **`qty * |TP_faktyczne - entry| - P(entry, TP_faktyczne, qty) ≥ G`**.  
   - **LONG:** **TP_faktyczne ≥** rozwiązanie (nie ustawiaj TP **niżej** niż to minimum — bliżej entry = gorzej).  
   - **SHORT:** **TP_faktyczne ≤** analogiczne minimum (nie wyżej niż dopuszcza netto ≥ G).
4. Jeśli po uwzględnieniu fee **nie da się** spełnić nierówności bez absurdalnego TP — **nie otwieraj** / nie podnoś TP; opisz konflikt (za mały R przy założonej prowizji).

**Pivot / struktura:** jeśli w danych FLOOP / labelach widać wyraźny poziom w odległości **<= 0.15%** ceny od planowanego TP/SL, możesz dostosować poziom **tylko w kierunku korzystniejszym dla minimum z pkt 3** (LONG: TP **dalej** od entry niż minimum, nie bliżej). **Nigdy** nie ustawiaj TP **wbrew** punktowi 3, żeby „trafić” w strukturę.

**Wejście:** preferuj **`orderType: Limit`**. Cenę limitu ustaw:

- LONG: **<= aktualnego ask** (`get_orderbook`; np. midpoint minus mały offset, bez nierealnego spreadu).
- SHORT: **>= aktualnego bid** (symetrycznie).

Jeśli rynek ucieka i limit nie ma szans wypełnienia w **2-3 świece**, **nie** zamieniaj agresywnie na Market bez wyraźnej zgody użytkownika - zakończ z rekomendacją nowej ceny limitu.

## Krok 5: Rozmiar pozycji (20% equity na **każdy symbol**, 100x)

**Margin początkowy** ma odpowiadać **~20% równoważnika konta w USDT na każdy symbol osobno** (`get_wallet_balance` / `get_account_info` - equity lub USDT wallet balance w unified).

**Dźwignia efektywna `L_eff`:** przyjmij **min(100, rzeczywisty max leverage instrumentu na koncie)**. Skill docelowo liczy na **100×**, ale np. DOGE bywa **75×** — wtedy **nie** wolno wstawiać `100` do wzoru jeśli giełda blokuje wyższą dźwignię; użyj wartości z UI/API Bybit dla danego symbolu.

Przybliżona ilość **qty** (w kontraktach / coinie instrumentu), przy cenie **P** i equity **E** (USDT):

```text
order_value_USDT = 0.20 * E * L_eff
qty = order_value_USDT / P
```

Zaokrąglij **qty w dół** do kroków giełdy Bybit dla aktualnego symbolu (BTCUSDT lub DOGEUSDT). Jeśli wynik jest poniżej min. wielkości zlecenia -> **nie otwieraj**; opisz powód.

**Sekwencja wykonawcza (obowiązkowa przed wejściem):**

1. `node scripts/bybit-cli.mjs calc-size <SYMBOL> --category linear --equity-pct 0.2 --max-leverage 100`  
   (bierze `L_eff = min(100, max leverage instrumentu)` i oddaje `qtyRounded`)
2. `node scripts/bybit-cli.mjs set-leverage linear <SYMBOL> <L_eff> --execute`
3. `node scripts/bybit-cli.mjs submit linear <SYMBOL> <Buy|Sell> Limit <qtyRounded> <price> --execute`

Nie pomijaj kroku 1 i 2.

## MCP Bybit — poprawne wywołania (to nie jest błąd „skillu”, tylko format argumentów)

Serwer `bybit-mcp-server` (Zod) wymaga **ważnego JSON**: wszystkie pola tekstowe w cudzysłowach, **`qty` i `price` muszą być stringami**, nigdy liczbami. Błędy typu `Unexpected token`, `ategory`, `symbol` bez cudzysłowów = **model złożył złe `arguments`** — **powtórz** wywołanie z poprawnym JSON (nie rezygnuj od razu z MCP).

**Szablon `place_order` (Limit, linear):**

```json
{
  "category": "linear",
  "symbol": "DOGEUSDT",
  "side": "Buy",
  "orderType": "Limit",
  "qty": "1691",
  "price": "0.09456",
  "timeInForce": "GTC"
}
```

Reguły twarde:

- `category` zawsze **string** `"linear"` (nie `linear` bez cudzysłowów w JSON).
- `side` dokładnie **`"Buy"`** lub **`"Sell"`** (wielka litera).
- `orderType` dokładnie **`"Limit"`** lub **`"Market"`**.
- `qty` zawsze **string** (np. `"1691"`, `"0.01"`).
- `price` dla Limit zawsze **string** (np. `"0.09456"`).
- `get_open_orders` / `get_order_history`: `category` **string** `"linear"`; `symbol` jeśli podajesz — **string**; `limit` opcjonalnie **number** (np. `20`).

**Uwaga implementacji MCP:** w pakiecie `bybit-mcp-server@1.0.1` metody `get_orderbook` / `get_klines` wołają **`category: spot`** w kodzie klienta. Do ustalenia ceny limitu **preferuj** `quote_get` z TradingView albo własny odczyt z giełdy; traktuj `get_orderbook` z tego MCP jako **orientacyjny** dla perp.

Po błędzie parsowania MCP: spróbuj poprawnego JSON; jeśli nadal błąd — **nie blokuj cyklu**, tylko użyj **REST CLI** (poniżej).

### Bybit REST CLI (implementacja API, bez MCP)

Skrypt **`scripts/bybit-cli.mjs`** woła to samo API V5 co MCP (`bybit-api`), czyta klucze z **`BYBIT_API_KEY` / `BYBIT_API_SECRET`** lub z **`.cursor/mcp.json` → `mcpServers.bybit.env`**.

Przykłady (z katalogu repo `cursor_tv`):

```bash
node scripts/bybit-cli.mjs wallet-balance UNIFIED
node scripts/bybit-cli.mjs positions linear DOGEUSDT
node scripts/bybit-cli.mjs open-orders linear DOGEUSDT 50
node scripts/bybit-cli.mjs order-history linear DOGEUSDT 20
```

Zlecenia (domyślnie **dry-run**; realna wysyłka tylko z **`--execute`**):

```bash
node scripts/bybit-cli.mjs submit linear DOGEUSDT Buy Limit 1691 0.09456
node scripts/bybit-cli.mjs submit linear DOGEUSDT Buy Limit 1691 0.09456 --execute
node scripts/bybit-cli.mjs cancel linear DOGEUSDT <orderId> --execute
```

**TP/SL i trail na pozycji** (endpoint `trading-stop` — nie mylić z pojedynczym zleceniem limit):

```bash
node scripts/bybit-cli.mjs trading-stop linear DOGEUSDT --position-idx 0 --tp 0.09693 --sl 0.092
node scripts/bybit-cli.mjs trading-stop linear DOGEUSDT --position-idx 0 --tp 0.09693 --sl 0.092 --execute
```

**Zmiana otwartego zlecenia** (limit, trigger TP, itd. — `amend`):

```bash
node scripts/bybit-cli.mjs amend linear DOGEUSDT <orderId> --price 0.0945 --execute
node scripts/bybit-cli.mjs amend linear DOGEUSDT <orderId> --trigger 0.096 --tp 0.098 --execute
```

**Dźwignia** przed wejściem (np. 75× na DOGE):

```bash
node scripts/bybit-cli.mjs set-leverage linear DOGEUSDT 75 --execute
```

**Zamknięcie pozycji** (Market, `reduceOnly`; domyślnie cały size):

```bash
node scripts/bybit-cli.mjs close-position linear DOGEUSDT
node scripts/bybit-cli.mjs close-position linear DOGEUSDT --execute
# częściowo: --qty 500
```

**Audyt:** każde **`--execute`** dopisuje linię JSON do **`logs/trade-audit-YYYYMMDD.jsonl`** (timestamp, komenda, request, `retCode`).

**Okno czasu (opcjonalnie, UTC):** ustaw **`BYBIT_TRADE_WINDOW_UTC=08:00-22:00`** albo skopiuj `.cursor/trade-window.example.txt` → **`.cursor/trade-window.txt`** i edytuj jedną linię `HH:MM-HH:MM`. Poza oknem **`--execute` jest blokowane** (wyjątek: flaga **`--bypass-hours`** — tylko świadomie).

| Cel | CLI |
|-----|-----|
| Wejście | `submit … --execute` |
| Wyjście / anuluj zlecenie | `cancel … --execute` |
| **Zamknij pozycję** (market reduce) | `close-position … --execute` |
| SL/TP/trail **na pozycji** | `trading-stop … --execute` |
| Korekta **istniejącego** orderu | `amend … --execute` |
| Ustaw `L_eff` | `set-leverage … --execute` |

Agent: użyj **`Shell`** z **absolutnymi ścieżkami** i `cd` do workspace; przy zepsutym MCP **nie pomijaj** Bybit — użyj `bybit-cli.mjs`.

**Ryzyko:** 100x na 20% equity to ekstremalne obciążenie - skill zakłada świadomą akceptację; agent nie zwiększa rozmiaru ponad te reguły.

## Krok 6: Strefy FLOOP — jedna pozycja na strefę (ochrona przed kolejnymi wejściami / wyjściami)

FLOOP dzieli czas na **strefy** według **koloru tła** na 5m (zielona vs czerwona/brązowa). **W jednej zielonej strefie = co najwyżej jeden long** (jeden cykl otwarcie → zamknięcie). **W jednej czerwonej strefie = co najwyżej jeden short.** To ogranicza **ponowne wejście** po SL/TP/exit w tej samej fazie tła i „flip-flop” na tym samym obszarze.

Przed `place_order` / `submit`:

1. **Strefa z screenshotu (Krok 1 pkt 5):** ustal **aktualny kolor tła** (zielony / czerwony) i **czy od ostatniej zmiany tła** nadal jesteś w **tej samej** strefie co przy poprzednim cyklu (opisz w notatce: „zielona strefa trwa od … / świeża od …”).
2. **Bybit (`positions`, `open-orders`, `order-history`, limit 30):** zweryfikuj, czy w **bieżącej** strefie kolorystycznej (czasowo dopasuj do widocznego wykresu — orientacyjnie od ostatniej zmiany tła) **nie** było już **drugiego** wejścia po stronie zgodnej ze strefą:
   - tło **zielone** + planujesz **Buy / long** → jeśli **już** było **zamknięte** long (np. sprzedaż zmniejszająca long do zera) **albo** pełny exit long **w tej samej zielonej strefie**, **albo** nadal masz **otwarty long** lub **aktywne** zlecenie wejścia Long → **nie** składaj **kolejnego** longa; tylko **zarządzaj** (SL/TP/amend) istniejącą pozycją lub limitem.
   - tło **czerwone** + planujesz **Sell / short** → symetrycznie (**jeden short na strefę**).
3. **Po pełnym wyjściu** z longa w zielonej strefie: **nie** otwieraj **ponownie longa** do momentu **zmiany tła** na nie-zielone (koniec strefy); dopiero **nowa** zielona strefa (po kolejnej zmianie palety) daje znowu **jeden** slot long. To samo dla short w czerwonej strefie.
4. **Dodatkowy filtr czasowy (opcjonalny, ciaśniejszy):** jeśli w **15 min** było wypełnienie tej samej strony i cena różni się od planu o **< 0.12%** → **nie** traktuj jako nowego setupu; **zarządzaj** istniejącym.

**Zasada:** w obrębie **jednej** barwy tła FLOOP — **maksymalnie jedno** „świeże” wejście long **lub** jedno short (nie stackuj tej samej strony). Wyjątkiem jest wyłącznie **edycja** już otwartej pozycji / zleceń, bez **nowego** netto wejścia po tej samej stronie w tej samej strefie.

## Krok 7: Zarządzanie otwartą pozycją (Bybit)

**Zrodlo prawdy (Bybit):** stan konta / zlecenia / pozycje — **MCP** lub **`node scripts/bybit-cli.mjs`**. Ten sam skill na kolejnym cyklu:

1. Odczytaj aktualny FLOOP (jak w kroku 1-2).
2. **Pełny exit:** flip **Bias** przeciw pozycji, lub CHOP **BLOCKED**, lub Quality **WEAK** / **< 8/14**, lub **1h lub 4h MTF** wyraźnie przeciw pozycji — albo **zmiana tła FLOOP** na przeciwny reżim (np. exit longa gdy tło przestaje być zielone). Po takim exit **nie** planuj **ponownego** wejścia **tą samą stroną** aż do **następnej** strefy tego koloru (Krok 6).
3. **Breakeven:** gdy zysk unrealized osiąga co najmniej **+1R** dla danego symbolu (BTC: +151 USDT, DOGE: +0.00030 USDT na jednostkę ceny wejścia) - przesuń **SL** na **entry** (z uwzględnieniem prowizji). Zlecenia warunkowe / TP na giełdzie obsłuż przez UI, MCP lub rozszerzenie CLI; opisz konkretną akcję (`cancel` / `submit` z `--execute`).
4. **Silny trend (A+ utrzymany, ADX > 25, MTF zgodne):** podnoś **TP** o kroki:
   - BTC: **~90 USDT**
   - DOGE: **~0.00020 USDT**
   max **3** podniesienia bez świeżego A+; potem wymagaj nowego A/A+ by dalej przedłużać. Każdy nowy TP musi spełniać **Krok 4**: **G** zamrożone jak przy otwarciu (`qty * |TP_start - entry|` z tabeli), przy aktualnym **TP** przelicz tylko **P** — **`netto ≥ G`**. **Trailuj SL** pod ostatni istotny swing:
   - BTC: nie bliżej niż **60 USDT** od ceny
   - DOGE: nie bliżej niż **0.00010 USDT** od ceny

## Krok 8: Brak powiadomień zewnętrznych

Nie wysyłaj Telegram / e-mail. Wynik cyklu = odpowiedź agenta + opcjonalnie log z `scripts/run-btc-floop-cycle.sh`.

## Dodatkowe zasoby

- Metodologia volatility: [reference.md](reference.md)
