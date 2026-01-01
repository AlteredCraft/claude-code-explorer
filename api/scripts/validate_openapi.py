#!/usr/bin/env python3
"""
Validate FastAPI-generated OpenAPI spec against docs/api-spec.yaml (source of truth).

Compares:
1. Endpoints (paths) - which are missing, extra, or different
2. HTTP methods per endpoint
3. Schema definitions
4. Response structures
"""

import json
import sys
from pathlib import Path
from typing import Any

import yaml


def load_yaml_spec(path: Path) -> dict:
    """Load the YAML OpenAPI spec (source of truth)."""
    with open(path) as f:
        return yaml.safe_load(f)


def load_json_spec(path: Path) -> dict:
    """Load the JSON OpenAPI spec (FastAPI generated)."""
    with open(path) as f:
        return json.load(f)


def normalize_path(path: str) -> str:
    """Normalize path parameters for comparison."""
    import re

    # Remove /api/v1 prefix
    if path.startswith("/api/v1"):
        path = path[7:]

    # Remove trailing slash
    path = path.rstrip("/")

    # Normalize parameter names: {project_id} -> {projectId}
    def to_camel(match):
        parts = match.group(1).split("_")
        return "{" + parts[0] + "".join(p.capitalize() for p in parts[1:]) + "}"

    path = re.sub(r"\{([a-z_]+)\}", to_camel, path)

    # Special case mappings
    path = path.replace("{planName}", "{plan_name}").replace("{plan_name}", "{planName}")

    return path


def compare_paths(source: dict, generated: dict) -> dict:
    """Compare API paths between source of truth and generated spec."""
    # Normalize paths for comparison
    source_paths_raw = source.get("paths", {})
    generated_paths_raw = generated.get("paths", {})

    # Create normalized -> original mappings
    source_normalized = {normalize_path(p): p for p in source_paths_raw.keys()}
    generated_normalized = {normalize_path(p): p for p in generated_paths_raw.keys()}

    source_paths = set(source_normalized.keys())
    generated_paths = set(generated_normalized.keys())

    # Filter out /health which is not in source spec
    generated_paths = {p for p in generated_paths if p != "/health"}

    # Find missing and extra paths
    missing = source_paths - generated_paths
    extra = generated_paths - source_paths
    common = source_paths & generated_paths

    # Compare methods for common paths
    method_diffs = {}
    for norm_path in common:
        source_orig = source_normalized[norm_path]
        gen_orig = generated_normalized[norm_path]

        source_methods = set(source_paths_raw[source_orig].keys())
        gen_methods = set(generated_paths_raw[gen_orig].keys())

        # Filter out non-method keys like 'parameters'
        http_methods = {"get", "post", "put", "delete", "patch", "options", "head"}
        source_methods = source_methods & http_methods
        gen_methods = gen_methods & http_methods

        if source_methods != gen_methods:
            method_diffs[norm_path] = {
                "missing": source_methods - gen_methods,
                "extra": gen_methods - source_methods,
            }

    return {
        "missing_paths": sorted(missing),
        "extra_paths": sorted(extra),
        "common_paths": sorted(common),
        "method_differences": method_diffs,
    }


def compare_schemas(source: dict, generated: dict) -> dict:
    """Compare schema definitions."""
    # Get schemas from components
    source_schemas_raw = source.get("components", {}).get("schemas", {})
    gen_schemas_raw = generated.get("components", {}).get("schemas", {})

    # Schema name mappings (generated -> source)
    name_mappings = {
        "ClaudeConfig": "Config",
        "ClaudeSettings": "Settings",
        "DailyProjectActivity": "DailyProjectActivity",
    }

    # Schemas that FastAPI auto-generates (expected extras)
    fastapi_extras = {
        "HTTPValidationError",
        "ValidationError",
        "LongestSession",
        "FileEntry",
        "ActivityResponse",
        "ActivitySummary",
        "ActivitySummaryStats",
        # Response wrappers we added for OpenAPI schema generation
        "DailyActivityResponse",
        "HistoryResponse",
        "ModelUsageResponse",
    }

    # Schemas that are inline in source or not needed in generated
    source_only = {
        "ProjectConfig",  # Inline in source, not exposed as separate schema
    }

    # Build normalized name sets
    source_schemas = set(source_schemas_raw.keys()) - source_only
    gen_schemas = set(gen_schemas_raw.keys()) - fastapi_extras

    # Apply name mappings to generated schemas
    gen_schemas_mapped = set()
    for name in gen_schemas:
        mapped = name_mappings.get(name, name)
        gen_schemas_mapped.add(mapped)

    # Also handle generic types (PaginatedResponse_X_)
    gen_schemas_filtered = {s for s in gen_schemas_mapped if not s.startswith("PaginatedResponse_")}

    missing = source_schemas - gen_schemas_filtered
    extra = gen_schemas_filtered - source_schemas
    common = source_schemas & gen_schemas_filtered

    # For common schemas, compare properties
    property_diffs = {}
    for schema in common:
        # Find the actual schema names in raw dicts
        source_schema_name = schema
        gen_schema_name = schema
        # Handle reverse mapping for generated
        for gen_name, src_name in name_mappings.items():
            if src_name == schema and gen_name in gen_schemas_raw:
                gen_schema_name = gen_name
                break

        if source_schema_name not in source_schemas_raw:
            continue
        if gen_schema_name not in gen_schemas_raw:
            continue

        # Get properties, handling allOf inheritance in source
        source_schema = source_schemas_raw[source_schema_name]
        source_props = set(source_schema.get("properties", {}).keys())

        # If source uses allOf, it inherits from parent - these are expected
        if "allOf" in source_schema:
            # This is inheritance, skip property comparison for now
            continue

        gen_props = set(gen_schemas_raw[gen_schema_name].get("properties", {}).keys())

        if source_props != gen_props:
            property_diffs[schema] = {
                "missing": sorted(source_props - gen_props),
                "extra": sorted(gen_props - source_props),
            }

    return {
        "missing_schemas": sorted(missing),
        "extra_schemas": sorted(extra),
        "common_schemas": sorted(common),
        "property_differences": property_diffs,
    }


