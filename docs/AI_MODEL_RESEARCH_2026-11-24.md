# Модели и API для grounded ИИ — исследование 24 ноября 2026

Проверены публичные официальные страницы 24.11.2026. Это исследование условий, а не сравнительный прогон моделей: ключи, аккаунты и платные запросы не использовались. Цены — USD за 1 млн токенов Standard, без налогов и посреднических комиссий, если не указано иначе. Страницы изменяются; перед eval/включением повторно сверить ID, тариф и доступность. Дата документа соответствует полученным страницам (в них уже есть ноябрьские обновления и изменение Gemini с 01.12.2026).

## Кандидаты для одинакового eval

| Вариант | Точный ID | Вход / выход | Контекст и JSON | Роль в проверке |
| --- | --- | --- | --- | --- |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | $0.30 / $2.50; есть Free | 1,048,576 input, 65,536 output; structured outputs | Текущий экономичный Google-кандидат, если регион разрешён |
| DeepSeek Flash | `deepseek-flash` (сейчас V4.1-Flash-1017) | peak $0.30 / $1.20, off-peak $0.15 / $0.60 | 1M; JSON output, schema в Responses API | Основной платный кандидат для проверки русского разбора |
| Groq GPT-OSS 120B | `openai/gpt-oss-120b` | $0.15 / $0.60; есть Free | 131,072; strict JSON Schema | Бесплатный эксперимент и независимый резервный кандидат |
| Mistral Small 4 | `mistral-small-2603` | $0.15 / $0.60 | 256k; custom structured outputs | Ещё один недорогой независимый кандидат |
| OpenRouter Free Router | `openrouter/free` | $0 / $0; ограниченная квота | Зависит от выбранной модели/провайдера | Только разведка; не фиксированная модель для итогового сравнения |

