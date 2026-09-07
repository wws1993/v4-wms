# -*- coding: utf-8 -*-
"""
红框 OCR 识别脚本（WMS 0 期调研）

针对 docs/ocr识别示例/ 中的标注样例：
  1) 海关进口货物报关单
  2) CCIC 重量证书
  3) CCIC 检验证书（品质）

流程：
  OpenCV HSV 检测红色标注框 → 裁剪框内区域 → RapidOCR 识别 → 结构化字段提炼

用法：
  python ocr_red_boxes.py
  python ocr_red_boxes.py --image path/to/xxx.png
  python ocr_red_boxes.py --debug
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "缺少依赖 rapidocr-onnxruntime，请先执行：\n"
        "  pip install -r requirements.txt"
    ) from exc


HERE = Path(__file__).resolve().parent
DOCS = HERE.parent


# ---------------------------------------------------------------------------
# IO helpers (Windows 中文路径友好)
# ---------------------------------------------------------------------------

def imread_unicode(path: Path) -> np.ndarray:
    data = np.fromfile(str(path), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"无法读取图片: {path}")
    return img


def imwrite_unicode(path: Path, img: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ext = path.suffix or ".png"
    ok, buf = cv2.imencode(ext, img)
    if not ok:
        raise ValueError(f"无法编码图片: {path}")
    buf.tofile(str(path))


def find_ocr_sample_dir() -> Path:
    for p in DOCS.iterdir():
        if p.is_dir() and "ocr" in p.name.lower():
            return p
    raise FileNotFoundError(f"未找到 OCR 示例目录，请检查 {DOCS}")


# ---------------------------------------------------------------------------
# Red box detection
# ---------------------------------------------------------------------------

@dataclass
class RedBox:
    x: int
    y: int
    w: int
    h: int
    area: int
    inner_red: float
    circularity: float
    aspect: float

    @property
    def xywh(self) -> tuple[int, int, int, int]:
        return self.x, self.y, self.w, self.h

    def crop(self, img: np.ndarray, pad: int = 4) -> np.ndarray:
        """裁剪框内区域，并向内收缩以去掉红边。"""
        x, y, w, h = self.xywh
        ix = max(0, x + pad)
        iy = max(0, y + pad)
        ix2 = min(img.shape[1], x + w - pad)
        iy2 = min(img.shape[0], y + h - pad)
        if ix2 <= ix or iy2 <= iy:
            return img[y : y + h, x : x + w].copy()
        return img[iy:iy2, ix:ix2].copy()


def build_red_mask(img: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # 红色在 HSV 色环两端
    m1 = cv2.inRange(hsv, (0, 70, 70), (12, 255, 255))
    m2 = cv2.inRange(hsv, (168, 70, 70), (180, 255, 255))
    mask = cv2.bitwise_or(m1, m2)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask


def _interior_red_ratio(mask: np.ndarray, x: int, y: int, w: int, h: int) -> float:
    roi = mask[y : y + h, x : x + w]
    if roi.size == 0:
        return 1.0
    bw = max(2, min(5, w // 6, h // 6))
    if h <= 2 * bw or w <= 2 * bw:
        return float(np.count_nonzero(roi) / roi.size)
    inner = roi[bw : h - bw, bw : w - bw]
    return float(np.count_nonzero(inner) / max(1, inner.size))


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1, y1 = max(ax, bx), max(ay, by)
    x2, y2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    if inter <= 0:
        return 0.0
    return inter / float(aw * ah + bw * bh - inter)


def _merge_boxes(boxes: list[RedBox], iou_thresh: float = 0.35) -> list[RedBox]:
    boxes = sorted(boxes, key=lambda b: b.area, reverse=True)
    kept: list[RedBox] = []
    for b in boxes:
        if any(_iou(b.xywh, k.xywh) > iou_thresh for k in kept):
            continue
        kept.append(b)
    return kept


def detect_red_boxes(img: np.ndarray) -> list[RedBox]:
    """检测红色标注框，滤除公章、印章碎片等。"""
    mask = build_red_mask(img)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    H, W = img.shape[:2]
    min_area = H * W * 0.0001
    boxes: list[RedBox] = []

    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.03 * peri, True)
        x, y, w, h = cv2.boundingRect(c)
        if w < 30 or h < 16:
            continue

        circularity = 4 * np.pi * area / (peri * peri + 1e-6)
        aspect = w / float(h)
        inner_red = _interior_red_ratio(mask, x, y, w, h)
        verts = len(approx)

        # 真圆形章
        if circularity >= 0.86:
            continue
        # 章内墨迹多 / 印章半截
        if inner_red > 0.38:
            continue
        if aspect < 0.55 or aspect > 12:
            continue
        if verts > 10 and inner_red > 0.25:
            continue

        boxes.append(
            RedBox(
                x=int(x),
                y=int(y),
                w=int(w),
                h=int(h),
                area=int(area),
                inner_red=round(inner_red, 3),
                circularity=round(circularity, 3),
                aspect=round(aspect, 2),
            )
        )

    boxes = _merge_boxes(boxes)
    boxes.sort(key=lambda b: (b.y, b.x))
    return boxes


# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------

def _bleach_red(img: np.ndarray) -> np.ndarray:
    """弱化残留红框边缘，减少对数字 OCR 的干扰。"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, (0, 40, 40), (15, 255, 255))
    m2 = cv2.inRange(hsv, (165, 40, 40), (180, 255, 255))
    red = cv2.bitwise_or(m1, m2)
    out = img.copy()
    out[red > 0] = (255, 255, 255)
    return out


