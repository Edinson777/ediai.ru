-- Схема БД для MAX ⇄ GLM бота (AdminVPS: MySQL/MariaDB)
-- Импорт: панель AdminVPS → phpMyAdmin → выбрать базу → «Импорт» → этот файл
-- Если в config.inc.php сменили префикс db.prefix — замените maxbot_ на свой.

CREATE TABLE IF NOT EXISTS `maxbot_memory` (
    chat_id    BIGINT      NOT NULL,
    history    MEDIUMTEXT  NOT NULL,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maxbot_stats` (
    day               DATE         NOT NULL,
    requests          INT UNSIGNED NOT NULL DEFAULT 0,
    prompt_tokens     BIGINT UNSIGNED NOT NULL DEFAULT 0,
    completion_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_tokens      BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maxbot_state` (
    name       VARCHAR(128) NOT NULL,
    value      TEXT NULL,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
