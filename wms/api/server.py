#!/usr/bin/env python3
"""WMS prototype annotations sync API — stdlib only (no pip / no Docker image)."""
from __future__ import annotations

import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", "3000"))
API_DIR = Path(__file__).resolve().parent
LEGACY_DATA_DIR = API_DIR / "data"
SIBLING_DATA_DIR = API_DIR.parent / "data"


def resolve_data_dir() -> Path:
    env = os.environ.get("WMS_DATA_DIR") or os.environ.get("ANNO_DATA_DIR")
    if not env:
        return SIBLING_DATA_DIR
    resolved = Path(env).resolve()
    if resolved == LEGACY_DATA_DIR.resolve():
        return SIBLING_DATA_DIR
    return resolved


def _looks_like_anno(path: Path) -> bool:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return int(raw.get("revision") or 0) > 0 or (
            isinstance(raw.get("items"), list) and len(raw.get("items") or []) > 0
        )
    except Exception:
        return False


def _looks_like_plans(path: Path) -> bool:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        plans = raw.get("plans") if isinstance(raw, dict) else None
        return isinstance(plans, dict) and len(plans) > 0
    except Exception:
        return False


def migrate_legacy_data(data_dir: Path) -> None:
    if LEGACY_DATA_DIR.resolve() == data_dir.resolve():
        return
    data_dir.mkdir(parents=True, exist_ok=True)
    mapping = [
        ("annotations.json", _looks_like_anno),
        ("floor-plans.json", _looks_like_plans),
    ]
    for name, ok in mapping:
        dest = data_dir / name
        src = LEGACY_DATA_DIR / name
        if not dest.exists() and src.exists() and ok(src):
            dest.write_bytes(src.read_bytes())


DATA_DIR = resolve_data_dir()
migrate_legacy_data(DATA_DIR)
DATA_FILE = DATA_DIR / "annotations.json"
FLOOR_PLAN_FILE = DATA_DIR / "floor-plans.json"
PROGRESS_FILE = DATA_DIR / "dev-progress.json"
_LOCK = threading.Lock()


def empty_store():
    return {"revision": 0, "updatedAt": None, "items": []}


def ensure_store():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(empty_store(), ensure_ascii=False, indent=2), encoding="utf-8")


def read_store():
    ensure_store()
    try:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return empty_store()
        return {
            "revision": int(raw.get("revision") or 0),
            "updatedAt": raw.get("updatedAt"),
            "items": raw.get("items") if isinstance(raw.get("items"), list) else [],
        }
    except Exception:
        return empty_store()


def write_store(store):
    ensure_store()
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DATA_FILE)


def empty_floor_plans():
    return {"updatedAt": None, "plans": {}}


def ensure_floor_plans():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not FLOOR_PLAN_FILE.exists():
        FLOOR_PLAN_FILE.write_text(
            json.dumps(empty_floor_plans(), ensure_ascii=False, indent=2), encoding="utf-8"
        )


