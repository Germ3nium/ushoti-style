import os
from PIL import Image
from rembg import remove
import io

INPUT_DIR  = "Pictures"
OUTPUT_DIR = "images"
BG_COLOR   = (250, 247, 242, 255)  # cream white matching --bg: #faf7f2
SIZE       = (800, 800)

os.makedirs(OUTPUT_DIR, exist_ok=True)

files = sorted([f for f in os.listdir(INPUT_DIR) if f.lower().endswith((".jpg", ".jpeg", ".png"))])[:1]
total = len(files)

print(f"Processing {total} images...\n")

for i, filename in enumerate(files, 1):
    input_path  = os.path.join(INPUT_DIR, filename)
    # clean filename: img_001.jpg, img_002.jpg etc
    output_name = f"product_{i:03d}.jpg"
    output_path = os.path.join(OUTPUT_DIR, output_name)

    print(f"[{i}/{total}] {filename} → {output_name}")

    with open(input_path, "rb") as f:
        raw = f.read()

    # Remove background — returns RGBA PNG
    result_bytes = remove(raw)
    fg = Image.open(io.BytesIO(result_bytes)).convert("RGBA")

    # Create solid background
    bg = Image.new("RGBA", SIZE, BG_COLOR)

    # Scale foreground to fit within SIZE keeping aspect ratio
    fg.thumbnail(SIZE, Image.LANCZOS)

    # Centre on background
    offset = ((SIZE[0] - fg.width) // 2, (SIZE[1] - fg.height) // 2)
    bg.paste(fg, offset, fg)

    # Save as JPEG
    final = bg.convert("RGB")
    final.save(output_path, "JPEG", quality=92)

print(f"\nDone! {total} images saved to /{OUTPUT_DIR}/")
