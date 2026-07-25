/*
 * server.c - OpenPnP Dashboard Backend (C)
 * HTTP server (port 10064) + UDP discovery (port 10065)
 * Single-file, POSIX sockets, no external dependencies.
 *
 * Compile:
 *   Linux/macOS: cc -O2 -o dashboard-server server.c -lpthread
 *   Windows:     cl /O2 /Fe:dashboard-server.exe server.c ws2_32.lib
 */

#ifdef _WIN32
  #ifndef _WIN32_WINNT
    #define _WIN32_WINNT 0x0600
  #endif
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #pragma comment(lib, "ws2_32.lib")
  typedef SOCKET sock_t;
  #define SHUT_RDWR SD_BOTH
  #define close_socket(s) closesocket(s)
  #define THREAD_RET DWORD WINAPI
  #define THREAD_ARG LPVOID
  #define snprintf _snprintf
#else
  #include <sys/socket.h>
  #include <sys/select.h>
  #include <netinet/in.h>
  #include <arpa/inet.h>
  #include <unistd.h>
  #include <pthread.h>
  #include <net/if.h>
  #include <sys/ioctl.h>
  #include <ifaddrs.h>
  typedef int sock_t;
  #define close_socket(s) close(s)
  #define THREAD_RET void*
  #define THREAD_ARG void*
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define HTTP_PORT 10064
#define DISCOVERY_PORT 10065
#define BUFFER_SIZE 4096
#define MAX_STATUS_SIZE 2048

/* ---- Thread-safe machine status ---- */
typedef struct {
    int done;
    int total;
    char state[32];
    /* Fixed nozzle slots: up to 8 nozzles */
    char n_ids[8][16];
    int n_isPicking[8];
    int n_isPlacing[8];
    int n_isVacActive[8];
    int n_hasComponent[8];
    int n_count;
} MachineStatus;

static MachineStatus g_status = {0};
#ifdef _WIN32
static CRITICAL_SECTION g_status_lock;
#define LOCK()   EnterCriticalSection(&g_status_lock)
#define UNLOCK() LeaveCriticalSection(&g_status_lock)
#else
static pthread_mutex_t g_status_lock = PTHREAD_MUTEX_INITIALIZER;
#define LOCK()   pthread_mutex_lock(&g_status_lock)
#define UNLOCK() pthread_mutex_unlock(&g_status_lock)
#endif

/* ---- Minimal JSON helpers (our JSON format is fixed/known) ---- */

/* Extract integer value for key: "key":123 or "key": -5 */
static int json_get_int(const char *json, const char *key) {
    char search[64];
    snprintf(search, sizeof(search), "\"%s\"", key);
    const char *p = strstr(json, search);
    if (!p) return -1;
    p += strlen(search);
    while (*p == ' ' || *p == ':') p++;
    return atoi(p);
}

/* Extract string value for key: "key":"value" */
static void json_get_str(const char *json, const char *key, char *out, int outlen) {
    char search[64];
    snprintf(search, sizeof(search), "\"%s\"", key);
    const char *p = strstr(json, search);
    if (!p) { out[0] = '\0'; return; }
    p += strlen(search);
    while (*p == ' ' || *p == ':' || *p == '"') p++;
    int i = 0;
    while (i < outlen - 1 && *p && *p != '"') out[i++] = *p++;
    out[i] = '\0';
}

/* Extract boolean value: "key":true or "key":false */
static int json_get_bool(const char *json, const char *key) {
    char search[64];
    snprintf(search, sizeof(search), "\"%s\"", key);
    const char *p = strstr(json, search);
    if (!p) return 0;
    p += strlen(search);
    while (*p == ' ' || *p == ':') p++;
    return strncmp(p, "true", 4) == 0;
}

/* ---- Build /status JSON response ---- */
static void build_status_json(char *buf, int buflen) {
    LOCK();
    char nozzles_json[1024] = "";
    char *np = nozzles_json;
    int remain = sizeof(nozzles_json);
    for (int i = 0; i < g_status.n_count; i++) {
        int w = snprintf(np, remain,
            "%s{\"id\":\"%s\",\"isPicking\":%s,\"isPlacing\":%s,"
            "\"isVacActive\":%s,\"hasComponent\":%s}",
            i > 0 ? "," : "",
            g_status.n_ids[i],
            g_status.n_isPicking[i] ? "true" : "false",
            g_status.n_isPlacing[i] ? "true" : "false",
            g_status.n_isVacActive[i] ? "true" : "false",
            g_status.n_hasComponent[i] ? "true" : "false");
        if (w >= remain) break;
        np += w; remain -= w;
    }
    snprintf(buf, buflen,
        "{\"done\":%d,\"total\":%d,\"nozzles\":[%s],\"state\":\"%s\"}",
        g_status.done, g_status.total, nozzles_json, g_status.state);
    UNLOCK();
}