def read_floor_plans():
    ensure_floor_plans()
    try:
        raw = json.loads(FLOOR_PLAN_FILE.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return empty_floor_plans()
        plans = raw.get("plans") if isinstance(raw.get("plans"), dict) else {}
        return {"updatedAt": raw.get("updatedAt"), "plans": plans}
    except Exception:
        return empty_floor_plans()


def write_floor_plans(store):
    ensure_floor_plans()
    tmp = FLOOR_PLAN_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(FLOOR_PLAN_FILE)


def normalize_floor_plan(raw):
    if not isinstance(raw, dict):
        return None
    items = raw.get("items") if isinstance(raw.get("items"), list) else []
    if not items:
        return None
    rooms = raw.get("rooms")
    doors = raw.get("doors")
    try:
        rooms_n = max(0, min(200, round(float(rooms)))) if rooms is not None else len(
            [it for it in items if isinstance(it, dict) and it.get("type") in ("room", "zone")]
        )
        doors_n = max(0, min(200, round(float(doors)))) if doors is not None else len(
            [it for it in items if isinstance(it, dict) and it.get("type") == "door"]
        )
    except (TypeError, ValueError):
        rooms_n = 0
        doors_n = 0
    from datetime import datetime, timezone

    saved = str(raw.get("savedAt") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z")
    plan = {"rooms": int(rooms_n), "doors": int(doors_n), "items": items, "savedAt": saved}
    kind = str(raw.get("kind") or "").strip()
    if kind:
        plan["kind"] = kind
    try:
        if raw.get("grid") is not None:
            plan["grid"] = max(8, min(80, int(raw.get("grid"))))
    except (TypeError, ValueError):
        pass
    try:
        if raw.get("gridCols") is not None:
            plan["gridCols"] = max(2, min(200, int(raw.get("gridCols"))))
        if raw.get("gridRows") is not None:
            plan["gridRows"] = max(2, min(200, int(raw.get("gridRows"))))
    except (TypeError, ValueError):
        pass
    try:
        if raw.get("canvasW") is not None:
            plan["canvasW"] = max(400, min(8000, int(raw.get("canvasW"))))
        if raw.get("canvasH") is not None:
            plan["canvasH"] = max(300, min(8000, int(raw.get("canvasH"))))
    except (TypeError, ValueError):
        pass
    if isinstance(raw.get("stackGrids"), dict):
        plan["stackGrids"] = raw.get("stackGrids")
    return plan


WH_PLAN_RE = re.compile(r"^/api/warehouses/([^/]+)/floor-plan$")


def normalize_item(raw, idx):
    if not isinstance(raw, dict):
        return None
    text = str(raw.get("text") or "").strip()
    page_id = str(raw.get("pageId") or "").strip()
    try:
        x = float(raw.get("x"))
        y = float(raw.get("y"))
    except (TypeError, ValueError):
        return None
    if not text or not page_id:
        return None
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    item_id = str(raw.get("id") or "").strip() or f"anno-server-{int(datetime.now().timestamp())}-{idx}"
    return {
        "id": item_id,
        "pageId": page_id,
        "x": min(100.0, max(0.0, x)),
        "y": min(100.0, max(0.0, y)),
        "text": text,
        "author": str(raw.get("author") or "远程用户"),
        "resolved": bool(raw.get("resolved")),
        "createdAt": str(raw.get("createdAt") or now),
        "updatedAt": str(raw.get("updatedAt") or now),
    }


def merge_annotations(server_items, client_items, base_revision, server_revision):
    out = {}
    if base_revision == server_revision:
        for it in client_items:
            out[it["id"]] = it
        return list(out.values())

    for it in server_items:
        out[it["id"]] = it
    for it in client_items:
        prev = out.get(it["id"])
        if not prev or str(it.get("updatedAt") or "") >= str(prev.get("updatedAt") or ""):
            out[it["id"]] = it
    for it in client_items:
        if it.get("_deleted") and it.get("id"):
            out.pop(it["id"], None)
    return list(out.values())


def json_response(handler, status, payload):
    # ASCII JSON：字节长度与字符长度一致，避免入口 Nginx gzip 后仍沿用错误 Content-Length
    body = json.dumps(payload, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode("utf-8")
    handler.close_connection = True
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Connection", "close")
    handler.send_header("Cache-Control", "no-store, no-transform")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,PUT,DELETE,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)
    handler.wfile.flush()


PROG_STATUSES = {"未开始", "进行中", "已完成", "阻塞", "不适用"}
PROG_TRACK_KEYS = ("proto", "ui", "fe", "be", "integ", "test")
PROG_FIELD_LABELS = {
    "proto": "原型设计",
    "ui": "UI设计",
    "fe": "前端开发",
    "be": "后端开发",
    "integ": "前后端对接",
    "test": "测试",
    "feOwner": "前端负责人",
    "beOwner": "后端负责人",
    "qaOwner": "测试负责人",
    "planDate": "计划完成",
    "actualDate": "实际完成",
    "block": "阻塞原因",
    "note": "备注",
}
PROG_EDIT_KEYS = tuple(PROG_FIELD_LABELS.keys())
PROG_TEXT_LIMIT = {"feOwner": 40, "beOwner": 40, "qaOwner": 40, "block": 500, "note": 500}
PROG_CAP_RE = re.compile(r"^CAP-\d{3,4}$")
PROG_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def prog_now_cst():
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone(timedelta(hours=8)))
    return now.strftime("%Y-%m-%dT%H:%M:%S+08:00"), now.strftime("%Y-%m-%d %H:%M:%S")


def client_ip(handler) -> str:
    fwd = handler.headers.get("X-Forwarded-For") or handler.headers.get("X-Real-IP") or ""
    ip = fwd.split(",")[0].strip() if fwd else ""
    if not ip and handler.client_address:
        ip = handler.client_address[0]
    if str(ip).startswith("::ffff:"):
        ip = str(ip)[7:]
    return ip or "未知"


def clip_text(value, limit: int) -> str:
    return str(value or "").replace("\x00", "").strip()[:limit]


def empty_progress():
    return {"revision": 0, "updatedAt": None, "overrides": {}, "logs": []}


def ensure_progress():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PROGRESS_FILE.exists():
        PROGRESS_FILE.write_text(json.dumps(empty_progress(), ensure_ascii=False, indent=2), encoding="utf-8")


def read_progress():
    ensure_progress()
    try:
        raw = json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return empty_progress()
    if not isinstance(raw, dict):
        return empty_progress()
    overrides = raw.get("overrides") if isinstance(raw.get("overrides"), dict) else {}
    logs = raw.get("logs") if isinstance(raw.get("logs"), list) else []
    return {
        "revision": int(raw.get("revision") or 0),
        "updatedAt": raw.get("updatedAt"),
        "overrides": overrides,
        "logs": logs,
    }


def write_progress(store):
    ensure_progress()
    tmp = PROGRESS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(PROGRESS_FILE)


def progress_payload(handler, store):
    return {
        "success": True,
        "data": {
            "revision": store["revision"],
            "updatedAt": store["updatedAt"],
            "clientIp": client_ip(handler),
            "overrides": store["overrides"],
            "logs": store["logs"],
        },
        "message": "ok",
    }


def put_dev_progress(handler, body):
    import time

    if not isinstance(body, dict):
        return json_response(handler, 400, {"success": False, "data": None, "message": "invalid json"})
    cap_id = str(body.get("id") or "").strip()
    if not PROG_CAP_RE.fullmatch(cap_id):
        return json_response(handler, 400, {"success": False, "data": None, "message": "能力编号无效"})
    patch = body.get("patch") if isinstance(body.get("patch"), dict) else {}
    before = body.get("before") if isinstance(body.get("before"), dict) else {}
    operator = clip_text(body.get("operator") or "未知", 40) or "未知"
    operator_user = clip_text(body.get("operatorUser"), 40)
    cap_name = clip_text(body.get("capName"), 80)
    module = clip_text(body.get("module"), 40)

    with _LOCK:
        store = read_progress()
        prev = store["overrides"].get(cap_id) if isinstance(store["overrides"].get(cap_id), dict) else {}

        def old_of(key):
            if key in prev and prev.get(key) is not None:
                return str(prev.get(key)).strip()
            if key in before and before.get(key) is not None:
                return str(before.get(key)).strip()
            return ""

        normalized = {}
        for key in PROG_EDIT_KEYS:
            raw = patch.get(key) if key in patch and patch.get(key) is not None else old_of(key)
            if key in PROG_TRACK_KEYS:
                val = str(raw or "").strip()
                if val not in PROG_STATUSES:
                    return json_response(handler, 400, {"success": False, "data": None, "message": "进度状态不在允许取值内"})
                normalized[key] = val
            elif key in ("planDate", "actualDate"):
                val = str(raw or "").strip()
                if val and not PROG_DATE_RE.fullmatch(val):
                    return json_response(handler, 400, {"success": False, "data": None, "message": "计划完成与实际完成须为日期"})
                normalized[key] = val
            else:
                normalized[key] = clip_text(raw, PROG_TEXT_LIMIT[key])

        if any(normalized[k] == "阻塞" for k in PROG_TRACK_KEYS) and not normalized["block"]:
            return json_response(handler, 400, {"success": False, "data": None, "message": "存在阻塞轨道时必须填写阻塞原因"})

        changes = []
        for key in PROG_EDIT_KEYS:
            old = old_of(key)
            new = normalized[key]
            if old != new:
                changes.append({"field": PROG_FIELD_LABELS[key], "before": old, "after": new})
        if not changes:
            return json_response(handler, 400, {"success": False, "data": None, "message": "没有变更"})

        iso, display = prog_now_cst()
        ip = client_ip(handler)
        item = dict(normalized)
        item.update({
            "updatedAt": iso,
            "updatedAtDisplay": display,
            "updatedBy": operator,
            "updatedIp": ip,
        })
        log = {
            "id": f"plog-{int(time.time() * 1000)}",
            "at": iso,
            "atDisplay": display,
            "ip": ip,
            "operator": operator,
            "operatorUser": operator_user,
            "capId": cap_id,
            "capName": cap_name,
            "module": module,
            "changes": changes,
        }
        logs = [log] + [row for row in store["logs"] if isinstance(row, dict)]
        logs = logs[:500]
        overrides = dict(store["overrides"])
        overrides[cap_id] = item
        next_store = {
            "revision": store["revision"] + 1,
            "updatedAt": iso,
            "overrides": overrides,
            "logs": logs,
        }
        write_progress(next_store)

    return json_response(handler, 200, {
        "success": True,
        "data": {
            "revision": next_store["revision"],
            "updatedAt": iso,
            "clientIp": ip,
            "item": item,
            "log": log,
            "logs": logs,
        },
        "message": "已记录",
    })


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[wms-anno-api]", self.address_string(), "-", fmt % args)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/api/health":
            return json_response(self, 200, {"success": True, "data": {"ok": True}, "message": "ok"})
        if path == "/api/dev-progress":
            with _LOCK:
                store = read_progress()
            return json_response(self, 200, progress_payload(self, store))
        if path == "/api/annotations":
            with _LOCK:
                store = read_store()
            return json_response(
                self,
                200,
                {
                    "success": True,
                    "data": {
                        "revision": store["revision"],
                        "updatedAt": store["updatedAt"],
                        "items": store["items"],
                    },
                    "message": "ok",
                },
            )
        if path in ("/api/floor-plans", "/api/floorplans"):
            try:
                with _LOCK:
                    store = read_floor_plans()
                return json_response(
                    self,
                    200,
                    {
                        "success": True,
                        "data": {"updatedAt": store["updatedAt"], "plans": store["plans"]},
                        "message": "ok",
                    },
                )
            except Exception as exc:
                return json_response(
                    self, 500, {"success": False, "data": None, "message": str(exc) or "读取平面图失败"}
                )
        m = WH_PLAN_RE.match(path)
        if m:
            wid = m.group(1)
            with _LOCK:
                plan = read_floor_plans()["plans"].get(wid)
            return json_response(
                self,
                200,
                {"success": True, "data": plan, "message": "ok" if plan else "未设置"},
            )
        return json_response(self, 404, {"success": False, "data": None, "message": "not found"})

    def do_PUT(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except Exception:
            return json_response(self, 400, {"success": False, "data": None, "message": "invalid json"})

        if path == "/api/dev-progress":
            return put_dev_progress(self, body)

        if path in ("/api/floor-plans", "/api/floorplans"):
            wid = str(body.get("id") or body.get("whId") or "").strip()
            if not wid:
                return json_response(self, 400, {"success": False, "data": None, "message": "平面图编号无效"})
            plan = normalize_floor_plan(body)
            if not plan:
                return json_response(self, 400, {"success": False, "data": None, "message": "平面图须包含 items"})
            with _LOCK:
                store = read_floor_plans()
                store["plans"][wid] = plan
                store["updatedAt"] = plan["savedAt"]
                write_floor_plans(store)
            return json_response(self, 200, {
                "success": True,
                "data": {"id": wid, "rooms": plan["rooms"], "doors": plan["doors"], "savedAt": plan["savedAt"]},
                "message": "ok",
            })

        m = WH_PLAN_RE.match(path)
        if m:
            wid = m.group(1)
            if not wid:
                return json_response(self, 400, {"success": False, "data": None, "message": "平面图编号无效"})
            plan = normalize_floor_plan(body)
            if not plan:
                return json_response(self, 400, {"success": False, "data": None, "message": "平面图须包含 items"})
            with _LOCK:
                store = read_floor_plans()
                store["plans"][wid] = plan
                store["updatedAt"] = plan["savedAt"]
                write_floor_plans(store)
            return json_response(self, 200, {
                "success": True,
                "data": {"id": wid, "rooms": plan["rooms"], "doors": plan["doors"], "savedAt": plan["savedAt"]},
                "message": "ok",
            })

        if path != "/api/annotations":
            return json_response(self, 404, {"success": False, "data": None, "message": "not found"})

        items = body.get("items")
        if not isinstance(items, list):
            return json_response(self, 400, {"success": False, "data": None, "message": "items 须为数组"})

        normalized = []
        for i, raw in enumerate(items):
            item = normalize_item(raw, i)
            if item:
                normalized.append(item)
        deleted_ids = [str(x) for x in (body.get("deletedIds") or [])] if isinstance(body.get("deletedIds"), list) else []
        base_revision = body.get("baseRevision")
        base_revision = int(base_revision) if base_revision is not None else None

        from datetime import datetime, timezone

        with _LOCK:
            store = read_store()
            if base_revision == store["revision"]:
                next_items = [it for it in normalized if it["id"] not in deleted_ids]
                merged = False
            else:
                next_items = merge_annotations(store["items"], normalized, base_revision, store["revision"])
                next_items = [it for it in next_items if it["id"] not in deleted_ids]
                merged = True
            next_store = {
                "revision": store["revision"] + 1,
                "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                "items": next_items,
            }
            write_store(next_store)

        return json_response(
            self,
            200,
            {
                "success": True,
                "data": {
                    "revision": next_store["revision"],
                    "updatedAt": next_store["updatedAt"],
                    "items": next_store["items"],
                    "merged": merged,
                },
                "message": "已合并保存" if merged else "已保存",
            },
        )

    def do_DELETE(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path != "/api/annotations":
            return json_response(self, 404, {"success": False, "data": None, "message": "not found"})
        from datetime import datetime, timezone

        with _LOCK:
            store = read_store()
            next_store = {
                "revision": store["revision"] + 1,
                "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                "items": [],
            }
            write_store(next_store)
        return json_response(
            self,
            200,
            {
                "success": True,
                "data": {
                    "revision": next_store["revision"],
                    "updatedAt": next_store["updatedAt"],
                    "items": [],
                },
                "message": "已清空",
            },
        )


def main():
    ensure_store()
    ensure_floor_plans()
    ensure_progress()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[wms-anno-api] listening on :{PORT}, data={DATA_DIR}")
    server.serve_forever()


if __name__ == "__main__":
    main()
