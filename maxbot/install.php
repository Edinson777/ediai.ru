<?php
// Установка и диагностика бота.
//   CLI:  php install.php check | tables | subscribe <url> | unsubscribe | webhook | status | log [N] | cron
//   Web:  https://домен/maxbot/install.php?key=<setup_key из config.inc.php>
require __DIR__ . '/lib/bootstrap.php';

// ---------- проверки окружения ----------

function install_env_items(): array
{
    $items = [];
    $items[] = ['PHP >= 7.4', version_compare(PHP_VERSION, '7.4.0', '>='), 'сейчас: ' . PHP_VERSION];
    foreach ([
        'curl'     => 'запросы к MAX и Z.ai',
        'pdo_mysql'=> 'хранилище MySQL',
        'json'     => 'разбор ответов API',
        'mbstring' => 'строки UTF-8',
    ] as $ext => $why) {
        $items[] = ["Расширение {$ext}", extension_loaded($ext), $why];
    }
    return $items;
}

function install_storage_error(): ?string
{
    if ((string)cfg('storage') === 'mysql') {
        try {
            $stmt = db()->query('SELECT 1');
            $stmt->closeCursor();
            return null;
        } catch (Throwable $e) {
            return 'MySQL: ' . $e->getMessage();
        }
    }
    $dir = (string)cfg('data_dir');
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
        return "Не удалось создать папку {$dir}";
    }
    if (!is_writable($dir)) {
        return "Папка {$dir} недоступна для записи";
    }
    return null;
}

// ---------- таблицы БД ----------

