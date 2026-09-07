# -*- coding: utf-8 -*-
"""
OCR 红框识别可视化工具

左侧上传单据图片并选择单据模式，右侧展示结构化识别结果与红框明细。

用法：
  python ocr_app.py
  python ocr_app.py --port 7860 --share
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from ocr_red_boxes import (  # noqa: E402
    DOC_MODE_PROFILES,
    DocDetectError,
    INVALID_IMAGE_MSG,
    OcrEngine,
    find_ocr_sample_dir,
    normalize_doc_mode,
    process_bgr,
)

try:
    import gradio as gr
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "缺少依赖 gradio，请先执行：\n  pip install -r requirements.txt"
    ) from exc


_ENGINE: OcrEngine | None = None

MODE_CHOICES = [
    ("自动（全部红框）", "auto"),
    ("报关单", "customs_declaration"),
    ("重量证书", "weight_certificate"),
    ("检验证书", "inspection_certificate"),
]


def get_engine() -> OcrEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = OcrEngine()
    return _ENGINE


def _to_bgr(image: np.ndarray | None) -> np.ndarray | None:
    if image is None:
        return None
    arr = np.asarray(image)
    if arr.ndim == 2:
        return cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
    if arr.shape[2] == 4:
        return cv2.cvtColor(arr, cv2.COLOR_RGBA2BGR)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def _format_fields_md(result: dict[str, Any]) -> str:
    elapsed = result.get("elapsed_sec")
    if elapsed is None and result.get("elapsed_ms") is not None:
        elapsed = round(float(result["elapsed_ms"]) / 1000.0, 3)
    elapsed_txt = f"{elapsed:.3f} s" if elapsed is not None else "-"

    lines = [
        f"### {result.get('doc_type_cn', '识别结果')}",
        f"- 单据模式：**{result.get('doc_mode_label', '-')}**",
        f"- 识别时长：**{elapsed_txt}**（{result.get('elapsed_ms', '-')} ms）",
        f"- OCR 策略：`{result.get('ocr_strategy', '-')}`",
        (
            f"- 红框：**{result.get('red_box_count', 0)}** 个参与识别"
            f"（检测到 {result.get('red_box_detected', result.get('red_box_count', 0))}）"
        ),
        "",
        "#### 结构化字段",
        "",
    ]
    fields = result.get("fields") or {}
    if not fields:
        lines.append("_未解析到结构化字段（可查看下方红框原文）_")
    else:
        for k, v in fields.items():
            if isinstance(v, (dict, list)):
                pretty = json.dumps(v, ensure_ascii=False, indent=2)
                lines.append(f"- **{k}**：")
                lines.append(f"```json\n{pretty}\n```")
            else:
                lines.append(f"- **{k}**：`{v}`")

    lines.extend(["", "#### 红框识别明细", ""])
    boxes = result.get("boxes") or []
    if not boxes:
        lines.append("_未检测到红色标注框_")
    else:
        for br in boxes:
            lines.append(f"**[{br['index']}]** {br['text']}")
            scores = ", ".join(
                f"{it['text']}({it['score']:.2f})" for it in (br.get("items") or [])
            )
            if scores:
                lines.append(f"  - {scores}")
            lines.append("")
    return "\n".join(lines)


def guess_mode_from_sample(sample_name: str) -> str:
    """根据样例文件名猜测单据模式。"""
    name = sample_name or ""
    if "854_18_8" in name or "报关" in name:
        return "customs_declaration"
    if "855_19_8" in name or "重量" in name:
        return "weight_certificate"
    if "856_20_8" in name or "检验" in name or "品质" in name:
        return "inspection_certificate"
    return "auto"


def recognize(image: np.ndarray | None, doc_mode: str):
    if image is None:
        raise gr.Error("请先上传图片")

    bgr = _to_bgr(image)
    mode = normalize_doc_mode(doc_mode or "auto")
    try:
        result = process_bgr(
            bgr,
            get_engine(),
            file_name="upload.png",
            return_annotated=True,
            doc_mode=mode,
        )
    except DocDetectError as exc:
        msg = str(exc) or INVALID_IMAGE_MSG
        # 清空预览与旧结果，避免残留上次成功识别内容
        err_md = f"### 识别失败\n\n**{msg}**"
        err_json = json.dumps({"success": False, "error": msg}, ensure_ascii=False, indent=2)
        # 同时弹出提示
        gr.Warning(msg)
        return None, err_md, err_json

    annotated = result.pop("annotated_bgr")
    annotated_rgb = cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB)

    md = _format_fields_md(result)
    raw_json = json.dumps(result, ensure_ascii=False, indent=2)
    return annotated_rgb, md, raw_json


def load_sample(sample_name: str):
    if not sample_name:
        return None, "auto"
    sample_dir = find_ocr_sample_dir()
    path = sample_dir / sample_name
    if not path.exists():
        raise gr.Error(f"样例不存在: {sample_name}")
    data = np.fromfile(str(path), dtype=np.uint8)
    bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return rgb, guess_mode_from_sample(sample_name)


def list_samples() -> list[str]:
    try:
        sample_dir = find_ocr_sample_dir()
    except FileNotFoundError:
        return []
    names = [p.name for p in sorted(sample_dir.glob("*.png"))]
    names += [p.name for p in sorted(sample_dir.glob("*.jpg"))]
    return names


def mode_hint(mode: str) -> str:
    try:
        key = normalize_doc_mode(mode)
    except ValueError:
        key = "auto"
    p = DOC_MODE_PROFILES[key]
    rules = {
        "auto": "先按红框识别，再自动判断单据类型",
        "customs_declaration": "先校验是否为报关单 → 不匹配则提示「无效图片，请重新上传」→ 匹配后再 OCR",
        "weight_certificate": "先校验是否为重量证书 → 不匹配则提示「无效图片，请重新上传」→ 匹配后再 OCR",
        "inspection_certificate": "先校验是否为检验证书 → 不匹配则提示「无效图片，请重新上传」→ 匹配后再 OCR",
    }
    return f"**当前模式**：{p['label']}  \n{rules.get(key, '')}"


def build_ui() -> gr.Blocks:
    samples = list_samples()
    css = """
    .gradio-container {max-width: 1280px !important;}
    footer {display: none !important;}
    """
    with gr.Blocks(title="WMS OCR 红框识别", css=css) as demo:
        gr.Markdown(
            "## WMS OCR 红框识别工具\n"
            "先选 **单据模式** 再识别：只会 OCR 该模式关心的红框，可明显提速。"
            "预览图中 **绿色=实际识别**，灰色=检测到但未识别。"
        )
        with gr.Row(equal_height=False):
            with gr.Column(scale=5):
                mode = gr.Radio(
                    choices=MODE_CHOICES,
                    value="auto",
                    label="单据模式",
                )
                mode_md = gr.Markdown(value=mode_hint("auto"))
                image_in = gr.Image(
                    label="上传图片",
                    type="numpy",
                    height=420,
                )
                with gr.Row():
                    sample_dd = gr.Dropdown(
                        choices=samples,
                        label="加载示例图（可选）",
                        value=None,
                        interactive=True,
                    )
                    btn_sample = gr.Button("载入样例", variant="secondary")
                btn = gr.Button("开始识别", variant="primary", size="lg")
                image_out = gr.Image(label="红框检测预览", type="numpy", height=320)

            with gr.Column(scale=5):
                result_md = gr.Markdown(value="右侧将显示识别结果…")
                with gr.Accordion("原始 JSON", open=False):
                    result_json = gr.Code(language="json", label="JSON")

        mode.change(fn=mode_hint, inputs=[mode], outputs=[mode_md])
        btn_sample.click(
            fn=load_sample,
            inputs=[sample_dd],
            outputs=[image_in, mode],
        ).then(fn=mode_hint, inputs=[mode], outputs=[mode_md])
        btn.click(
            fn=recognize,
            inputs=[image_in, mode],
            outputs=[image_out, result_md, result_json],
        )
        image_in.change(
            fn=lambda _: (None, "上传后选择单据模式，再点「开始识别」", ""),
            inputs=[image_in],
            outputs=[image_out, result_md, result_json],
        )
    return demo


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="OCR 红框识别可视化工具")
    p.add_argument("--host", default="127.0.0.1", help="监听地址")
    p.add_argument("--port", type=int, default=7860, help="端口")
    p.add_argument("--share", action="store_true", help="生成临时公网链接")
    p.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    args = parse_args(argv)
    print("预加载 OCR 引擎…")
    get_engine()
    demo = build_ui()
    demo.launch(
        server_name=args.host,
        server_port=args.port,
        share=args.share,
        inbrowser=not args.no_browser,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