/* Forward declarations for range-limited JSON helpers */
static int json_get_bool_range(const char *start, const char *end, const char *key);
static void json_get_str_range(const char *start, const char *end, const char *key, char *out, int outlen);

/* ---- Parse /update-status JSON and update state ---- */
static void update_status(const char *json) {
    LOCK();
    int done = json_get_int(json, "done");
    int total = json_get_int(json, "total");
    if (done >= 0) g_status.done = done;
    if (total >= 0) g_status.total = total;
    char state[32];
    json_get_str(json, "state", state, sizeof(state));
    if (state[0]) snprintf(g_status.state, sizeof(g_status.state), "%s", state);

    /* Parse nozzles array: find "nozzles":[{...},{...}] */
    const char *arr = strstr(json, "\"nozzles\"");
    if (arr) {
        arr = strchr(arr, '[');
        if (arr) {
            const char *end = strchr(arr, ']');
            if (end) {
                /* Count nozzles */
                int count = 0;
                const char *p = arr;
                while ((p = strchr(p, '{')) && p < end) { count++; p++; }
                if (count > 8) count = 8;

                /* Parse each nozzle object */
                p = arr;
                for (int i = 0; i < count; i++) {
                    p = strchr(p, '{');
                    if (!p || p >= end) break;
                    const char *obj_end = strchr(p, '}');
                    if (!obj_end || obj_end >= end) break;
                    
                    /* Extract fields from this nozzle object */
                    char nid[16];
                    json_get_str_range(p, obj_end, "id", nid, sizeof(nid));
                    if (nid[0]) snprintf(g_status.n_ids[i], sizeof(g_status.n_ids[i]), "%s", nid);
                    
                    g_status.n_isPicking[i]   = json_get_bool_range(p, obj_end, "isPicking");
                    g_status.n_isPlacing[i]   = json_get_bool_range(p, obj_end, "isPlacing");
                    g_status.n_isVacActive[i] = json_get_bool_range(p, obj_end, "isVacActive");
                    g_status.n_hasComponent[i]= json_get_bool_range(p, obj_end, "hasComponent");
                    
                    p = obj_end + 1;
                }
                g_status.n_count = count;
            }
        }
    }
    UNLOCK();
}

/* Range-limited JSON helpers for nozzle parsing */
static int json_get_bool_range(const char *start, const char *end, const char *key) {
    char buf[512];
    int len = (int)(end - start);
    if (len >= (int)sizeof(buf)) len = sizeof(buf) - 1;
    memcpy(buf, start, len);
    buf[len] = '\0';
    return json_get_bool(buf, key);
}

static void json_get_str_range(const char *start, const char *end, const char *key, char *out, int outlen) {
    char buf[512];
    int len = (int)(end - start);
    if (len >= (int)sizeof(buf)) len = sizeof(buf) - 1;
    memcpy(buf, start, len);
    buf[len] = '\0';
    json_get_str(buf, key, out, outlen);
}

/* ---- Minimal HTTP request parser ---- */
typedef struct {
    char method[16];
    char path[256];
} HttpRequest;

static int parse_http_request(const char *data, int len, HttpRequest *req) {
    /* Parse first line: METHOD /path HTTP/1.x */
    const char *line_end = strstr(data, "\r\n");
    if (!line_end) return 0;
    int line_len = (int)(line_end - data);
    if (line_len > 255) return 0;

    char line[256];
    memcpy(line, data, line_len);
    line[line_len] = '\0';

    char *p = line;
    /* Method */
    char *method = p;
    p = strchr(p, ' ');
    if (!p) return 0;
    *p++ = '\0';
    snprintf(req->method, sizeof(req->method), "%.15s", method);

    /* Path */
    while (*p == ' ') p++;
    char *path = p;
    p = strchr(p, ' ');
    if (p) *p = '\0';
    snprintf(req->path, sizeof(req->path), "%.255s", path);

    return 1;
}

