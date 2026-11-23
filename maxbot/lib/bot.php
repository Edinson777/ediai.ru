<?php
// Логика бота: обработка событий MAX, команды, ответы через GLM
// Логика один в один перенесена из Node-версии (max-glm-bot)

const MAXBOT_WELCOME = "Привет! Я бот на базе GLM от Z.ai 🤖\n\n"
    . "Задайте любой вопрос — отвечу с учётом контекста диалога.\n\n"
    . "Команды:\n"
    . "/start — это приветствие\n"
    . "/reset — очистить память диалога\n"
    . "/stats — статистика запросов и токенов\n"
    . "/help — помощь";

const MAXBOT_HELP = "Я пересылаю ваши сообщения модели GLM (Z.ai) и возвращаю ответы.\n\n"
    . "• Помню последние сообщения диалога — можно задавать уточняющие вопросы.\n"
    . "• /reset очищает память диалога.\n"
    . "• /stats показывает расход запросов и токенов за сегодня.";

// Кэш информации о боте (GET /me) на время запроса/процесса
function bot_get_me_cached(): ?array
{
    static $me = null;
    static $loaded = false;
    if (!$loaded) {
        $loaded = true;
        try {
            $me = max_get_me();
        } catch (Throwable $e) {
            $me = null;
        }
    }
    return $me;
}

// MAX рендерит markdown (**жирный**, `код`, ссылки), но не поддерживает списки и таблицы
function bot_system_prompt(): string
{
    $base = (string)cfg('system_prompt');
    $format = (string)cfg('send_format');
    if ($format === 'markdown') {
        return $base . "\n\nОформляй ответы простым Markdown, который поддерживает MAX: **жирный**, *курсив*, `код`, [ссылки](url), цитаты «>». НЕ используй списки (дефисы, цифры), заголовки и таблицы — вместо списков пиши обычные предложения или переносы строк.";
    }
    if ($format === 'html') {
        return $base . "\n\nОформляй ответы простым HTML, который поддерживает MAX: <b>, <i>, <code>, <a href=\"...\">. Без списков, таблиц и заголовков.";
    }
    return $base . "\n\nОтвечай простым текстом без какой-либо разметки.";
}

// Обновление из MAX может прийти в разных обёртках — нормализуем
function bot_extract_message(array $update): ?array
{
    $payload = isset($update['payload']) && is_array($update['payload']) ? $update['payload'] : [];
    if (isset($payload['message']['body'])) {
        return $payload['message'];
    }
    if (isset($payload['body'], $payload['sender'])) {
        return $payload; // payload — само сообщение
    }
    if (isset($update['message']['body'])) {
        return $update['message'];
    }
    return null;
}

function bot_is_mentioned(array $message, string $text): bool
{
    $me = bot_get_me_cached();
    $username = $me['username'] ?? null;
    if ($username && mb_stripos($text, '@' . (string)$username) !== false) {
        return true;
    }
    $linkSender = $message['link']['sender'] ?? $message['link']['message']['sender'] ?? null;
    if (is_array($linkSender) && !empty($linkSender['is_bot'])) {
        return true; // ответ на сообщение бота
    }
    return false;
}

function bot_is_allowed(string $chatId, string $chatType): bool
{
    $whitelist = array_map('strval', (array)cfg('chat_whitelist'));
    if (empty($whitelist)) {
        return true;
    }
    if (in_array($chatId, $whitelist, true)) {
        return true;
    }
    bot_log('WARN', "Чат {$chatId} не в белом списке (chat_whitelist) — сообщение проигнорировано");
    if ($chatType === 'dialog' && state_get('denied_notified_' . $chatId) === null) {
        state_set('denied_notified_' . $chatId, '1');
        try {
            max_send_message($chatId, "Этот чат не в белом списке бота. Ваш chat_id: {$chatId} — сообщите его администратору, чтобы добавить.");
        } catch (Throwable $e) {
            // уведомление не критично
        }
    }
    return false;
}

function bot_handle_command(string $name, string $chatId): void
{
    switch ($name) {
        case 'start':
            max_send_message($chatId, MAXBOT_WELCOME);
            return;
        case 'help':
            max_send_message($chatId, MAXBOT_HELP);
            return;
        case 'reset':
            memory_reset($chatId);
            max_send_message($chatId, '🧹 Память диалога очищена — начинаем с чистого листа.');
            return;
        case 'stats':
            max_send_message($chatId, '📊 ' . usage_summary());
            return;
    }
}

