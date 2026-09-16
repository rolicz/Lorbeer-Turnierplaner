/**
 * A9 — a missed broadcast is noticed.
 *
 * Every envelope carries a per-channel `seq` that counts 1, 2, 3…. The client
 * parsed it and threw it away, so a message that never arrived while the socket
 * stayed up was simply lost: no reconnect, no visibility change, nothing that
 * would ever ask the server for the state it described.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribe } from "../hooks/realtime/connection";

type Listener = ((ev: { data: string }) => void) | null;

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: Listener = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  deliver(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

describe("seq gap detection", () => {
  let original: unknown;

  beforeEach(() => {
    original = (globalThis as { WebSocket?: unknown }).WebSocket;
    FakeSocket.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = original;
  });

  function connect() {
    const onMessage = vi.fn();
    const onGap = vi.fn();
    const unsubscribe = subscribe(`ws://test/${Math.random()}`, { onMessage, onGap });
    const sock = FakeSocket.instances[FakeSocket.instances.length - 1];
    sock.open();
    return { onMessage, onGap, sock, unsubscribe };
  }

  it("says nothing while the numbers run on", () => {
    const { onGap, onMessage, sock, unsubscribe } = connect();
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 1 });
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 2 });
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 3 });
    expect(onMessage).toHaveBeenCalledTimes(3);
    expect(onGap).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("fires once when a number is skipped, and still delivers the message", () => {
    const { onGap, onMessage, sock, unsubscribe } = connect();
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 1 });
    sock.deliver({ event: "tournament.sync", payload: { n: 4 }, seq: 4 });
    expect(onGap).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage.mock.calls[1][0]).toMatchObject({ seq: 4 });
    // Back in step from there on.
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 5 });
    expect(onGap).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not fire on the first message of a connect, whatever it is numbered", () => {
    const { onGap, sock, unsubscribe } = connect();
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 812 });
    expect(onGap).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("ignores the seq-less handshake and heartbeat", () => {
    const { onGap, onMessage, sock, unsubscribe } = connect();
    sock.deliver({ event: "connected", payload: {} });
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 1 });
    sock.deliver({ event: "pong", payload: {} });
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 2 });
    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onGap).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("re-baselines after a reconnect, so a restarted server is not a gap", () => {
    const { onGap, sock, unsubscribe } = connect();
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 42 });
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 43 });
    // The server restarted: same socket object here, but a fresh connect.
    sock.open();
    sock.deliver({ event: "tournament.sync", payload: {}, seq: 1 });
    expect(onGap).not.toHaveBeenCalled();
    unsubscribe();
  });
});
