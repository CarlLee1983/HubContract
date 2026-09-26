import { describe, expect, it } from "bun:test";
import { RedisQueueDrain, type QueueState } from "../src/probe/queueDrain";

function fakeDrain(read: (queue: string) => QueueState): RedisQueueDrain {
  const drain = Object.create(RedisQueueDrain.prototype) as RedisQueueDrain;
  drain.readState = async (queue) => read(queue);
  return drain;
}

describe("RedisQueueDrain", () => {
  it("waits for pending, reserved and delayed jobs on both queues", async () => {
    let poll = 0;
    const drain = fakeDrain((queue) => {
      if (queue === "HttpLogging") poll++;
      if (poll === 1) return { pending: queue === "HubWalletSync" ? 1 : 0, reserved: 0, delayed: 0 };
      if (poll === 2) return { pending: 0, reserved: queue === "HubWalletSync" ? 1 : 0, delayed: 0 };
      if (poll === 3) return { pending: 0, reserved: 0, delayed: queue === "HttpLogging" ? 1 : 0 };
      return { pending: 0, reserved: 0, delayed: 0 };
    });
    await drain.waitForIdle(["HubWalletSync", "HttpLogging"], 100, 1);
    expect(poll).toBeGreaterThanOrEqual(5); // two consecutive idle polls
  });

  it("fails with queue counts when work never drains", async () => {
    const drain = fakeDrain(() => ({ pending: 0, reserved: 1, delayed: 0 }));
    await expect(drain.waitForIdle(["HubWalletSync"], 5, 1)).rejects.toThrow(
      /timed out.*HubWalletSync.*reserved.*1/
    );
  });
});
