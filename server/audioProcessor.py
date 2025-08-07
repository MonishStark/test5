"""
audioProcessor.py

This script processes a music track to generate a remixed version with an optional shuffled intro and outro.

Features:
- Loads the input audio file ('audio.mp3').
- Uses Librosa to detect tempo (BPM) and beat positions.
- Optionally uses Madmom for more accurate tempo and beat tracking.
- Converts beat frames to actual time values.
- Separates audio into stems (vocals, drums, bass, other) using Spleeter (4 stems model).
- Identifies and selects the loudest segments from instrumental stems (bass, drums, other).
- Creates an intro by shuffling and stitching together the loudest instrumental segments.
- Optionally appends an outro using a similar shuffle method.
- Combines intro, original track, and optional outro into a single final remix.
- Saves the final output as 'output.mp3'.
- Also saves metadata (e.g., the shuffle order) in 'shuffle_info.json'.
"""

import sys
import os
import librosa
from pydub import AudioSegment
import json
import tempfile
import subprocess
import logging
import random

# Create a module-level cryptographically secure random generator for efficiency
secure_random = random.SystemRandom()

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration constants
DEFAULT_BARS_COUNT = 4        # Default number of bars to extract for intro/outro sections
DEFAULT_BEATS_PER_BAR = 4     # Standard beats per bar in most music
OTHER_STEM_GAIN_DB = 9        # Gain boost for 'other' stem in decibels
MS_PER_SECOND = 1000         # Milliseconds per second conversion factor
MINIMUM_BEATS_BUFFER = 8      # Minimum beats required beyond intro+outro for processing


try:
    import madmom
except ImportError:
    logger.error(
        "The 'madmom' package is required but not installed.\n"
        "Install it with: pip install madmom\n"
        "System requirements: 'ffmpeg' must be installed and available in your PATH.\n"
        "On Ubuntu/Debian: sudo apt-get install ffmpeg\n"
        "On MacOS (Homebrew): brew install ffmpeg\n"
        "See https://madmom.readthedocs.io/en/latest/installation.html for details."
    )
    raise
try:
    from spleeter.separator import Separator
except ImportError:
    logger.error(
        "The 'spleeter' package is required but not installed.\n"
        "Install it with: pip install spleeter\n"
        "System requirements: 'ffmpeg' and 'tensorflow' must be installed.\n"
        "On Ubuntu/Debian: sudo apt-get install ffmpeg\n"
        "On MacOS (Homebrew): brew install ffmpeg\n"
        "Install TensorFlow with: pip install tensorflow\n"
        "See https://github.com/deezer/spleeter#installation for details."
    )
    raise

def detect_tempo_and_beats(audio_path, method="auto"):
    """Detects the tempo and beats in an audio file using specified methods.
    Parameters:
        audio_path (str): Path to the audio file.
        method (str): Method to use for beat detection ('librosa', 'madmom', or 'auto').
        Returns:
        tuple: (tempo, beat_times) where tempo is in BPM and beat_times is a list of beat times in seconds.
    """
    logger.info("Detecting tempo and beats using %s method", method)

    if method in ("librosa", "auto"):
        try:
            y, sr = librosa.load(audio_path, sr=None)
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            beat_times = librosa.frames_to_time(beats, sr=sr)

            if len(beats) > 0 and tempo > 0:
                logger.info(
                    "Librosa detected tempo: %s BPM with %s beats", tempo, len(beats))
                return tempo, beat_times
            elif method == "librosa":
                logger.warning(
                    "Librosa beat detection failed, but was explicitly requested")
                return None, None
        except Exception as e:
            logger.error("Error in librosa beat detection: %s", str(e))
            if method == "librosa":
                return None, None

    if method in ("madmom", "auto"):
        try:
            from madmom.features.beats import RNNBeatProcessor, BeatTrackingProcessor
            from madmom.features.tempo import TempoEstimationProcessor

            proc = RNNBeatProcessor()(audio_path)
            beats = BeatTrackingProcessor(fps=100)(proc)
            tempo_proc = TempoEstimationProcessor(fps=100)(proc)
            tempo = tempo_proc[0][0]

            logger.info(
                "Madmom detected tempo: %s BPM with %s beats", tempo, len(beats))
            return tempo, beats
        except Exception as e:
            logger.error("Error in madmom beat detection: %s", str(e))

    logger.warning("Beat detection failed with all methods")
    return None, None

