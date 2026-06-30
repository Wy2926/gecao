#!/usr/bin/env python3
"""像素帧后处理管线（12-assets.md §三）。

把 AI 生成的「网格表格图」（统一纯品红 #FF00FF 背景，每格一帧）处理成游戏可直接
加载的「单行 strip spritesheet」：

    等分切帧  →  品红绿幕抠图（去边缘品红污染）  →  [可选] 预乘 alpha  →
    最近邻缩放到目标帧尺寸  →  横向拼成单行 strip  →  写入 public/assets/

设计取舍（与仓库现有可用素材保持一致）：
  * 现有 player-*.png / enemy-walk.png 均为「直通(straight) alpha」，配合 Phaser
    `pixelArt: true`（最近邻、无 mipmap）渲染干净、无白边。
  * 历史上「预乘 alpha」反而引入过白雾（见 .agents/skills/testing-m1-combat：
    "White haze = the old premultiplied-alpha bug"）——因 Phaser 默认按直通 alpha
    上传纹理，再预乘会被二次处理。
  * 因此本脚本默认 **不预乘**，但保留 `--premultiply` 开关；无论是否预乘，抠图后都把
    全透明像素 RGB 归零、并对半透明边缘去品红，从根本上杜绝品红/白边渗色。

脚本可重复运行、参数化。用法见 --help。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def chroma_key_magenta(rgb: np.ndarray, tol: int) -> np.ndarray:
    """返回 0..255 的 alpha：品红(#FF00FF)→0(透明)，其余→255(不透明)。

    判定「品红度」为 R 高、B 高、G 低；用 tol 容差吸收 JPEG/抗锯齿噪声。
    边缘半品红像素给出中间 alpha，使切边平滑。
    """
    r = rgb[..., 0].astype(int)
    g = rgb[..., 1].astype(int)
    b = rgb[..., 2].astype(int)
    # 与纯品红的「绿通道」差：品红 G≈0。绿越高越不像品红 → 越不透明。
    magenta_like = (r > 110) & (b > 110) & (g < 110)
    # 以 G 通道作为软 alpha：G 越低越透明。
    soft = np.clip((g.astype(float) - tol) / (128 - tol), 0.0, 1.0)
    alpha = np.where(magenta_like, soft, 1.0)
    return (alpha * 255).astype(np.uint8)


def defringe(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """去除边缘像素的品红污染：把偏品红的边缘像素 G 拉到 min(R,B) 抑制紫边。"""
    out = rgb.astype(int)
    edge = (alpha > 0) & (alpha < 255)
    if edge.any():
        r = out[..., 0]
        b = out[..., 2]
        neutral = np.minimum(r, b)
        g = out[..., 1]
        fixed = np.where(edge & (g > neutral), neutral, g)
        out[..., 1] = fixed
    return out.astype(np.uint8)


def process_grid(
    src: Image.Image,
    rows: int,
    cols: int,
    frame_size: int,
    count: int | None,
    tol: int,
    premultiply: bool,
) -> Image.Image:
    src = src.convert("RGBA")
    W, H = src.size
    if W % cols or H % rows:
        print(
            f"[warn] 图尺寸 {W}x{H} 不能被 {cols}x{rows} 整除，按整除截断切分。",
            file=sys.stderr,
        )
    cw, ch = W // cols, H // rows
    arr = np.asarray(src)

    frames: list[np.ndarray] = []
    for ry in range(rows):
        for cx in range(cols):
            cell = arr[ry * ch : (ry + 1) * ch, cx * cw : (cx + 1) * cw, :]
            rgb = cell[..., :3].copy()
            alpha = chroma_key_magenta(rgb, tol)
            rgb = defringe(rgb, alpha)
            # 全透明像素 RGB 归零，避免任何残留底色渗到边缘。
            rgb[alpha == 0] = 0
            if premultiply:
                a = alpha.astype(float) / 255.0
                rgb = (rgb.astype(float) * a[..., None]).round().astype(np.uint8)
            out = np.dstack([rgb, alpha])
            frames.append(out)

    total = rows * cols
    if count is not None:
        if count > total:
            raise SystemExit(f"--count {count} 超过网格帧数 {total}")
        frames = frames[:count]

    n = len(frames)
    strip = Image.new("RGBA", (frame_size * n, frame_size), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        # 整图按帧裁出后，最近邻缩放到目标显示倍数尺寸（pixelArt 干净下采样）。
        im = Image.fromarray(f, "RGBA").resize((frame_size, frame_size), Image.NEAREST)
        strip.paste(im, (i * frame_size, 0))
    return strip


def main() -> None:
    ap = argparse.ArgumentParser(description="像素网格图 → 单行 strip spritesheet 后处理")
    ap.add_argument("input", type=Path, help="输入网格图（品红背景）")
    ap.add_argument("output", type=Path, help="输出 strip png 路径")
    ap.add_argument("--rows", type=int, required=True, help="网格行数")
    ap.add_argument("--cols", type=int, required=True, help="网格列数")
    ap.add_argument(
        "--frame-size", type=int, default=128, help="单帧输出方形边长(px)，默认 128"
    )
    ap.add_argument(
        "--count",
        type=int,
        default=None,
        help="只取前 N 帧（行优先顺序），默认取满 rows*cols",
    )
    ap.add_argument(
        "--tol", type=int, default=60, help="品红抠图容差(越大抠得越狠)，默认 60"
    )
    ap.add_argument(
        "--premultiply",
        action="store_true",
        help="预乘 alpha（默认关闭；见脚本头部说明）",
    )
    args = ap.parse_args()

    src = Image.open(args.input)
    strip = process_grid(
        src,
        rows=args.rows,
        cols=args.cols,
        frame_size=args.frame_size,
        count=args.count,
        tol=args.tol,
        premultiply=args.premultiply,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    strip.save(args.output)
    print(f"[ok] {args.input} → {args.output}  ({strip.size[0]}x{strip.size[1]}, {strip.size[0] // args.frame_size} 帧)")


if __name__ == "__main__":
    main()
