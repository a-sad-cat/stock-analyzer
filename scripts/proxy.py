#!/usr/bin/env python3
"""
极简 HTTP 正向代理 - 纯标准库，0 依赖
用途：部署在能正常访问 Sina/东方财富的机器上，阿里云被封 IP 的服务器通过它中转

用法:
  部署端 (能上网的机器):
    python proxy.py --port 8888 --bind 0.0.0.0

  使用端 (阿里云服务器):
    export AKSHARE_PROXY=http://部署机IP:8888
    bash scripts/deploy.sh
"""

import socket
import threading
import select
import argparse
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("proxy")

BUFFER_SIZE = 65536
TIMEOUT = 30


def relay(src, dst):
    """双向转发数据"""
    try:
        while True:
            data = src.recv(BUFFER_SIZE)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass


def handle_connect(client: socket.socket, addr: tuple, dest_host: str, dest_port: int):
    """处理 HTTPS CONNECT 隧道"""
    remote = None
    try:
        remote = socket.create_connection((dest_host, dest_port), timeout=TIMEOUT)
        client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")

        t1 = threading.Thread(target=relay, args=(client, remote), daemon=True)
        t2 = threading.Thread(target=relay, args=(remote, client), daemon=True)
        t1.start()
        t2.start()
        t1.join(timeout=TIMEOUT)
        t2.join(timeout=TIMEOUT)
    except Exception as e:
        logger.debug(f"CONNECT {dest_host}:{dest_port} error: {e}")
    finally:
        try:
            client.close()
        except Exception:
            pass
        if remote:
            try:
                remote.close()
            except Exception:
                pass


def handle_http(client: socket.socket, addr: tuple, first_data: bytes):
    """处理 HTTP GET/POST 等请求"""
    remote = None
    try:
        lines = first_data.split(b"\r\n")
        if not lines:
            return
        request_line = lines[0].decode(errors="replace")
        parts = request_line.split()
        if len(parts) < 2:
            return

        method, url = parts[0], parts[1]

        if url.startswith("http://"):
            url = url[7:]
        host, _, path = url.partition("/")
        path = "/" + path if path else "/"

        if ":" in host:
            host, port_str = host.rsplit(":", 1)
            port = int(port_str)
        else:
            port = 80

        remote = socket.create_connection((host, port), timeout=TIMEOUT)

        forward_req = f"{method} {path} HTTP/1.1\r\n".encode()
        for line in lines[1:]:
            if line.lower().startswith(b"proxy-connection:"):
                forward_req += b"Connection: close\r\n"
            elif line.lower().startswith(b"connection:"):
                forward_req += b"Connection: close\r\n"
            else:
                forward_req += line + b"\r\n"
        forward_req += b"\r\n"

        remote.sendall(forward_req)
        relay(remote, client)
    except Exception as e:
        logger.debug(f"HTTP {addr} error: {e}")
    finally:
        try:
            client.close()
        except Exception:
            pass
        if remote:
            try:
                remote.close()
            except Exception:
                pass


def handle_client(client: socket.socket, addr: tuple):
    """处理客户端连接 - 解析 CONNECT 或普通 HTTP"""
    try:
        client.settimeout(TIMEOUT)
        first_data = client.recv(BUFFER_SIZE)
        if not first_data:
            return

        lines = first_data.split(b"\r\n")
        request_line = lines[0].decode(errors="replace")
        parts = request_line.split()

        if len(parts) >= 3 and parts[0].upper() == "CONNECT":
            dest = parts[1]
            if ":" in dest:
                host, port = dest.rsplit(":", 1)
                handle_connect(client, addr, host, int(port))
            else:
                handle_connect(client, addr, dest, 443)
        else:
            handle_http(client, addr, first_data)
    except socket.timeout:
        pass
    except Exception as e:
        logger.debug(f"Client {addr} error: {e}")
    finally:
        try:
            client.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="极简 HTTP 正向代理")
    parser.add_argument("--port", type=int, default=8888, help="监听端口")
    parser.add_argument("--bind", type=str, default="0.0.0.0", help="绑定地址")
    args = parser.parse_args()

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((args.bind, args.port))
    server.listen(128)

    logger.info(f"代理已启动: http://{args.bind}:{args.port}")
    logger.info("在阿里云服务器设置: export AKSHARE_PROXY=http://<本机IP>:{args.port}")

    try:
        while True:
            client, addr = server.accept()
            threading.Thread(target=handle_client, args=(client, addr), daemon=True).start()
    except KeyboardInterrupt:
        logger.info("代理已停止")
    finally:
        server.close()


if __name__ == "__main__":
    main()
