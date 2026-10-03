/**
 * The `k` best items according to `compare` (negative when `a` ranks before `b`), best first.
 * Uses a bounded binary heap whose root is the worst kept item: O(n log k) instead of sorting all n.
 */
export function topK<T>(items: Iterable<T>, k: number, compare: (a: T, b: T) => number): T[] {
  if (k <= 0) return [];
  const heap: T[] = [];
  // In the heap, "worse" items bubble up: parent is worse than (ranks after) its children.
  const worse = (a: T, b: T) => compare(a, b) > 0;

  const siftUp = (i: number) => {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!worse(heap[i]!, heap[parent]!)) break;
      [heap[i], heap[parent]] = [heap[parent]!, heap[i]!];
      i = parent;
    }
  };
  const siftDown = (i: number) => {
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let worst = i;
      if (left < heap.length && worse(heap[left]!, heap[worst]!)) worst = left;
      if (right < heap.length && worse(heap[right]!, heap[worst]!)) worst = right;
      if (worst === i) return;
      [heap[i], heap[worst]] = [heap[worst]!, heap[i]!];
      i = worst;
    }
  };

  for (const item of items) {
    if (heap.length < k) {
      heap.push(item);
      siftUp(heap.length - 1);
    } else if (compare(item, heap[0]!) < 0) {
      heap[0] = item;
      siftDown(0);
    }
  }
  return heap.sort(compare);
}
