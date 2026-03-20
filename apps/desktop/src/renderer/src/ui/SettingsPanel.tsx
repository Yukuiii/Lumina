import React, { useCallback, useEffect, useRef, useState } from "react";

// ─── Provider 默认值映射 ──────────────────────────────────────────

const PROVIDER_OPTIONS = [
  { value: "", label: "请选择…" },
  { value: "openai", label: "OpenAI (Chat Completions)" },
  { value: "openai-responses", label: "OpenAI (Responses)" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" }
] as const;

const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-4.1-mini",
  "openai-responses": "gpt-4.1",
  claude: "claude-sonnet-4-20250514",
  gemini: "gemini-2.5-flash"
};

const PROVIDER_DEFAULT_BASE_URL: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1",
  claude: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta"
};

// ─── Types ───────────────────────────────────────────────────────

type SettingsPanelProps = {
  onClose: () => void;
};

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

// ─── Component ───────────────────────────────────────────────────

/**
 * 设置面板：LLM 配置表单。
 *
 * - 打开时从 main process 加载已有配置
 * - API key 显示掩码 + 修改/清除按钮
 * - 保存时先由 main process 做 merge + validate
 * - 反馈：✅/❌ toast
 */
export function SettingsPanel(props: SettingsPanelProps): React.JSX.Element {
  const { onClose } = props;

  // ── 表单状态 ──
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState(0);

  // ── API key 状态 ──
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyMode, setApiKeyMode] = useState<"display" | "edit">("display");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyCleared, setApiKeyCleared] = useState(false);

  // ── UI 状态 ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ── 卸载时清理所有定时器 ──
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // ── 加载 ──
  useEffect(() => {
    let cancelled = false;

    void window.lumina.getSettings().then((settings) => {
      if (cancelled) return;

      setProvider(settings.llm.provider);
      setHasApiKey(settings.llm.hasApiKey);
      setModel(settings.llm.model);
      setBaseUrl(settings.llm.baseUrl);
      setSystemPrompt(settings.llm.systemPrompt);
      setMaxTokens(settings.llm.maxTokens);
      setApiKeyMode(settings.llm.hasApiKey ? "display" : "edit");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Escape 关闭 ──
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  // ── Toast 自动清除 ──
  const showToast = useCallback((message: string, type: "success" | "error") => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2500);
  }, []);

  // ── 保存 ──
  const handleSave = useCallback(async () => {
    setSaving(true);

    // apiKey 三值语义：edit + 有输入 > cleared > 保留旧值
    let apiKey: string | undefined;

    if (apiKeyMode === "edit" && apiKeyInput) {
      apiKey = apiKeyInput; // 替换（优先于 cleared）
    } else if (apiKeyCleared) {
      apiKey = ""; // 清空
    }
    // else: undefined = 保留旧值

    const result = await window.lumina.saveSettings({
      llm: {
        provider,
        apiKey,
        model,
        baseUrl,
        systemPrompt,
        maxTokens
      }
    });

    setSaving(false);

    if (result.ok) {
      showToast("已保存 ✅", "success");
      closeTimerRef.current = window.setTimeout(onClose, 1500);
    } else {
      showToast(result.error ?? "保存失败", "error");
    }
  }, [provider, apiKeyMode, apiKeyInput, apiKeyCleared, model, baseUrl, systemPrompt, maxTokens, onClose, showToast]);

  // ── API Key 操作 ──
  const handleEditKey = useCallback(() => {
    setApiKeyMode("edit");
    setApiKeyInput("");
    setApiKeyCleared(false);
  }, []);

  const handleClearKey = useCallback(() => {
    setApiKeyCleared(true);
    setApiKeyInput("");
    setApiKeyMode("edit"); // 切到输入态，让用户可以直接输入新 key
    setHasApiKey(false);
  }, []);

  // ── Placeholder ──
  const modelPlaceholder = PROVIDER_DEFAULT_MODEL[provider] ?? "模型 ID";
  const baseUrlPlaceholder = PROVIDER_DEFAULT_BASE_URL[provider] ?? "API 端点";

  if (loading) {
    return (
      <div className="settings-overlay" ref={panelRef}>
        <div className="settings-panel">
          <div className="settings-loading">加载中…</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="settings-overlay"
      ref={panelRef}
      onPointerDown={(e) => {
        if (e.target === panelRef.current) {
          onClose();
        }
      }}
    >
      <div className="settings-panel">
        <div className="settings-header">
          <span className="settings-title">⚙️ 设置</span>
          <button
            className="settings-close-btn"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* Provider */}
          <label className="settings-label">
            LLM 提供商
            <select
              className="settings-select"
              onChange={(e) => setProvider(e.target.value)}
              value={provider}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {/* API Key */}
          <label className="settings-label">
            API Key
            {apiKeyMode === "display" && hasApiKey && !apiKeyCleared ? (
              <div className="settings-key-display">
                <span className="settings-key-mask">••••••••••••</span>
                <button className="settings-key-btn" onClick={handleEditKey} type="button">
                  修改
                </button>
                <button className="settings-key-btn settings-key-btn-danger" onClick={handleClearKey} type="button">
                  清除
                </button>
              </div>
            ) : (
              <input
                autoComplete="off"
                className="settings-input"
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="粘贴 API Key"
                type="password"
                value={apiKeyInput}
              />
            )}
          </label>

          {/* Model */}
          <label className="settings-label">
            模型
            <input
              className="settings-input"
              onChange={(e) => setModel(e.target.value)}
              placeholder={modelPlaceholder}
              type="text"
              value={model}
            />
          </label>

          {/* Base URL */}
          <label className="settings-label">
            API 端点
            <input
              className="settings-input"
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={baseUrlPlaceholder}
              type="text"
              value={baseUrl}
            />
          </label>

          {/* System Prompt */}
          <label className="settings-label">
            系统提示词
            <textarea
              className="settings-textarea"
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="留空使用内置桌宠角色提示词"
              rows={3}
              value={systemPrompt}
            />
          </label>

          {/* Max Tokens */}
          <label className="settings-label">
            Max Tokens
            <input
              className="settings-input"
              min={0}
              onChange={(e) => setMaxTokens(Number(e.target.value) || 0)}
              placeholder="默认"
              type="number"
              value={maxTokens || ""}
            />
          </label>
        </div>

        <div className="settings-footer">
          {toast ? (
            <span className={`settings-toast settings-toast-${toast.type}`}>{toast.message}</span>
          ) : null}
          <button
            className="settings-save-btn"
            disabled={saving}
            onClick={() => void handleSave()}
            type="button"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
