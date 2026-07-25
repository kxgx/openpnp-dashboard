// ============================================================
// OpenPnP Dashboard - Shared Communication Library
// Provides: discoverDashboard, getDashboardUrl, resetDashboardUrl,
//           asyncHttpPostJson, postToDashboard
// ============================================================

var DASHBOARD_PORT = 10064;
var DISCOVERY_PORT = 10065;
var DISCOVERY_TIMEOUT = 2000;
var STATE_KEY = "dashboard-url";

/**
 * Discover Dashboard via UDP broadcast on the local network.
 * @returns {string|null} Dashboard URL (e.g. "http://192.168.1.5:10064") or null
 */
function discoverDashboard() {
    var DatagramSocket = java.net.DatagramSocket;
    var InetAddress = java.net.InetAddress;
    var DatagramPacket = java.net.DatagramPacket;

    try {
        var socket = new DatagramSocket();
        socket.setSoTimeout(DISCOVERY_TIMEOUT);
        socket.setBroadcast(true);

        var msg = JSON.stringify({ type: "discover" });
        var sendBuf = new java.lang.String(msg).getBytes("UTF-8");
        var sendPacket = new DatagramPacket(
            sendBuf, sendBuf.length,
            InetAddress.getByName("255.255.255.255"),
            DISCOVERY_PORT
        );
        socket.send(sendPacket);

        var recvBuf = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 1024);
        var recvPacket = new DatagramPacket(recvBuf, recvBuf.length);
        socket.receive(recvPacket);

        var data = new java.lang.String(recvPacket.getData(), 0, recvPacket.getLength(), "UTF-8");
        var info = JSON.parse(data);
        socket.close();
        return "http://" + info.host + ":" + info.port;
    } catch (e) {
        try { socket.close(); } catch (e2) {}
        return null;
    }
}

/**
 * Get cached Dashboard URL, or discover + cache it.
 * Uses config.scriptState for persistence across engine pool recycling.
 * Falls back to localhost if discovery fails.
 * @returns {string} Dashboard base URL
 */
function getDashboardUrl() {
    // Persist across scripting engine pool recycling (OpenPnP >= 2.3)
    var cached = config.scriptState.get(STATE_KEY);
    if (cached !== null) return cached;

    var discovered = discoverDashboard();
    if (discovered !== null) {
        config.scriptState.put(STATE_KEY, discovered);
        print("[Dashboard]", "Discovered at:", discovered);
        return discovered;
    }

    var fallback = "http://127.0.0.1:" + DASHBOARD_PORT;
    config.scriptState.put(STATE_KEY, fallback);
    print("[Dashboard]", "Using fallback:", fallback);
    return fallback;
}

/**
 * Reset cached URL. Next getDashboardUrl() call will re-discover.
 */
function resetDashboardUrl() {
    config.scriptState.remove(STATE_KEY);
}

/**
 * Send JSON data to Dashboard asynchronously via HTTP POST.
 * Runs in background thread to avoid blocking OpenPnP.
 * @param {string} url     - Full endpoint URL
 * @param {object} jsonData - Data to send
 */
function asyncHttpPostJson(url, jsonData) {
    var URL = java.net.URL;

    var thread = new java.lang.Thread(function () {
        try {
            var connection = new URL(url).openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setDoOutput(true);

            var jsonString = JSON.stringify(jsonData);
            var outputStream = connection.getOutputStream();
            var writer = new java.io.OutputStreamWriter(outputStream, "UTF-8");
            writer.write(jsonString);
            writer.close();

            var responseCode = connection.getResponseCode();
            var reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(connection.getInputStream())
            );

            var response = "";
            var inputLine;
            while ((inputLine = reader.readLine()) !== null) {
                response += inputLine;
            }
            reader.close();

            var responseData = JSON.parse(response);
            print("[Dashboard]", "OK", responseCode, "-", response);
            return responseData;
        } catch (error) {
            print("[Dashboard]", "Error:", error);
            resetDashboardUrl();
            return null;
        }
    });
    thread.start();
}

/**
 * Convenience: auto-discover Dashboard and POST jsonData.
 * @param {object} jsonData - Data to send to /update-status
 */
function postToDashboard(jsonData) {
    asyncHttpPostJson(getDashboardUrl() + "/update-status", jsonData);
}