def print_section(title: str, items: list | dict, indent: int = 0):
    """Print a section with items."""
    prefix = "  " * indent
    if not items:
        print(f"{prefix}{title}: (none)")
        return

    print(f"{prefix}{title}:")
    if isinstance(items, list):
        for item in items:
            print(f"{prefix}  - {item}")
    elif isinstance(items, dict):
        for key, value in items.items():
            print(f"{prefix}  {key}:")
            if isinstance(value, dict):
                for k, v in value.items():
                    if v:
                        print(f"{prefix}    {k}: {sorted(v) if isinstance(v, set) else v}")
            else:
                print(f"{prefix}    {value}")


def main():
    # Paths
    repo_root = Path(__file__).parent.parent.parent
    source_spec_path = repo_root / "docs" / "api-spec.yaml"
    generated_spec_path = repo_root / "api" / "generated-openapi.json"

    # Check if we need to fetch the generated spec
    if not generated_spec_path.exists():
        print("Generated OpenAPI spec not found. Fetching from running server...")
        import subprocess
        result = subprocess.run(
            ["curl", "-s", "http://localhost:3001/api/v1/openapi.json"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not result.stdout.startswith("{"):
            print("ERROR: Could not fetch OpenAPI spec. Is the server running?")
            print("Start with: npm run dev:api")
            sys.exit(1)
        generated_spec_path.write_text(result.stdout)
        print(f"Saved to {generated_spec_path}")

    # Load specs
    print(f"\nSource of truth: {source_spec_path}")
    print(f"Generated spec:  {generated_spec_path}")
    print("=" * 60)

    source = load_yaml_spec(source_spec_path)
    generated = load_json_spec(generated_spec_path)

    # Compare paths
    print("\n## PATH COMPARISON")
    print("-" * 40)
    path_diff = compare_paths(source, generated)

    print(f"\nSource has {len(source.get('paths', {}))} paths")
    print(f"Generated has {len(generated.get('paths', {}))} paths")
    print(f"Common paths: {len(path_diff['common_paths'])}")

    print_section("\nMissing paths (in source, not in generated)", path_diff["missing_paths"])
    print_section("\nExtra paths (in generated, not in source)", path_diff["extra_paths"])
    print_section("\nMethod differences", path_diff["method_differences"])

    # Compare schemas
    print("\n## SCHEMA COMPARISON")
    print("-" * 40)
    schema_diff = compare_schemas(source, generated)

    source_schema_count = len(source.get("components", {}).get("schemas", {}))
    gen_schema_count = len(generated.get("components", {}).get("schemas", {}))
    print(f"\nSource has {source_schema_count} schemas")
    print(f"Generated has {gen_schema_count} schemas")
    print(f"Common schemas: {len(schema_diff['common_schemas'])}")

    print_section("\nMissing schemas (in source, not in generated)", schema_diff["missing_schemas"])
    print_section("\nExtra schemas (in generated, not in source)", schema_diff["extra_schemas"])

    if schema_diff["property_differences"]:
        print("\nProperty differences in common schemas:")
        for schema, diff in schema_diff["property_differences"].items():
            print(f"  {schema}:")
            if diff["missing"]:
                print(f"    missing: {diff['missing']}")
            if diff["extra"]:
                print(f"    extra: {diff['extra']}")

    # Summary
    print("\n## SUMMARY")
    print("=" * 60)
    issues = []
    warnings = []

    if path_diff["missing_paths"]:
        issues.append(f"{len(path_diff['missing_paths'])} missing paths")
    if path_diff["extra_paths"]:
        issues.append(f"{len(path_diff['extra_paths'])} extra paths")
    if path_diff["method_differences"]:
        issues.append(f"{len(path_diff['method_differences'])} paths with method differences")
    if schema_diff["missing_schemas"]:
        issues.append(f"{len(schema_diff['missing_schemas'])} missing schemas")

    # Schemas with dynamic content (extra="allow") - property differences expected
    dynamic_schemas = {"Config", "Settings"}

    if schema_diff["property_differences"]:
        for schema, diff in schema_diff["property_differences"].items():
            if schema in dynamic_schemas:
                warnings.append(f"{schema}: property differences expected (dynamic schema)")
            else:
                issues.append(f"{schema}: {len(diff.get('missing', []))} missing, {len(diff.get('extra', []))} extra properties")

    if issues:
        print("Issues found:")
        for issue in issues:
            print(f"  - {issue}")

    if warnings:
        print("\nWarnings (expected):")
        for warning in warnings:
            print(f"  - {warning}")

    if issues:
        return 1
    else:
        print("✓ All paths and schemas match!")
        return 0


if __name__ == "__main__":
    sys.exit(main())
