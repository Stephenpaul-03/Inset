// A bounded window in flight and one newest pending frame. ACKs include IDs so late
// messages from a previous connection cannot release the current frame.
export class LatestFrameQueue<T> {
  private pending?: T;
  private inFlight = new Set<number>();
  private sequence = 0;
  constructor(private readonly send: (value: T, id: number) => void, private readonly capacity = 1) {}
  offer(value: T): void { this.pending = value; this.flush(); }
  acknowledge(id: number): void {
    if (!this.inFlight.delete(id)) return;
    this.flush();
  }
  reset(): void { this.pending = undefined; this.inFlight.clear(); }
  private flush(): void {
    if (this.inFlight.size >= this.capacity || this.pending === undefined) return;
    const value = this.pending;
    this.pending = undefined;
    const id = ++this.sequence;
    this.inFlight.add(id);
    this.send(value, id);
  }
}
