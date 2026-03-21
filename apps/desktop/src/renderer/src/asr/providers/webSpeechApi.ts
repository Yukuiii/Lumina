import type { AsrAdapter, AsrCallbacks, AsrConfig } from "../types";

/**
 * 基于浏览器 Web Speech API 的 ASR 适配器。
 *
 * 使用 Chromium 内置的 SpeechRecognition，需要联网（底层走 Google 服务）。
 * Push-to-Talk 模式：continuous=true，按住按钮持续识别，松开停止。
 *
 * 注意：recognition.start() 必须在用户手势上下文中同步调用，
 * 否则 Chromium 会抛出 not-allowed 错误。
 */
export function createWebSpeechAdapter(config: AsrConfig, callbacks: AsrCallbacks): AsrAdapter {
  const Ctor = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;

  if (!Ctor) {
    callbacks.onError({ code: "not_supported", message: "当前浏览器不支持 Web Speech API" });
    callbacks.onStatusChange("error");
    return { start: () => {}, stop: () => {}, destroy: () => {} };
  }

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = config.lang;

  let intentionallyStopped = false;
  let destroyed = false;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    if (destroyed) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      callbacks.onResult({
        transcript: result[0].transcript,
        isFinal: result.isFinal
      });
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (destroyed) return;
    console.warn("[ASR]", event.error);

    if (event.error === "aborted" || event.error === "no-speech") {
      return;
    }

    callbacks.onError({ code: event.error, message: event.message || event.error });
    callbacks.onStatusChange("error");
  };

  recognition.onend = () => {
    if (destroyed) return;
    if (!intentionallyStopped) {
      callbacks.onStatusChange("idle");
    }
    intentionallyStopped = false;
  };

  return {
    start: () => {
      if (destroyed) return;
      // 必须同步调用——Chromium 要求 start() 在用户手势上下文中执行。
      intentionallyStopped = false;
      try {
        recognition.start();
      } catch (err) {
        if (err instanceof DOMException && err.name === "InvalidStateError") return;
        callbacks.onError({ code: "start_failed", message: String(err) });
        callbacks.onStatusChange("error");
        return;
      }
      callbacks.onStatusChange("listening");
    },
    stop: () => {
      if (destroyed) return;
      intentionallyStopped = true;
      recognition.stop();
      callbacks.onStatusChange("idle");
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      intentionallyStopped = true;
      recognition.abort();
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    }
  };
}