def separate_audio_components(audio_path, output_dir):
    """Separates audio into stems using Spleeter.
    Parameters:
        audio_path (str): Path to the input audio file.
        output_dir (str): Directory to save the separated stems.
    Returns:
        list: A list of paths to the separated audio components (vocals, drums, bass
        other).
    """
    logger.info("Starting audio separation with Spleeter")

    try:
        separator = Separator('spleeter:4stems')
        main_song = AudioSegment.from_file(audio_path)
        separator.separate_to_file(audio_path, output_dir)

        base_name = os.path.splitext(os.path.basename(audio_path))[0]
        component_dir = os.path.join(output_dir, base_name)

        components = {
            'vocals': os.path.join(component_dir, 'vocals.wav'),
            'drums': os.path.join(component_dir, 'drums.wav'),
            'bass': os.path.join(component_dir, 'bass.wav'),
            'other': os.path.join(component_dir, 'other.wav')
        }

        for component, path in components.items():
            if not os.path.exists(path):
                logger.warning(
                    "Component %s file not found at %s", component, path)

        logger.info("Audio separation completed successfully")
        return [components, main_song]

    except Exception as e:
        logger.error("Error during audio separation: %s", str(e))
        return None

def pick_loudest_bars(stem, beats_ms, bars=DEFAULT_BARS_COUNT, beats_per_bar=DEFAULT_BEATS_PER_BAR):
    """Picks the loudest segment of the audio stem based on beat positions.
    Parameters:
        stem (AudioSegment): The audio segment to analyze.
        beats_ms (list): List of beat times in milliseconds.
        bars (int): Number of bars to consider for the segment.
        beats_per_bar (int): Number of beats per bar.
    Returns:
        AudioSegment: The loudest segment of the stem.
    """
    total_beats = len(beats_ms)
    window = beats_per_bar * bars
    max_rms = -1
    pick_start = 0
    if total_beats < window + 1:
        return stem
    for i in range(total_beats - window):
        start_ms = int(beats_ms[i])
        end_ms = int(beats_ms[i + window])
        segment = stem[start_ms:end_ms]
        rms = segment.rms
        if rms > max_rms:
            max_rms = rms
            pick_start = i
    start_ms = int(beats_ms[pick_start])
    end_ms = int(beats_ms[pick_start + window])
    return stem[start_ms:end_ms]

def create_extended_mix(components, output_path, intro_bars, outro_bars, _preserve_vocals, _tempo, beat_times, main_song):
    """Creates an extended mix with shuffled intro and outro sections.
    Parameters:
        components (list): List of audio components (vocals, drums, bass, other).
        output_path (str): Path to save the extended mix.
        intro_bars (int): Number of bars for the intro section.
        outro_bars (int): Number of bars for the outro section.
        _preserve_vocals (bool): Whether to preserve vocals in the mix.
        _tempo (float): Detected tempo in BPM.
        beat_times (list): List of beat times in seconds.
        main_song (AudioSegment): The main song segment to append.
    Returns:
        bool: True if the mix was created successfully, False otherwise.
    """
    logger.info(
        "Creating extended mix with %s bars intro and %s bars outro", intro_bars, outro_bars)

    try:
        beats_per_bar = DEFAULT_BEATS_PER_BAR
        intro_beats = intro_bars * beats_per_bar
        outro_beats = outro_bars * beats_per_bar

        if len(beat_times) < (intro_beats + outro_beats + MINIMUM_BEATS_BUFFER):
            logger.warning(
                "Not enough beats detected (%s) for requested extension", len(beat_times))
            return False

        version = 1
        if "_v" in output_path:
            try:
                version = int(output_path.split("_v")[-1].split(".")[0])
            except (ValueError, IndexError):
                pass

        drums = AudioSegment.from_file(components['drums'])
        other = AudioSegment.from_file(components['other']).apply_gain(OTHER_STEM_GAIN_DB)
        vocals = AudioSegment.from_file(components['vocals'])

        beat_times_ms = [t * MS_PER_SECOND for t in beat_times]

        full_intro_drums = pick_loudest_bars(
            drums, beat_times_ms, bars=intro_bars)
        full_intro_other = pick_loudest_bars(
            other, beat_times_ms, bars=intro_bars)
        intro_vocals = pick_loudest_bars(
            vocals, beat_times_ms, bars=intro_bars)

        # Use a cryptographically secure random shuffle for unpredictability
        intro_labels = ['drums', 'other', 'drums', 'vocals']
        intro_segments = [full_intro_drums,
                          full_intro_other, full_intro_drums, intro_vocals]
        intro_zipped = list(zip(intro_labels, intro_segments))
        secure_random.shuffle(intro_zipped)
        intro_components = [seg for (_, seg) in intro_zipped]
        shuffled_intro_order = [label for (label, _) in intro_zipped]

        full_intro = sum(intro_components).fade_in(2000)

        extended_mix = full_intro.append(main_song, crossfade=500)

        extended_mix.export(
            output_path, format=os.path.splitext(output_path)[1][1:])
        logger.info(
            "Extended mix created successfully and saved to %s", output_path)
        return True

    except Exception as e:
        logger.error("Error in create_extended_mix: %s", str(e))
        return False