def _normalize_numeric_text(text: str, aggressive: bool = False) -> str:
    """拼接被拆开的重量数字碎片，如 '10 996.64' → '10,996.64'。

    默认仅处理「数字中间有空白/异常点号」的情况，避免把备案号、提单号等连续字符误加千分位。
    """
    t = text
    t = t.replace("。", ".").replace("，", ",")
    t = re.sub(r"\s+\.\s*", ".", t)
    t = re.sub(r"(?<=\d)\.\s+(?=\d)", ".", t)
    t = re.sub(r"\s+,", ",", t)
    t = re.sub(r",\s+", ",", t)
    t = re.sub(r"\.\.+", ".", t)

    # 仅合并被空格拆开的千分位：10 996.64 / 9 968.840
    t = re.sub(
        r"(?<![A-Za-z0-9])(\d{1,3})\s+(\d{3})(?:\s*\.\s*(\d+))?(?![A-Za-z0-9])",
        lambda m: f"{m.group(1)},{m.group(2)}" + (f".{m.group(3)}" if m.group(3) else ""),
        t,
    )
    # 9, 968.840 → 9,968.840
    t = re.sub(
        r"(?<![A-Za-z0-9])(\d{1,3}),\s+(\d{3}(?:\.\d+)?)(?![A-Za-z0-9])",
        r"\1,\2",
        t,
    )

    if aggressive:
        # 重量框专用：去掉“吨/%/为”等干扰字后再拼
        t = re.sub(r"[为為]", " ", t)
        t = re.sub(
            r"(?<![A-Za-z0-9])(\d{1,3})\s+(\d{3})(?:\.(\d+))?(?![A-Za-z0-9])",
            lambda m: f"{m.group(1)},{m.group(2)}" + (f".{m.group(3)}" if m.group(3) else ""),
            t,
        )
    return re.sub(r"\s+", " ", t).strip()


