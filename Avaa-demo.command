#!/bin/zsh
set -e
cd -- "${0:A:h}"
python3 - <<'PY'
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser
server = ThreadingHTTPServer(('127.0.0.1', 0), SimpleHTTPRequestHandler)
address = f'http://127.0.0.1:{server.server_port}/'
print(f'Niinimäki3 - heijastusversio avautuu selaimessa: {address}')
print('Pidä tämä ikkuna auki demon käytön ajan. Sulje se lopuksi.')
webbrowser.open(address)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
PY
