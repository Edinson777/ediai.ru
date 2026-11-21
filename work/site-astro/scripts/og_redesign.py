# -*- coding: utf-8 -*-
"""OG-картинки редизайна (1200x630) в новой палитре EDIAI.
Запуск: python3 work/site-astro/scripts/og_redesign.py
Файлы пишутся в og/ корня репозитория (внепаблиш-зоны, как и у build.py)."""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OG = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'og'))
os.makedirs(OG, exist_ok=True)

F = "/usr/share/fonts/truetype/dejavu/"
def font(sz, bold=False):
    return ImageFont.truetype(F + ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"), sz)

PAPER, INK, FOREST, ORANGE, LAV, MUTED = "#f3f0e8", "#20241f", "#244b3d", "#d96340", "#6b61b7", "#687067"

def base():
    im = Image.new("RGB", (1200, 630), PAPER)
    d = ImageDraw.Draw(im)
    return im, d

def footer(d):
    d.rectangle([60, 560, 1140, 562], fill="#dddcd2")
    d.text((60, 584), "EDIAI · ediai.ru", font=font(22, True), fill=MUTED)
    d.text((900, 584), "ноябрь 2026", font=font(22), fill=MUTED)

def brand(d):
    d.rounded_rectangle([60, 52, 122, 114], radius=18, fill=INK)
    d.text((74, 62), "E.", font=font(34, True), fill=PAPER)
    d.text((136, 56), "EDIAI", font=font(38, True), fill=INK)
    d.text((138, 100), "разумнее с деньгами · увереннее с технологиями", font=font(16), fill="#73776d")

# 1) og-index.png — главная
im, d = base()
brand(d)
d.text((60, 200), "Разумнее", font=font(84, True), fill=INK)
d.text((60, 292), "с деньгами.", font=font(84, True), fill=INK)
d.text((60, 384), "Увереннее", font=font(84), fill=ORANGE)
d.text((60, 476), "с технологиями.", font=font(84, True), fill=INK)
d.ellipse([860, 150, 1140, 430], outline="#244b3d33", width=3)
c = d.ellipse([930, 350, 1070, 490], fill=ORANGE)
d.text((977, 396), "₽", font=font(60, True), fill="#ffffff")
footer(d)
im.save(os.path.join(OG, "og-index.png"))

# 2) og-finansy.png
im, d = base()
brand(d)
d.rounded_rectangle([60, 190, 1140, 520], radius=30, fill=FOREST)
d.text((100, 226), "ФИНАНСЫ", font=font(22, True), fill="#c8d0c5")
d.text((100, 268), "Спокойствие", font=font(56, True), fill="#ffffff")
d.text((100, 336), "начинается с ясности.", font=font(56, True), fill="#ffffff")
d.text((100, 428), "ИИС-3 · ПДС · подушка безопасности · вклады и налоги", font=font(24), fill="#ffffffcc")
d.ellipse([950, 430, 1110, 590], outline="#d8e2d9", width=2)
d.ellipse([1000, 470, 1090, 560], outline="#ffffff", width=3)
d.text((1028, 496), "₽", font=font(38, True), fill="#ffffff")
footer(d)
im.save(os.path.join(OG, "og-finansy.png"))

# 3) og-digital.png
im, d = base()
brand(d)
d.rounded_rectangle([60, 190, 1140, 520], radius=30, fill=INK)
d.text((100, 226), "ЦИФРОВАЯ ЖИЗНЬ", font=font(22, True), fill="#c8d0c5")
d.text((100, 268), "Без лишней", font=font(56, True), fill="#ffffff")
d.text((100, 336), "сложности.", font=font(56, True), fill="#ffffff")
d.text((100, 428), "Безопасность · смартфон · госсервисы · почта", font=font(24), fill="#ffffffcc")
d.ellipse([920, 330, 1120, 530], fill=LAV)
d.ellipse([1080, 300, 1116, 336], fill="#e1a17c")
footer(d)
im.save(os.path.join(OG, "og-digital.png"))

print("OG-картинки обновлены:", os.listdir(OG))
