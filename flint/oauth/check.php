<?php
/**
 * Flint — диагностика серверной части (этапы 2–3), версия 4.
 * Показывает: PHP/расширения, секреты (и заглушки), Redirect URI, выбранный
 * режим базы (SQLite или MySQL из secrets.php), папки-кандидаты SQLite с правами
 * и open_basedir, результат открытия базы и записи, связь с Яндексом (OAuth
 * и API Диска). К каждой типовой ошибке — конкретная подсказка.
 * После проверки входа в приложение файл удаляется из репозитория.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';

header('Content-Type: text/plain; charset=utf-8');

/** Права/владелец пути — строкой. */
function flint_perm(string $path): string {
    if (!@file_exists($path)) {
        return 'не существует';
    }
    $p = @substr(sprintf('%o', @fileperms($path)), -4);
    $owner = '';
    if (function_exists('posix_getpwuid')) {
        $u = @posix_getpwuid(@fileowner($path));
        $g = @posix_getgrgid(@filegroup($path));
        $owner = ' | владелец: ' . ($u['name'] ?? ('uid ' . @fileowner($path)))
               . (isset($g['name']) ? ':' . $g['name'] : '');
    }
    return 'права ' . $p . $owner;
}

/** Как путь соотносится с open_basedir. */
function flint_allowed(string $path): string {
    $ob = ini_get('open_basedir');
    if (!$ob) {
        return 'open_basedir не ограничивает';
    }
    foreach (explode(':', $ob) as $dir) {
        $dir = rtrim($dir, '/');
        if ($dir !== '' && strncmp($path, $dir . '/', strlen($dir) + 1) === 0) {
            return 'внутри open_basedir — разрешено';
        }
    }
    return 'ВНЕ open_basedir — PHP сюда не допустит';
}

/** Подсказка к сообщению об ошибке базы (с учётом драйвера). */
function flint_hint(string $msg, string $driver): string {
    $m = strtolower($msg);
    if (strpos($m, 'could not find driver') !== false) {
        if ($driver === 'mysql') {
            return '→ ПРИЧИНА: выключен драйвер MySQL. Панель хостинга → PHP → расширения → '
                 . 'включите «pdo_mysql» (или «mysql») → перезапустите PHP → обновите страницу.';
        }
        return '→ ПРИЧИНА: выключен драйвер SQLite. Варианты: а) панель → PHP → расширения → '
             . 'включите «pdo_sqlite» и «sqlite3»; б) перейдите на MySQL — создайте базу в панели '
             . 'и заполните FLINT_MYSQL_* в secrets.php (шаблон secrets-template.php обновлён).';
    }
    if (strpos($m, 'access denied for user') !== false
        && strpos($m, 'to database') !== false) {
        return '→ ПРИЧИНА: у пользователя нет доступа к базе с таким именем. Проверьте в панели '
             . 'точное имя базы (часто с префиксом логина) и впишите его в FLINT_MYSQL_DB; '
             . 'пользователь базы должен быть привязан именно к этой базе.';
    }
    if (strpos($m, 'access denied for user') !== false) {
        return '→ ПРИЧИНА: MySQL не принял пользователя/пароль. Сверьте FLINT_MYSQL_USER и '
             . 'FLINT_MYSQL_PASS в secrets.php с базой, созданной в панели (у хостингов имя базы, '
             . 'пользователь и префикс обычно связаны).';
    }
    if (strpos($m, 'unknown database') !== false) {
        return '→ ПРИЧИНА: базы с таким именем нет на сервере. Создайте базу в панели '
             . '(MySQL → создать базу) и впишите её точное имя в FLINT_MYSQL_DB в secrets.php.';
    }
    if (strpos($m, "can't connect") !== false || strpos($m, 'connection refused') !== false
        || strpos($m, 'getaddrinfo failed') !== false || strpos($m, 'no such host') !== false
        || strpos($m, 'through socket') !== false) {
        return '→ ПРИЧИНА: сервер MySQL не отвечает на этом адресе. Возьмите хост и порт из панели '
             . 'хостинга и впишите в FLINT_MYSQL_HOST / FLINT_MYSQL_PORT (обычно localhost; если '
             . "ошибка про сокет — попробуйте '127.0.0.1' вместо localhost).";
    }
    if (strpos($m, 'unable to open database file') !== false
        || strpos($m, 'readonly') !== false || strpos($m, 'read-only') !== false) {
        return '→ ПРИЧИНА: PHP не может писать в папку. Файловый менеджер панели → права на папку '
             . 'данных 775 (или 777). Если папка/файл созданы криво — удалите flint.sqlite* и повторите. '
             . 'На CentOS-подобных VPS может мешать SELinux (chcon -Rt httpd_sys_rw_content_t <папка>).';
    }
    if (strpos($m, 'open_basedir') !== false) {
        return '→ ПРИЧИНА: путь вне open_basedir. В панели добавьте папку данных в open_basedir '
             . 'ИЛИ задайте define(\'FLINT_DATA_DIR\', ...) в secrets.php на путь внутри разрешённых.';
    }
    if (strpos($m, 'malformed') !== false) {
        return '→ ПРИЧИНА: файл базы повреждён. Удалите flint.sqlite* через панель и войдите заново.';
    }
    if (strpos($m, 'syntax error') !== false) {
        return '→ Обновите файлы приложения из свежего архива (исправлено в этой версии).';
    }
    return '';
}