function bot_answer_with_glm(string $chatId, string $userText): void
{
    $startedAt = microtime(true);
    try {
        max_send_typing($chatId);
    } catch (Throwable $e) {
        // «печатает…» — косметика
    }

    $messages = array_merge(
        [['role' => 'system', 'content' => bot_system_prompt()]],
        memory_get_history($chatId),
        [['role' => 'user', 'content' => $userText]]
    );

    try {
        $result = glm_chat_complete($messages);
    } catch (Throwable $e) {
        bot_log('ERROR', 'Ошибка получения ответа от GLM: ' . $e->getMessage());
        try {
            max_send_message($chatId, '⚠️ Не удалось получить ответ от модели. Попробуйте повторить позже.');
        } catch (Throwable $e2) {
            // не критично
        }
        return;
    }

    usage_record($result['usage']);
    memory_add_turn($chatId, $userText, $result['content']);
    max_send_message($chatId, $result['content']);

    $ms = (int)round((microtime(true) - $startedAt) * 1000);
    $usage = $result['usage'];
    $tokens = $usage ? ", токены prompt={$usage['prompt_tokens']} completion={$usage['completion_tokens']}" : '';
    bot_log('INFO', "Ответ в чат {$chatId} за {$ms} мс{$tokens} | " . usage_summary());
}

function bot_handle_update(array $update): void
{
    $type = (string)($update['update_type'] ?? '');
    if (isset($update['chat_id'])) {
        $updateChatId = (string)$update['chat_id'];
    } elseif (isset($update['payload']['chat_id'])) {
        $updateChatId = (string)$update['payload']['chat_id'];
    } else {
        $updateChatId = '';
    }

    if ($type === 'bot_started') {
        if ($updateChatId !== '') {
            max_send_message($updateChatId, MAXBOT_WELCOME);
        }
        return;
    }
    if ($type !== 'message_created') {
        return;
    }

    $message = bot_extract_message($update);
    if ($message === null) {
        return;
    }
    if (!empty($message['sender']['is_bot'])) {
        return; // свои же сообщения игнорируем — защита от циклов
    }

    $chatType = (string)($message['recipient']['chat_type'] ?? 'dialog');
    $chatId = (string)($message['recipient']['chat_id'] ?? $updateChatId);
    if ($chatId === '') {
        return;
    }
    $text = trim((string)($message['body']['text'] ?? ''));

    $who = $message['sender']['name'] ?? $message['sender']['username'] ?? ($message['sender']['user_id'] ?? '?');
    bot_log('INFO', 'Сообщение из чата ' . $chatId . " ({$chatType}) от {$who}: " . ($text !== '' ? mb_substr($text, 0, 150) : '(без текста)'));

    if (!bot_is_allowed($chatId, $chatType)) {
        return;
    }

    if (preg_match('/^\/(start|reset|stats|help)\b/i', $text, $m)) {
        bot_log('INFO', "Команда /{$m[1]} в чате {$chatId}");
        bot_handle_command(strtolower($m[1]), $chatId);
        return;
    }

    // В группах/каналах можно отвечать только по упоминанию (group_trigger=mentions)
    if ($chatType !== 'dialog' && (string)cfg('group_trigger') === 'mentions' && !bot_is_mentioned($message, $text)) {
        return;
    }

    if ($text === '') {
        try {
            max_send_message($chatId, 'Пока я понимаю только текстовые сообщения 🙂');
        } catch (Throwable $e) {
            // не критично
        }
        return;
    }

    // Блокировка на чат (MySQL): параллельные вебхуки не обработают один чат дважды
    $lockName = db_prefix() . 'chat_' . $chatId;
    if (cfg('storage') === 'mysql' && !db_get_lock($lockName, 0)) {
        bot_log('WARN', "Чат {$chatId} уже обрабатывается другим запросом — событие пропущено");
        return;
    }
    try {
        bot_answer_with_glm($chatId, $text);
    } finally {
        if (cfg('storage') === 'mysql') {
            db_release_lock($lockName);
        }
    }
}
