#!/usr/bin/env python3
"""Build deterministic compatibility-clone contracts from ONEX evidence catalogs."""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "rebuild-manifest/all_windows_rebuild_status.csv"
UNIFIED = ROOT / "legacy-source/unified_window_contracts.csv"
RUNTIME = ROOT / "legacy-source/window_runtime_contracts.csv"
OUTPUT = ROOT / "rebuild/window-clones/clone_manifest.json"


def rows(path: Path, key: str | None = None) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        items = list(csv.DictReader(handle))
    selected_key = key or next(iter(items[0]))
    return {row[selected_key]: row for row in items}


def normalized_actions(value: str) -> list[str]:
    return [item.strip() for item in value.split("|") if item.strip()]


def build() -> list[dict[str, object]]:
    with MANIFEST.open(encoding="utf-8-sig", newline="") as handle:
        manifest_rows = list(csv.DictReader(handle))
    unified = rows(UNIFIED, "legacy_form")
    runtime = rows(RUNTIME)
    contracts: list[dict[str, object]] = []
    for source in manifest_rows:
        form = source["window"].removesuffix(".fmx")
        unified_row = unified.get(source["window"], {})
        runtime_row = runtime.get(source["window"], {})
        actions = normalized_actions(unified_row.get("actions", ""))
        if not actions:
            operations = normalized_actions(runtime_row.get("inferred_operations", ""))
            actions = ["initialize", "query"] + [op.lower().split("/")[0] for op in operations] + ["refresh", "exit"]
        # Preserve order while removing duplicates from noisy inferred operation lists.
        actions = list(dict.fromkeys(actions))
        contracts.append(
            {
                "legacyForm": source["window"],
                "windowId": unified_row.get("window_id", form),
                "domain": unified_row.get("domain") or runtime_row.get("domain") or source["category"],
                "category": source["category"],
                "coreApi": unified_row.get("core_api") or runtime_row.get("core_api") or "ONEX_OTHER_WINDOW_API",
                "actions": actions,
                "counts": {
                    "fields": int(runtime_row.get("observed_field_count") or unified_row.get("window_field_evidence_count") or 0),
                    "procedures": int(source.get("observed_procedures") or runtime_row.get("observed_procedure_count") or 0),
                    "triggers": int(source.get("observed_triggers") or runtime_row.get("observed_trigger_count") or 0),
                    "tables": int(source.get("observed_table_indicators") or runtime_row.get("observed_table_count") or 0),
                },
                "source": {
                    "manifest": "rebuild-manifest/all_windows_rebuild_status.csv",
                    "unifiedContract": "legacy-source/unified_window_contracts.csv",
                    "runtimeContract": "legacy-source/window_runtime_contracts.csv",
                    "specification": source.get("spec_path", ""),
                    "confidence": runtime_row.get("confidence", "FMX_STRING_EVIDENCE"),
                },
                "rebuild": {
                    "mode": "COMPATIBILITY_CLONE",
                    "sourceForm": source["window"],
                    "sourceAvailable": False,
                    "updateTrack": "FULL_CATALOG_PHASE1",
                    "level": source.get("rebuild_level", "catalog_specification"),
                    "sourceStatus": source.get("source_status", "FMB_PLL_not_found"),
                    "verificationStatus": "CATALOG_ONLY",
                    "productionStatus": unified_row.get("production_status", "NOT_READY_FOR_PRODUCTION"),
                    "requires": ["FMB", "PLL/PLX", "PKS/PKB", "DDL", "Oracle test schema"],
                },
            }
        )
    return sorted(contracts, key=lambda item: str(item["legacyForm"]).lower())


def main() -> None:
    contracts = build()
    payload = {
        "schemaVersion": 1,
        "generatedBy": "scripts/build_window_clone_manifest.py",
        "windowCount": len(contracts),
        "sourceSha256": {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (MANIFEST, UNIFIED, RUNTIME)
        },
        "contracts": contracts,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(contracts)} compatibility-clone contracts at {OUTPUT}")


if __name__ == "__main__":
    main()
