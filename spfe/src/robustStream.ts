import React from "react";
import ReconnectingEventSource from "reconnecting-eventsource";

export default function useRobustStream(
  url: string,
  func: (sse: ReconnectingEventSource) => void
) {
  const streamConnected = React.useRef(false);
  const connectStream = React.useCallback(() => {
    if (streamConnected.current) {
      console.log("stream already connected");
      return;
    }

    console.log("connecting to stream");
    streamConnected.current = true;

    const sse = new ReconnectingEventSource(url);

    sse.onerror = (e) => {
      console.error("stream error");
      console.error(`${e}`);
      if (sse.readyState !== 1) {
        sse.close()
        streamConnected.current = false;
        connectStream(); // try to reconnect
      }
    };

    func(sse);

    return () => {
      console.log("closing stream");
      streamConnected.current = false;
      sse.close();
    };
  }, [url, func]);

  // Connect on startup
  React.useEffect(connectStream, [connectStream]);
}
