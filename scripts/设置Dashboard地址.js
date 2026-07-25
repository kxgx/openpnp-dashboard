// ============================================================
// Dashboard URL Setup — run once from OpenPnP Scripts menu
// Edit the DASHBOARD_IP below, then click this script to save.
// ============================================================

// ★ Edit this to your Dashboard machine's LAN IP ★
var DASHBOARD_IP = "192.168.1.100";

var url = "http://" + DASHBOARD_IP + ":10064";
config.scriptState.put("dashboard-url", url);
print("[Dashboard] URL set to:", url);
print("[Dashboard] Run '重置Dashboard地址' to clear it.");
