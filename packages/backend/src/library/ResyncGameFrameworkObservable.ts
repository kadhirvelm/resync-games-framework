import { StreamingEventError } from "@resync-game-framework/api";
import { Observable, Subscriber } from "rxjs";
import { NestJSStreamingEvent } from "../genericTypes/controller";
import { convertErrorToString } from "./utils/convertErroToString";

/**
 * Handles errors and teardowns for a streaming observable.
 */
export function resyncGameFrameworkObservable<Chunk, Finish>(
  promise: (
    subscriber: Subscriber<NestJSStreamingEvent<Chunk, Finish>>,
  ) => Promise<void>,
) {
  return new Observable<NestJSStreamingEvent<Chunk, Finish>>((subscriber) => {
    /**
     * It's important to catch errors here because otherwise the errors are not on the main thread, so they won't
     * be caught by the error handler. Instead we explicitly catch them here, pass them through the subscriber in
     * a way that our frontend knows how to handle it, then we complete the stream.
     */
    promise(subscriber).catch((error) => {
      const streamError: StreamingEventError["data"] = {
        message: convertErrorToString(error),
      };
      subscriber.error(streamError);

      subscriber.complete();
    });

    // If client disconnects early, Node fires 'close' and Nest will call teardown.
    return () => {};
  });
}

export type ResyncGameFrameworkObservable<Chunk, Finish> = ReturnType<
  typeof resyncGameFrameworkObservable<Chunk, Finish>
>;