def process_audio(input_path, output_path, intro_bars=16, outro_bars=16, preserve_vocals=True, beat_detection="auto"):
    """Processes the input audio file to create an extended mix with shuffled intro and outro.
    Parameters:
        input_path (str): Path to the input audio file.
        output_path (str): Path to save the extended mix.
        intro_bars (int): Number of bars for the intro section.
        outro_bars (int): Number of bars for the outro section.
        preserve_vocals (bool): Whether to preserve vocals in the mix.
        beat_detection (str): Method for beat detection (e.g., "auto", "manual").
    Returns:
        bool: True if the mix was created successfully, False otherwise.
    """
    logger.info("Starting audio processing: %s", input_path)
    logger.info(
        "Parameters: intro_bars=%s, outro_bars=%s, preserve_vocals=%s, beat_detection=%s", 
        intro_bars, outro_bars, preserve_vocals, beat_detection)

    try:

        intro_bars = int(intro_bars)
        outro_bars = int(outro_bars)
        preserve_vocals = str(preserve_vocals).lower() == 'true'

        with tempfile.TemporaryDirectory() as temp_dir:

            tempo, beat_times = detect_tempo_and_beats(
                input_path, method=beat_detection)
            if tempo is None or beat_times is None or len(beat_times) == 0:
                logger.error("Beat detection failed, cannot proceed")
                return False

            components, main_song = separate_audio_components(
                input_path, temp_dir)
            if components is None:
                logger.error("Audio separation failed, cannot proceed")
                return False

            success = create_extended_mix(
                components,
                output_path,
                intro_bars,
                outro_bars,
                preserve_vocals,
                tempo,
                beat_times,
                main_song
            )

            return success

    except Exception as e:
        logger.error("Error in audio processing: %s", str(e))
        return False


def main():
    """Main function to handle command line execution."""
    if len(sys.argv) < 3:
        print(
            "Usage: python audioProcessor.py <input_path> <output_path> [intro_bars] [outro_bars] [preserve_vocals] [beat_detection]")
        sys.exit(1)

    audio_input_path = sys.argv[1]
    audio_output_path = sys.argv[2]
    audio_intro_bars = int(sys.argv[3]) if len(sys.argv) > 3 else 16
    audio_outro_bars = int(sys.argv[4]) if len(sys.argv) > 4 else 16
    audio_preserve_vocals = sys.argv[5].lower(
    ) == 'true' if len(sys.argv) > 5 else True
    audio_beat_detection = sys.argv[6] if len(sys.argv) > 6 else "auto"

    processing_success = process_audio(audio_input_path, audio_output_path, audio_intro_bars,
                            audio_outro_bars, audio_preserve_vocals, audio_beat_detection)

    if processing_success:
        print(json.dumps({"status": "success", "output_path": audio_output_path}))
        sys.exit(0)
    else:
        print(json.dumps(
            {"status": "error", "message": "Failed to process audio"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
