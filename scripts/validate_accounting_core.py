#!/usr/bin/env python3
"""Static guardrails for the Oracle accounting reversal workflow."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
schema = (ROOT / "rebuild/accounting_core/database/01_onex_accounting_core.sql").read_text()
api = (ROOT / "rebuild/accounting_core/packages/ONEX_AR_WINDOW_API.sql").read_text()

checks = {
    "reversal link column": "REVERSAL_OF_JOURNAL_ID" in schema,
    "reversal journal insert": "REVERSAL_OF_JOURNAL_ID" in api,
    "reversal lines copied": "FROM ONEX_GL_LINE" in api and "CREDIT,DEBIT" in api,
    "balanced reversal": "assert_balanced(l_reversal_journal)" in api,
    "guarded status transition": all(token in schema for token in (":NEW.STATUS <> 'REVERSED'", ":OLD.STATUS <> 'POSTED'", "DELETING")),
    "reversal audit": "'REVERSE'" in api,
}

failed = [name for name, passed in checks.items() if not passed]
if failed:
    raise SystemExit("Accounting core validation failed: " + ", ".join(failed))
print(f"Accounting core validation passed ({len(checks)} checks)")
