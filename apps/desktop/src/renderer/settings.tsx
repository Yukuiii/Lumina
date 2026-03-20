import React from "react";
import ReactDOM from "react-dom/client";
import { SettingsPanel } from "./src/ui/SettingsPanel";
import "./src/styles.css";

/**
 * 设置窗口入口。
 *
 * 独立于主窗口，由 main process 在新 BrowserWindow 中加载。
 * SettingsPanel 在此窗口中占据全部视口，onClose 直接关闭窗口。
 */
function SettingsApp(): React.JSX.Element {
  return (
    <SettingsPanel
      onClose={() => {
        window.close();
      }}
    />
  );
}

const root = document.getElementById("root");

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <SettingsApp />
    </React.StrictMode>
  );
}
