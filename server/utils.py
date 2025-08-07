"""
utils.py

This script analyzes an audio file and extracts useful metadata, including:
- Audio format
- Duration in seconds
- Bitrate
- Estimated tempo (BPM)
- Detected musical key

It uses librosa and pydub for audio analysis and handles errors gracefully with a fallback mechanism.
Run the script from the command line with a file path, and it outputs JSON-formatted metadata.
"""

import sys
import json
import logging
import os
import librosa
import numpy as np
from os import path
from pydub import AudioSegment
from enum import Enum

class LogFormat(Enum):
    """Secure log format enumeration to prevent injection attacks"""
    DEFAULT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    SHORT = "%(levelname)s:%(name)s:%(message)s"
    SIMPLE = "%(asctime)s %(levelname)s %(message)s"

def get_log_format():
    """
    Retrieves the log format string from the environment variable LOG_FORMAT_TYPE,
    validates it against the secure LogFormat enum values, and returns the corresponding format.
    This function helps prevent injection attacks by only allowing predefined log formats.
    Parameters:
        None
    Returns:
        str: A validated log format string from the LogFormat enum. If the environment
             variable is not set or invalid, returns the default log format.
    """
    
    env_format = os.environ.get("LOG_FORMAT_TYPE", "DEFAULT").upper()
    try:
        return LogFormat[env_format].value
    except KeyError:
        # Fallback to default if invalid format specified
        return LogFormat.DEFAULT.value

# Use enum-based log format instead of environment variable for security
LOG_FORMAT = get_log_format()

# Validate LOG_LEVEL against allowed values to prevent injection
ALLOWED_LOG_LEVELS = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"}
env_log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
if env_log_level in ALLOWED_LOG_LEVELS:
    LOG_LEVEL = env_log_level
else:
    LOG_LEVEL = "INFO"
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format=LOG_FORMAT
)
logger = logging.getLogger(__name__)


def get_audio_format(file_path):
    """
    Extracts the audio file format from the given file path.
    
    Parameters:
        file_path (str): The path to the audio file.
    
    Returns:
        str: The file extension (audio format) in lowercase, without the leading dot.
    """
    return path.splitext(file_path)[1][1:].lower()


def get_audio_data(file_path):
    """
    Load audio data from a file using librosa.
    Parameters:
        file_path (str): Path to the audio file.
    Returns:
        tuple: (audio_array, sample_rate) where audio_array is a numpy array of the audio time series,
               and sample_rate is the sampling rate of the audio file.
    """
    return librosa.load(file_path, sr=None)


def get_audio_duration(audio_array, sample_rate):
    """
    Computes the duration of an audio signal.
    Parameters:
        audio_array (np.ndarray): Audio time series data.
        sample_rate (int): Sampling rate of the audio.
    Returns:
        float: Duration of the audio in seconds.
    """
    return librosa.get_duration(y=audio_array, sr=sample_rate)


def get_audio_bitrate(audio):
    """
    Computes the bitrate of an audio file.
    Parameters:
        audio (AudioSegment): The audio segment object.
    Returns:
        int: Bitrate of the audio in kbps.
    """
    return audio.frame_rate * audio.sample_width * audio.channels * 8


def get_audio_tempo(audio_array, sample_rate):
    """
    Detects the tempo (beats per minute, BPM) of an audio signal using librosa.
    
    Parameters:
        audio_array (np.ndarray): Audio time series data.
        sample_rate (int): Sampling rate of the audio.
    
    Returns:
        float: Estimated tempo in BPM.
    """
    onset_env = librosa.onset.onset_strength(y=audio_array, sr=sample_rate)
    return librosa.beat.tempo(onset_envelope=onset_env, sr=sample_rate)[0]


def detect_key(audio_array, sample_rate):
    """
    Detects the musical key of an audio signal using chroma features.
    
    Parameters:
        audio_array (np.ndarray): Audio time series data.
        sample_rate (int): Sampling rate of the audio.
    
    Returns:
        str: Detected musical key and type (e.g., "C major", "A minor").
    """
    chroma = librosa.feature.chroma_cqt(y=audio_array, sr=sample_rate)
    chroma_sum = np.sum(chroma, axis=1)
    key_idx = np.argmax(chroma_sum)

    key_names = ['C', 'C#', 'D', 'D#', 'E', 'F',
                 'F#', 'G', 'G#', 'A', 'A#', 'B']
    key = key_names[key_idx]

    minor_chroma = librosa.feature.chroma_cqt(
        y=audio_array, sr=sample_rate, bins_per_octave=36)
    minor_sum = np.sum(minor_chroma[9:], axis=1) / np.sum(minor_chroma, axis=1)

    key_type = "minor" if np.mean(minor_sum) > 0.2 else "major"
    return f"{key} {key_type}"


def analyze_audio_file(file_path):
    """
    Analyzes an audio file and extracts metadata including format, duration, BPM, key, and
    bitrate.
    Parameters:
        file_path (str): Path to the audio file.
    Returns:
        dict: A dictionary containing the audio metadata.
    """
    logger.info("Analyzing audio file: %s", file_path)

    try:
        logger.info("Starting audio analysis...")
        format_type = get_audio_format(file_path)

        audio_array, sample_rate = get_audio_data(file_path)
        duration = int(get_audio_duration(audio_array, sample_rate))

        audio = AudioSegment.from_file(file_path)
        bitrate = int(get_audio_bitrate(audio))

        tempo = int(round(get_audio_tempo(audio_array, sample_rate)))
        key = detect_key(audio_array, sample_rate)

        info = {
            "format": format_type,
            "duration": duration,
            "bpm": tempo,
            "key": key,
            "bitrate": bitrate
        }

        logger.info("Successfully analyzed audio file: %s", info)
        return info

    except Exception as error:
        logger.error("Error analyzing audio file: %s", str(error))
        return fallback_audio_analysis(file_path)


def fallback_audio_analysis(file_path):
    """
    Fallback analysis for audio files that failed the primary analysis.
    This function attempts to load the audio file using pydub and extract basic metadata.
    Parameters:
        file_path (str): Path to the audio file.
    Returns:
        dict: A dictionary containing basic audio metadata.
    """
    try:
        audio = AudioSegment.from_file(file_path)
        format_type = get_audio_format(file_path)

        return {
            "format": format_type,
            "duration": int(len(audio) / 1000),
            "bpm": 0,
            "key": "Unknown",
            "bitrate": int(get_audio_bitrate(audio))
        }

    except Exception as error:
        logger.error("Fallback analysis failed: %s", str(error))

        return {
            "format": get_audio_format(file_path),
            "duration": 0,
            "bpm": 0,
            "key": "Unknown",
            "bitrate": 0
        }


def is_valid_filepath(file_path):
    """Checks if the provided file path exists and is a valid file.
    Parameters:
        file_path (str): The path to the file to check.
    Returns:
        bool: True if the file exists, False otherwise.
    """
    return path.exists(file_path)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)

    file_path = sys.argv[1]

    if not is_valid_filepath(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    info = analyze_audio_file(file_path)
    print(json.dumps(info))


if __name__ == "__main__":
    main()
