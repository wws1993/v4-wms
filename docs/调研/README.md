# OCR 红框识别调研脚本

针对 `docs/ocr识别示例/` 中 3 张标注样例，自动检测红色标注框并识别框内文字。

## 样例与目标字段

| 样例 | 单据类型 | 红框关注点 |
|------|----------|------------|
| `...854_18_8.png` | 海关进口货物报关单 | 收货人/使用单位、申报日期、备案号、提运单号、毛净重、核注清单号、船名、币制金额 |
| `...855_19_8.png` | CCIC 重量证书 | 净湿重、干态重量、水分 |
| `...856_20_8.png` | CCIC 检验证书 | 检验项目（Cu/Ag/Au…）及对应结果 |

## 单据模式（提速）

| 模式 | 行为 |
|------|------|
| `auto` | 识别全部红框，自动判断类型（最全，最慢） |
| `customs_declaration` / 报关单 | 最多 10 框 + 快速 OCR |
| `weight_certificate` / 重量证书 | 只取最多 3 个矮条数字框 |
| `inspection_certificate` / 检验证书 | 只取面积最大的 1 个框 |

失败策略：选定报关单/重量证书/检验证书后，**先做单据类型预检**；与所选模式不匹配时直接返回「无效图片，请重新上传」，不会当其它模式解析。匹配成功后再做红框 OCR。

结果中含识别时长字段：`elapsed_ms` / `elapsed_sec`。

```bash
cd docs/调研
pip install -r requirements.txt
```

## 运行

### 可视化工具（上传图片 + 右侧结果）

```bash
python ocr_app.py
```

浏览器打开后先选 **单据模式**，再上传/载入样例并识别。  
预览：**绿色=实际 OCR**，灰色=检测到但本模式跳过。

### 命令行

```bash
# 自动模式处理全部样例
python ocr_red_boxes.py --debug

# 仅检验证书模式（更快）
python ocr_red_boxes.py -m inspection_certificate -i ../ocr识别示例/微信图片_20260805144856_20_8.png

# 重量证书模式
python ocr_red_boxes.py -m weight_certificate -i ../ocr识别示例/微信图片_20260805144855_19_8.png
```

结果默认写入：`ocr_red_boxes_result.json`  
`--debug` 时额外输出：`output_debug/boxes_*.png`、`output_debug/crops_*/`

## 技术说明

1. **红框检测**：HSV 提取红色 → 轮廓外接矩形 → 用框内红像素占比过滤公章/印章碎片  
2. **单据模式筛选**：按模式限制框数量与形状规则，并降低多尺度 OCR  
3. **文字识别**：RapidOCR（ONNXRuntime，中英混合，Windows 友好）  
4. **结构化**：按单据类型启发式解析字段，原始框文本仍保留在 JSON `boxes` 中便于人工复核
