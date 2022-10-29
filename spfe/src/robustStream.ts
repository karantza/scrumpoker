import React from "react";

export default function useRobustStream(
  url: string,
  func: (sse: EventSource) => void
) {
  const streamConnected = React.useRef(false);
  const connectStream = React.useCallback(() => {
    if (streamConnected.current) {
      console.log("stream already connected");
      return;
    }

    console.log("connecting to stream");
    streamConnected.current = true;

    const sse = new EventSource(url, { withCredentials: true });

    const closeSSE = () => {
      console.log('Close sse event handler')
      streamConnected.current = false;
      sse.close()
    }

    window.addEventListener('beforeunload', closeSSE);

    sse.onerror = (e) => {
      console.error("stream error");
      console.error(`${e}`);
    };

    func(sse);

    return () => {
      console.log("closing stream");
      streamConnected.current = false;
      sse.close();
      window.removeEventListener('beforeunload', closeSSE);
    };
  }, [url, func]);

  // Connect on startup
  React.useEffect(connectStream, [connectStream]);
}
