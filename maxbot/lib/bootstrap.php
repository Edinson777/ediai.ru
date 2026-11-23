<?php
// Общая загрузка: настройки ошибок, конфиг, логгер, хранилище, API-клиенты, логика бота

error_reporting(E_ALL);
ini_set('display_errors', PHP_SAPI === 'cli' ? '1' : '0');
ini_set('log_errors', '1');
mb_internal_encoding('UTF-8');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/store.php';
require_once __DIR__ . '/max-api.php';
require_once __DIR__ . '/glm.php';
require_once __DIR__ . '/bot.php';
