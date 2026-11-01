#!/usr/bin/python3
import re
import sys
import urllib.parse
import urllib.request

try:
    with open('/etc/qosyl/duckdns-token', encoding='ascii') as token_file:
        token = token_file.read().strip()
    if not re.fullmatch(r'[0-9a-fA-F-]{36}', token):
        raise ValueError('invalid token')
    query = urllib.parse.urlencode({'domains': 'qosyl', 'token': token, 'ip': ''})
    with urllib.request.urlopen('https://www.duckdns.org/update?' + query, timeout=15) as response:
        result = response.read(64).decode('ascii').strip()
    if result != 'OK':
        raise ValueError('update rejected')
    print('DuckDNS update succeeded')
except Exception:
    print('DuckDNS update failed; check network and token', file=sys.stderr)
    sys.exit(1)