function install_tables_sql(): array
{
    $p = db_prefix();
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}memory` (
            chat_id BIGINT NOT NULL,
            history MEDIUMTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (chat_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `{$p}stats` (
            day DATE NOT NULL,
            requests INT UNSIGNED NOT NULL DEFAULT 0,
            prompt_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
            completion_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
            total_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (day)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `{$p}state` (
            name VARCHAR(128) NOT NULL,
            value TEXT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];
}

function install_create_tables(): array // список ошибок (пустой = успех)
{
    $errors = [];
    foreach (install_tables_sql() as $sql) {
        try {
            db()->exec($sql);
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }
    }
    return $errors;
}

function install_status(): array
{
    $out = ['storage' => (string)cfg('storage')];
    if ((string)cfg('storage') === 'mysql') {
        $out['tables'] = [];
        foreach (['memory', 'stats', 'state'] as $t) {
            try {
                $stmt = db()->prepare('SHOW TABLES LIKE ?');
                $stmt->execute([db_prefix() . $t]);
                $found = $stmt->fetchColumn();
                $stmt->closeCursor();
                $out['tables'][$t] = $found ? 'есть' : 'НЕТ — создайте таблицы';
            } catch (Throwable $e) {
                $out['tables'][$t] = 'ошибка: ' . $e->getMessage();
            }
        }
        try {
            $out['chats'] = (int)db()->query('SELECT COUNT(*) FROM ' . db_table('memory'))->fetchColumn();
        } catch (Throwable $e) {
            $out['chats'] = null;
        }
    } else {
        $dir = (string)cfg('data_dir');
        $out['tables'] = [];
        foreach (['memory.json', 'stats.json', 'state.json'] as $f) {
            $out['tables'][$f] = is_file($dir . '/' . $f) ? 'есть' : 'нет (создастся при работе)';
        }
        $out['chats'] = count(storage_read_json('memory.json', []));
    }
    try {
        $out['usage'] = usage_summary();
    } catch (Throwable $e) {
        $out['usage'] = 'н/д: ' . $e->getMessage();
    }
    try {
        $out['marker'] = state_get('updates_marker');
    } catch (Throwable $e) {
        $out['marker'] = null;
    }
    return $out;
}

function install_webhook_url_auto(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $path = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    return ($https ? 'https' : 'http') . '://' . $host . $path . '/index.php';
}

// Статус подписки вебхука в MAX: [есть_ли, текст]
function install_webhook_status(): array
{
    try {
        $sub = max_get_subscriptions();
    } catch (Throwable $e) {
        return [false, 'Не удалось получить статус: ' . $e->getMessage()];
    }
    if (!is_array($sub)) {
        return [false, 'Неожиданный ответ API'];
    }
    $items = [];
    if (isset($sub['subscriptions']) && is_array($sub['subscriptions'])) {
        $items = $sub['subscriptions'];
    } elseif (isset($sub[0])) {
        $items = $sub;
    } elseif (isset($sub['url'])) {
        $items = [$sub];
    }
    $urls = [];
    foreach ($items as $s) {
        if (is_array($s) && !empty($s['url'])) {
            $types = isset($s['update_types']) && is_array($s['update_types']) ? ' [' . implode(', ', (array)$s['update_types']) . ']' : '';
            $urls[] = $s['url'] . $types;
        }
    }
    if (!$urls) {
        // Показываем сырой ответ, чтобы формат ответа MAX не скрывал реально существующую подписку
        $raw = json_encode($sub, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $extra = ($raw && $raw !== '[]' && $raw !== '{}' && $raw !== 'null') ? ' (ответ API: ' . $raw . ')' : '';
        return [false, 'Активной подписки нет — MAX не присылает события. Зарегистрируйте вебхук ниже (либо выключите его и используйте cron-polling run.php).' . $extra];
    }
    return [true, implode('; ', $urls)];
}

// Последние строки лога (читаем не более 300 КБ из конца файла)
function install_log_tail(int $lines = 50): string
{
    $file = (string)cfg('log_file');
    if ($file === '' || !is_file($file)) {
        return 'Лога ещё нет (' . ($file !== '' ? $file : 'log_file не задан') . ").\n"
            . "Если вы уже писали боту, это значит: события от MAX до бота НЕ доходят.\n"
            . "Проверьте: подписка вебхука зарегистрирована? URL заканчивается на /index.php? Домен открывается по HTTPS?\n"
            . "Если выбрали cron-polling: запускается ли run.php (php -f …/run.php -- --once)?";
    }
    $size = (int)@filesize($file);
    $fp = @fopen($file, 'rb');
    if (!$fp) {
        return 'Не удалось открыть лог: ' . $file;
    }
    $read = min($size, 300000);
    @fseek($fp, $size - $read);
    $data = (string)stream_get_contents($fp);
    fclose($fp);
    $all = preg_split('/\r\n|\r|\n/', rtrim($data));
    if (count($all) > $lines) {
        $all = array_slice($all, -$lines);
    }
    $head = $read < $size ? "… (показаны последние " . $lines . " строк)\n" : '';
    return $head . implode("\n", $all);
}

function install_subscribe(string $url): string
{
    if (strpos($url, 'https://') !== 0) {
        return '❌ URL должен начинаться с https:// (MAX принимает только HTTPS на порту 443, самоподписанные сертификаты не поддерживаются)';
    }
    try {
        max_subscribe($url, (string)cfg('webhook_secret'));
        return "✅ Вебхук зарегистрирован в MAX: {$url}"
            . ((string)cfg('webhook_secret') !== '' ? ' (с секретом X-Max-Bot-Api-Secret)' : '');
    } catch (Throwable $e) {
        return '❌ ' . $e->getMessage() . ' — пробую перерегистрировать…';
    }
}

function install_subscribe_retry(string $url): string
{
    try {
        max_unsubscribe();
        max_subscribe($url, (string)cfg('webhook_secret'));
        return "✅ Вебхук перерегистрирован: {$url}";
    } catch (Throwable $e) {
        return '❌ Не удалось зарегистрировать вебхук: ' . $e->getMessage();
    }
}

// ---------- CLI ----------

if (PHP_SAPI === 'cli') {
    $cmd = $argv[1] ?? 'check';
    switch ($cmd) {
        case 'check':
            $allOk = true;
            foreach (install_env_items() as [$name, $ok, $note]) {
                if (!$ok) {
                    $allOk = false;
                }
                echo ($ok ? '✅ ' : '❌ ') . $name . ' — ' . $note . "\n";
            }
            $err = install_storage_error();
            echo $err === null ? "✅ Хранилище (" . cfg('storage') . ") подключено\n" : "❌ Хранилище: {$err}\n";
            if ($err !== null) {
                $allOk = false;
            }
            try {
                $me = max_get_me();
                echo '✅ MAX: бот "' . ($me['name'] ?? '?') . '" (id=' . ($me['user_id'] ?? '?') . (isset($me['username']) ? ', @' . $me['username'] : '') . ")\n";
            } catch (Throwable $e) {
                echo '❌ MAX: ' . $e->getMessage() . "\n";
                $allOk = false;
            }
            $problems = config_problems();
            foreach ($problems as $p) {
                echo "⚠️  Не заполнено: {$p}\n";
                $allOk = false;
            }
            exit($allOk ? 0 : 1);

        case 'tables':
            $err = install_storage_error();
            if ($err !== null) {
                echo "❌ {$err}\n";
                exit(1);
            }
            $errors = install_create_tables();
            echo $errors ? "❌ " . implode('; ', $errors) . "\n" : '✅ Таблицы созданы (' . db_prefix() . "memory, stats, state)\n";
            exit($errors ? 1 : 0);

        case 'subscribe':
            $url = $argv[2] ?? '';
            if ($url === '') {
                echo "Использование: php install.php subscribe https://домен/путь/index.php\n";
                exit(1);
            }
            $res = install_subscribe($url);
            echo $res . "\n";
            if (strpos($res, '❌') === 0 && strpos($res, 'перерегистрировать') !== false) {
                echo install_subscribe_retry($url) . "\n";
            }
            exit(0);

        case 'unsubscribe':
            try {
                max_unsubscribe();
                echo "✅ Подписка вебхука удалена\n";
            } catch (Throwable $e) {
                echo '⚠️  ' . $e->getMessage() . " (подписки могло не быть)\n";
            }
            exit(0);

        case 'status':
            print_r(install_status());
            exit(0);

        case 'webhook':
            try {
                $me = max_get_me();
                echo '✅ MAX: бот "' . ($me['name'] ?? '?') . '" (id=' . ($me['user_id'] ?? '?') . (isset($me['username']) ? ', @' . $me['username'] : '') . ")\n";
            } catch (Throwable $e) {
                echo '❌ MAX: ' . $e->getMessage() . "\n";
            }
            [$hasSub, $subText] = install_webhook_status();
            echo ($hasSub ? '✅ Подписка вебхука: ' : '❌ Подписка вебхука: ') . $subText . "\n";
            exit(0);

        case 'log':
            echo install_log_tail(isset($argv[2]) ? max(1, (int)$argv[2]) : 50) . "\n";
            exit(0);

        case 'cron':
            echo "# Добавьте в cron (панель AdminVPS → Планировщик), запуск каждую минуту:\n";
            echo '* * * * * php -f ' . __DIR__ . "/run.php -- --once >> /dev/null 2>&1\n";
            exit(0);

        default:
            echo "Команды: check | tables | subscribe <url> | unsubscribe | webhook | status | log [N] | cron\n";
            exit(1);
    }
}

// ---------- Web ----------

// install.php доступен из веба только с ключом setup_key из config.inc.php
$setupKey = (string)cfg('setup_key');
if ($setupKey === '') {
    http_response_code(503);
    echo 'Установщик закрыт: задайте случайный setup_key в config.inc.php или используйте SSH: php install.php check';
    exit;
}
if (!hash_equals($setupKey, (string)($_REQUEST['key'] ?? ''))) {
    http_response_code(403);
    echo 'Неверный ключ доступа. Добавьте к адресу ?key=<setup_key из config.inc.php>';
    exit;
}

$results = [];
$action = (string)($_POST['action'] ?? '');
if ($action === 'tables') {
    $err = install_storage_error();
    if ($err !== null) {
        $results[] = '❌ ' . $err;
    } else {
        $errors = install_create_tables();
        $results[] = $errors ? '❌ ' . implode('; ', $errors) : '✅ Таблицы созданы (' . db_prefix() . 'memory, stats, state)';
    }
} elseif ($action === 'subscribe') {
    $url = trim((string)($_POST['webhook_url'] ?? ''));
    $results[] = $url === '' ? '❌ Укажите URL вебхука' : install_subscribe($url);
    if ($url !== '' && strpos((string)end($results), 'перерегистрировать') !== false) {
        $results[] = install_subscribe_retry($url);
    }
} elseif ($action === 'unsubscribe') {
    try {
        max_unsubscribe();
        $results[] = '✅ Подписка вебхука удалена';
    } catch (Throwable $e) {
        $results[] = '⚠️ ' . $e->getMessage() . ' (подписки могло не быть)';
    }
}

$envItems = install_env_items();
$storageError = install_storage_error();
try {
    $me = max_get_me();
    $meLine = '✅ MAX: бот "' . ($me['name'] ?? '?') . '" (id=' . ($me['user_id'] ?? '?') . (isset($me['username']) ? ', @' . $me['username'] : '') . ')';
} catch (Throwable $e) {
    $meLine = '❌ MAX: ' . $e->getMessage();
}
$status = null;
try {
    $status = install_status();
} catch (Throwable $e) {
    $status = null;
}
$autoUrl = install_webhook_url_auto();
$autoIsHttps = strpos($autoUrl, 'https://') === 0;
$webhookStatus = null;
try {
    $webhookStatus = install_webhook_status();
} catch (Throwable $e) {
    $webhookStatus = [false, $e->getMessage()];
}
$logLines = min(200, max(10, (int)($_GET['log_lines'] ?? 50)));
$logTail = install_log_tail($logLines);

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Установка MAX-GLM бота</title>
<style>
body { font-family: Arial, sans-serif; max-width: 780px; margin: 24px auto; padding: 0 16px; color: #222; }
h2 { border-bottom: 1px solid #ddd; padding-bottom: 4px; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
.ok { color: #1a7f37; } .bad { color: #c0392b; }
input[type=text] { width: 70%; padding: 6px; }
button, .btn { padding: 6px 14px; margin: 4px 0; }
pre { background: #f6f6f6; padding: 10px; overflow-x: auto; }
form.inline { display: inline; }
</style>
</head>
<body>
<h1>Установка MAX ⇄ GLM бота</h1>

<h2>1. Окружение</h2>
<table>
<tr><th>Проверка</th><th>Статус</th><th>Примечание</th></tr>
<?php foreach ($envItems as [$name, $ok, $note]): ?>
<tr><td><?= htmlspecialchars($name) ?></td><td class="<?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? '✅ OK' : '❌ нет' ?></td><td><?= htmlspecialchars($note) ?></td></tr>
<?php endforeach; ?>
<tr><td>Хранилище (<?= htmlspecialchars((string)cfg('storage')) ?>)</td>
    <td class="<?= $storageError === null ? 'ok' : 'bad' ?>"><?= $storageError === null ? '✅ OK' : '❌' ?></td>
    <td><?= htmlspecialchars($storageError ?? 'подключение работает') ?></td></tr>
<tr><td>MAX Bot API</td><td class="<?= strpos($meLine, '✅') === 0 ? 'ok' : 'bad' ?>"><?= strpos($meLine, '✅') === 0 ? '✅ OK' : '❌' ?></td>
    <td><?= htmlspecialchars(mb_substr($meLine, 3)) ?></td></tr>
</table>

<h2>2. Таблицы базы данных</h2>
<form method="post" class="inline">
  <input type="hidden" name="key" value="<?= htmlspecialchars((string)($_REQUEST['key'] ?? '')) ?>">
  <button name="action" value="tables">Создать таблицы</button>
</form>
<?php if ($status !== null && is_array($status['tables'] ?? null)): ?>
<ul>
<?php foreach ($status['tables'] as $t => $st): ?>
  <li><?= htmlspecialchars($t) ?>: <?= htmlspecialchars((string)$st) ?></li>
<?php endforeach; ?>
</ul>
<?php endif; ?>

<h2>3. Вебхук</h2>
<p><b>Текущая подписка в MAX:</b>
   <span class="<?= !empty($webhookStatus[0]) ? 'ok' : 'bad' ?>"><?= htmlspecialchars((string)$webhookStatus[1]) ?></span></p>
<form method="post">
  <input type="hidden" name="key" value="<?= htmlspecialchars((string)($_REQUEST['key'] ?? '')) ?>">
  <input type="text" name="webhook_url" value="<?= htmlspecialchars($autoUrl) ?>" size="60">
  <button name="action" value="subscribe">Зарегистрировать вебхук в MAX</button>
  <button name="action" value="unsubscribe" form="unsub">Удалить подписку</button>
</form>
<form id="unsub" method="post"><input type="hidden" name="key" value="<?= htmlspecialchars((string)($_REQUEST['key'] ?? '')) ?>"></form>
<p><?= $autoIsHttps ? '✅ Обнаружен HTTPS — адрес подходит для MAX.' : '⚠️ Сейчас адрес по http:// — MAX требует https:// (включите бесплатный SSL/Let\'s Encrypt в панели AdminVPS и откройте эту страницу заново).' ?></p>
<p>Секрет вебхука берётся из config.inc.php (<code>webhook_secret</code>) и передаётся при подписке.</p>

<h2>4. Статус</h2>
<?php if ($status !== null): ?>
<pre><?= htmlspecialchars(print_r($status, true)) ?></pre>
<?php endif; ?>

<h2>5. Лог бота (последние <?= $logLines ?> строк)</h2>
<p>Если вы писали боту, а лог пуст — события от MAX не доходят до бота (вебхук не зарегистрирован, не тот URL или домен недоступен по HTTPS).</p>
<pre><?= htmlspecialchars($logTail) ?></pre>
<p><a href="?key=<?= htmlspecialchars((string)($_REQUEST['key'] ?? '')) ?>&log_lines=200">Показать больше строк (200)</a></p>

<h2>Дальше</h2>
<ul>
<li>Проверьте бота в MAX: напишите ему — он должен ответить приветствием.</li>
<li>Если выбрали режим polling вместо вебхука — настройте cron
    (<code>php -f <?= htmlspecialchars(__DIR__) ?>/run.php -- --once</code> каждую минуту) и не регистрируйте вебхук.</li>
<li>После установки рекомендуется удалить install.php или сменить setup_key.</li>
</ul>

<?php if ($results): ?>
<h2>Результаты действий</h2>
<ul><?php foreach ($results as $r): ?><li><?= htmlspecialchars($r) ?></li><?php endforeach; ?></ul>
<?php endif; ?>
</body>
</html>
