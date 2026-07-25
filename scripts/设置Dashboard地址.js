// ============================================================
// Dashboard URL Setup — popup dialog to enter IP
// Run from OpenPnP Scripts menu
// ============================================================
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

var JOptionPane = javax.swing.JOptionPane;

// Check if already configured
var currentUrl = null;
try {
    currentUrl = config.scriptState.get("dashboard-url");
} catch (e) {}

var defaultIp = "192.168.1.100";
if (currentUrl) {
    // Extract IP from cached URL
    try {
        var u = new java.net.URL(currentUrl);
        defaultIp = u.getHost();
    } catch (e) {}
}

var ip = JOptionPane.showInputDialog(
    null,
    "请输入 Dashboard 机器的 IP 地址:",
    "设置 Dashboard 地址",
    JOptionPane.QUESTION_MESSAGE,
    null,
    null,
    defaultIp
);

if (ip && ip.trim()) {
    ip = ip.trim();
    var url = "http://" + ip + ":" + DASHBOARD_PORT;
    config.scriptState.put("dashboard-url", url);
    print("[Dashboard] URL set to:", url);
} else {
    print("[Dashboard] 已取消设置");
}