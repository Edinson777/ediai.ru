<?php
// CLI: long polling обновлений MAX.
//   php run.php --once              — режим для cron (AdminVPS → Планировщик, каждую минуту):
//                                     работает до 55 секунд, обрабатывает события, завершается
//   php run.php --loop              — бесконечный long polling (для SSH-сессии или VPS)
//   php run.php --once --seconds=10 — ограничить время работы
//   php run.php --test              — самопроверка: конфиг, хранилище, getMe
require __DIR__ . '/lib/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("run.php — только для CLI (ssh / cron)\n");
}

$options = getopt('', ['once', 'loop', 'seconds::', 'test', 'help']);
if (isset($options['help'])) {
    echo "Использование:\n"
        . "  php run.php --once               режим cron (до 55 секунд)\n"
        . "  php run.php --loop               бесконечный long polling\n"
        . "  php run.php --once --seconds=10  ограничить время\n"
        . "  php run.php --test               самопроверка\n";
    exit(0);
}

// Самопроверка
if (isset($options['test'])) {
    $problems = config_problems();
    if ($problems) {
        foreach ($problems as $p) {
            echo "❌ {$p}\n";
        }
        exit(1);
    }
    echo "✅ Обязательные настройки заполнены\n";
    echo '✅ Хранилище: ' . (cfg('storage') === 'mysql' ? 'MySQL (' . db_prefix() . '*), подключение OK' : 'файлы (' . cfg('data_dir') . ')') . "\n";
    try {
        $me = max_get_me();
        echo '✅ MAX: бот "' . ($me['name'] ?? '?') . '" (id=' . ($me['user_id'] ?? '?') . (isset($me['username']) ? ', @' . $me['username'] : '') . ")\n";
    } catch (Throwable $e) {
        echo '❌ MAX: ' . $e->getMessage() . "\n";
        exit(1);
    }
    echo "✅ GLM: ключ задан, эндпоинт " . cfg('zai_api_url') . "\n";
    exit(0);
}

$problems = config_problems();
if ($problems) {
    foreach ($problems as $p) {
        bot_log('ERROR', 'Настройка не заполнена: ' . $p);
    }
    exit(1);
}

$loop = isset($options['loop']);
$budget = isset($options['seconds']) ? (int)$options['seconds'] : 55;
$startedAt = time();

bot_log('INFO', 'Long polling запущен (--' . ($loop ? 'loop' : 'once') . ", бюджет={$budget} с)");

// Защита от параллельных cron-запусков (MySQL GET_LOCK)
$haveLock = false;
if (cfg('storage') === 'mysql') {
    $haveLock = db_get_lock(db_prefix() . 'polling', 0);
    if (!$haveLock) {
        bot_log('WARN', 'Другой процесс polling уже работает — выходим');
        exit(0);
    }
}

// Webhook и long polling нельзя смешивать: снимаем старую подписку, если была
try {
    max_unsubscribe();
    bot_log('INFO', 'Старая подписка вебхука удалена (если была)');
} catch (Throwable $e) {
    // подписки могло не быть
}

$marker = state_get('updates_marker');
$marker = $marker !== null && $marker !== '' ? (int)$marker : null;
if ($marker !== null) {
    bot_log('INFO', "Продолжаю с marker={$marker}");
}

while (true) {
    try {
        $data = max_get_updates($marker, $loop ? 30 : 10);
        if (isset($data['marker'])) {
            $marker = (int)$data['marker'];
            state_set('updates_marker', (string)$marker);
        }
        foreach ((array)($data['updates'] ?? []) as $update) {
            try {
                bot_handle_update($update);
            } catch (Throwable $e) {
                bot_log('ERROR', 'Ошибка обработки события: ' . $e->getMessage());
            }
        }
    } catch (Throwable $e) {
        bot_log('ERROR', 'Ошибка long polling: ' . $e->getMessage() . ' — повтор через 5 секунд');
        sleep(5);
    }
    if (!$loop && (time() - $startedAt) >= $budget) {
        break;
    }
}

if ($haveLock) {
    db_release_lock(db_prefix() . 'polling');
}
bot_log('INFO', 'Long polling завершён. ' . usage_summary());
