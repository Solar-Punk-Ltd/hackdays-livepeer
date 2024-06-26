const FIRST_SEGMENT_INDEX = "0000000000000000";

function incrementHexString(hexString, i = 1n) {
  const num = BigInt("0x" + hexString);
  return (num + i).toString(16).padStart(16, "0");
}

export class AsyncQueue {
  indexed;
  index = FIRST_SEGMENT_INDEX;
  waitable;
  clearWaitTime;
  isProcessing = false;
  currentPromiseProcessing = false;
  queue = [];

  constructor(settings) {
    this.indexed = settings.indexed || false;
    this.waitable = settings.waitable || false;
    this.clearWaitTime = settings.clearWaitTime || 1000;
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.currentPromiseProcessing = true;
      const promise = this.queue.shift();
      const action = this.indexed ? () => promise(this.index) : () => promise();

      if (this.waitable) {
        try {
          await action();
          this.index = incrementHexString(this.index);
        } catch (error) {
          console.error("Error processing promise:", error);
          throw error;
        } finally {
          this.currentPromiseProcessing = false;
        }
      } else {
        action()
          .then(() => {
            this.index = incrementHexString(this.index);
          })
          .catch((error) => {
            console.error("Error processing promise:", error);
          })
          .finally(() => {
            this.currentPromiseProcessing = false;
          });
      }
    }

    this.isProcessing = false;
  }

  enqueue(promiseFunction) {
    this.queue.push(promiseFunction);
    this.processQueue();
  }

  async clearQueue() {
    // this.queue = [];
    while (this.isProcessing || this.currentPromiseProcessing) {
      // wait
    }
  }
}