/* Extract body from HTTP request (after \r\n\r\n) */
static const char *get_http_body(const char *data, int len) {
    const char *body = strstr(data, "\r\n\r\n");
    if (!body) return NULL;
    return body + 4;
}

/* ---- HTTP response helper ---- */
static void send_response(sock_t client, int code, const char *status, 
                          const char *content_type, const char *body) {
    char response[BUFFER_SIZE];
    int body_len = body ? (int)strlen(body) : 0;
    snprintf(response, sizeof(response),
        "HTTP/1.1 %d %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %d\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Connection: close\r\n"
        "\r\n",
        code, status, content_type, body_len);
    send(client, response, (int)strlen(response), 0);
    if (body && body_len > 0) {
        send(client, body, body_len, 0);
    }
}

/* ---- Handle one HTTP request ---- */
static void handle_http(sock_t client) {
    char buffer[BUFFER_SIZE];
    int n = recv(client, buffer, sizeof(buffer) - 1, 0);
    if (n <= 0) { close_socket(client); return; }
    buffer[n] = '\0';

    HttpRequest req;
    if (!parse_http_request(buffer, n, &req)) {
        send_response(client, 400, "Bad Request", "text/plain", "Bad Request");
        close_socket(client);
        return;
    }

    /* Handle CORS preflight */
    if (strncmp(req.method, "OPTIONS", 7) == 0) {
        char cors[256];
        snprintf(cors, sizeof(cors),
            "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n"
            "Connection: close\r\n\r\n");
        send(client, cors, (int)strlen(cors), 0);
        close_socket(client);
        return;
    }

    if (strcmp(req.path, "/status") == 0 && strncmp(req.method, "GET", 3) == 0) {
        char json[MAX_STATUS_SIZE];
        build_status_json(json, sizeof(json));
        send_response(client, 200, "OK", "application/json", json);
    }
    else if (strcmp(req.path, "/update-status") == 0 && strncmp(req.method, "POST", 4) == 0) {
        const char *body = get_http_body(buffer, n);
        if (body) {
            update_status(body);
            send_response(client, 200, "OK", "application/json", 
                         "{\"message\":\"Status updated successfully\"}");
        } else {
            send_response(client, 400, "Bad Request", "text/plain", "Empty body");
        }
    }
    else {
        send_response(client, 404, "Not Found", "text/plain", "Not Found");
    }

    close_socket(client);
}

/* Worker thread wrapper for handle_http */
static THREAD_RET http_worker(THREAD_ARG arg) {
#ifdef _WIN32
    sock_t client = (SOCKET)(uintptr_t)arg;
#else
    sock_t client = (sock_t)(intptr_t)arg;
#endif
    handle_http(client);
    return 0;
}

