// GoKoreaMate / gokoreamate.com — Priority Queue
// TASK-013: Rule-based Scheduler v1
// Max-heap priority queue for greedy candidate selection.

export interface Prioritized {
  score: number;
}

export class PriorityQueue<T extends Prioritized> {
  private heap: T[] = [];

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  enqueue(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;
    this.swap(0, this.heap.length - 1);
    const top = this.heap.pop();
    this.sinkDown(0);
    return top;
  }

  // Rebuild the queue with adjusted scores (e.g., after zone bonus applied).
  rebuild(items: T[]): void {
    this.heap = [...items];
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.sinkDown(i);
    }
  }

  toArray(): T[] {
    return [...this.heap];
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].score >= this.heap[idx].score) break;
      this.swap(parent, idx);
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const n = this.heap.length;
    while (true) {
      let largest = idx;
      const left  = 2 * idx + 1;
      const right = 2 * idx + 2;

      if (left  < n && this.heap[left].score  > this.heap[largest].score) largest = left;
      if (right < n && this.heap[right].score > this.heap[largest].score) largest = right;

      if (largest === idx) break;
      this.swap(idx, largest);
      idx = largest;
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }
}
