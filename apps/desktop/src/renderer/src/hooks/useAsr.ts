import { useCallback, useEffect, useRef, useState } from "react";
import { createAsrAdapter } from "../asr/createAsrAdapter";
import type { AsrAdapter, AsrConfig, AsrStatus } from "../asr/types";

/** useAsr hook 的返回值。 */
export type UseAsrReturn = {
  /** 当前 ASR 状态。 */
  asrStatus: AsrStatus;
  /** 中间识别文本（识别过程中实时更新，最终结果产出后清空）。 */
  partialTranscript: string;
  /** 浏览器是否支持当前 ASR provider。 */
  isAsrSupported: boolean;
  /** 开始语音识别。 */
  startListening: () => void;
  /** 停止语音识别。 */
  stopListening: () => void;
};

/** 检测浏览器是否支持 Web Speech API。 */
function checkWebSpeechSupport(): boolean {
  return !!(globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition);
}

/**
 * ASR 语音识别 React Hook。
 *
 * 管理适配器生命周期、识别状态和中间文本。
 * 最终识别结果通过 onFinalTranscript 回调传出，由上层连接到 sendTextMessage。
 */
export function useAsr(options: {
  /** 最终识别结果回调。 */
  onFinalTranscript: (text: string) => void;
  /** ASR 配置，从 settings 读取。 */
  asrConfig?: AsrConfig;
}): UseAsrReturn {
  const { onFinalTranscript, asrConfig } = options;

  const [asrStatus, setAsrStatus] = useState<AsrStatus>("idle");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [isAsrSupported] = useState(checkWebSpeechSupport);

  // 稳定引用，避免 adapter 回调中使用过期的 closure。
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const adapterRef = useRef<AsrAdapter | null>(null);
  // 跟踪最新的 partial 文本，用于松开按钮时提交残留文本。
  const partialRef = useRef("");
  // 麦克风权限是否已通过主进程确认。
  const micPermissionRef = useRef(false);

  // 根据配置创建/重建适配器。
  const effectiveConfig: AsrConfig = asrConfig ?? { provider: "web-speech-api", lang: "zh-CN" };
  const configKey = `${effectiveConfig.provider}:${effectiveConfig.lang}`;

  // 提前请求麦克风权限（不阻塞用户手势），以便 start() 可以同步调用。
  useEffect(() => {
    if (!isAsrSupported) return;

    void window.lumina.requestMicPermission().then((result) => {
      micPermissionRef.current = result.status === "granted";
    });
  }, [isAsrSupported]);

  useEffect(() => {
    if (!isAsrSupported) return;

    const adapter = createAsrAdapter(effectiveConfig, {
      onResult: (event) => {
        if (event.isFinal) {
          setPartialTranscript("");
          partialRef.current = "";
          const trimmed = event.transcript.trim();
          if (trimmed) {
            onFinalRef.current(trimmed);
          }
        } else {
          setPartialTranscript(event.transcript);
          partialRef.current = event.transcript;
        }
      },
      onError: (event) => {
        console.warn("[ASR]", event.code, event.message);
      },
      onStatusChange: (status) => {
        setAsrStatus(status);
        if (status === "idle" || status === "error") {
          setPartialTranscript("");
        }
      }
    });

    adapterRef.current = adapter;

    return () => {
      adapter.destroy();
      adapterRef.current = null;
    };
    // configKey 变化时重建适配器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, isAsrSupported]);

  const startListening = useCallback(() => {
    partialRef.current = "";
    adapterRef.current?.start();
  }, []);

  const stopListening = useCallback(() => {
    // 松开按钮时，先提交残留的 partial 文本再停止。
    const remaining = partialRef.current.trim();
    if (remaining) {
      partialRef.current = "";
      setPartialTranscript("");
      onFinalRef.current(remaining);
    }
    adapterRef.current?.stop();
  }, []);

  return {
    asrStatus,
    partialTranscript,
    isAsrSupported,
    startListening,
    stopListening
  };
}
