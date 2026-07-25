// Dashboard auto-discovery via UDP broadcast
var DASHBOARD_URL = null;

function discoverDashboard() {
    var DatagramSocket = java.net.DatagramSocket;
    var InetAddress = java.net.InetAddress;
    var DatagramPacket = java.net.DatagramPacket;
    try {
        var socket = new DatagramSocket();
        socket.setSoTimeout(2000);
        socket.setBroadcast(true);
        var msg = JSON.stringify({ type: "discover" });
        var sendBuf = new java.lang.String(msg).getBytes("UTF-8");
        var sendPacket = new DatagramPacket(sendBuf, sendBuf.length, 
            InetAddress.getByName("255.255.255.255"), 10065);
        socket.send(sendPacket);
        var recvBuf = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 1024);
        var recvPacket = new DatagramPacket(recvBuf, recvBuf.length);
        socket.receive(recvPacket);
        var data = new java.lang.String(recvPacket.getData(), 0, recvPacket.getLength(), "UTF-8");
        var info = JSON.parse(data);
        socket.close();
        return "http://" + info.host + ":" + info.port;
    } catch (e) { try { socket.close(); } catch (e2) {} return null; }
}

function getDashboardUrl() {
    if (DASHBOARD_URL !== null) return DASHBOARD_URL;
    var discovered = discoverDashboard();
    if (discovered !== null) { DASHBOARD_URL = discovered; return DASHBOARD_URL; }
    DASHBOARD_URL = "http://127.0.0.1:10064";
    return DASHBOARD_URL;
}

function resetDashboardUrl() { DASHBOARD_URL = null; }

function asyncHttpPostJson(url, jsonData) {
    var URL = java.net.URL;
    var HttpURLConnection = java.net.HttpURLConnection;

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
            var reader = new java.io.BufferedReader(new java.io.InputStreamReader(connection.getInputStream()));
            var response = "";
            var inputLine;
            while ((inputLine = reader.readLine()) !== null) { response += inputLine; }
            reader.close();
            var responseData = JSON.parse(response);
            print("[Dashboard]", "Status Code: " + responseCode, "Response: " + response);
            return responseData;
        } catch (error) {
            print("[Dashboard]", "Error:", error);
            resetDashboardUrl();
            return null;
        }
    });
    thread.start();
}

// Use latest API (no deprecated getRootPanelLocation parameter)
var activePlacements = job.getActivePlacements();
var totalActivePlacements = job.getTotalActivePlacements();

var postData = {
    done: totalActivePlacements - activePlacements,
    total: totalActivePlacements,
    state: "",
};

asyncHttpPostJson(getDashboardUrl() + "/update-status", postData);