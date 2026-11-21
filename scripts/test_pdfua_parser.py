"""Regression tests: never allow noncompliant PDF/UA specimens past the release gate."""
from __future__ import annotations
import importlib.util
import io
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("pdfua_parser", HERE / "summarize_pdfua.py")
assert SPEC and SPEC.loader
parser = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(parser)

def fake_report(passed: bool) -> str:
    return (
        '<report><validationReport isCompliant="' + ('true' if passed else 'false') +
        '" profileName="PDF/UA-1"><details passedRules="8" failedRules="' +
        ('0' if passed else '1') +
        '" passedChecks="12" failedChecks="' + ('0' if passed else '1') +
        '"/></validationReport></report>'
    )

class IndependentValidatorParserTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.original = parser.REPORTS
        parser.REPORTS = Path(self.temp.name)
        self.addCleanup(lambda: setattr(parser, "REPORTS", self.original))

    def write(self, **results: bool):
        for name, is_ok in results.items():
            (parser.REPORTS / (name + ".xml")).write_text(fake_report(is_ok), encoding="utf-8")

    def check(self):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return parser.main()

    def test_all_three_independent_passes_are_required(self):
        self.write(**{"typst-reference": True, "reading-basic": True, "reading-stem": True})
        self.assertEqual(self.check(), 0)

    def test_generated_basic_failure_blocks_release(self):
        self.write(**{"typst-reference": True, "reading-basic": False, "reading-stem": True})
        self.assertEqual(self.check(), 1)

    def test_generated_stem_failure_blocks_release(self):
        self.write(**{"typst-reference": True, "reading-basic": True, "reading-stem": False})
        self.assertEqual(self.check(), 1)

    def test_reference_failure_invalidates_entire_report(self):
        self.write(**{"typst-reference": False, "reading-basic": True, "reading-stem": True})
        self.assertEqual(self.check(), 1)

    def test_missing_report_never_defaults_to_success(self):
        self.write(**{"typst-reference": True, "reading-basic": True})
        self.assertEqual(self.check(), 1)

if __name__ == "__main__":
    unittest.main()
