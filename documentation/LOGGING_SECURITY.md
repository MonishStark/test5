<!-- @format -->

# Secure Configuration and Constants

## Overview

The Python audio processing modules now use secure enum-based approaches for configuration and named constants for magic numbers, improving both security and maintainability.

## Logging Security Implementation

### Before (Vulnerable)

```python
# Environment variable could contain malicious format strings
LOG_FORMAT = os.environ.get("LOG_FORMAT", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
```

### After (Secure)

```python
from enum import Enum

class LogFormat(Enum):
    """Secure log format enumeration to prevent injection attacks"""
    DEFAULT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    SHORT = "%(levelname)s:%(name)s:%(message)s"
    SIMPLE = "%(asctime)s %(levelname)s %(message)s"

def get_log_format():
    """Get log format from environment with validation against enum values"""
    env_format = os.environ.get("LOG_FORMAT_TYPE", "DEFAULT").upper()
    try:
        return LogFormat[env_format].value
    except KeyError:
        # Fallback to default if invalid format specified
        return LogFormat.DEFAULT.value

LOG_FORMAT = get_log_format()
```

## Usage

### Environment Configuration

```bash
# Valid options: DEFAULT, SHORT, SIMPLE
LOG_FORMAT_TYPE=SHORT

# Invalid values fallback to DEFAULT automatically
LOG_FORMAT_TYPE=INVALID_VALUE  # Uses DEFAULT format
```

### Available Formats

| Format Type | Output Example                                                   |
| ----------- | ---------------------------------------------------------------- |
| `DEFAULT`   | `2025-08-06 10:30:45,123 - utils - INFO - Processing audio file` |
| `SHORT`     | `INFO:utils:Processing audio file`                               |
| `SIMPLE`    | `2025-08-06 10:30:45,123 INFO Processing audio file`             |

## Security Benefits

1. **Injection Prevention**: No arbitrary format strings can be injected
2. **Validation**: Only predefined enum values are accepted
3. **Fallback Safety**: Invalid values automatically use secure defaults
4. **Type Safety**: Python enum provides compile-time validation

## Audio Processing Constants Enhancement

### Configuration Constants Added to `audioProcessor.py`

```python
# Configuration constants
SHUFFLE_SEED_MULTIPLIER = 42  # Multiplier for version-based random seed to ensure reproducible shuffling
DEFAULT_BARS_COUNT = 4        # Default number of bars to extract for intro/outro sections
DEFAULT_BEATS_PER_BAR = 4     # Standard beats per bar in most music
OTHER_STEM_GAIN_DB = 9        # Gain boost for 'other' stem in decibels
MS_PER_SECOND = 1000         # Milliseconds per second conversion factor
MINIMUM_BEATS_BUFFER = 8      # Minimum beats required beyond intro+outro for processing
```

### Benefits

1. **Improved Readability**: Magic numbers replaced with descriptive constants
2. **Easy Configuration**: Change behavior by modifying constants at the top of the file
3. **Documentation**: Each constant includes a clear description of its purpose
4. **Maintainability**: Centralized configuration makes updates safer and easier

## Migration Notes

- Previous `LOG_FORMAT` environment variable is now ignored
- Use `LOG_FORMAT_TYPE` with enum keys instead
- All existing logs will continue working with default format
- Audio processing now uses named constants instead of magic numbers
