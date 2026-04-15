# Reference - volatility BTCUSDT + DOGEUSDT (5m)

## Metoda

Zrodlo danych: publiczne REST Bybit `v5/market/kline`, `category=linear`, `interval=5`, **1000** ostatnich swiec 5m (~3.5 dnia) dla symboli `BTCUSDT` i `DOGEUSDT`.

Data analizy: okolice **2026-04-14**, ostatnia cena referencyjna ~**74 500 USDT**.

## Wyniki (BTCUSDT)

| Metryka | Wartość (USDT) |
|---------|----------------|
| Średni zakres świecy 5m (H-L) | ~103 |
| Mediana zakresu | ~82 |
| P75 zakresu | ~124 |
| P90 zakresu | ~186 |
| ATR(14) proxy (średnia TR) | ~120.5 |

## Wyniki (DOGEUSDT)

| Metryka | Wartość (USDT) |
|---------|----------------|
| Średni zakres świecy 5m (H-L) | ~0.000158 |
| Mediana zakresu | ~0.000130 |
| P90 zakresu | ~0.000290 |
| ATR(14) proxy (średnia TR) | ~0.000244 |

## Uzasadnienie poziomów w SKILL

- **BTC SL ~151** = max(1.25 * ATR14, 0.5 * P90), **BTC TP ~331** (2.2R), krok TP trail ~90.
- **DOGE SL ~0.00030** = max(1.25 * ATR14, 0.5 * P90), **DOGE TP ~0.00067** (2.2R), krok TP trail ~0.00020.

## Replay TradingView

Pełny bar replay w TV MCP zależy od trybu replay w aplikacji. Kalibracja liczbowa opiera się na próbce Bybit; przy zmianie volatility warto powtórzyć obliczenia i zaktualizować tabele w tym pliku.
