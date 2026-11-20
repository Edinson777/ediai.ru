#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка превью для GitHub Pages (project page https://edinson777.github.io/ediai.ru/)
из production-сборки dist. Продакшн (dist → корень репо → FTP на ediai.ru) не трогается.

Что делает:
  1. копирует dist → dist-ghp;
  2. в HTML: атрибуты href="/…" и src="/…" получают префикс /ediai.ru (под-путь Pages);
  3. в inline-скриптах (PAGE/PROMPTS/SECTMETA…): JSON-строки "/prompty/" и т.п. — тот же
     префикс. Правило консервативное: только известные разделы-топы, чтобы не задеть
     артефакты регулярок вида "/g, в JS;
  4. canonical, og:, JSON-LD и sitemap.xml НЕ трогаются — они обязаны указывать на
     боевой домен https://ediai.ru (это превью, а не зеркало);
  5. в каждую страницу (без noindex) добавляется <meta name="robots" content="noindex, nofollow">,
     robots.txt заменён на полный запрет индексации — превью не должно попадать в поисковики;
  6. для 11 старых адресов (*.html) создаются заглушки с meta refresh на новые пути
     (.htaccess на GitHub Pages не работает — это Apache-директива);
  7. llms.txt переписывается на абсолютные адреса превью; .htaccess удаляется;
     добавляется .nojekyll.

Выход: dist-ghp готов к публикации в ветку gh-pages. Запуск: python3 scripts/preview_pages.py
"""
import os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.normpath(os.path.join(HERE, '..', 'dist'))
OUT = os.path.normpath(os.path.join(HERE, '..', 'dist-ghp'))
BASE = '/ediai.ru'  # под-путь project page на edinson777.github.io

# старый адрес → новый (синхронно с URL_MAP в scripts/verify.py, кроме index/education)
STUBS = {
    'photo.html': '/prompty/foto/',
    'life.html': '/prompty/zhizn/',
    'work.html': '/prompty/rabota/',
    'texts.html': '/prompty/teksty/',
    'generate.html': '/prompty/generaciya/',
    'qwen.html': '/prompty/qwen/',
    'basics.html': '/guides/osnovy-promptinga/',
    'start.html': '/guides/s-chego-nachat/',
    'models.html': '/guides/kakuyu-nejroset-vybrat/',
    'keis-ii-pochta.html': '/guides/ii-i-pochta/',
    'glossary.html': '/glossary/',
}

# только известные топы — консервативное правило для JSON-строк в inline-скриптах
TOPS = r'prompty|guides|glossary|instrumenty|o-proekte|politika-konfidencialnosti|education'

STUB_TMPL = '''<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>Страница переехала — Ediai.ru</title>
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url={BASE}{NEW}">
<link rel="canonical" href="https://ediai.ru{NEW}">
</head><body>
<p>Страница <b>{OLD}</b> переехала на <a href="{BASE}{NEW}">https://ediai.ru{NEW}</a>.</p>
<p>Если переадресация не сработала — откройте ссылку вручную.</p>
<script>location.replace('{BASE}{NEW}');</script>
</body></html>
'''


def main():
    if not os.path.isdir(DIST):
        sys.exit('нет dist — сначала npm run build')
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(DIST, OUT)

    stats = {'pages': 0, 'href': 0, 'src': 0, 'js': 0, 'noindex': 0}
    problems = []

    for root, dirs, files in os.walk(OUT):
        for fn in files:
            p = os.path.join(root, fn)
            if fn.endswith('.html'):
                with open(p, encoding='utf-8') as f:
                    html = f.read()
                if 'url(/' in html:
                    problems.append('url(/ в CSS: ' + os.path.relpath(p, OUT))
                n = html.count('href="/')
                html = html.replace('href="/', 'href="%s/' % BASE)
                m = html.count('src="/')
                html = html.replace('src="/', 'src="%s/' % BASE)
                stats['href'] += n
                stats['src'] += m

                def repl(mm):
                    stats['js'] += 1
                    return '"%s%s' % (BASE, mm.group(1))
                html = re.sub(r'"(/(?:%s)(?=[/?#"]))' % TOPS, repl, html)

                if 'noindex' not in html:
                    if '<head>' not in html:
                        problems.append('нет <head>: ' + os.path.relpath(p, OUT))
                    else:
                        html = html.replace(
                            '<head>',
                            '<head>\n<meta name="robots" content="noindex, nofollow">', 1)
                        stats['noindex'] += 1

                # самопроверка: не осталось ли непрефиксованных атрибутов
                left = re.findall(r'href="/(?!ediai\.ru)[^"]*"', html)
                if left:
                    problems.append('%s: остались href=%s' % (os.path.relpath(p, OUT), left[:3]))
                left_js = re.findall(r'"(/(?:%s)(?=[/?#"]))' % TOPS, html)
                if left_js:
                    problems.append('%s: остались пути в скриптах %s' % (os.path.relpath(p, OUT), left_js[:3]))
                with open(p, 'w', encoding='utf-8') as f:
                    f.write(html)
                stats['pages'] += 1

    # заглушки старых адресов
    for old, new in STUBS.items():
        with open(os.path.join(OUT, old), 'w', encoding='utf-8') as f:
            f.write(STUB_TMPL.format(BASE=BASE, OLD=old, NEW=new))
    stats['stubs'] = len(STUBS)

    # robots.txt: полный запрет индексации превью
    with open(os.path.join(OUT, 'robots.txt'), 'w', encoding='utf-8') as f:
        f.write('# Превью на GitHub Pages — индексация запрещена.\n'
                '# Основной сайт: https://ediai.ru (robots.txt — в корне боевого репозитория)\n'
                'User-agent: *\nDisallow: /\n')

    # llms.txt: абсолютные адреса превью, чтобы ссылки были рабочими
    llms = os.path.join(OUT, 'llms.txt')
    if os.path.exists(llms):
        with open(llms, encoding='utf-8') as f:
            t = f.read()
        with open(llms, 'w', encoding='utf-8') as f:
            f.write(t.replace('https://ediai.ru/', 'https://edinson777.github.io/ediai.ru/'))

    # .htaccess не нужен (Pages его игнорирует), .nojekyll — отключить Jekyll
    ht = os.path.join(OUT, '.htaccess')
    if os.path.exists(ht):
        os.remove(ht)
    with open(os.path.join(OUT, '.nojekyll'), 'w') as f:
        f.write('')

    print('страниц обработано: %(pages)d | href: %(href)d | src: %(src)d | пути в JS: %(js)d | noindex: %(noindex)d | заглушек: %(stubs)d' % stats)
    if problems:
        print('ПРОБЛЕМЫ:')
        for pr in problems:
            print('  -', pr)
        sys.exit(1)
    print('OK: dist-ghp готов.')


if __name__ == '__main__':
    main()