echo "Flint — проверка серверной части (этапы 2–3, диагностика v4)\n";
echo str_repeat('=', 58), "\n\n";

echo 'PHP ' . PHP_VERSION . ' | SAPI ' . php_sapi_name() . "\n";
echo 'Расширения: pdo_sqlite=' . (extension_loaded('pdo_sqlite') ? 'да' : 'НЕТ')
   . ', pdo_mysql=' . (extension_loaded('pdo_mysql') ? 'да' : 'НЕТ')
   . ', pdo-драйверы=' . (function_exists('pdo_drivers') && pdo_drivers() ? implode('/', pdo_drivers()) : 'нет')
   . ', curl=' . (extension_loaded('curl') ? 'да' : 'НЕТ (будет запасной путь)')
   . ", openssl=" . (extension_loaded('openssl') ? 'да' : 'НЕТ') . "\n";
echo 'open_basedir: ' . (ini_get('open_basedir') ?: 'не ограничен') . "\n";
if (function_exists('posix_geteuid')) {
    $euid = posix_geteuid();
    $proc = function_exists('posix_getpwuid') ? (posix_getpwuid($euid)['name'] ?? ('uid ' . $euid)) : ('uid ' . $euid);
    echo 'Процесс PHP: ' . $proc . ' | владелец скрипта: ' . get_current_user() . "\n";
}

echo "\n-- Режим базы --\n";
if (flint_driver() === 'mysql') {
    echo "MySQL — включён (в secrets.php заполнены FLINT_MYSQL_*)\n";
    echo 'Хост: ' . (FLINT_MYSQL_HOST !== '' ? FLINT_MYSQL_HOST : 'localhost')
       . ' | Порт: ' . (int) FLINT_MYSQL_PORT
       . ' | База: ' . FLINT_MYSQL_DB . "\n";
    echo 'Пользователь: ' . FLINT_MYSQL_USER
       . ' | Пароль: ' . (FLINT_MYSQL_PASS !== '' ? 'задан' : 'НЕ задан') . "\n";
    if (FLINT_MYSQL_HOST === 'localhost') {
        echo "  примечание: если ниже ошибка про сокет — впишите '127.0.0.1' в FLINT_MYSQL_HOST\n";
    }
    if (!extension_loaded('pdo_mysql')) {
        echo "!! Расширение pdo_mysql выключено — подключение не удастся. Включите его в панели\n"
           . "   (PHP → расширения) или вернитесь на SQLite (удалите/закомментируйте FLINT_MYSQL_*).\n";
    }
} else {
    echo "SQLite — по умолчанию (MySQL в secrets.php не заполнен)\n";
    if (!extension_loaded('pdo_sqlite')) {
        echo "!! Расширение pdo_sqlite выключено. Два варианта:\n"
           . "   а) панель → PHP → расширения → включить pdo_sqlite и sqlite3;\n"
           . "   б) перейти на MySQL: создайте базу в панели и заполните FLINT_MYSQL_*\n"
           . "      в secrets.php по обновлённому шаблону secrets-template.php — режим\n"
           . "      переключится автоматически, остальной код менять не нужно.\n";
    }
}

echo "\n-- Секреты --\n";
echo 'Файл секретов: ' . (FLINT_SECRETS_FILE !== '' ? FLINT_SECRETS_FILE
    : 'НЕ НАЙДЕН (ищется: flint-data/secrets.php вне корня сайта или oauth/secrets.php)') . "\n";
if (FLINT_SECRETS_FILE !== '') {
    $head = (string) @file_get_contents(FLINT_SECRETS_FILE, false, null, 0, 16);
    if (strncmp($head, '<?', 2) !== 0) {
        echo "!! Файл секретов не начинается с <?php — PHP его не исполняет, константы не появятся\n";
    }
}
echo 'ClientID: ';
if (FLINT_CLIENT_ID === '') {
    echo "НЕ задан — заполните secrets.php (шаблон secrets-template.php)\n";
} elseif (FLINT_CLIENT_ID === 'ВСТАВЬТЕ_CLIENT_ID') {
    echo "ОСТАЛАСЬ ЗАГЛУШКА ИЗ ШАБЛОНА — впишите настоящее значение из oauth.yandex.ru\n";
} else {
    echo 'задан (' . strlen(FLINT_CLIENT_ID) . " симв.)\n";
}
echo 'ClientSecret: ' . (FLINT_CLIENT_SECRET === '' ? 'НЕ задан'
    : 'задан (' . strlen(FLINT_CLIENT_SECRET) . ' симв.)') . "\n";
