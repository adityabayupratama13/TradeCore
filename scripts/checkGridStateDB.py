import sqlite3
import json

try:
    conn = sqlite3.connect('prisma/dev.db')
    c = conn.cursor()
    c.execute("SELECT value FROM AppSettings WHERE key='grid_v6_state'")
    row = c.fetchone()
    if row:
        data = json.loads(row[0])
        placed = sum(1 for l in data['levels'] if l['status'] == 'ORDER_PLACED')
        print(f"Active Levels: {placed}")
        print(f"Placed Grid Size: {data['qtyPerGrid']} ETH")
        print(f"Leverage: {data['leverage']}x")
    else:
        print("NOT_FOUND")
except Exception as e:
    print(e)
