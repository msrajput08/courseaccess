#!/usr/bin/env python3
"""Parse veraPDF XML, requiring real validation and a known-good positive control."""
from __future__ import annotations
import json
import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

REPORTS = Path("pdfua-artifacts/reports")
EXPECTED = ("typst-reference", "reading-basic", "reading-stem")

def parse(name: str) -> dict:
    path = REPORTS / (name + ".xml")
    if not path.exists() or path.stat().st_size < 150:
        raise ValueError(name + ": independent report missing or empty")
    root = ET.parse(path).getroot()
    def local(element: ET.Element) -> str:
        return element.tag.rsplit("}", 1)[-1]
    reports = [node for node in root.iter() if local(node) == "validationReport"]
    if len(reports) != 1:
        raise ValueError(f"{name}: expected one validation report, got {len(reports)}")
    report = reports[0]
    value = report.attrib.get("isCompliant")
    if value not in ("true", "false"):
        raise ValueError(name + ": no clear conformance result")
    details = next((x for x in report if local(x) == "details"), None)
    if details is None:
        raise ValueError(name + ": missing validation details")
    failed = int(details.attrib.get("failedRules", -1))
    if failed < 0 or (value == "true" and failed > 0):
        raise ValueError(name + ": inconsistent validation totals")
    failures = []
    for rule in details.iter():
        if local(rule) != "rule" or rule.attrib.get("status") != "failed":
            continue
        description = next((x.text or "" for x in rule if local(x) == "description"), "")
        failures.append({
            "specification": rule.attrib.get("specification"),
            "clause": rule.attrib.get("clause"),
            "testNumber": rule.attrib.get("testNumber"),
            "failedChecks": int(rule.attrib.get("failedChecks", "0")),
            "description": " ".join(description.split())[:400],
        })
    return {
        "name": name,
        "profile": report.attrib.get("profileName", "PDF/UA-1"),
        "compliant": value == "true",
        "passedRules": int(details.attrib.get("passedRules", "0")),
        "failedRules": failed,
        "passedChecks": int(details.attrib.get("passedChecks", "0")),
        "failedChecks": int(details.attrib.get("failedChecks", "0")),
        "failedRuleDetails": failures[:100],
    }

def main() -> int:
    REPORTS.mkdir(parents=True, exist_ok=True)
    try:
        results = {name: parse(name) for name in EXPECTED}
    except Exception as error:
        print(f"::error::{error}", file=sys.stderr)
        return 1
    payload = {
        "tool": "veraPDF CLI", "profile": "PDF/UA-1",
        "certificate": False, "results": results,
    }
    (REPORTS / "validation-summary.json").write_text(json.dumps(payload, indent=2) + "\n")
    lines = [
        "## Independent PDF/UA-1 validation — CourseAccess",
        "",
        "Real veraPDF checks browser-generated PDFs; tag presence is not treated as conformance.",
        "",
        "| Sample | PDF/UA-1 | Failed rules | Failed checks |",
        "|---|---|---:|---:|",
    ]
    for name in EXPECTED:
        item = results[name]
        state = "PASS" if item["compliant"] else "FAIL"
        lines.append(f"| {name} | {state} | {item['failedRules']} | {item['failedChecks']} |")
    lines += ["", "**Diagnostic:** A failed CourseAccess sample is a real detected gap, not hidden success.",
              "Full veraPDF XML and sample PDFs are attached to this workflow.", ""]
    summary = "\n".join(lines)
    (REPORTS / "validation-summary.md").write_text(summary)
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as file:
            file.write(summary)
    if not results["typst-reference"]["compliant"]:
        print("::error::Independent PDF/UA positive control failed; validator run is untrusted.", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