Источники параметров: [Gemini model card/docs](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/), [DeepSeek Responses schema](https://api-docs.deepseek.com/api/create-response/), [Groq models](https://console.groq.com/docs/models), [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Mistral Small 4](https://docs.mistral.ai/models/mistral-small-4-0-26-03), [Mistral structured output](https://docs.mistral.ai/inference/conversations/structured-output/custom), [OpenRouter free collection](https://openrouter.ai/collections/free-models).

Это shortlist по условиям, а не рейтинг качества русского языка или точности статей. Схема гарантирует форму, но не подтверждённость утверждений источниками. Ссылки, части статей и основания нужно проверять нашим кодом при любом провайдере.

## Что означает бесплатность

**Gemini:** бесплатные токены доступны для выбранных моделей; активные лимиты зависят от проекта и видны в AI Studio, опубликованные пределы не гарантируют фактическую пропускную способность. Не переносить старые числа RPM/RPD из блогов. Free-данные могут использоваться для улучшения продуктов; в Paid это отключено по условиям тарифной страницы. [Лимиты](https://aistudio.google.com/docs/rate-limits), [цены и data use](https://aistudio.google.com/docs/pricing).

**Groq:** для GPT-OSS 120B Free указано 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD на организацию; точный аккаунт может отличаться. Для длинного контекста раньше дневных запросов кончатся токены: при условных 8k input + 1k output бюджет 200k — около 22 вызовов, а 8k TPM может не вместить такой запрос без уменьшения/перехода на другой тариф. Это оценка, не замер. [Free limits](https://console.groq.com/docs/rate-limits).

**OpenRouter:** `:free` ограничены 20 RPM и 50 RPD; после покупки $10 кредитов — 1,000 RPD (порог срабатывает с $9 для компенсации сборов). Неуспешные попытки учитываются. `openrouter/free` выбирает подходящую бесплатную модель автоматически; для воспроизводимого eval нужен конкретный ID и provider, сохранённые вместе с ответом. Конкретный Gemma ID в этом исследовании не утверждается: первичная страница отдельной модели не была доступна, а сторонний каталог доказательством не считается. [Официальная коллекция/FAQ](https://openrouter.ai/collections/free-models), [Free Router](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/routers/free-router.mdx).

**Mistral:** Free mode существует, но числовые лимиты выбранной организации в этой проверке не подтверждены; не обещать его как общую бесплатную производственную инфраструктуру. Labs/Public Preview могут обновляться без предупреждения и не дают training opt-out/ZDR. Для итогового eval фиксировать versioned ID и lifecycle, не `latest`. [Режимы использования данных](https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models), [lifecycle](https://docs.mistral.ai/inference/model-lifecycle).

**DeepSeek:** считать платным. Peak: будни 01:00–04:00 и 06:00–10:00 UTC, кроме китайских праздников; остальное off-peak. Текущая страница указывает concurrency 2,500 для Flash и 500 для Pro; это не обещание задержки. Старые имена V4 Flash принимаются как alias другой версии. [Тариф и aliases](https://api-docs.deepseek.com/quick_start/pricing/).

## Доступность и данные

Россия отсутствует в официальном списке стран Gemini API. Поэтому прямой Gemini нельзя обещать пользователям/оператору из РФ как работающий вариант. [Список регионов](https://aistudio.google.com/docs/available-regions). Для DeepSeek, Groq и Mistral допуск именно нашего оператора/платежа/хостинга из РФ здесь не подтверждён; отсутствие найденного запрета не доказывает доступность. Нужна отдельная проверка условий и обычный запрос с разрешённого production-хостинга. Обход региональных ограничений не входит в план.

OpenRouter не отменяет запреты поставщиков: его Terms требуют соблюдать ограничения модели/страны, запрещают обход через VPN/proxy и предупреждают, что доступность контролирует provider. [Terms §5.7](https://openrouter.ai/terms/).

Groq обычно не хранит inference input/output; возможны логи надёжности/abuse до 30 дней, доступен ZDR, метаданные сохраняются; хранимые данные расположены в США. [Groq data policy](https://console.groq.com/docs/your-data). DeepSeek policy допускает использование данных для улучшения/обучения; подтверждённой универсальной гарантии «API no training/ZDR» не найдено, не приписывать её сервису. [DeepSeek policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html).

OpenRouter имеет собственные logging/privacy-настройки, но есть ещё политика конечного provider и исключения safety retention; ZDR и no-training нужно проверять по всей цепочке. [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection). Mistral Free допускает training с opt-out (исключения Labs/Preview); обычные API input/output могут храниться 30 дней для abuse, если ZDR не активирован. [Training](https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models), [privacy](https://legal.mistral.ai/terms/privacy-policy/).

Для публичных игровых законов и синтетических eval это проще, чем для реальных пользовательских историй: перед сменой production-провайдера отразить получателя и правила в PRIVACY, не отправлять лишнюю историю и идентификаторы.

## Условная стоимость

Расчёт ниже — один вызов без cache hit, thinking сверх указанного output, классификатора, повторов и fallback. Это допущение для сравнения, не измеренная стоимость текущего pipeline.

| 10,000 вызовов | 8k input + 1k output каждый | 20k input + 2k output каждый |
| --- | --- | --- |
| Gemini 3.5 Flash-Lite | $49 | $110 |
| DeepSeek Flash peak / off-peak | $36 / $18 | $84 / $42 |
| Groq GPT-OSS 120B | $18 | $42 |
| Mistral Small 4 | $18 | $42 |

Формула: calls × (input × input_rate + billed_output × output_rate) / 1,000,000. Итог месяца нужно пересчитать по измеренным usage всего запроса. 20% повторов примерно умножат эти суммы на 1.2 только при одинаковом размере вызовов; reasoning и резерв могут существенно изменить результат. Бесплатный лимит не умножается на число пользователей приложения.

## Практическое решение перед внедрением

Сначала baseline текущего pipeline, затем одинаковые русские случаи и контекст для DeepSeek Flash, Groq GPT-OSS 120B, Mistral Small 4; Gemini 3.5 Flash-Lite добавить при разрешённом доступе. Оставить дешёвую текущую модель контрольной, если она ещё доступна. Важно: `gemini-2.5-flash` официально deprecated и с 01.12.2026 автоматически маршрутизируется на 3.5 Flash-Lite с новыми ценами — старую контрольную версию нельзя считать неизменной. [Предупреждение тарифа](https://aistudio.google.com/docs/pricing#gemini-2.5-flash).

Сравнивать точность article/part, опору каждого утверждения на контекст, полезность, корректный отказ и уточнение, JSON, p50/p95, retries, billed tokens/cost; повторить каждый случай минимум трижды. Фиксировать дату, model ID, возвращённую версию/provider и базу сервера. Ни одного победителя не назначать по названию/маркетинговому benchmark. Production primary и fallback выбрать по этому eval и доступности; только после этого менять конфигурацию. Для стабильной общей службы недорогой платный API с лимитом расходов выглядит практичнее зависимости от вращающейся бесплатной квоты — это инженерная рекомендация, а не измеренный результат моделей.

### Сценарий аудита: 6k input + 1.2k output, 10k разборов/месяц

При одном таком вызове на разбор: Gemini $48, DeepSeek peak $32.40 / off-peak $16.20, Groq GPT-OSS 120B и Mistral Small 4 по $16.20. При двух одинаковых по размеру вызовах на разбор (20k вызовов): соответственно $96, $64.80 / $32.40, $32.40. Это намеренно простая оценка overhead; классификатор обычно имеет другой размер, поэтому фактическую сумму считать по usage каждой стадии. Нельзя считать output=1.2k, если thinking также оплачивается и не включён в эти 1.2k. Для первичного сравнительного pilot можно взять 30 случаев × 3 повтора × 3 кандидата = 270 вызовов; при этом сценарии DeepSeek peak около $0.875, Groq/Mistral около $0.437 каждый на все 270 вызовов, если бы все вызовы шли на соответствующего провайдера. Реальный pilot из 90 вызовов каждому из трёх стоит примерно $0.583 без retries/reasoning; технический потолок отдельно ограничить token budget и spend limit. Это расчёт, не разрешение списаний.

## Уточнение по моделям существующего адаптера

Официально подтверждены все три ID: [gemini-3.8-flash](https://aistudio.google.com/docs/models/gemini-3.8-flash) — stable; [gemini-3.6-flash](https://aistudio.google.com/docs/models/gemini-3.6-flash) — прежнее поколение, доступное production; [gemini-3.5-flash](https://aistudio.google.com/docs/models/gemini-3.5-flash) — deprecated, запросы автоматически идут на 3.6. Поэтому fallback 3.6 → 3.5 нельзя считать переходом к независимой модели/версии. Присутствие ID в docs не гарантирует доступ конкретного ключа/региона.

У 3.8/3.6 Flash Standard сейчас вход $0.75, выход $3.75; с 01.01.2027 соответственно $1.50/$7.50. При 6k input+1.2k billed output это $90 за 10k одиночных вызовов либо $180 при двух одинаковых вызовах, до изменения цен; после него суммы удваиваются. [Тариф](https://aistudio.google.com/docs/pricing#gemini-3.8-flash). Это более дорогой Google baseline; shortlist Flash-Lite выше — отдельная экономичная модель, не утверждение о текущей production-конфигурации.

Проверка транспорта нужна ДО eval качества: OpenAI Chat Completions structured output ожидает `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }`; Responses использует другой объект `text.format`. Плоский объект с schema/strict внутри response_format не следует считать совместимым с OpenAI Chat только из-за того, что совместимый gateway его принимает. [Официальное руководство](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat). Проверить для конкретного endpoint и отдельным contract test, затем проводить модельное сравнение.
