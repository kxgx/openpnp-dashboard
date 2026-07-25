// ============================================================
// OpenPnP Dashboard - Communication Library
//
// Auto-discovery: UDP broadcast → find Dashboard on LAN
// Cache:        config.scriptState (persists across engine pool)
// Fallback:     http://127.0.0.1:10064
//
// Provides: getDashboardUrl, asyncHttpPostJson, postToDashboard
// ============================================================

var DASHBOARD_URL_KEY = "dashboard-url";
var DASHBOARD_PORT = 10064;
var DISCOVERY_PORT = 10065;
var DISCOVERY_TIMEOUT = 500;

/**
 * Discover Dashboard via UDP broadcast.
 * @returns {string|null} e.g. "http://192.168.1.5:10064"
 */
function discoverDashboard() {
    var DatagramSocket = java.net.DatagramSocket;
    var InetAddress = java.net.InetAddress;
    var DatagramPacket = java.net.DatagramPacket;

    var socket = null;
    try {
        socket = new DatagramSocket();
        socket.setSoTimeout(DISCOVERY_TIMEOUT);
        socket.setBroadcast(true);

        var msg = JSON.stringify({ type: "discover" });
        var sendBuf = new java.lang.String(msg).getBytes("UTF-8");

        // 1. Subnet-directed broadcast (same subnet)
        try {
            var localHost = InetAddress.getLocalHost();
            var ip = localHost.getHostAddress();
            var parts = ip.split("\\.");
            if (parts.length === 4) {
                parts[3] = "255";
                var subnetBcast = InetAddress.getByName(parts.join("."));
                var packetSubnet = new DatagramPacket(
                    sendBuf, sendBuf.length,
                    subnetBcast,
                    DISCOVERY_PORT
                );
                socket.send(packetSubnet);
            }
        } catch (e2) { /* skip subnet broadcast */ }

        // 2. Limited broadcast (cross-subnet)
        var packetGlobal = new DatagramPacket(
            sendBuf, sendBuf.length,
            InetAddress.getByName("255.255.255.255"),
            DISCOVERY_PORT
        );
        socket.send(packetGlobal);

        var recvBuf = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 1024);
        var recvPacket = new DatagramPacket(recvBuf, recvBuf.length);
        socket.receive(recvPacket);

        var data = new java.lang.String(recvPacket.getData(), 0, recvPacket.getLength(), "UTF-8");
        var info = JSON.parse(data);
        socket.close();
        return "http://" + info.host + ":" + info.port;
    } catch (e) {
        if (socket) {
            try { socket.close(); } catch (e2) {}
        }
        return null;
    }
}

/**
 * Get Dashboard URL. Cache-first, then UDP discover, then localhost.
 * @returns {string} Dashboard base URL
 */
function getDashboardUrl() {
    // 1. Check persistent cache
    try {
        var cached = config.scriptState.get(DASHBOARD_URL_KEY);
        if (cached) return cached;
    } catch (e) {}

    var url = null;

    // 2. Try UDP discovery on LAN
    try {
        url = discoverDashboard();
        if (url) {
            print("[Dashboard] Discovered:", url);
            config.scriptState.put(DASHBOARD_URL_KEY, url);
            return url;
        }
    } catch (e) {}

    // 3. UDP failed — popup dialog for manual IP input
    var JOptionPane = javax.swing.JOptionPane;
    var ip = JOptionPane.showInputDialog(
        null,
        "UDP 自动发现失败。\n请输入 Dashboard 机器的 IP 地址:",
        "Dashboard 未找到",
        JOptionPane.QUESTION_MESSAGE
    );

    if (ip && ip.trim()) {
        url = "http://" + ip.trim() + ":" + DASHBOARD_PORT;
        config.scriptState.put(DASHBOARD_URL_KEY, url);
        print("[Dashboard] Configured:", url);
        return url;
    }

    // User cancelled — don't cache, will prompt again next time
    print("[Dashboard] No URL configured, skipping");
    return null;
}

/**
 * Send JSON data to Dashboard via background HTTP POST.
 * Does NOT block OpenPnP main thread.
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
                print("[Dashboard]", "OK " + code);
            } else {
                print("[Dashboard]", "FAIL " + code, url);
            }
            connection.disconnect();
        } catch (error) {
            print("[Dashboard]", "CANNOT REACH", url, "-", error);
        }
    });
    thread.start();
}

/**
 * POST jsonData to /update-status.
 */
function postToDashboard(jsonData) {
    var url = getDashboardUrl();
    if (!url) return;
    asyncHttpPostJson(url + "/update-status", jsonData);
}

// ============================================================
// Auto-init: trigger setup on first load if no cached URL
// ============================================================
var _initUrl = getDashboardUrl();
if (_initUrl) {
    print("[Dashboard] Ready:", _initUrl);
    // Send initial heartbeat so Dashboard shows "已连接"
    asyncHttpPostJson(_initUrl + "/update-status", {});
}
