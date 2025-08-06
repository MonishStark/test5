#!/usr/bin/env python3
"""
Test script for log level validation
"""
import os
import logging

# Test the log level validation logic from utils.py
ALLOWED_LOG_LEVELS = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"}

def test_log_level_validation(test_level):
    """Test the log level validation with different inputs"""
    LOG_LEVEL = test_level.upper() if test_level else "INFO"
    if LOG_LEVEL not in ALLOWED_LOG_LEVELS:
        LOG_LEVEL = "INFO"
    return LOG_LEVEL

# Test cases
test_cases = [
    ("DEBUG", "DEBUG"),
    ("info", "INFO"),
    ("ERROR", "ERROR"),
    ("invalid_level", "INFO"),
    ("INJECTION_ATTEMPT", "INFO"),
    ("", "INFO"),
    (None, "INFO")
]

print("Testing log level validation:")
print("=" * 40)
for input_val, expected in test_cases:
    try:
        result = test_log_level_validation(input_val or "")
        status = "✓ PASS" if result == expected else "✗ FAIL"
        print(f"{status} Input: '{input_val}' -> Output: '{result}' (Expected: '{expected}')")
    except Exception as e:
        print(f"✗ ERROR Input: '{input_val}' -> Exception: {e}")

print("\nAll valid Python logging levels:")
valid_levels = ["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"]
for level in valid_levels:
    try:
        # Test that getattr works with our validated levels
        log_level_obj = getattr(logging, level)
        print(f"✓ {level}: {log_level_obj}")
    except AttributeError:
        print(f"✗ {level}: Not found in logging module")