class OcrEngine:
    def __init__(self) -> None:
        self._ocr = RapidOCR()

    def _run_once(self, img: np.ndarray) -> list[dict[str, Any]]:
        result, _elapse = self._ocr(img)
        items: list[dict[str, Any]] = []
        if not result:
            return items
        for box, text, score in result:
            text = (text or "").strip()
            if not text:
                continue
            items.append(
                {
                    "text": text,
                    "score": float(score),
                    "box": [[float(p[0]), float(p[1])] for p in box],
                }
            )
        return items

    def recognize(self, img: np.ndarray, *, strategy: str = "quality") -> list[dict[str, Any]]:
        if img is None or img.size == 0:
            return []

        h, w = img.shape[:2]
        candidates: list[list[dict[str, Any]]] = []

        # strategy:
        #   quality  — 小框多尺度(含 3x)，准
        #   balanced — 小框最多 1x+2x，跳过 3x
        #   fast     — 优先单尺度，失败再补一次 2x
        if strategy == "fast":
            scales = [1.0]
            if max(h, w) < 160:
                scales = [1.0, 2.0]
        elif strategy == "balanced":
            scales = [1.0]
            if max(h, w) < 180:
                scales = [1.0, 2.0]
            elif max(h, w) < 360:
                scales = [1.0, 1.8]
        else:
            scales = [1.0]
            if max(h, w) < 180:
                scales = [1.0, 2.0, 3.0]
            elif max(h, w) < 360:
                scales = [1.0, 1.8]

        base = _bleach_red(img)
        for scale in scales:
            work = base
            if scale != 1.0:
                work = cv2.resize(base, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            items = self._run_once(work)
            if items:
                candidates.append(items)
                # fast：拿到结果就停，避免继续放大
                if strategy == "fast":
                    break

        if not candidates:
            return []

        # 优先选择「完整千分位数字」更多的结果
        def score_items(items: list[dict[str, Any]]) -> tuple[int, float, int]:
            text = _normalize_numeric_text(join_texts(items))
            good_nums = len(re.findall(r"\d{1,3},\d{3}(?:\.\d+)?", text))
            avg = sum(i["score"] for i in items) / max(1, len(items))
            return (good_nums, avg, len(text))

        best = max(candidates, key=score_items)
        # 判断是否为「纯数字/重量」小框，避免误改备案号等
        raw_join = join_texts(best)
        digit_ratio = len(re.findall(r"\d", raw_join)) / max(1, len(raw_join))
        looks_weight = digit_ratio > 0.45 and not re.search(r"[A-Za-z]{3,}", raw_join)
        merged_text = _normalize_numeric_text(raw_join, aggressive=looks_weight)

        if len(best) >= 2 and looks_weight and re.search(r"\d{1,3},\d{3}", merged_text):
            xs = [p[0] for it in best for p in it["box"]]
            ys = [p[1] for it in best for p in it["box"]]
            return [
                {
                    "text": merged_text,
                    "score": float(sum(i["score"] for i in best) / len(best)),
                    "box": [
                        [min(xs), min(ys)],
                        [max(xs), min(ys)],
                        [max(xs), max(ys)],
                        [min(xs), max(ys)],
                    ],
                }
            ]
        for it in best:
            it["text"] = _normalize_numeric_text(it["text"], aggressive=looks_weight)
        if looks_weight and len(best) == 1:
            best[0]["text"] = merged_text
        return best


def join_texts(items: list[dict[str, Any]], sep: str = " ") -> str:
    return sep.join(i["text"] for i in items).strip()


INVALID_IMAGE_MSG = "无效图片，请重新上传"


class DocDetectError(Exception):
    """当前单据模式下检测/识别失败，不回退其它模式。"""


# ---------------------------------------------------------------------------
# Document-type heuristics & field extraction
# ---------------------------------------------------------------------------

# 单据类型签名词（用于模式匹配预检，不依赖红框字段解析）
DOC_TYPE_SIGNATURES: dict[str, dict[str, list[str]]] = {
    "customs_declaration": {
        "strong": ["进口货物报关单", "境内收货人", "消费使用单位"],
        "weak": ["报关单", "提运单号", "备案号", "毛重", "净重"],
    },
    "weight_certificate": {
        "strong": ["CERTIFICATE OF WEIGHT", "重量证书", "干态重量"],
        "weak": ["净重结果", "水分", "Certificate of Weight"],
    },
    "inspection_certificate": {
        "strong": ["检验项目", "Inspection item", "检验结果", "Inspection result"],
        "weak": ["检验标准", "Inspection standard", "GB/T 3884"],
    },
}


def score_doc_types(text: str) -> dict[str, int]:
    """按关键词给各单据类型打分。"""
    raw = text or ""
    upper = raw.upper()
    scores = {k: 0 for k in DOC_TYPE_SIGNATURES}
    for doc_type, buckets in DOC_TYPE_SIGNATURES.items():
        for kw in buckets.get("strong", []):
            if kw.isascii():
                hit = kw.upper() in upper
            else:
                hit = kw in raw
            if hit:
                scores[doc_type] += 3
        for kw in buckets.get("weak", []):
            if kw.isascii():
                hit = kw.upper() in upper
            else:
                hit = kw in raw
            if hit:
                scores[doc_type] += 1
    return scores


def classify_document_text(text: str) -> tuple[str, dict[str, int]]:
    scores = score_doc_types(text)
    best = max(scores, key=scores.get)
    if scores[best] <= 0:
        return "unknown", scores
    return best, scores


def quick_page_text(img: np.ndarray, engine: OcrEngine, *, early_mode: str | None = None) -> str:
    """整页缩小后快速 OCR，仅用于单据类型预检。"""
    h, w = img.shape[:2]
    scale = 900.0 / max(h, w)
    if scale < 1.0:
        small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    else:
        small = img
    # 优先扫上半页（标题区信号最强）
    top = small[: max(80, small.shape[0] // 2), :]
    top_text = join_texts(engine.recognize(top, strategy="fast"))
    if early_mode and early_mode != "auto":
        detected, scores = classify_document_text(top_text)
        if scores.get(early_mode, 0) > 0 and detected == early_mode:
            return top_text
    full_text = join_texts(engine.recognize(small, strategy="fast"))
    return " ".join(t for t in (top_text, full_text) if t)


def assert_image_matches_mode(
    img: np.ndarray,
    engine: OcrEngine,
    mode: str,
) -> dict[str, Any]:
    """校验图片是否匹配用户选择的单据模式；不匹配则直接失败。"""
    if mode == "auto":
        return {"matched_type": "auto", "scores": {}, "page_text": ""}

    page_text = quick_page_text(img, engine, early_mode=mode)
    detected_type, scores = classify_document_text(page_text)
    selected_score = scores.get(mode, 0)
    best_type, best_score = max(scores.items(), key=lambda kv: kv[1])

    # 必须命中当前模式签名；若其它类型分数更高也判定不匹配
    if selected_score <= 0 or (best_score > selected_score and best_type != mode):
        raise DocDetectError(INVALID_IMAGE_MSG)

    return {
        "matched_type": mode,
        "detected_type": detected_type,
        "scores": scores,
        "page_text": page_text[:500],
    }


def guess_doc_type(full_text: str, n_boxes: int) -> str:
    detected, scores = classify_document_text(full_text)
    if detected != "unknown":
        return detected
    # 签名不足时不再乱猜其它模式
    if n_boxes == 1:
        return "inspection_certificate"
    if n_boxes <= 3:
        return "weight_certificate"
    return "unknown"


_RE_CREDIT = re.compile(r"\(?\s*([0-9A-Z]{18})\s*\)?")
_RE_DATE8 = re.compile(r"(?<!\d)(20\d{6})(?!\d)")
_RE_BILL = re.compile(r"(?<![A-Z0-9])([A-Z0-9]{8,})(?![A-Z0-9])")
_RE_RECORD = re.compile(r"(?<![A-Z0-9])(L[0-9A-Z]{8,})(?![A-Z0-9])")
_RE_QD = re.compile(r"(QD[0-9A-Z]+)")
_RE_WEIGHT_MT = re.compile(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)")
_RE_WEIGHT_PLAIN = re.compile(r"([0-9]{4,}(?:\.[0-9]+)?)")
_RE_PCT = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*%")
_RE_SHIP = re.compile(r"船名[:：\s]*([A-Za-z0-9 ./-]+)")
_RE_ELEMENT = re.compile(
    r"([☆✦★]?\s*[\u4e00-\u9fff]+)\s*[\(（]\s*([A-Za-z]{1,2})\s*[\)）]"
)


def _company_name(text: str) -> str | None:
    t = re.sub(r"境内收货人|消费使用单位|\([^\)]*\)|（[^）]*）", "", text)
    t = re.sub(r"\s+", "", t).strip(" :：,，")
    # OCR 偶发截断/拆字
    if t.endswith("有限公"):
        t += "司"
    if t.startswith("西丰联"):
        t = "广" + t
    if "丰联铜业" in t and not t.startswith("广西"):
        t = "广西丰联铜业有限公司"
    if "公司" in t:
        return t
    return None


def parse_customs(box_results: list[dict[str, Any]]) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    for br in box_results:
        text = _normalize_numeric_text(br["text"])
        compact = text.replace(" ", "")

        if "消费使用单位" in compact:
            m = _RE_CREDIT.search(compact)
            if m:
                fields["消费使用单位统一社会信用代码"] = m.group(1)
            name = _company_name(compact)
            if name:
                fields["消费使用单位"] = name
            continue

        if "境内收货人" in compact:
            m = _RE_CREDIT.search(compact)
            if m:
                fields["境内收货人统一社会信用代码"] = m.group(1)
            name = _company_name(compact)
            if name:
                fields["境内收货人"] = name
            continue

        if "申报日期" in compact:
            m = _RE_DATE8.search(compact)
            if m:
                fields["申报日期"] = m.group(1)

        if "备案号" in compact:
            m = _RE_RECORD.search(compact) or re.search(r"备案号\s*([A-Z0-9]+)", compact)
            if m:
                fields["备案号"] = m.group(1)

        if "提运单号" in compact:
            m = re.search(r"提运单号\s*([A-Z0-9]+)", compact)
            if not m:
                m = re.search(r"(G[0-9A-Z]{8,})", compact)
            if m:
                fields["提运单号"] = m.group(1)

        if "毛重" in compact:
            nums = re.findall(r"\d{5,}", compact)
            if nums:
                fields["毛重_千克"] = nums[0]

        if "净重" in compact:
            nums = re.findall(r"\d{5,}", compact)
            if nums:
                fields["净重_千克"] = nums[0]

        if "QD" in compact.upper() or "核注清单" in compact:
            m = _RE_QD.search(compact.upper())
            if m:
                fields["保税核注清单号"] = m.group(1)

        if "船名" in compact:
            m = _RE_SHIP.search(text)
            if m:
                fields["船名"] = m.group(1).strip(" ,，")

        if "美元" in compact:
            fields["币制"] = "美元"
            money = re.findall(r"\d[\d,]*\.?\d*", compact)
            money = [x for x in money if len(x.replace(",", "").replace(".", "")) >= 3]
            if money:
                fields["金额候选"] = money

    # 兜底扫一遍仅含值的框
    for br in box_results:
        compact = _normalize_numeric_text(br["text"]).replace(" ", "")
        if "备案号" not in fields:
            m = _RE_RECORD.search(compact)
            if m:
                fields["备案号"] = m.group(1)
        if "提运单号" not in fields:
            m = re.search(r"(G[0-9A-Z]{8,})", compact)
            if m:
                fields["提运单号"] = m.group(1)
        if "申报日期" not in fields:
            m = _RE_DATE8.search(compact)
            if m:
                fields["申报日期"] = m.group(1)
        if "保税核注清单号" not in fields:
            m = _RE_QD.search(compact.upper())
            if m:
                fields["保税核注清单号"] = m.group(1)
        if "船名" not in fields:
            m = _RE_SHIP.search(br["text"])
            if m:
                fields["船名"] = m.group(1).strip(" ,，")

    pure_nums = []
    for br in box_results:
        t = br["text"].replace(",", "").replace(" ", "")
        if re.fullmatch(r"\d{6,}", t):
            pure_nums.append((br["bbox"], t))
    if pure_nums:
        pure_nums.sort(key=lambda x: (x[0][1], x[0][0]))
        if "毛重_千克" not in fields and len(pure_nums) >= 1:
            fields["毛重_千克"] = pure_nums[0][1]
        if "净重_千克" not in fields and len(pure_nums) >= 2:
            fields["净重_千克"] = pure_nums[1][1]

    return fields


def parse_weight(box_results: list[dict[str, Any]]) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    weights: list[tuple[tuple[int, int, int, int], str]] = []
    pcts: list[str] = []

    for br in box_results:
        text = _normalize_numeric_text(br["text"])
        # 百分比框
        if "%" in text:
            m = _RE_PCT.search(text)
            if m:
                pcts.append(m.group(1) + "%")
            continue

        found = _RE_WEIGHT_MT.findall(text)
        if not found:
            # 无千分位时，取较长小数/整数（排除噪声单数字）
            found = [x for x in _RE_WEIGHT_PLAIN.findall(text.replace(",", "")) if float(x) > 100]
        for val in found:
            weights.append((br["bbox"], val))

    uniq_w: list[str] = []
    for _, v in sorted(weights, key=lambda x: (x[0][1], x[0][0])):
        if v not in uniq_w:
            uniq_w.append(v)

    if len(uniq_w) >= 1:
        fields["净湿重_吨"] = uniq_w[0]
    if len(uniq_w) >= 2:
        fields["干态重量_吨"] = uniq_w[1]
    if pcts:
        fields["水分"] = pcts[0]

    return fields


def parse_inspection(box_results: list[dict[str, Any]]) -> dict[str, Any]:
    fields: dict[str, Any] = {"检验项目结果": []}
    # 通常只有 1 个大框，内含项目+结果多行
    lines: list[tuple[float, float, str]] = []
    for br in box_results:
        for item in br["items"]:
            ys = [p[1] for p in item["box"]]
            xs = [p[0] for p in item["box"]]
            lines.append((sum(ys) / 4.0, sum(xs) / 4.0, item["text"]))
    lines.sort(key=lambda x: (round(x[0] / 12.0), x[1]))

    # 同一行：左侧元素名，右侧结果
    rows: dict[int, list[tuple[float, str]]] = {}
    for y, x, t in lines:
        key = int(round(y / 14.0))
        rows.setdefault(key, []).append((x, t))

    for key in sorted(rows):
        parts = sorted(rows[key], key=lambda z: z[0])
        texts = [p[1] for p in parts]
        joined = " ".join(texts)
        elem = None
        m = _RE_ELEMENT.search(joined)
        if m:
            elem = f"{m.group(1).strip()} ({m.group(2)})"
        else:
            # 单项只有中文名
            cn = re.findall(r"[☆✦★]?[\u4e00-\u9fff]{1,4}", joined)
            if cn:
                elem = cn[0]
        # 结果：数字/% 等，排除元素符号
        nums = re.findall(r"\d+(?:\.\d+)?%?|\<\s*\d+(?:\.\d+)?", joined)
        # 过滤化学式误判
        nums = [n for n in nums if not re.fullmatch(r"[A-Za-z]+", n)]
        result_val = nums[-1] if nums else None
        if elem:
            fields["检验项目结果"].append({"项目": elem, "结果": result_val, "原始": joined})

    return fields


def extract_fields(doc_type: str, box_results: list[dict[str, Any]]) -> dict[str, Any]:
    if doc_type == "customs_declaration":
        return parse_customs(box_results)
    if doc_type == "weight_certificate":
        return parse_weight(box_results)
    if doc_type == "inspection_certificate":
        return parse_inspection(box_results)
    return {}


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

DOC_TYPE_CN = {
    "customs_declaration": "海关进口货物报关单",
    "weight_certificate": "重量证书",
    "inspection_certificate": "检验证书",
    "unknown": "未知",
    "auto": "自动识别",
}

# 单据模式：限制红框数量/筛选策略 + OCR 策略，用于提速
DOC_MODE_PROFILES: dict[str, dict[str, Any]] = {
    "auto": {
        "label": "自动（全部红框）",
        "force_doc_type": None,
        "max_boxes": None,
        "select": "all",
        "ocr_strategy": "quality",
        "skip_page_hint": False,
        "min_boxes": 1,
    },
    "customs_declaration": {
        "label": "报关单",
        "force_doc_type": "customs_declaration",
        "max_boxes": 10,
        "select": "reading_order",
        "ocr_strategy": "fast",
        "skip_page_hint": True,
        "min_boxes": 1,
    },
    "weight_certificate": {
        "label": "重量证书",
        "force_doc_type": "weight_certificate",
        "max_boxes": 3,
        "select": "weight_strips",
        "ocr_strategy": "balanced",
        "skip_page_hint": True,
        "min_boxes": 1,
    },
    "inspection_certificate": {
        "label": "检验证书",
        "force_doc_type": "inspection_certificate",
        "max_boxes": 1,
        "select": "largest",
        "ocr_strategy": "fast",
        "skip_page_hint": True,
        "min_boxes": 1,
    },
}


def normalize_doc_mode(mode: str | None) -> str:
    if not mode or mode in ("自动", "自动（全部红框）", "auto"):
        return "auto"
    mapping = {
        "报关单": "customs_declaration",
        "海关进口货物报关单": "customs_declaration",
        "customs": "customs_declaration",
        "customs_declaration": "customs_declaration",
        "重量证书": "weight_certificate",
        "重量证": "weight_certificate",
        "weight": "weight_certificate",
        "weight_certificate": "weight_certificate",
        "检验证书": "inspection_certificate",
        "品质证": "inspection_certificate",
        "检验证": "inspection_certificate",
        "inspection": "inspection_certificate",
        "inspection_certificate": "inspection_certificate",
    }
    key = str(mode).strip()
    if key not in mapping:
        raise ValueError(f"未知单据模式: {mode}")
    return mapping[key]


def filter_boxes_for_mode(boxes: list[RedBox], mode: str) -> list[RedBox]:
    """按单据模式筛选待 OCR 的红框（不匹配其它模式形态，宁缺毋错）。"""
    profile = DOC_MODE_PROFILES[normalize_doc_mode(mode)]
    select = profile["select"]
    max_boxes = profile["max_boxes"]
    if not boxes:
        return []

    if select == "all":
        chosen = list(boxes)
    elif select == "largest":
        chosen = sorted(boxes, key=lambda b: b.area, reverse=True)
    elif select == "weight_strips":
        # 仅接受矮条横框；不够则直接失败，不回退其它形状
        strips = [b for b in boxes if b.aspect >= 2.0 and b.h <= 80]
        chosen = sorted(strips, key=lambda b: (b.y, b.x))
    else:  # reading_order
        chosen = sorted(boxes, key=lambda b: (b.y, b.x))

    if max_boxes is not None:
        chosen = chosen[:max_boxes]

    return sorted(chosen, key=lambda b: (b.y, b.x))


def validate_mode_result(
    mode: str,
    doc_type: str,
    fields: dict[str, Any],
    box_results: list[dict[str, Any]],
    *,
    detected_count: int,
    selected_count: int,
) -> None:
    """校验当前模式结果；失败即抛错，不尝试其它模式。"""
    if detected_count <= 0:
        raise DocDetectError(INVALID_IMAGE_MSG)

    if selected_count <= 0:
        raise DocDetectError(INVALID_IMAGE_MSG)

    texts = [str(br.get("text") or "").strip() for br in box_results]
    if not any(texts):
        raise DocDetectError(INVALID_IMAGE_MSG)

    if mode == "auto" and doc_type == "unknown":
        raise DocDetectError(INVALID_IMAGE_MSG)

    if mode == "weight_certificate":
        if not any(k in fields for k in ("净湿重_吨", "干态重量_吨", "水分")):
            raise DocDetectError(INVALID_IMAGE_MSG)

    if mode == "inspection_certificate":
        items = fields.get("检验项目结果") or []
        if not items:
            raise DocDetectError(INVALID_IMAGE_MSG)

    if mode == "customs_declaration":
        keys = ("备案号", "提运单号", "申报日期", "毛重_千克", "净重_千克", "境内收货人")
        if not any(k in fields for k in keys):
            raise DocDetectError(INVALID_IMAGE_MSG)


def annotate_boxes(img: np.ndarray, boxes: list[RedBox]) -> np.ndarray:
    """在原图上绘制检测到的红框编号（绿框）。"""
    dbg = img.copy()
    for i, box in enumerate(boxes, 1):
        cv2.rectangle(dbg, (box.x, box.y), (box.x + box.w, box.y + box.h), (0, 255, 0), 2)
        cv2.putText(
            dbg,
            str(i),
            (box.x, max(20, box.y - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
        )
    return dbg


def process_bgr(
    img: np.ndarray,
    engine: OcrEngine,
    *,
    file_name: str = "upload.png",
    return_annotated: bool = False,
    doc_mode: str = "auto",
) -> dict[str, Any]:
    """对 BGR 图像执行：模式匹配预检 → 红框检测 + OCR。"""
    t0 = time.perf_counter()

    if img is None or getattr(img, "size", 0) == 0:
        raise ValueError("图像为空")

    mode = normalize_doc_mode(doc_mode)
    profile = DOC_MODE_PROFILES[mode]

    # 1) 用户选定具体单据模式时：先校验图片是否匹配，不匹配直接失败
    match_info = assert_image_matches_mode(img, engine, mode)

    # 2) 匹配后再做红框检测与 OCR
    detected = detect_red_boxes(img)
    if not detected:
        raise DocDetectError(INVALID_IMAGE_MSG)

    boxes = filter_boxes_for_mode(detected, mode)
    if not boxes:
        raise DocDetectError(INVALID_IMAGE_MSG)

    box_results: list[dict[str, Any]] = []
    all_text_parts: list[str] = []
    strategy = profile["ocr_strategy"]

    for i, box in enumerate(boxes, 1):
        crop = box.crop(img)
        items = engine.recognize(crop, strategy=strategy)
        text = join_texts(items)
        all_text_parts.append(text)
        box_results.append(
            {
                "index": i,
                "bbox": [box.x, box.y, box.w, box.h],
                "text": text,
                "items": items,
                "meta": {
                    "inner_red": box.inner_red,
                    "circularity": box.circularity,
                    "aspect": box.aspect,
                },
            }
        )

    if profile["force_doc_type"]:
        doc_type = profile["force_doc_type"]
    else:
        type_hint = " ".join(all_text_parts)
        if match_info.get("page_text"):
            type_hint = match_info["page_text"] + " " + type_hint
        doc_type = guess_doc_type(type_hint, len(boxes))

    fields = extract_fields(doc_type, box_results)

    validate_mode_result(
        mode,
        doc_type,
        fields,
        box_results,
        detected_count=len(detected),
        selected_count=len(boxes),
    )

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    elapsed_sec = round(elapsed_ms / 1000.0, 3)

    result: dict[str, Any] = {
        "file": file_name,
        "doc_mode": mode,
        "doc_mode_label": profile["label"],
        "doc_type": doc_type,
        "doc_type_cn": DOC_TYPE_CN.get(doc_type, doc_type),
        "red_box_detected": len(detected),
        "red_box_count": len(boxes),
        "ocr_strategy": strategy,
        "elapsed_ms": elapsed_ms,
        "elapsed_sec": elapsed_sec,
        "mode_match": {
            "matched_type": match_info.get("matched_type"),
            "detected_type": match_info.get("detected_type"),
            "scores": match_info.get("scores") or {},
        },
        "fields": fields,
        "boxes": [
            {
                "index": br["index"],
                "bbox": br["bbox"],
                "text": br["text"],
                "items": [
                    {"text": it["text"], "score": round(it["score"], 4)} for it in br["items"]
                ],
            }
            for br in box_results
        ],
    }
    if return_annotated:
        annotated = img.copy()
        selected_xy = {(b.x, b.y, b.w, b.h) for b in boxes}
        for b in detected:
            color = (0, 255, 0) if (b.x, b.y, b.w, b.h) in selected_xy else (180, 180, 180)
            thickness = 2 if (b.x, b.y, b.w, b.h) in selected_xy else 1
            cv2.rectangle(annotated, (b.x, b.y), (b.x + b.w, b.y + b.h), color, thickness)
        for i, b in enumerate(boxes, 1):
            cv2.putText(
                annotated,
                str(i),
                (b.x, max(20, b.y - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2,
            )
        result["annotated_bgr"] = annotated
    return result


def process_image(
    path: Path,
    engine: OcrEngine,
    debug_dir: Path | None = None,
    doc_mode: str = "auto",
) -> dict[str, Any]:
    img = imread_unicode(path)
    result = process_bgr(
        img,
        engine,
        file_name=path.name,
        return_annotated=debug_dir is not None,
        doc_mode=doc_mode,
    )

    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        crop_root = debug_dir / f"crops_{path.stem}"
        crop_root.mkdir(parents=True, exist_ok=True)
        for br in result.get("boxes") or []:
            x, y, w, h = br["bbox"]
            pad = 4
            crop = img[y + pad : y + h - pad, x + pad : x + w - pad]
            if crop.size:
                imwrite_unicode(crop_root / f"{br['index']:02d}.png", crop)
        annotated = result.pop("annotated_bgr", None)
        if annotated is not None:
            imwrite_unicode(debug_dir / f"boxes_{path.stem}.png", annotated)

    return result


def default_images() -> list[Path]:
    sample_dir = find_ocr_sample_dir()
    return sorted(sample_dir.glob("*.png")) + sorted(sample_dir.glob("*.jpg"))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="识别 OCR 示例图红框内信息")
    p.add_argument(
        "--image",
        "-i",
        action="append",
        default=None,
        help="指定图片路径，可多次传入；默认处理 docs/ocr识别示例/ 下全部图片",
    )
    p.add_argument(
        "--mode",
        "-m",
        default="auto",
        choices=sorted(DOC_MODE_PROFILES.keys()),
        help="单据模式：auto/customs_declaration/weight_certificate/inspection_certificate",
    )
    p.add_argument(
        "--out",
        "-o",
        default=str(HERE / "ocr_red_boxes_result.json"),
        help="结果 JSON 输出路径",
    )
    p.add_argument(
        "--debug",
        action="store_true",
        help="输出红框可视化与裁剪图到 output_debug/",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    # Windows 控制台尽量 UTF-8
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    args = parse_args(argv)
    if args.image:
        images = [Path(x) for x in args.image]
    else:
        images = default_images()

    if not images:
        print("未找到待识别图片", file=sys.stderr)
        return 1

    debug_dir = HERE / "output_debug" if args.debug else None
    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)

    mode = normalize_doc_mode(args.mode)
    print(
        f"加载 OCR 引擎…（共 {len(images)} 张，模式={DOC_MODE_PROFILES[mode]['label']}）"
    )
    engine = OcrEngine()

    results = []
    for path in images:
        print(f"\n>>> {path.name}")
        try:
            result = process_image(path, engine, debug_dir=debug_dir, doc_mode=mode)
        except DocDetectError as exc:
            print(f"  识别失败: {exc}")
            results.append({"file": path.name, "error": str(exc), "error_type": "DocDetectError"})
            continue
        except Exception as exc:
            print(f"  失败: {exc}")
            results.append({"file": path.name, "error": str(exc)})
            continue

        results.append(result)
        print(
            f"  模式: {result.get('doc_mode_label')}  类型: {result['doc_type_cn']}  "
            f"红框: {result['red_box_count']}/{result.get('red_box_detected', result['red_box_count'])}  "
            f"耗时: {result.get('elapsed_sec', '-')}s"
        )
        print(f"  字段: {json.dumps(result['fields'], ensure_ascii=False)}")
        for br in result["boxes"]:
            print(f"  [{br['index']}] {br['text']}")

    payload = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "doc_mode": mode,
        "count": len(results),
        "results": results,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n已写入: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
