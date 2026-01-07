#!/usr/bin/env python3
"""Proxy script for Claude Explorer API calls from sandboxed environments.

Usage:
    python api_proxy.py <endpoint> [--param value ...]

Examples:
    python api_proxy.py /activity/summary --startDate 2026-01-01 --endDate 2026-01-05
    python api_proxy.py /projects/
    python api_proxy.py /sessions/abc123/todos
    python api_proxy.py /projects/-Users-sam-Projects-foo/sessions/abc123/messages --type user --flatten
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "http://localhost:3001/api/v1"
DOCS_URL = "http://localhost:3001/docs/llms.txt"


def main():
    parser = argparse.ArgumentParser(
        description="Proxy for Claude Explorer API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("endpoint", nargs="?", help="API endpoint path (e.g., /activity/summary)")
    parser.add_argument("--docs", action="store_true", help="Fetch API documentation (llms.txt)")
    parser.add_argument("--startDate", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--endDate", help="End date (YYYY-MM-DD)")
    parser.add_argument("--type", help="Filter: 'user', 'assistant', 'regular', 'agent', 'all'")
    parser.add_argument("--limit", type=int, help="Result limit")
    parser.add_argument("--offset", type=int, help="Pagination offset")
    parser.add_argument("--flatten", action="store_true", help="Flatten message content")
    parser.add_argument("--days", type=int, help="Number of days for activity endpoints")
    args = parser.parse_args()

    # Handle --docs flag: fetch llms.txt documentation
    if args.docs:
        try:
            with urllib.request.urlopen(DOCS_URL, timeout=30) as response:
                print(response.read().decode())
            return
        except urllib.error.URLError as e:
            print(f"Error fetching docs: {e.reason}", file=sys.stderr)
            sys.exit(1)

    # Require endpoint for API calls
    if not args.endpoint:
        parser.error("endpoint is required (or use --docs)")

    # Build query string from provided params
    params = {}
    for key, value in vars(args).items():
        if key == "endpoint":
            continue
        if value is None:
            continue
        if value is False:
            continue
        if key == "flatten":
            params[key] = "true"
        else:
            params[key] = value

    url = f"{BASE_URL}{args.endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = json.load(response)
            print(json.dumps(data, indent=2))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        print(json.dumps({"error": str(e), "status": e.code, "body": error_body}), file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(json.dumps({"error": str(e.reason)}), file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON response: {e}"}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