/* ---- HTTP server thread ---- */
static THREAD_RET http_thread(THREAD_ARG arg) {
    (void)arg;
    sock_t server = socket(AF_INET, SOCK_STREAM, 0);
#ifdef _WIN32
    if (server == INVALID_SOCKET) {
#else
    if (server == -1) {
#endif
        fprintf(stderr, "HTTP: socket() failed\n");
        return (THREAD_RET)1;
    }

    int opt = 1;
#ifdef _WIN32
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(HTTP_PORT);

    if (bind(server, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        fprintf(stderr, "HTTP: bind port %d failed\n", HTTP_PORT);
        close_socket(server);
        return (THREAD_RET)1;
    }

    if (listen(server, 10) < 0) {
        fprintf(stderr, "HTTP: listen() failed\n");
        close_socket(server);
        return (THREAD_RET)1;
    }

    printf("HTTP server listening on 0.0.0.0:%d\n", HTTP_PORT);

    while (1) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        sock_t client = accept(server, (struct sockaddr*)&client_addr, &client_len);
#ifdef _WIN32
        if (client == INVALID_SOCKET) continue;
#else
        if (client == -1) continue;
#endif

#ifdef _WIN32
        DWORD tid;
        HANDLE th = CreateThread(NULL, 0, http_worker, (LPVOID)(uintptr_t)client, 0, &tid);
        if (th) CloseHandle(th);
#else
        pthread_t th;
        pthread_create(&th, NULL, http_worker, (void*)(intptr_t)client);
        pthread_detach(th);
#endif
    }

    close_socket(server);
    return 0;
}

/* ---- Get local IP address ---- */
static int get_local_ip(char *ip_buf, int buflen) {
#ifdef _WIN32
    char hostname[256];
    gethostname(hostname, sizeof(hostname));
    struct hostent *he = gethostbyname(hostname);
    if (he && he->h_addr_list[0]) {
        struct in_addr addr;
        memcpy(&addr, he->h_addr_list[0], sizeof(addr));
        strncpy(ip_buf, inet_ntoa(addr), buflen);
        return 1;
    }
#else
    struct ifaddrs *ifaddr, *ifa;
    if (getifaddrs(&ifaddr) == 0) {
        for (ifa = ifaddr; ifa; ifa = ifa->ifa_next) {
            if (ifa->ifa_addr && ifa->ifa_addr->sa_family == AF_INET) {
                struct sockaddr_in *sin = (struct sockaddr_in*)ifa->ifa_addr;
                /* Skip loopback */
                if (strncmp(ifa->ifa_name, "lo", 2) != 0) {
                    inet_ntop(AF_INET, &sin->sin_addr, ip_buf, buflen);
                    freeifaddrs(ifaddr);
                    return 1;
                }
            }
        }
        freeifaddrs(ifaddr);
    }
#endif
    strncpy(ip_buf, "127.0.0.1", buflen);
    return 0;
}

/* ---- UDP discovery thread ---- */
static THREAD_RET discovery_thread(THREAD_ARG arg) {
    (void)arg;
    sock_t sock = socket(AF_INET, SOCK_DGRAM, 0);
#ifdef _WIN32
    if (sock == INVALID_SOCKET) {
#else
    if (sock == -1) {
#endif
        fprintf(stderr, "Discovery: socket() failed\n");
        return (THREAD_RET)1;
    }

    int opt = 1;
#ifdef _WIN32
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(DISCOVERY_PORT);

    if (bind(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        fprintf(stderr, "Discovery: bind port %d failed\n", DISCOVERY_PORT);
        close_socket(sock);
        return (THREAD_RET)1;
    }

    char local_ip[64];
    get_local_ip(local_ip, sizeof(local_ip));
    printf("UDP discovery listening on 0.0.0.0:%d (host: %s)\n", DISCOVERY_PORT, local_ip);

    char buffer[512];
    struct sockaddr_in sender;
    socklen_t sender_len;

    while (1) {
        sender_len = sizeof(sender);
        int n = recvfrom(sock, buffer, sizeof(buffer) - 1, 0, 
                        (struct sockaddr*)&sender, &sender_len);
        if (n <= 0) continue;
        buffer[n] = '\0';

        if (strstr(buffer, "\"discover\"")) {
            char response[256];
            snprintf(response, sizeof(response),
                "{\"type\":\"openpnp-dashboard\",\"host\":\"%s\",\"port\":%d}",
                local_ip, HTTP_PORT);
            sendto(sock, response, (int)strlen(response), 0,
                  (struct sockaddr*)&sender, sender_len);
        }
    }

    close_socket(sock);
    return 0;
}

/* ---- Main ---- */
int main(void) {
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
    InitializeCriticalSection(&g_status_lock);
#endif

    /* Initialize status with 2 default nozzles */
    g_status.done = 0;
    g_status.total = 0;
    g_status.state[0] = '\0';
    g_status.n_count = 2;
    strncpy(g_status.n_ids[0], "N1", sizeof(g_status.n_ids[0]) - 1);
    strncpy(g_status.n_ids[1], "N2", sizeof(g_status.n_ids[1]) - 1);

    printf("OpenPnP Dashboard Server v1.0 (C)\n");

    /* Start threads */
#ifdef _WIN32
    HANDLE h1 = CreateThread(NULL, 0, http_thread, NULL, 0, NULL);
    HANDLE h2 = CreateThread(NULL, 0, discovery_thread, NULL, 0, NULL);
    WaitForSingleObject(h1, INFINITE);
    WaitForSingleObject(h2, INFINITE);
    CloseHandle(h1);
    CloseHandle(h2);
    DeleteCriticalSection(&g_status_lock);
    WSACleanup();
#else
    pthread_t t1, t2;
    pthread_create(&t1, NULL, http_thread, NULL);
    pthread_create(&t2, NULL, discovery_thread, NULL);
    pthread_join(t1, NULL);
    pthread_join(t2, NULL);
#endif

    return 0;
}
