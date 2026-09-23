#!/usr/bin/env python3
import base64
import hashlib
import json
import mimetypes
import os
from pathlib import Path

import blake3
import requests

ROOT = Path(os.environ.get("PAGES_ASSETS_DIR", "dist/public")).resolve()
JWT = os.environ["CF_PAGES_UPLOAD_JWT"]
API = "https://api.cloudflare.com/client/v4"
HEADERS = {"Authorization": f"Bearer {JWT}", "Content-Type": "application/json"}

files = []
for path in sorted(ROOT.rglob("*")):
    if not path.is_file() or path.name in {"_worker.js", "_redirects", "_headers", "_routes.json"}:
        continue
    raw = path.read_bytes()
    rel = "/" + path.relative_to(ROOT).as_posix()
    ext = path.suffix[1:]
    encoded = base64.b64encode(raw).decode("ascii")
    digest = blake3.blake3((encoded + ext).encode("utf-8")).hexdigest()[:32]
    files.append({
        "path": rel,
        "hash": digest,
        "size": len(raw),
        "contentType": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        "value": encoded,
    })

if not files:
    raise SystemExit("No assets found")

manifest = {f["path"]: f["hash"] for f in files}
manifest_path = Path(os.environ.get("PAGES_MANIFEST", "/tmp/onex-pages-manifest.json"))
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))

r = requests.post(f"{API}/pages/assets/check-missing", headers=HEADERS, json={"hashes": [f["hash"] for f in files]}, timeout=120)
r.raise_for_status()
missing = set(r.json()["result"])
print(f"FILES={len(files)} MISSING={len(missing)}")

pending = [f for f in files if f["hash"] in missing]
# Keep request bodies comfortably below the Pages gateway limit.
for offset in range(0, len(pending), 40):
    batch = pending[offset:offset + 40]
    payload = [{"key": f["hash"], "value": f["value"], "metadata": {"contentType": f["contentType"]}, "base64": True} for f in batch]
    u = requests.post(f"{API}/pages/assets/upload", headers=HEADERS, json=payload, timeout=180)
    u.raise_for_status()
    print(f"UPLOADED={min(offset + len(batch), len(pending))}/{len(pending)}")

u = requests.post(f"{API}/pages/assets/upsert-hashes", headers=HEADERS, json={"hashes": [f["hash"] for f in files]}, timeout=120)
u.raise_for_status()
print(f"MANIFEST={manifest_path}")

account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
project_name = os.environ.get("PAGES_PROJECT", "onex-erp-rc1")
branch = os.environ.get("PAGES_BRANCH", "release/v1.0.0-rc.1")
deployment_url = f"{API}/accounts/{account_id}/pages/projects/{project_name}/deployments"
deployment = requests.post(
    deployment_url,
    headers={"Authorization": f"Bearer {JWT}"},
    files={
        "manifest": (None, json.dumps(manifest, separators=(",", ":")), "application/json"),
        "branch": (None, branch),
        "commit_message": (None, "Deploy Cloud Onex ERP v1.0.0-rc.1 independent frontend"),
        "commit_dirty": (None, "true"),
    },
    timeout=180,
)
if not deployment.ok:
    raise RuntimeError(f"Pages deployment failed: HTTP {deployment.status_code} {deployment.text}")
result = deployment.json().get("result", {})
print(f"DEPLOYMENT_ID={result.get('id', '')}")
print(f"DEPLOYMENT_URL={result.get('url', '')}")
print(json.dumps({"manifest": manifest, "files": len(files), "deployment": result}, ensure_ascii=False))
