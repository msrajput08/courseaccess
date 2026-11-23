#!/usr/bin/env python3
"""Fetch and verify externally authored CC0 sample documents for the release QA matrix.

Third-party files are fetched at immutable Git commits and verified against
the known Git blob SHA-1 (length-prefixed Git object hash). No external document
is committed, publicly republished or silently modified.
"""
from __future__ import annotations
import hashlib
import json
import time
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/"quality"/"external"
ROOT.mkdir(parents=True,exist_ok=True)
SAMPLES=[
    ("domdomegg/sample-files","d2baa46a5927e00df94f95c6785cefd37d44b360","sample.docx","b3a819e98abc661388c311d0a369f9ad4a6233fa"),
    ("domdomegg/sample-files","d2baa46a5927e00df94f95c6785cefd37d44b360","sample.pptx","89b178dfe1383c6ea964bc6ad0fddf49f9b09aba"),
    ("domdomegg/sample-files","d2baa46a5927e00df94f95c6785cefd37d44b360","sample.xlsx","845dcfd518563fe6b66faf735146c9f574028bb9"),
    ("domdomegg/sample-files","d2baa46a5927e00df94f95c6785cefd37d44b360","sample1_small.pdf","00172f2664eeb926ac57e750ca6b58b6d3e889ac"),
    ("tinytoolkit-org/pdf-sample-files","4fd733c47ead5446b06372ab910cb78d1c7da55e","out/sample-corrupted.pdf","0d0807c30a1310f7d7ab6dca08776ceb2e345fca"),
    ("tinytoolkit-org/pdf-sample-files","4fd733c47ead5446b06372ab910cb78d1c7da55e","out/sample-password-protected.pdf","acbb6ca2491ee5840755ed1b1b02de8b2cbd5c11"),
    ("tinytoolkit-org/pdf-sample-files","4fd733c47ead5446b06372ab910cb78d1c7da55e","out/sample-scanned.pdf","be086b3e2a18235a2d72c3b70a2ecd2733ad148f"),
]
manifest={"sourceLicense":"CC0-1.0","authorization":"Public CC0 samples, original bytes unchanged","samples":[]}
for project,commit,source,blob_hash in SAMPLES:
    url=f"https://raw.githubusercontent.com/{project}/{commit}/{source}"
    data=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"CourseAccess-Release-Audit/1.0"}),timeout=25) as response:
                data=response.read(15_000_001)
                break
        except Exception:
            if attempt==2:raise
            time.sleep(1+attempt)
    if data is None or len(data)>15_000_000:
        raise ValueError("Unexpected or oversized corpus file: "+source)
    actual=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if actual!=blob_hash:
        raise ValueError("Source hash mismatch: "+source+" ("+actual+")")
    name=source.rsplit("/",1)[-1]
    if (ROOT/name).exists():
        raise ValueError("Filename collision: "+name)
    (ROOT/name).write_bytes(data)
    manifest["samples"].append({
      "file":name,"upstream":url,"repository":project,"commit":commit,
      "gitBlobSha1":blob_hash,"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data),
      "sourceType":"independent public sample", "license":"CC0-1.0"
    })
(ROOT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")
print(json.dumps({"downloaded":len(manifest["samples"]),"files":[s["file"] for s in manifest["samples"]]},indent=2))
