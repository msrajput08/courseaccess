# Independent PDF/UA-1 validation

## GitHub Actions

The workflow "Independent PDF/UA validation" generates two PDFs from the actual CourseAccess browser UI (one regular, one STEM-focused), plus a separate positive-control file from Typst's PDF/UA-1 exporter. All three files go through the official veraPDF CLI.

Read the workflow summary, then download artifact "independent-pdfua-evidence" to inspect:
- generated PDFs used in the validation;
- veraPDF XML rule-by-rule reports;
- structured JSON summary;
- validator stderr logs.

A green workflow means the validator produced parseable evidence and correctly recognized the known-good reference. It DOES NOT mean a CourseAccess PDF is PDF/UA conformant. Only a specific file with the corresponding "isCompliant=true" result passes the rules checked in that profile. Independent manual accessibility assessment remains necessary for meaningful figures, equations, tables and navigation.

## Validate a private document on your own machine

With Docker installed, run this from a folder containing document.pdf:

    docker run --rm -v "$(pwd):/data" verapdf/cli:v1.30.4 -f ua1 --format xml /data/document.pdf > pdfua-report.xml

The PDF stays on your computer; unlike hosted demo validators, no third-party server receives its content. Check the "validationReport" attribute "isCompliant" and failed rules in the XML.

## Technical sources

- veraPDF CLI help: https://docs.verapdf.org/cli/help/
- veraPDF validation guide: https://docs.verapdf.org/cli/validation/
- Reference Typst PDF standard: https://typst.app/docs/reference/pdf/
