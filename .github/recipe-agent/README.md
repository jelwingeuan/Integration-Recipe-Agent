# Partner configuration

Copy `partner.example.json` to `partner.json` and replace every `.invalid` placeholder. The committed configuration may contain public documentation, OpenAPI, and sandbox base URLs only—never credentials.

The generator accepts issue-supplied documentation links only when their hostname appears in `allowedDocsHosts`. OpenAPI server URLs and generated recipe URLs must use `allowedApiHosts`. Hostnames are exact matches; wildcards and redirects are intentionally unsupported in the pilot.
