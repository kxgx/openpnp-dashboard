// ============================================================
// Dashboard 连接测试脚本
// 从 OpenPnP Scripts 菜单运行，测试发现 + HTTP 通信
// ============================================================
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// 清除缓存，强制重新 UDP 发现
try {
    config.scriptState.remove("dashboard-url");
    print("[Dashboard] 已清除缓存，开始 UDP 发现...");
} catch (e) {
    print("[Dashboard] 清除缓存失败:", e);
}

// 触发发现 + 发送测试数据
postToDashboard({
    state: "RUNNING",
    done: 0,
    total: 100,
    nozzles: [
        { id: "N1", isVacActive: false, isPicking: false, isPlacing: false, hasComponent: false },
        { id: "N2", isVacActive: false, isPicking: false, isPlacing: false, hasComponent: false }
    ]
});

print("[Dashboard] 测试脚本执行完毕，等待后台 HTTP 结果...");
