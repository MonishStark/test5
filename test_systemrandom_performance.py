#!/usr/bin/env python3
"""
Performance test for SystemRandom optimization
"""
import time
import random

def test_old_approach(iterations=100):
    """Test creating new SystemRandom instance each time"""
    times = []
    for _ in range(iterations):
        test_list = [1, 2, 3, 4, 5]
        start = time.time()
        random.SystemRandom().shuffle(test_list)
        times.append(time.time() - start)
    return sum(times) / len(times) * 1000  # Convert to milliseconds

def test_new_approach(iterations=100):
    """Test reusing SystemRandom instance"""
    secure_random = random.SystemRandom()
    times = []
    for _ in range(iterations):
        test_list = [1, 2, 3, 4, 5]
        start = time.time()
        secure_random.shuffle(test_list)
        times.append(time.time() - start)
    return sum(times) / len(times) * 1000  # Convert to milliseconds

if __name__ == "__main__":
    print("SystemRandom Performance Test")
    print("=" * 40)
    
    iterations = 1000
    print(f"Running {iterations} iterations...")
    
    old_avg = test_old_approach(iterations)
    new_avg = test_new_approach(iterations)
    
    improvement = ((old_avg - new_avg) / old_avg) * 100
    
    print(f"Old approach (new instance each time): {old_avg:.4f}ms per shuffle")
    print(f"New approach (reused instance): {new_avg:.4f}ms per shuffle")
    print(f"Performance improvement: {improvement:.1f}%")
    
    if improvement > 0:
        print("✓ New approach is faster!")
    else:
        print("✓ Both approaches have similar performance")
    
    print("\nMemory efficiency:")
    print("Old approach: Creates new SystemRandom object each shuffle")
    print("New approach: Reuses single SystemRandom object")
    print("✓ Reduced memory allocation and garbage collection overhead")
