import streamdeck, {
  action,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import WebSocket from "ws";

const DEVICE_REGEX = /pro_x_2_compact_wireless_mouse/i;

@action({ UUID: "com.evan.logibatt.increment" })
export class Battery extends SingletonAction {
  private ws?: WebSocket;
  private deviceId?: string;
  private lastPayload?: any;
  private retryInterval?: NodeJS.Timeout;

  private connect() {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.ws = new WebSocket("ws://localhost:9010", "json");

    this.ws.on("open", () => {
      streamdeck.logger.info("Websocket connected.");
      this.send("GET", "/devices/list");
    });

    this.ws.on("message", (data) => this.handleMessage(data));

    this.ws.on("error", () => this.ws?.close());

    this.ws.on("close", () => {
      if (!this.actions.next().done) {
        clearTimeout(this.retryInterval);
        this.retryInterval = setTimeout(() => {
          streamdeck.logger.info("Attempting to reconnect to websocket.");
          this.connect();
        }, 10000);
      }
    });
  }

  private handleMessage(data: WebSocket.Data) {
    const msg = JSON.parse(data.toString());
    const payload = msg.payload;

    switch (msg.path) {
      case "/devices/list":
        const device = payload.deviceInfos?.find((d: any) =>
          DEVICE_REGEX.test(d.deviceModel),
        );
        if (device) {
          this.deviceId = device.id;
          this.send("GET", `/battery/${this.deviceId}/state`);
        } else {
          this.ws?.close();
        }
        break;

      case `/battery/${this.deviceId}/state`:
        this.send("SUBSCRIBE", "/battery/state/changed");
        this.updateDisplay(payload);
        break;

      case "/battery/state/changed":
        if (payload?.deviceId === this.deviceId) {
          this.updateDisplay(payload);
        }
        break;
    }
  }

  private send(verb: string, path: string) {
    this.ws?.send(JSON.stringify({ msgid: "", verb, path }));
  }

  private updateDisplay(payload: any) {
    this.lastPayload = payload;

    if (!payload || payload.percentage === undefined) {
      return;
    }

    const pct = payload.percentage;
    const text = payload.fullyCharged
      ? "100%"
      : payload.charging
        ? `⚡${pct}%`
        : `${pct}%`;

    for (const action of this.actions) {
      action.setTitle(text);
    }
  }

  override async onWillAppear(ev: WillAppearEvent<any>): Promise<void> {
    if (this.lastPayload) {
      this.updateDisplay(this.lastPayload);
    } else {
      ev.action.setTitle("...");
    }

    this.connect();
  }

  override async onWillDisappear(ev: WillDisappearEvent<any>): Promise<void> {
    if (this.actions.next().done) {
      clearTimeout(this.retryInterval);
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.close();
        this.ws = undefined;
      }
      streamdeck.logger.info("No more remaining keys.");
    }
  }
}
