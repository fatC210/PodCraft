import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import VoiceStudio from "../../pages/VoiceStudio";

export default function AppLayout() {
  const location = useLocation();
  const isOnCreate = location.pathname === "/create";

  // 首次访问 /create 后才挂载，保持挂载状态直到页面刷新
  const [everVisited, setEverVisited] = useState(isOnCreate);
  useEffect(() => {
    if (isOnCreate) setEverVisited(true);
  }, [isOnCreate]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-16 min-h-screen">
        {everVisited && (
          <div className={isOnCreate ? "" : "hidden"}>
            <VoiceStudio />
          </div>
        )}
        <div className={isOnCreate ? "hidden" : ""}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
