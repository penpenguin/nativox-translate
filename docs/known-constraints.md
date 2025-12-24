# Known Constraints

- Target environment is WSLg (Linux). GUI behavior outside WSLg is not validated.
- External CLI tools (git, gh, glab, agent binaries) must be installed and authenticated separately.
- StateDB lives under the git common directory and uses file locks; multiple concurrent instances are blocked.
- Command approvals are enforced per project; allowlist restrictions may prevent execution.
- Large artifacts are stored by reference only; ensure files remain on disk for downstream nodes.
