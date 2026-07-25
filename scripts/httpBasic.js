// ============================================================
// OpenPnP Dashboard - Communication Library
//
// Usage:
//   Local (same machine):  just copy scripts, no config needed
//   Remote (LAN):          set URL via OpenPnP menu or script:
//     config.scriptState.put("dashboard-url", "http://192.168.1.5:10064")
//
// Provides: getDashboardUrl, resetDashboardUrl, asyncHttpPostJson, postToDashboard
// ============================================================

var DASHBOARD_URL_KEY = "dashboard-url";

/**
 * Get Dashboard base URL.
 * Checks config.scriptState first (persistent), falls back to localhost.
 * No UDP discovery — instant, no firewall/network issues.
 * @returns {string} e.g. "http://127.0.0.1:10064"
 */
function getDashboardUrl() {
    try {
        var url = config.scriptState.get(DASHBOARD_URL_KEY);
        if (url) return url;
    } catch (e) {
        print("[Dashboard] config.scriptState unavailable, using localhost");
    }
    return "http://127.0.0.1:10064";
}

/**
 * Reset cached URL. Next call will default to localhost.
 */
function resetDashboardUrl() {
    try {
        config.scriptState.remove(DASHBOARD_URL_KEY);
    } catch (e) {}
}

/**
 * Send JSON data to Dashboard asynchronously via HTTP POST.
 * Runs in background thread — does not block OpenPnP.
 * @param {string} url     - Full endpoint URL
 * @param {object} jsonData - Data to send
 */
function asyncHttpPostJson(url, jsonData) {
    var URL = java.net.URL;
    var Thread = java.lang.Thread;

    var thread = new Thread(function () {
        try {
            var connection = new URL(url).openConnection();
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(3000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);

            var jsonString = JSON.stringify(jsonData);
            var writer = new java.io.OutputStreamWriter(
                connection.getOutputStream(), "UTF-8"
            );
            writer.write(jsonString);
            writer.close();

            var code = connection.getResponseCode();
            if (code >= 200 && code < 300) {
                print("[Dashboard]", "OK " + code + " → " + url);
            } else {
                print("[Dashboard]", "FAIL " + code + " → " + url);
            }
            connection.disconnect();
        } catch (error) {
            print("[Dashboard]", "CANNOT REACH", url, "-", error);
            resetDashboardUrl();
        }
    });
    thread.start();
}

/**
 * Convenience: POST jsonData to Dashboard /update-status.
 * @param {object} jsonData
 */
function postToDashboard(jsonData) {
    asyncHttpPostJson(getDashboardUrl() + "/update-status", jsonData);
}