echo 'Redirect URI: ' . flint_redirect_uri() . "\n";
echo "  ← должен совпадать с полем Redirect URI в oauth.yandex.ru (у приложения)\n";

if (flint_driver() === 'sqlite') {
    echo "\n-- Папки-кандидаты для базы (в порядке приоритета) --\n";
    foreach (flint_data_candidates() as $label => $path) {
        echo '[' . $label . "]\n    " . $path . "\n    " . flint_perm($path) . ' | ' . flint_allowed($path) . "\n";
    }
}

echo "\n-- База --\n";
try {
    $db = flint_db();
    if (flint_driver() === 'mysql') {
        echo 'Соединение: MySQL, сервер ' . $db->query('SELECT VERSION()')->fetchColumn()
           . ', база ' . FLINT_MYSQL_DB . "\n";
    } else {
        $dir = flint_resolve_data_dir();
        echo 'Файл базы: ' . $dir . ' [' . flint_chosen_label() . ']'
           . (@is_writable($dir) ? ' (запись есть)' : ' (НЕ доступна для записи!)') . "\n";
        if (flint_chosen_label() === 'внутри приложения flint/data') {
            echo "!! База внутри сайта (flint/data): FTP-деплой может её удалить. Желательно добиться\n"
               . "   записи во flint-data ВНЕ корня сайта (см. кандидатов выше — что мешает).\n";
        }
        if (flint_chosen_label() === 'временный каталог PHP (все кандидаты недоступны)') {
            echo "!! Все постоянные папки недоступны — база во временном каталоге PHP и исчезнет при чистке tmp.\n";
        }
        try {
            $mode = (string) $db->query('PRAGMA journal_mode')->fetchColumn();
            echo 'Журнал: ' . $mode . ($mode === 'wal' ? '' : ' (WAL недоступен — не критично)') . "\n";
        } catch (Throwable $e) {
            echo "Журнал: узнать не удалось — " . $e->getMessage() . "\n";
        }
        echo 'SQLite: ' . $db->query('SELECT sqlite_version()')->fetchColumn() . "\n";
    }
    echo 'Пользователей: ' . (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn()
       . " | Сессий: " . (int) $db->query('SELECT COUNT(*) FROM sessions')->fetchColumn() . "\n";
    // тест записи: DDL чуть отличается у драйверов (AUTO_INCREMENT только у MySQL)
    $db->exec(flint_driver() === 'mysql'
        ? 'CREATE TABLE IF NOT EXISTS _write_test (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, v TEXT)'
        : 'CREATE TABLE IF NOT EXISTS _write_test (id INTEGER PRIMARY KEY, v TEXT)');
    $db->exec("INSERT INTO _write_test (v) VALUES ('ok')");
    $n = (int) $db->query('SELECT COUNT(*) FROM _write_test')->fetchColumn();
    $db->exec('DELETE FROM _write_test');
    echo $n === 1
        ? "Тест записи: УСПЕШНО — запись в базу работает\n"
        : "Тест записи: ВСТАВКА НЕ СОХРАНИЛАСЬ (проверьте настройки базы)\n";
} catch (Throwable $e) {
    echo 'ОШИБКА базы: ' . $e->getMessage() . "\n";
    $h = flint_hint($e->getMessage(), flint_driver());
    if ($h !== '') {
        echo $h . "\n";
    }
}

echo "\n-- Связь с Яндексом --\n";
echo 'Запрос к oauth.yandex.ru из PHP: ';
[$st, $d] = flint_http_post_form('https://oauth.yandex.ru/token', ['grant_type' => 'client_credentials']);
if ($st === 0) {
    echo 'НЕТ СВЯЗИ (' . ($d['error_description'] ?? 'неизвестно') . ")\n";
} elseif ($st === 400) {
    echo "связь есть (ожидаемый отказ без ключей: " . ($d['error'] ?? '?') . ")\n";
} else {
    echo "HTTP $st\n";
}
echo 'API Диска (cloud-api.yandex.net) из PHP: ';
[$dst, $dres] = flint_http_request('GET', 'https://cloud-api.yandex.net/v1/disk/', ['timeout' => 15]);
if ($dst === 401) {
    echo "связь есть (ожидаемый 401 без токена — синхронизация будет работать)\n";
} elseif ($dst === 0) {
    echo 'НЕТ СВЯЗИ (' . ($dres['error_description'] ?? 'неизвестно')
       . ") — хостинг блокирует исходящие запросы, отправка на Диск не заработает. "
       . "Обратитесь в поддержку панели: нужен доступ к cloud-api.yandex.net\n";
} else {
    echo "HTTP $dst (синхронизация должна работать)\n";
}

echo "\nПосле проверки входа в приложение этот файл удаляется из репозитория.\n";
