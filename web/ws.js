// Live connection to the local server, shared by the HUD and the debug view.
// Reconnects with backoff; `hello` (history + state) arrives again after every reconnect.

export function connectLive({ onHello, onEvent, onStatus, onConfig, onState }) {
  let retryMs = 1000;

  function open() {
    onStatus('connecting');
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.addEventListener('open', () => {
      retryMs = 1000;
      onStatus('open');
    });
    ws.addEventListener('message', (msg) => {
      let data;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (data.type === 'hello') onHello(data);
      else if (data.type === 'event') onEvent(data);
      else if (data.type === 'config') onConfig?.(data); // settings saved from any open page
      else if (data.type === 'state') onState?.(data); // state changed without an event (context size)
    });
    ws.addEventListener('close', () => {
      onStatus('closed');
      setTimeout(open, retryMs);
      retryMs = Math.min(retryMs * 2, 5000);
    });
  }

  open();
}
