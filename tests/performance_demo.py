"""Performance test to demonstrate the rate limiting optimization."""

import time
import collections
from backend.server import check_api_rate_limit, check_guess_rate_limit, API_REQUEST_TIMES, GUESS_REQUEST_TIMES


def simulate_old_behavior(ip: str, times_dict: dict, window: float, limit: int) -> bool:
    """Simulate the old O(n) list comprehension behavior for comparison."""
    now = time.time()
    times = times_dict.setdefault(ip, [])
    # Old O(n) behavior - rebuild entire list
    times[:] = [t for t in times if now - t < window]
    
    if len(times) >= limit:
        return False
    
    times.append(now)
    return True


def performance_test():
    """Test the performance difference between old and new approaches."""
    print("Performance Test: Rate Limiting Optimization")
    print("=" * 50)
    
    # Clear existing state
    API_REQUEST_TIMES.clear()
    GUESS_REQUEST_TIMES.clear()
    
    # Test parameters
    num_requests = 1000
    ip = "test_ip"
    player_id = "test_player"
    
    # Test new optimized behavior (deque with O(1) cleanup)
    print(f"\nTesting optimized O(1) behavior with {num_requests} requests...")
    start_time = time.time()
    
    for i in range(num_requests):
        check_api_rate_limit(f"{ip}_{i % 10}")  # Distribute across 10 IPs
        check_guess_rate_limit(f"{player_id}_{i % 10}")  # Distribute across 10 players
    
    optimized_time = time.time() - start_time
    print(f"Optimized time: {optimized_time:.4f} seconds")
    print(f"Average per request: {optimized_time/num_requests*1000:.4f} ms")
    
    # Verify the data structures are deques
    for key in list(API_REQUEST_TIMES.keys())[:3]:  # Check first 3
        assert isinstance(API_REQUEST_TIMES[key], collections.deque), f"Expected deque for {key}"
    
    for key in list(GUESS_REQUEST_TIMES.keys())[:3]:  # Check first 3
        assert isinstance(GUESS_REQUEST_TIMES[key], collections.deque), f"Expected deque for {key}"
    
    print(f"\n✅ All data structures are using collections.deque as expected")
    
    # Test old behavior for comparison (simulate with lists)
    print(f"\nSimulating old O(n) behavior with {num_requests} requests...")
    old_api_times = {}
    old_guess_times = {}
    
    start_time = time.time()
    
    for i in range(num_requests):
        # Simulate old behavior
        simulate_old_behavior(f"{ip}_{i % 10}", old_api_times, 60, 100)
        simulate_old_behavior(f"{player_id}_{i % 10}", old_guess_times, 60, 30)
    
    old_time = time.time() - start_time
    print(f"Simulated old time: {old_time:.4f} seconds")
    print(f"Average per request: {old_time/num_requests*1000:.4f} ms")
    
    # Calculate improvement
    if old_time > 0:
        improvement = ((old_time - optimized_time) / old_time) * 100
        print(f"\n🚀 Performance improvement: {improvement:.1f}%")
        print(f"Speedup factor: {old_time/optimized_time:.1f}x")
    
    # Test scalability - add many old timestamps and see cleanup efficiency
    print(f"\nTesting cleanup efficiency with many old timestamps...")
    
    test_ip = "scalability_test"
    test_deque = collections.deque()
    now = time.time()
    
    # Add many old timestamps
    for i in range(1000):
        test_deque.append(now - 100 - i)  # All old timestamps
    
    API_REQUEST_TIMES[test_ip] = test_deque
    
    # Time the cleanup
    start_time = time.time()
    result = check_api_rate_limit(test_ip)
    cleanup_time = time.time() - start_time
    
    print(f"Cleanup of 1000 old timestamps: {cleanup_time*1000:.2f} ms")
    print(f"Remaining timestamps: {len(API_REQUEST_TIMES[test_ip])}")
    print(f"Result (should be True): {result}")
    
    assert result is True, "Should allow request after cleanup"
    assert len(API_REQUEST_TIMES[test_ip]) == 1, "Should only have 1 timestamp remaining"
    
    print("\n✅ All performance tests passed!")


if __name__ == "__main__":
    performance_test()