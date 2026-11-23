<?php
// Временная проверка PHP (этап 0). Показывает версию и SAPI, ничего лишнего.
// После успешной проверки файл удаляется из репозитория.
header('Content-Type: text/plain; charset=utf-8');
echo 'PHP_OK ' . PHP_VERSION . ' | SAPI: ' . php_sapi_name() . ' | ' . date('Y-m-d H:i') . "\n";
