# Bing Ads MCP — Workflows

Операционные процедуры для управления кампаниями через MCP.

---

## Обновление Target ROAS по таблице таргетов

**Триггер:** "обнови таргеты в бинге" / "sync Bing ROAS targets" / `/update-bing-targets`

### Контекст

Joom ведёт таблицу Target ROAS по странам с историей по датам.
Формат (TSV): `ISO | Region | Country | Currency | Langs | ... | [YYYY-MM-DD] | ...`

**Аккаунты:**
- SIA Joom: `account_id=138371118`, `customer_id=252992655`
- Ayzeze: `account_id=138977563`, `customer_id=252992655`

**НЕ трогать:** JoomPro (4058884609, 4281343295, 9263957211), Onfy (7726379260)

---

### Шаг 1 — Разбор таблицы таргетов

Взять последнюю дату (или указанную пользователем).
Сопоставить ISO → target ROAS.

```python
# Пример разбора
# Колонки 0-6: ISO, Region, Country, Currency, Langs, Langs ads, Joom works
# Колонки 7+: значения ROAS по датам
target = float(row[date_index])  # e.g. 0.87 для DE на 2026-05-14
```

---

### Шаг 2 — Получить текущие ROAS (Bulk API)

**⚠️ КРИТИЧНО: SOAP `GetCampaignsByIds` возвращает `<BiddingScheme i:nil="true"/>` для всех PMax кампаний — ROAS через SOAP недоступен.**

Это подтверждено экспериментально: UI Bing Ads показывает ROAS для PMax (например, 86%), а SOAP отвечает nil. Значение хранится в Bid Strategy, не в BiddingScheme кампании.

**Единственный надёжный источник для PMax — Bulk Download API (и для Shopping тоже):**

```bash
# SOAP DownloadCampaignsByAccountIds → poll → download ZIP → parse CSV
# Колонка: "Bid Strategy TargetRoas"
# Маппинг: bing_joom_g:XX_l:... → geo = XX.upper()
```

Нужные колонки CSV:
- `Type` (должен быть "Campaign")
- `Id`
- `Campaign` (название)
- `Status` (берём только Active)
- `Bid Strategy Type` (MaxConversionValue / TargetRoas)
- `Bid Strategy TargetRoas`

---

### Шаг 3 — Показать таблицу расхождений

```
Campaign Name                    | ID         | Geo | Current | Target | Diff
bing_joom_g:de_l:de_pmax_main   | 569984108  | DE  | 0.82    | 0.87   | -0.05
bing_joom_g:de_l:de_shop_main   | 569984121  | DE  | 0.82    | 0.87   | -0.05
...
```

**Спросить подтверждение перед обновлением.**

---

### Шаг 4 — Обновить

Для каждой кампании с `abs(diff) > 0.005`:

```
bing_ads_set_campaign_bidding(
  account_id="138371118",
  campaign_id="<ID>",
  strategy_type="MaxConversionValue",  # правильный тип для PMax и Shopping
  target_roas=<target>                  # e.g. 0.87
)
```

**Типы стратегий:**
- `MaxConversionValue` — PMax и Shopping (maximize conversion VALUE с ROAS target)
- `TargetRoas` — алиас для MaxConversionValue
- `MaxConversions` — maximize conversion COUNT (другая стратегия, без ROAS!) ← не путать!

---

### Шаг 5 — Обработка результата

Каждый вызов возвращает:
```json
{
  "verified": true/false,
  "actual": { "targetRoas": 0.87 },
  "slack_alert_needed": false,
  "slack_alert_text": "...",
  "slack_channels": ["C0B7H9YT1C4", "ULALR4665"]
}
```

**Если `verified: true`:**
```
sheets_log/log_change(
  platform="Bing Ads",
  account="SIA Joom",
  campaign_id=<id>,
  campaign_name=<name>,
  change_type="bidding_roas",
  old_value="0.82",
  new_value="0.87",
  note="Sync to target YYYY-MM-DD"
)
```

**Если `slack_alert_needed: true`:**
```
# НЕМЕДЛЕННО отправить в ОБА канала:
slack_send_message(channel="C0B7H9YT1C4", message=slack_alert_text)  # #marketing-ai-debug
slack_send_message(channel="ULALR4665",   message=slack_alert_text)  # @dimapan DM
```

---

### Шаг 6 — Финальная сверка

После всех обновлений скачать Bulk снова и показать итоговую таблицу:
```
✅ Updated: 45 campaigns
❌ Failed: 0
⚠️  Skipped (diff < 0.005): 2
```

---

## Мониторинг аномалий (hourly)

**Триггер:** Cron каждые 3 часа

```
bing_ads_get_spend_by_hour(account_id="138371118", date=TODAY)
bing_ads_get_spend_by_hour(account_id="138371118", date=YESTERDAY)
```

Сравнить за последний завершённый час. Пороги:
- Spend > +35% → алерт в Slack C0B7H9YT1C4
- CPC > +30% → алерт в Slack C0B7H9YT1C4

При реальном алерте — также в ULALR4665 (@dimapan).

---

## Проверка здоровья Merchant Center

```
bing_ads_get_merchant_center_health(account_id="138371118")
```

Смотреть на `rejectPct`. Норма < 3%. Выше — проверить в MC UI → Diagnostics.

---

## Логирование всех изменений

Все мутации логировать через:
```
sheets-log/log_change(...)
```

Google Sheet: https://docs.google.com/spreadsheets/d/1DHZrlRdxJpb4CpsluzkzEzrQpiBY2iLuZlW9Wi8UwF0/edit

Slack каналы:
- `C0B7H9YT1C4` — #marketing-ai-debug (debug + все алерты)
- `ULALR4665` — @dimapan DM (только реальные проблемы)
