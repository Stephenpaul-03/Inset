// One frame in flight and one newest pending frame. ACKs include IDs so late
// messages from a previous connection cannot release the current frame.
export class LatestFrameQueue<T> {
  private pending?: T;
  private inFlight?: number;
  private sequence = 0;
  constructor(private readonly send: (value: T, id: number) => void) {}
  offer(value: T): void { this.pending = value; this.flush(); }
  acknowledge(id: number): void {
    if (this.inFlight !== id) return;
    this.inFlight = undefined;
    this.flush();
  }
  reset(): void { this.pending = undefined; this.inFlight = undefined; }
  private flush(): void {
    if (this.inFlight !== undefined || this.pending === undefined) return;
    const value = this.pending;
    this.pending = undefined;
    this.inFlight = ++this.sequence;
    this.send(value, this.inFlight);
  }
}
