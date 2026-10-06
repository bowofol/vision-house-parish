"""Create responsive WebP assets from approved original area church photographs.

Run: python scripts/optimize_images.py
Requires Pillow. Originals are preserved; images are resized without cropping.
"""
from pathlib import Path
from PIL import Image, ImageOps
import json

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets' / 'images' / 'optimized'
SOURCES = [
    ('img/IMG_1244.JPG.jpeg', 'IMG_1244', (640, 1280, 1920)),
    ('img/IMG_1259.JPG.jpeg', 'IMG_1259', (480, 960, 1600)),
    ('img/IMG_1249.JPG.jpeg', 'IMG_1249', (640, 1280, 1920)),
    ('img/IMG_1292.JPG.jpeg', 'IMG_1292', (480, 960, 1600)),
    ('img/IMG_1311.JPG.jpeg', 'IMG_1311', (480, 960, 1600)),
    ('assets/images/church-prayer.jpg', 'church-prayer', (480, 960, 1600)),
    ('img/IMG_1250.JPG.jpeg', 'IMG_1250', (480, 960, 1600)),
    ('img/IMG_1285.JPG.jpeg', 'IMG_1285', (480, 960, 1600)),
    ('img/IMG_1286.JPG.jpeg', 'IMG_1286', (480, 960, 1600)),
    ('img/IMG_1299.JPG.jpeg', 'IMG_1299', (480, 960, 1600)),
    ('img/IMG_1309.JPG.jpeg', 'IMG_1309', (480, 960, 1600)),
    ('img/IMG_1335.JPG.jpeg', 'IMG_1335', (480, 960, 1600)),
    ('assets/images/church-community.jpg', 'church-community', (480, 960, 1600)),
    ('assets/images/hero-church.jpg', 'hero-church', (480, 960, 1600)),
    ('assets/images/pastor-dele.jpg', 'pastor-dele', (480, 960)),
]


def optimize_images():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = []
    for source_name, stem, widths in SOURCES:
        source = ROOT / source_name
        with Image.open(source) as original:
            photo = ImageOps.exif_transpose(original).convert('RGB')
            source_width, source_height = photo.size
            for target_width in widths:
                width = min(target_width, source_width)
                height = round(source_height * width / source_width)
                resized = photo.resize((width, height), Image.Resampling.LANCZOS)
                target = OUTPUT / f'{stem}-{target_width}.webp'
                resized.save(target, 'WEBP', quality=85 if stem == 'IMG_1244' else 82, method=6)
                record = {
                    'source': source_name,
                    'file': str(target.relative_to(ROOT)).replace('\\', '/'),
                    'width': width,
                    'height': height,
                    'bytes': target.stat().st_size,
                    'source_bytes': source.stat().st_size,
                }
                report.append(record)
                print(f'{target.name}: {width} x {height}, {record["bytes"] / 1024:.1f} KB', flush=True)
    (OUTPUT / 'image-sizes.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Created {len(report)} WebP files; originals preserved.', flush=True)


if __name__ == '__main__':
    optimize_images()
