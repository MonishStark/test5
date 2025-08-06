#!/usr/bin/env python3
"""
Test script for cryptographically secure shuffle validation
"""
import random

def test_system_random_shuffle():
    """Test that SystemRandom provides truly random shuffles"""
    
    # Test data similar to what's used in audioProcessor.py
    intro_labels = ['drums', 'other', 'drums', 'vocals']
    intro_segments = ['segment1', 'segment2', 'segment3', 'segment4']
    
    print("Testing cryptographically secure shuffle:")
    print("=" * 50)
    
    # Generate multiple shuffles to show they're different
    results = []
    for i in range(5):
        intro_zipped = list(zip(intro_labels, intro_segments))
        random.SystemRandom().shuffle(intro_zipped)
        shuffled_order = [label for (label, _) in intro_zipped]
        results.append(shuffled_order)
        print(f"Shuffle {i+1}: {shuffled_order}")
    
    # Check if all results are different (high probability with good randomness)
    unique_results = set(tuple(r) for r in results)
    print(f"\nUnique shuffle patterns: {len(unique_results)} out of {len(results)}")
    
    if len(unique_results) > 1:
        print("✓ PASS: SystemRandom produces varied shuffle patterns")
    else:
        print("⚠ WARNING: All shuffles were identical (low probability but possible)")
    
    # Test that SystemRandom doesn't rely on seed
    print("\nTesting independence from seed:")
    random.seed(12345)  # Set a seed for regular random
    
    # SystemRandom should ignore this seed
    intro_zipped1 = list(zip(intro_labels, intro_segments))
    intro_zipped2 = list(zip(intro_labels, intro_segments))
    
    random.SystemRandom().shuffle(intro_zipped1)
    random.SystemRandom().shuffle(intro_zipped2)
    
    result1 = [label for (label, _) in intro_zipped1]
    result2 = [label for (label, _) in intro_zipped2]
    
    print(f"Result 1 after seed: {result1}")
    print(f"Result 2 after seed: {result2}")
    
    if result1 != result2:
        print("✓ PASS: SystemRandom ignores seed (cryptographically secure)")
    else:
        print("⚠ WARNING: Results were identical (possible but unlikely)")

if __name__ == "__main__":
    test_system_random_shuffle()
